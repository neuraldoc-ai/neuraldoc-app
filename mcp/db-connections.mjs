// Own PostgreSQL connections for the Daten page: a local database (on this machine or in Docker) or one at an
// internet address. Stored in the state volume (connections.json, mode 600); the password never leaves the server.
// Every query runs in a read-only transaction with a time limit and a row limit.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { pg } from '../frontend/server-deps.mjs'
import { DraftError } from './drafting.mjs'
import { log } from './log.mjs'

const LIMITS = { connections: 20, rows: 1000, timeoutMs: 15_000, connectMs: 8_000, sqlChars: 100_000 }
const SSL = ['disable', 'prefer', 'require', 'verify-full']

const stateDir = () => process.env.NEURALDOC_STATE_DIR ? path.resolve(process.env.NEURALDOC_STATE_DIR) : fileURLToPath(new URL('./state/', import.meta.url))
const file = () => path.join(stateDir(), 'connections.json')
const stored = () => { try { const list = JSON.parse(fs.readFileSync(file(), 'utf8')); return Array.isArray(list) ? list : [] } catch { return [] } }
function store(list) {
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file() + '.tmp', JSON.stringify(list, null, 2), { mode: 0o600 })
  fs.renameSync(file() + '.tmp', file())
}

/** What the interface may see: everything but the password. */
const visible = ({ password, ...rest }) => ({ ...rest, passwordSet: !!password })
export const listConnections = () => stored().map(visible)

const text = (value, max, label, { required = false } = {}) => {
  const v = typeof value === 'string' ? value.trim() : value == null ? '' : String(value)
  if (required && !v) throw new DraftError(`${label} fehlt.`, 400)
  if (v.length > max || /[\r\n\0]/.test(v)) throw new DraftError(`${label} ist ungültig.`, 400)
  return v
}

/** A connection URL (postgres://user:pass@host:5432/db?sslmode=require) split into the form's fields. */
export function parseUrl(value) {
  let url
  try { url = new URL(value) } catch { throw new DraftError('Die Verbindungs-URL ist ungültig. Beispiel: postgres://benutzer:passwort@host:5432/datenbank', 400) }
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new DraftError('Die Verbindungs-URL muss mit postgres:// beginnen.', 400)
  const ssl = url.searchParams.get('sslmode')
  return { host: url.hostname, port: url.port || '5432', database: decodeURIComponent(url.pathname.slice(1)), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), ssl: SSL.includes(ssl) ? ssl : ssl === 'verify-ca' ? 'verify-full' : 'prefer' }
}

/** Validates form input; an empty password keeps the stored one. */
function normalize(input, previous) {
  if (!input || typeof input !== 'object') throw new DraftError('Ungültige Verbindung.', 400)
  const fromUrl = input.url ? parseUrl(text(input.url, 2000, 'Verbindungs-URL')) : {}
  const merged = { ...input, ...Object.fromEntries(Object.entries(fromUrl).filter(([, v]) => v !== '')) }
  const port = Number(merged.port || 5432)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DraftError('Der Port muss zwischen 1 und 65535 liegen.', 400)
  const ssl = merged.ssl || 'prefer'
  if (!SSL.includes(ssl)) throw new DraftError('Ungültige SSL-Einstellung.', 400)
  const host = text(merged.host, 255, 'Host', { required: true })
  if (!/^[a-zA-Z0-9.\-_:[\]]+$/.test(host)) throw new DraftError('Der Host ist ungültig.', 400)
  const password = typeof merged.password === 'string' && merged.password !== '' ? text(merged.password, 1000, 'Passwort') : previous?.password ?? ''
  return {
    name: text(merged.name, 80, 'Name') || `${host}/${merged.database || 'postgres'}`,
    host, port, database: text(merged.database, 128, 'Datenbank', { required: true }), user: text(merged.user, 128, 'Benutzer', { required: true }),
    password, ssl, schema: text(merged.schema, 128, 'Schema') || 'public',
  }
}

export function saveConnection(input) {
  const list = stored(), previous = input?.id ? list.find((c) => c.id === input.id) : null
  if (input?.id && !previous) throw new DraftError('Diese Verbindung gibt es nicht mehr.', 404)
  const next = { id: previous?.id ?? randomUUID(), ...normalize(input, previous), updatedAt: new Date().toISOString() }
  if (!previous && list.length >= LIMITS.connections) throw new DraftError(`Höchstens ${LIMITS.connections} Verbindungen.`, 400)
  store(previous ? list.map((c) => (c.id === next.id ? next : c)) : [...list, next])
  log.info('db', previous ? 'Verbindung geändert' : 'Verbindung angelegt', { name: next.name, host: next.host, port: next.port, ssl: next.ssl })
  return visible(next)
}

export function deleteConnection(id) {
  const list = stored()
  if (!list.some((c) => c.id === id)) throw new DraftError('Diese Verbindung gibt es nicht mehr.', 404)
  store(list.filter((c) => c.id !== id))
  return listConnections()
}

export const resetConnections = () => fs.rmSync(file(), { force: true })

const sslOption = (mode) => mode === 'disable' ? false : mode === 'verify-full' ? { rejectUnauthorized: true } : { rejectUnauthorized: false }

/** Readable German messages for the errors people actually hit. */
function explain(error, c) {
  const code = error.code, message = String(error.message || error)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `Der Host ${c.host} wurde nicht gefunden. Prüf die Adresse.`
  if (code === 'ECONNREFUSED') return `${c.host}:${c.port} nimmt keine Verbindung an. Läuft die Datenbank?${/^(localhost|127\.0\.0\.1|::1)$/.test(c.host) ? ' Im Docker-Container heißt dein Rechner host.docker.internal.' : ''}`
  if (code === '57014' || /Query read timeout/i.test(message)) return `Die Abfrage wurde nach ${LIMITS.timeoutMs / 1000} Sekunden abgebrochen.`
  if (/multiple commands into a prepared statement/i.test(message)) return 'Bitte nur eine Abfrage auf einmal ausführen.'
  if (code === 'ETIMEDOUT' || /timeout/i.test(message)) return `${c.host}:${c.port} antwortet nicht. Prüf Adresse, Port und Firewall.`
  if (code === '28P01' || code === '28000') return 'Benutzer oder Passwort sind falsch.'
  if (code === '3D000') return `Die Datenbank „${c.database}“ gibt es auf diesem Server nicht.`
  if (code === '25006') return 'Diese Verbindung ist nur lesend. Ändernde Befehle sind nicht erlaubt.'
  if (/does not support SSL|server does not support/i.test(message)) return 'Der Server unterstützt kein SSL. Stell SSL auf „Aus“.'
  if (/self[- ]signed|certificate/i.test(message)) return 'Das Zertifikat des Servers ist nicht vertrauenswürdig. Stell SSL auf „Erforderlich“ statt „Zertifikat prüfen“.'
  if (/no pg_hba\.conf entry/i.test(message)) return 'Der Server lässt diese Verbindung nicht zu (pg_hba.conf). Eventuell ist SSL nötig.'
  return message.slice(0, 300)
}

async function connect(c) {
  const open = async (ssl) => {
    const client = new pg.Client({ host: c.host, port: c.port, database: c.database, user: c.user, password: c.password, ssl, connectionTimeoutMillis: LIMITS.connectMs, statement_timeout: LIMITS.timeoutMs, query_timeout: LIMITS.timeoutMs + 2000, application_name: 'neuraldoc' })
    client.on('error', () => {})
    try { await client.connect(); return client } catch (error) { await client.end().catch(() => {}); throw error }
  }
  if (c.ssl !== 'prefer') return open(sslOption(c.ssl))
  // „prefer“ like libpq: SSL if the server offers it, otherwise without.
  try { return await open({ rejectUnauthorized: false }) } catch (error) { if (/does not support SSL/i.test(String(error.message))) return open(false); throw error }
}

const byId = (id) => { const c = stored().find((x) => x.id === id); if (!c) throw new DraftError('Diese Verbindung gibt es nicht mehr.', 404); return c }

/** Tries a connection (saved, or the unsaved form input) and reports server version and time. */
export async function testConnection(input) {
  const previous = input?.id ? stored().find((c) => c.id === input.id) : null
  const c = input?.host || input?.url ? normalize(input, previous) : byId(input?.id)
  const started = Date.now()
  let client
  try {
    client = await connect(c)
    const { rows } = await client.query({ text: 'SELECT version() AS version, current_user AS user, (SELECT count(*) FROM information_schema.tables WHERE table_schema = $1)::int AS tables', values: [c.schema], queryMode: 'extended' })
    return { ok: true, version: rows[0].version.match(/^PostgreSQL [\d.]+/)?.[0] ?? rows[0].version, user: rows[0].user, tables: rows[0].tables, ms: Date.now() - started }
  } catch (error) {
    log.warn('db', 'Verbindungstest fehlgeschlagen', { host: c.host, port: c.port, code: error.code })
    throw new DraftError(explain(error, c), 400)
  } finally { await client?.end().catch(() => {}) }
}

/**
 * One read-only query. The extended protocol allows exactly one statement, so nothing can end the read-only
 * transaction; the database role should still be read-only (recommended in the interface).
 */
export async function queryConnection(id, sql, params = []) {
  const c = byId(id)
  if (typeof sql !== 'string' || !sql.trim() || sql.length > LIMITS.sqlChars) throw new DraftError('Leere oder zu lange Abfrage.', 400)
  if (!Array.isArray(params) || params.length > 20) throw new DraftError('Ungültige Parameter.', 400)
  const started = Date.now()
  let client
  try {
    client = await connect(c)
    await client.query('BEGIN TRANSACTION READ ONLY')
    await client.query({ text: `SET LOCAL search_path TO ${client.escapeIdentifier(c.schema)}, public`, queryMode: 'extended' })
    const result = await client.query({ text: sql.trim().replace(/;\s*$/, ''), values: params, queryMode: 'extended', rowMode: 'array' })
    const fields = result.fields.map((f) => ({ name: f.name, type: f.dataTypeID }))
    const rows = result.rows.slice(0, LIMITS.rows).map((r) => Object.fromEntries(fields.map((f, i) => [f.name, cell(r[i])])))
    return { fields, rows, ms: Date.now() - started, truncated: result.rows.length > LIMITS.rows }
  } catch (error) {
    throw new DraftError(explain(error, c), 400)
  } finally {
    await client?.query('ROLLBACK').catch(() => {})
    await client?.end().catch(() => {})
  }
}

/** JSON-safe cells: dates as ISO text, binary as a hint, big numbers as text. */
function cell(v) {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().replace('T', ' ').replace(/\.000Z$|Z$/, '')
  if (Buffer.isBuffer(v)) return `<${v.length} Bytes>`
  if (typeof v === 'bigint') return String(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}
