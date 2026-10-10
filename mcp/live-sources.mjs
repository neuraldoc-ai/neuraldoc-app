// Documentation read live from Confluence Cloud and Google Drive instead of a folder or Git repository, and approved
// sections written back to Confluence as a new page version. The import writes what it reads into the usual docs
// folder (Confluence pages as storage XML, Drive files as they are), so the check sees the same input as for a
// documentation repository; the page and file ids stay with the project for the way back.
//   Confluence: site URL, account e-mail and API token (Basic auth, REST v2).
//   Google Drive: a service account's JSON key; the folder is shared with the service account (read-only scope).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DraftError } from './drafting.mjs'
import { log } from './log.mjs'
import { reviewer, runtimeEnv } from './settings.mjs'
import { applyFile } from './github.mjs'

/* ---------- Configuration ---------- */

export function confluenceConfig(env = runtimeEnv()) {
  const site = String(env.NEURALDOC_CONFLUENCE_URL || '').trim().replace(/\/+$/, '').replace(/\/wiki$/, '')
  const email = env.NEURALDOC_CONFLUENCE_EMAIL?.trim(), token = env.NEURALDOC_CONFLUENCE_TOKEN?.trim()
  return { site, email, token, configured: !!(site && email && token) }
}

export function driveConfig(env = runtimeEnv()) {
  let key = null
  try { key = env.NEURALDOC_GOOGLE_SA_KEY?.trim() ? JSON.parse(env.NEURALDOC_GOOGLE_SA_KEY) : null } catch { key = null }
  return { key: key?.client_email && key?.private_key ? key : null, configured: !!(key?.client_email && key?.private_key), invalid: !!env.NEURALDOC_GOOGLE_SA_KEY?.trim() && !key?.client_email }
}

/* ---------- Confluence client ---------- */

function confluence(config = confluenceConfig(), fetchImpl = fetch) {
  if (!config.configured) throw new DraftError('Confluence ist nicht verbunden. Unter Einstellungen Adresse, E-Mail und API-Token eintragen.', 503)
  if (!/^https:\/\/[\w.-]+$/.test(config.site)) throw new DraftError('Die Confluence-Adresse muss wie https://firma.atlassian.net aussehen.', 400)
  const auth = 'Basic ' + Buffer.from(`${config.email}:${config.token}`).toString('base64')
  async function request(method, url, body) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(`${config.site}/wiki${url}`, { method, headers: { Authorization: auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
        .catch((error) => { throw new DraftError(`Confluence ist nicht erreichbar (${error.cause?.code || error.message}).`, 502) })
      if (response.status === 429 && attempt < 4) { await new Promise((r) => setTimeout(r, 1000 * (Number(response.headers.get('retry-after')) || 2 ** attempt))); continue }
      const text = await response.text(), data = text ? (() => { try { return JSON.parse(text) } catch { return { message: text.slice(0, 200) } } })() : null
      if (!response.ok) {
        const detail = data?.message || data?.errors?.[0]?.title || `HTTP ${response.status}`
        const error = new DraftError(response.status === 401 ? 'Confluence lehnt die Anmeldung ab. E-Mail und API-Token prüfen.'
          : response.status === 403 ? `Keine Berechtigung in Confluence (${detail}).`
            : response.status === 404 ? `In Confluence nicht gefunden (${method} ${url.split('?')[0]}).`
              : response.status === 409 ? 'Die Seite wurde in Confluence inzwischen geändert.'
                : `Confluence meldet ${response.status}: ${detail}`, response.status >= 500 ? 502 : 400)
        error.httpStatus = response.status
        throw error
      }
      return data
    }
  }
  // Paginated v2 lists: follow _links.next until the end.
  async function all(url) {
    const out = []
    for (let next = url; next; ) {
      const page = await request('GET', next)
      out.push(...(page.results ?? []))
      next = page._links?.next ? page._links.next.replace(/^\/wiki/, '') : null
    }
    return out
  }
  return { request, all, site: config.site }
}

/** Who neuraldoc is in Confluence and which spaces it can read. */
export async function testConfluence({ fetchImpl } = {}) {
  const c = confluence(confluenceConfig(), fetchImpl)
  const me = await c.request('GET', '/rest/api/user/current')
  const spaces = await c.all('/api/v2/spaces?limit=250&status=current')
  return { site: c.site, account: me.displayName ?? me.publicName ?? me.accountId, spaces: spaces.filter((s) => s.type !== 'personal').map((s) => ({ key: s.key, name: s.name })) }
}

const slug = (value) => String(value).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'seite'

/**
 * Every current page of the given spaces into dir/confluence/<KEY>/<id>-<labels>-<title>.xml, in storage format with
 * the export comment "<!-- KEY / Title (Version n) -->" the importer reads the title from. The labels are part of the
 * file name, so the document type (manual, dialog, parameters, architecture …) follows them.
 */
export async function fetchConfluence(dir, keys, { fetchImpl } = {}) {
  const c = confluence(confluenceConfig(), fetchImpl)
  const wanted = [...new Set(keys.map((k) => String(k).trim().toUpperCase()).filter(Boolean))]
  if (!wanted.length) throw new DraftError('Bitte mindestens einen Confluence-Bereich angeben (Schlüssel wie DOKU).', 400)
  if (wanted.some((k) => !/^[A-Z0-9~_]{1,255}$/.test(k))) throw new DraftError('Ungültiger Bereichsschlüssel. Erlaubt sind Buchstaben, Ziffern und _.', 400)
  const spaces = await c.all(`/api/v2/spaces?keys=${wanted.join(',')}&limit=250`)
  const missing = wanted.filter((k) => !spaces.some((s) => s.key === k))
  if (missing.length) throw new DraftError(`Confluence-Bereich nicht gefunden oder kein Zugriff: ${missing.join(', ')}.`, 400)
  const pages = {}
  for (const space of spaces) {
    for (const page of await c.all(`/api/v2/spaces/${space.id}/pages?limit=250&status=current&body-format=storage`)) {
      const labels = (await c.all(`/api/v2/pages/${page.id}/labels?limit=250`)).map((l) => l.name)
      const rel = `confluence/${space.key}/${page.id}-${slug([...labels, page.title].join(' '))}.xml`
      const body = page.body?.storage?.value ?? ''
      const file = path.join(dir, ...rel.split('/'))
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `<!-- ${space.key} / ${page.title.replace(/--+/g, '-')} (Version ${page.version?.number ?? 1}) -->\n${body}`)
      pages[rel] = { id: page.id, title: page.title, space: space.key, version: page.version?.number ?? 1, labels }
    }
  }
  log.info('import', 'Confluence gelesen', { site: c.site, spaces: wanted.join(','), pages: Object.keys(pages).length })
  return { site: c.site, spaces: spaces.map((s) => ({ key: s.key, name: s.name, id: s.id })), pages }
}

/* ---------- Google Drive ---------- */

async function driveToken(config, fetchImpl = fetch) {
  if (!config.configured) throw new DraftError(config.invalid ? 'Der Google-Dienstkonto-Schlüssel ist kein gültiges JSON mit client_email und private_key.' : 'Google Drive ist nicht verbunden. Unter Einstellungen den JSON-Schlüssel eines Dienstkontos eintragen.', 503)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: config.key.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now - 30, exp: now + 3000 })}`
  let jwt
  try { jwt = `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(config.key.private_key, 'base64url')}` } catch { throw new DraftError('Der private Schlüssel des Google-Dienstkontos ist ungültig.', 400) }
  const response = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}` })
    .catch((error) => { throw new DraftError(`Google ist nicht erreichbar (${error.cause?.code || error.message}).`, 502) })
  const data = await response.json().catch(() => ({}))
  if (!data.access_token) throw new DraftError(`Google lehnt das Dienstkonto ab (${data.error_description || data.error || response.status}).`, 400)
  return data.access_token
}

export const driveFolderId = (value) => String(value || '').match(/folders\/([\w-]{10,})/)?.[1] ?? (/^[\w-]{10,}$/.test(String(value || '').trim()) ? String(value).trim() : null)

// Google's own formats have no file to download; they are exported as the matching Office file.
const EXPORTS = { 'application/vnd.google-apps.document': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'], 'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'], 'application/vnd.google-apps.presentation': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'] }

/** Who reads Drive (the service account) and whether it sees the folder. */
export async function testDrive(folder, { fetchImpl } = {}) {
  const config = driveConfig(), result = { account: config.key?.client_email ?? null, folder: null }
  const token = await driveToken(config, fetchImpl)
  const id = driveFolderId(folder)
  if (id) {
    const r = await (fetchImpl ?? fetch)(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
    result.folder = r.ok ? { id, name: (await r.json()).name, ok: true } : { id, ok: false, message: r.status === 404 ? 'Ordner nicht gefunden: Ist er für das Dienstkonto freigegeben?' : `Google meldet ${r.status}.` }
  }
  return result
}

/** Every file below a shared Drive folder into dir/drive/<folders>/<name>, with its Drive id for the way back. */
export async function fetchDrive(dir, folder, { fetchImpl = fetch, maxFiles = 500, maxBytes = 30_000_000 } = {}) {
  const id = driveFolderId(folder)
  if (!id) throw new DraftError('Bitte den Link eines Google-Drive-Ordners angeben (drive.google.com/drive/folders/…).', 400)
  const token = await driveToken(driveConfig(), fetchImpl), headers = { Authorization: `Bearer ${token}` }
  const get = async (url) => {
    const r = await fetchImpl(url, { headers }).catch((error) => { throw new DraftError(`Google Drive ist nicht erreichbar (${error.cause?.code || error.message}).`, 502) })
    if (!r.ok) throw new DraftError(r.status === 404 ? 'Drive-Ordner nicht gefunden. Ist er für das Dienstkonto freigegeben?' : `Google Drive meldet ${r.status}.`, 400)
    return r
  }
  const root = await (await get(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType&supportsAllDrives=true`)).json()
  if (root.mimeType !== 'application/vnd.google-apps.folder') throw new DraftError('Der Drive-Link zeigt nicht auf einen Ordner.', 400)
  const files = {}, warnings = []
  const walk = async (folderId, prefix, depth) => {
    if (depth > 12) return
    for (let pageToken = ''; ;) {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
      const list = await (await get(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`)).json()
      for (const f of list.files ?? []) {
        const name = f.name.replace(/[\\/:*?"<>|\0]/g, '_').slice(0, 150)
        if (f.mimeType === 'application/vnd.google-apps.folder') { await walk(f.id, `${prefix}${name}/`, depth + 1); continue }
        if (Object.keys(files).length >= maxFiles) { warnings.push(`Mehr als ${maxFiles} Dateien in Drive, der Rest wurde nicht gelesen.`); return }
        const exported = EXPORTS[f.mimeType]
        if (f.mimeType.startsWith('application/vnd.google-apps.') && !exported) continue
        if (Number(f.size) > maxBytes) { warnings.push(`${prefix}${name}: über 30 MB, nicht gelesen.`); continue }
        const rel = `drive/${prefix}${exported && !name.endsWith(exported[1]) ? name + exported[1] : name}`
        const bytes = Buffer.from(await (await get(exported ? `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent(exported[0])}` : `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`)).arrayBuffer())
        const file = path.join(dir, ...rel.split('/'))
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes)
        files[rel] = { id: f.id, name: f.name, modifiedTime: f.modifiedTime, url: f.webViewLink ?? null, exported: !!exported }
      }
      if (!list.nextPageToken) break
      pageToken = list.nextPageToken
    }
  }
  await walk(id, '', 0)
  log.info('import', 'Google Drive gelesen', { folder: root.name, files: Object.keys(files).length })
  return { folder: { id, name: root.name, url: `https://drive.google.com/drive/folders/${id}` }, files, warnings }
}

/* ---------- Writing approved sections back to Confluence ---------- */

const stateDir = () => process.env.NEURALDOC_STATE_DIR ? path.resolve(process.env.NEURALDOC_STATE_DIR) : fileURLToPath(new URL('./state/', import.meta.url))
const stateFile = () => path.join(stateDir(), 'confluence.json')
// published: project → proposal → { pageId, version, url, at }; open: project → proposal → reason it could not be written
const readState = () => { try { return { published: {}, open: {}, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) } } catch { return { published: {}, open: {} } } }
const updateState = (change) => { const state = readState(); change(state); fs.mkdirSync(stateDir(), { recursive: true }); fs.writeFileSync(stateFile() + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(stateFile() + '.tmp', stateFile()) }
export const resetConfluence = () => fs.rmSync(stateFile(), { force: true })

const docPath = (source) => source.path.replace(/^dokumentation\//, '')
/** The Confluence page of a document source, when the project's docs came from Confluence. */
const pageOf = (p, source) => source.origin === 'docs' ? p.sources?.docs?.live?.confluence?.pages?.[docPath(source)] ?? null : null

/** Approved, not yet written sections of Confluence pages, grouped by page. */
export function planConfluence(p, state = readState()) {
  const published = state.published[p.id] ?? {}, pages = new Map()
  for (const proposal of p.dataset?.proposals ?? []) {
    const decision = p.decisions?.[proposal.id]
    if (decision?.state !== 'uebernommen' || published[proposal.id]) continue
    const section = p.docFiles.find((d) => d.id === (proposal.section ?? proposal.doc)), source = section && p.docSources.find((s) => s.id === section.source)
    const page = source && pageOf(p, source), content = decision.edited?.text ?? p.generated[proposal.id]?.text
    if (!page || typeof content !== 'string') continue
    if (!pages.has(page.id)) pages.set(page.id, { page, path: docPath(source), items: [] })
    pages.get(page.id).items.push({ proposal: proposal.id, title: section.title, path: docPath(source), find: section.text, content, edited: !!decision.edited, by: decision.by, at: decision.at })
  }
  return [...pages.values()]
}

export const confluenceStatus = { running: false, lastRun: null, error: null }
let chain = Promise.resolve()

/** Writes every approved section of the project into its Confluence page: one new version per page, with a comment. */
export function syncConfluence(getProject, options = {}) {
  const run = chain.then(() => syncNow(getProject(), options))
  chain = run.catch(() => undefined)
  return run
}

async function syncNow(p, { fetchImpl } = {}) {
  if (!p?.sources?.docs?.live?.confluence) return { written: 0 }
  const c = confluence(confluenceConfig(), fetchImpl)
  Object.assign(confluenceStatus, { running: true, error: null })
  let written = 0
  try {
    for (const { page, path: file, items } of planConfluence(p)) {
      try {
        const live = await c.request('GET', `/api/v2/pages/${page.id}?body-format=storage`)
        // The same text the import read: the export comment names the page; changes go into the text nodes only.
        const head = `<!-- ${page.space} / ${live.title.replace(/--+/g, '-')} (Version ${live.version.number}) -->\n`, raw = head + (live.body?.storage?.value ?? '')
        const result = applyFile(file, raw, items)
        const body = result.text.startsWith(head) ? result.text.slice(head.length) : result.text.replace(/^\s*<!--[\s\S]*?-->\n?/, '')
        const done = result.applied.filter((i) => !i.already), url = `${c.site}/wiki/spaces/${page.space}/pages/${page.id}`
        if (body !== live.body?.storage?.value) {
          const message = `neuraldoc: ${done.map((i) => i.title.split(' › ').pop()).join(', ').slice(0, 200)} freigegeben von ${done[0]?.by || reviewer()}`
          const saved = await c.request('PUT', `/api/v2/pages/${page.id}`, { id: page.id, status: 'current', title: live.title, body: { representation: 'storage', value: body }, version: { number: live.version.number + 1, message } })
          written++
          log.info('confluence', 'Seite aktualisiert', { page: live.title, version: saved.version?.number, sections: done.length })
          updateState((s) => { for (const i of result.applied) { (s.published[p.id] ??= {})[i.proposal] = { pageId: page.id, version: saved.version?.number ?? live.version.number + 1, url, at: new Date().toISOString(), ...(i.partial ? { partial: i.partial } : {}) }; delete s.open[p.id]?.[i.proposal] } })
        } else updateState((s) => { for (const i of result.applied) { (s.published[p.id] ??= {})[i.proposal] = { pageId: page.id, version: live.version.number, url, at: new Date().toISOString() }; delete s.open[p.id]?.[i.proposal] } })
        if (result.conflicts.length) updateState((s) => { for (const i of result.conflicts) (s.open[p.id] ??= {})[i.proposal] = i.reason })
      } catch (error) {
        log.warn('confluence', 'Seite nicht geschrieben', { page: page.title, error: error.message })
        updateState((s) => { for (const i of items) (s.open[p.id] ??= {})[i.proposal] = error.message })
        confluenceStatus.error = error.message
      }
    }
    confluenceStatus.lastRun = new Date().toISOString()
    return { written }
  } finally { confluenceStatus.running = false }
}

let timer = null
/** After an approval: write a moment later, so a run of quick decisions makes one version per page. */
export function scheduleConfluence(getProject, delay = 2500) {
  const p = getProject()
  if (!p?.sources?.docs?.live?.confluence || !confluenceConfig().configured) return false
  clearTimeout(timer)
  timer = setTimeout(() => { syncConfluence(getProject).catch((error) => { confluenceStatus.error = error.message; log.warn('confluence', 'Zurückschreiben fehlgeschlagen', { error: error.message }) }) }, delay)
  timer.unref?.()
  return true
}

/** Where each approved section is in Confluence, for the rows of the dashboard. */
export function confluenceLinks(p) {
  const state = readState(), links = {}
  for (const [id, x] of Object.entries(state.published[p.id] ?? {})) links[id] = { ...x, state: 'written' }
  for (const [id, reason] of Object.entries(state.open[p.id] ?? {})) if (!links[id]) links[id] = { state: 'open', reason }
  return links
}
export const isWritten = (projectId, proposalId) => !!readState().published[projectId]?.[proposalId]
