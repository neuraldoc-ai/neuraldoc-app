// Keys and model choice entered in the interface. Stored in the state volume (settings.json, mode 600),
// they take precedence over environment variables; an empty field falls back to the environment again.
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const SECRETS = ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'VERTEX_API_KEY', 'NEURALDOC_LLM_API_KEY', 'NEURALDOC_GIT_TOKEN']
export const VALUES = ['NEURALDOC_USER_NAME', 'NEURALDOC_USER_COMPANY', 'NEURALDOC_USER_ROLE', 'NEURALDOC_JEV_BUDGET_USD', 'NEURALDOC_DRAFT_PROVIDER', 'NEURALDOC_LLM_MODEL', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'NEURALDOC_VERTEX_MODE', 'NEURALDOC_LLM_BASE_URL', 'NEURALDOC_LLM_FORMAT']
const FIELDS = [...SECRETS, ...VALUES]
const ALIASES = { TYPESAFE_API_KEY: ['JEV_API_KEY'], GEMINI_API_KEY: ['GOOGLE_API_KEY'] }

const stateDir = () => process.env.NEURALDOC_STATE_DIR ? path.resolve(process.env.NEURALDOC_STATE_DIR) : fileURLToPath(new URL('./state/', import.meta.url))
const file = () => path.join(stateDir(), 'settings.json')
function stored() {
  try { const value = JSON.parse(fs.readFileSync(file(), 'utf8')); return Object.fromEntries(FIELDS.filter((k) => typeof value[k] === 'string' && value[k]).map((k) => [k, value[k]])) } catch { return {} }
}

/** Environment as the server uses it: process.env plus the values saved in the interface. */
export const runtimeEnv = () => ({ ...process.env, ...stored() })

const fromEnv = (k) => [k, ...(ALIASES[k] || [])].some((name) => process.env[name]?.trim())
/** What the interface may see: plain values, and for keys only whether and where they are set. */
export function publicSettings() {
  const saved = stored()
  return {
    values: Object.fromEntries(VALUES.map((k) => [k, saved[k] ?? process.env[k] ?? ''])),
    secrets: Object.fromEntries(SECRETS.map((k) => [k, saved[k] ? { set: true, source: 'ui', hint: '…' + saved[k].slice(-4) } : fromEnv(k) ? { set: true, source: 'env' } : { set: false }])),
  }
}

/** Saves the given fields: a string sets it, '' or null removes the saved value. Fields not sent stay as they are. */
export function saveSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ungültige Einstellungen.')
  const next = stored()
  for (const [k, v] of Object.entries(input)) {
    if (!FIELDS.includes(k)) throw new Error(`Unbekanntes Feld: ${k}`)
    if (v === null || v === '') { delete next[k]; continue }
    if (typeof v !== 'string' || v.length > 2000 || /[\r\n\0]/.test(v)) throw new Error(`Ungültiger Wert für ${k}.`)
    next[k] = v.trim()
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file() + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 })
  fs.renameSync(file() + '.tmp', file())
  return publicSettings()
}

/** The person using this installation, as entered in the settings. */
export function profile(env = runtimeEnv()) {
  const name = env.NEURALDOC_USER_NAME?.trim() || ''
  return { name, company: env.NEURALDOC_USER_COMPANY?.trim() || '', role: env.NEURALDOC_USER_ROLE?.trim() || '' }
}
export const reviewer = () => profile().name || 'Lokaler Nutzer'

/** A random MCP token per installation, created on first start and kept in the state directory. */
export function installToken() {
  const target = path.join(stateDir(), 'mcp-token')
  try { const token = fs.readFileSync(target, 'utf8').trim(); if (token) return token } catch { /* first start */ }
  const token = 'nd_' + randomBytes(18).toString('base64url')
  try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, token, { mode: 0o600 }) } catch { /* read-only state: token lives until restart */ }
  return token
}
