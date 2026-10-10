// MCP protocol (JSON-RPC 2.0) and the HTTP endpoints.
//  - POST /mcp          Streamable HTTP transport, JSON responses (no SSE stream needed for tools)
//  - /api/mcp/*         small REST API for the neuraldoc dashboard (tools, rules, activity, decisions)
// Used by http.mjs (standalone server) and by the Vite dev server (same port as the app).
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DraftError, draftingStatus } from './drafting.mjs'
import { setupStatus } from './setup.mjs'
import { listModels } from './models.mjs'
import { installToken, profile, publicSettings, resetSettings, reviewer, saveSettings } from './settings.mjs'
import { listConnections, saveConnection, deleteConnection, testConnection, queryConnection, resetConnections } from './db-connections.mjs'
import { activeProject, addProject, activateProject, projectList, projectPayload, startCheck, checkStatus, projectDraft, projectDecisions, resetProjectDecisions, resetProjects, exportProject, showcaseOnly, projectSource, projectCommit, projectDocuments } from './projects.mjs'
import { LIMITS } from '../frontend/src/dashboard/features/docs/import-rules.mjs'
import { docTypeOrder, docTypes } from '../frontend/src/dashboard/features/docs/vocabulary.ts'
import { log, logError } from './log.mjs'
import { projectTools, projectTool } from './project-mcp.mjs'
import { projectUsage } from './project-usage.mjs'
import { appManifest, completeAppManifest, githubStatus, isPublished, proposalLinks, resetGitHub, scheduleSync, setProjectTarget, syncGitHub, testGitHub } from './github.mjs'
import { confluenceConfig, confluenceLinks, confluenceStatus, driveConfig, isWritten, resetConfluence, scheduleConfluence, syncConfluence, testConfluence, testDrive } from './live-sources.mjs'

// The MOBIQ showcase reads its dataset (datasets/) as soon as it is loaded, so only showcase mode imports it.
let showcaseModules
const mobiq = () => showcaseModules ??= Promise.all([import('./core.mjs'), import('./prompts.mjs'), import('./usage.mjs'), import('../frontend/src/dashboard/features/docs/showcase-data.ts')])
  .then(([core, prompts, usage, data]) => ({ ...core, ...prompts, usage: usage.usage, exampleProposals: data.proposals }))

// The public showcase keeps the documented demo token; every other installation gets its own.
export const TOKEN = process.env.NEURALDOC_MCP_TOKEN?.trim() || (process.env.NEURALDOC_MODE === 'showcase' ? 'nd_demo_mobiq_2b7f9c41e8' : installToken())
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_INFO = { name: 'neuraldoc', title: 'neuraldoc', version: '0.2.1' }
const STDIO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'stdio.mjs').split(path.sep).join('/')
const INSTRUCTIONS = [
  'neuraldoc kennt die Produktdoku von MOBIQ und prüft sie gegen den Code (GitLab, Jira, Confluence, SharePoint). Drei Werkzeuge:',
  '1. ticket_context zu Beginn der Arbeit an einem Ticket: Regeln aus dem Code, wie die Doku es heute beschreibt, offene Fragen.',
  '2. ask bei Fachfragen. Jede Fundstelle hat einen Status; wo Doku und Code abweichen, gilt der Code.',
  '3. check_change, sobald ein Feature fertig ist oder ein Merge-Request offen ist. Es liefert die Doku-Entwürfe und einen Link; gib den Link an den Nutzer weiter. Doku nie selbst in Confluence oder SharePoint schreiben: das macht neuraldoc nach der Freigabe.',
  'Nur bei einem Auftrag zur Prüfung von Doku-Auswirkungen: vor der Schlussantwort check_change mit answer aufrufen, dann die zurückgegebene vollständig ergänzte Antwort unverändert einschließlich jeder Fundstelle und Änderungsangabe übernehmen. Nicht erneut zusammenfassen. Bei Fachfragen (ask) und Ticketvorbereitung (ticket_context) keine zusätzliche Doku-Gesamtprüfung. Die Quellenliste kann mehr enthalten als vorbereitete Dashboard-Entwürfe. Mit source_id Originaltexte/Codebelege nachladen. Unzugeordnete Quellen sind ungeprüft. Standardantworten enthalten Fakten einmal; format=structured ergänzt Daten für Oberflächen.',
].join('\n')

const sessions = new Map() // session id → client name

/** Handles one JSON-RPC message. Returns a response object, or null for notifications. */
export async function handleMessage(msg, ctx = {}) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result })
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return msg.id === undefined ? null : fail(-32600, 'Invalid Request')
  const isNotification = msg.id === undefined

  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion
      if (ctx.onInitialize) ctx.onInitialize(msg.params?.clientInfo)
      return reply({
        protocolVersion: SUPPORTED.includes(requested) ? requested : SUPPORTED[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: showcaseOnly() ? INSTRUCTIONS : activeProject() ? 'neuraldoc liest den hochgeladenen Code-Stand und die Dokumente. Fundstellen sind keine Bestätigung der Dokumentrichtigkeit. Freigabe und Export erfolgen im Dashboard.' : 'Noch kein Projekt importiert. Im neuraldoc-Dashboard ein Repository importieren, dann stehen die Werkzeuge zur Verfügung.',
      })
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: showcaseOnly() ? (await mobiq()).toolList() : projectTools })
    case 'prompts/list':
      // The prepared prompts describe the MOBIQ showcase; own projects have none yet.
      return reply({ prompts: showcaseOnly() ? (await mobiq()).promptList() : [] })
    case 'prompts/get':
      if (!showcaseOnly()) return fail(-32602, 'Für eigene Projekte gibt es keine vorbereiteten Prompts.')
      try {
        return reply((await mobiq()).getPrompt(msg.params?.name, msg.params?.arguments))
      } catch (e) {
        return fail(-32602, e.message)
      }
    case 'tools/call': {
      const { name, arguments: args } = msg.params ?? {}
      log.info('mcp', `Werkzeug ${name}`, { client: ctx.client })
      if (!showcaseOnly()) return reply(await projectTool(name, args ?? {}))
      if (name === 'check_change' && args?.draft_id) return reply({ content: [{ type: 'text', text: 'Der Showcase verwendet vorbereitete Entwürfe. Eigene Projekte prüfst du in deiner eigenen neuraldoc-Installation.' }], isError: true })
      return reply(await (await mobiq()).callTool(name, args ?? {}, { client: ctx.client ?? 'unbekannt', origin: ctx.origin }))
    }
    default:
      return isNotification ? null : fail(-32601, `Method not found: ${msg.method}`)
  }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

const readRaw = (req, limit = 1048576) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new DraftError(`Anfrage zu groß (über ${Math.round(limit / 1e6)} MB).`, 413)); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
const readBody = async (req, limit) => (await readRaw(req, limit)).toString('utf8')
const readJsonBody = async (req, limit) => JSON.parse((await readBody(req, limit)) || '{}')

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

const originOf = (req) => `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:5173'}`

async function mcpEndpoint(req, res) {
  if (req.method === 'GET' || req.method === 'DELETE') return send(res, 405, { error: 'Dieser Server sendet keine SSE-Streams; bitte POST verwenden.' }, { Allow: 'POST' })
  if (req.method !== 'POST') return send(res, 405, undefined, { Allow: 'POST' })
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Token fehlt oder ist falsch' } }, { 'WWW-Authenticate': 'Bearer' })

  let payload
  try {
    payload = JSON.parse(await readBody(req))
  } catch {
    return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }
  let sid = req.headers['mcp-session-id']
  const headers = {}
  const ctx = {
    origin: originOf(req),
    client: sessions.get(sid) ?? req.headers['user-agent']?.split(' ')[0] ?? 'HTTP',
    onInitialize: (clientInfo) => {
      sid = randomUUID()
      const name = clientInfo?.name ? `${clientInfo.name}${clientInfo.version ? ' ' + clientInfo.version : ''}` : 'HTTP-Client'
      sessions.set(sid, name)
      ctx.client = name
      headers['Mcp-Session-Id'] = sid
    },
  }
  const messages = Array.isArray(payload) ? payload : [payload]
  const responses = []
  for (const m of messages) {
    const r = await handleMessage(m, ctx)
    if (r) responses.push(r)
  }
  if (!responses.length) return send(res, 202, undefined, headers)
  return send(res, 200, Array.isArray(payload) ? responses : responses[0], headers)
}

async function api(req, res, path) {
  try {
    const localMutation = () => {
      const sameOrigin = req.headers.origin === `http://${req.headers.host}` || req.headers.origin === `https://${req.headers.host}`
      if (!sameOrigin && req.headers.authorization !== `Bearer ${TOKEN}`) throw new DraftError('Lokale Projektaktionen benötigen dieselbe Herkunft oder einen MCP-Token.', 403)
    }
    if (req.method === 'GET' && path === '/api/mcp/project') return send(res, 200, { ...projectPayload(), projects: projectList(), profile: showcaseOnly() ? null : profile() },{ 'Cache-Control': 'no-store' })
    if (path.startsWith('/api/mcp/project/') && req.method === 'POST') {
      localMutation()
      if (path === '/api/mcp/project/import') return send(res, 200, await addProject(await readRaw(req, LIMITS.uploadBytes)))
      if (path === '/api/mcp/project/activate') return send(res, 200, activateProject((await readJsonBody(req)).id))
      if (path === '/api/mcp/project/check') return send(res, 202, startCheck())
    }
    if (req.method === 'GET' && path === '/api/mcp/project/check') return send(res, 200, checkStatus, { 'Cache-Control': 'no-store' })
    if (req.method === 'GET' && path === '/api/mcp/project/source') return send(res, 200, projectSource(), { 'Cache-Control': 'no-store' })
    if (req.method === 'GET' && path === '/api/mcp/project/commit') return send(res, 200, projectCommit(new URL(req.url, 'http://localhost').searchParams.get('sha')))
    if (req.method === 'GET' && path === '/api/mcp/project/documents') return send(res, 200, projectDocuments(), { 'Cache-Control': 'no-store' })
    if (req.method === 'GET' && path === '/api/mcp/project/export') {
      return send(res, 200, exportProject(), { 'Content-Disposition': 'attachment; filename="neuraldoc-dokumentaenderungen.json"', 'Cache-Control': 'no-store' })
    }
    if (req.method === 'GET' && path === '/api/mcp/setup') return send(res, 200, { ...setupStatus(), settings: publicSettings(), editable: !showcaseOnly() }, { 'Cache-Control': 'no-store' })
    if (req.method === 'POST' && path === '/api/mcp/settings') {
      localMutation()
      if (showcaseOnly()) throw new DraftError('Im Showcase lassen sich keine Keys hinterlegen.', 403)
      const settings = saveSettings(await readJsonBody(req, 65536))
      log.info('setup', 'Einstellungen gespeichert', { keys: Object.entries(settings.secrets).filter(([, s]) => s.set).map(([k, s]) => `${k} (${s.source})`).join(', ') || 'keine' })
      return send(res, 200, { ...setupStatus(), settings, editable: true })
    }
    if (req.method === 'POST' && path === '/api/mcp/models') {
      // POST with origin check: the server fetches the local model server's address given in the form.
      localMutation()
      if (showcaseOnly()) throw new DraftError('Im Showcase werden keine Modelle gewählt.', 403)
      const { provider, baseUrl } = await readJsonBody(req, 4096)
      return send(res, 200, await listModels(String(provider), { baseUrl: baseUrl ? String(baseUrl) : undefined }), { 'Cache-Control': 'no-store' })
    }
    if (req.method === 'POST' && path === '/api/mcp/reset') {
      // scope projects: imported projects only; all: also profile, keys and model. The MCP token stays, so agents stay connected.
      localMutation()
      const { scope } = await readJsonBody(req, 1024)
      if (!['projects', 'all'].includes(scope)) throw new Error('scope muss projects oder all sein.')
      resetProjects(); resetGitHub(); resetConfluence()
      if (scope === 'all') { resetSettings(); resetConnections(); log.info('reset', 'Profil, Keys und Datenbankverbindungen gelöscht') }
      return send(res, 200, { ok: true, scope })
    }

    if (path.startsWith('/api/mcp/github/')) {
      // Approved sections as pull requests: off in the showcase, every change only from this app.
      if (showcaseOnly()) throw new DraftError('Im Showcase gibt es keine GitHub-Anbindung.', 403)
      if (req.method === 'GET' && path === '/api/mcp/github/status') return send(res, 200, await githubStatus(activeProject(), { refresh: true, getProject: activeProject }), { 'Cache-Control': 'no-store' })
      if (req.method === 'GET' && path === '/api/mcp/github/app/callback') {
        // GitHub sends the browser back here after the app was created; the state from appManifest is the proof.
        const params = new URL(req.url, 'http://localhost').searchParams
        const done = await completeAppManifest({ code: params.get('code'), state: params.get('state') }).then((app) => `installieren&slug=${encodeURIComponent(app.slug)}`, (error) => { logError('github', error); return `fehler&grund=${encodeURIComponent(error.message)}` })
        res.writeHead(302, { Location: `/app/einstellungen?github=${done}` }); return res.end()
      }
      if (req.method === 'POST') {
        localMutation()
        const body = await readJsonBody(req, 16384)
        if (path === '/api/mcp/github/sync') return send(res, 200, await syncGitHub(activeProject, { force: body.force === true, only: typeof body.key === 'string' ? body.key : undefined }))
        if (path === '/api/mcp/github/test') return send(res, 200, await testGitHub(activeProject()))
        if (path === '/api/mcp/github/target') {
          const project = activeProject()
          if (!project) throw new Error('Zuerst ein eigenes Projekt importieren.')
          setProjectTarget(project, { origin: body.origin, repo: body.repo ? String(body.repo) : '', base: body.base ? String(body.base) : '' })
          scheduleSync(activeProject)
          return send(res, 200, await githubStatus(project))
        }
        if (path === '/api/mcp/github/app/manifest') return send(res, 200, appManifest({ origin: originOf(req), name: body.name ? String(body.name) : '', org: body.org ? String(body.org).trim() : '' }))
      }
    }

    if (path.startsWith('/api/mcp/sources/') || path.startsWith('/api/mcp/confluence/')) {
      // Confluence and Google Drive as live documentation: off in the showcase, every change only from this app.
      if (showcaseOnly()) throw new DraftError('Im Showcase gibt es keine Confluence- oder Drive-Anbindung.', 403)
      if (req.method === 'GET' && path === '/api/mcp/confluence/status') {
        const project = activeProject()
        return send(res, 200, { configured: confluenceConfig().configured, live: !!project?.sources?.docs?.live?.confluence, ...confluenceStatus, links: project ? confluenceLinks(project) : {} }, { 'Cache-Control': 'no-store' })
      }
      if (req.method === 'POST') {
        localMutation()
        const body = await readJsonBody(req, 4096)
        if (path === '/api/mcp/sources/test') {
          const settle = (work) => work.then((value) => ({ ok: true, ...value }), (error) => ({ ok: false, message: error.message }))
          return send(res, 200, {
            confluence: confluenceConfig().configured ? await settle(testConfluence()) : null,
            drive: driveConfig().configured || driveConfig().invalid ? await settle(testDrive(typeof body.folder === 'string' ? body.folder : '')) : null,
          })
        }
        if (path === '/api/mcp/confluence/sync') { const project = activeProject(); if (!project) throw new DraftError('Zuerst ein Projekt importieren.', 400); return send(res, 200, { ...(await syncConfluence(activeProject)), links: confluenceLinks(project) }) }
      }
    }

    if (path.startsWith('/api/mcp/db/')) {
      // Own PostgreSQL connections: off in the public showcase, every change and query only from this app.
      if (showcaseOnly()) throw new DraftError('Im Showcase lassen sich keine Datenbanken verbinden.', 403)
      if (req.method === 'GET' && path === '/api/mcp/db/connections') return send(res, 200, { connections: listConnections() }, { 'Cache-Control': 'no-store' })
      if (req.method === 'POST') {
        localMutation()
        const body = await readJsonBody(req, 200_000)
        if (path === '/api/mcp/db/connections') return send(res, 200, saveConnection(body))
        if (path === '/api/mcp/db/connections/delete') return send(res, 200, { connections: deleteConnection(String(body.id)) })
        if (path === '/api/mcp/db/test') return send(res, 200, await testConnection(body))
        if (path === '/api/mcp/db/query') return send(res, 200, await queryConnection(String(body.id), body.sql, body.params ?? []))
      }
    }

    if (!showcaseOnly()) {
      // The normal app: the active project, or the empty start before the first import.
      const project = activeProject()
      const approvers = (value) => Object.fromEntries(docTypeOrder.map((id) => [id, value]))
      const local = () => ({ id: 'local', name: reviewer(), role: profile().role || 'Prüfung & Freigabe' })
      if (req.method === 'GET' && path === '/api/mcp/usage') return send(res, 200, projectUsage(new URL(req.url, 'http://localhost').searchParams))
      if (req.method === 'GET' && path === '/api/mcp/drafts') return send(res, 200, project?.generated ?? {})
      if (req.method === 'POST' && path === '/api/mcp/drafts/generate') { localMutation(); const body = await readJsonBody(req); return send(res, 200, await projectDraft(body.id, body.answer)) }
      if (req.method === 'GET' && path === '/api/mcp/decisions') return send(res, 200, project?.decisions ?? {})
      if (req.method === 'POST' && path === '/api/mcp/decisions') {
        localMutation(); const body = await readJsonBody(req)
        // A section merged on GitHub is part of the repository now; changing it is a new change there.
        if (project && (body.ids || [body.id]).some((id) => isPublished(project.id, id))) throw new DraftError('Diese Änderung ist auf GitHub schon gemergt und lässt sich hier nicht mehr zurücknehmen.', 409)
        if (project && (body.ids || [body.id]).some((id) => isWritten(project.id, id))) throw new DraftError('Diese Änderung steht schon in Confluence. Zurücknehmen geht dort über den Seitenverlauf.', 409)
        const decisions = projectDecisions(body); scheduleSync(activeProject); scheduleConfluence(activeProject); return send(res, 200, decisions)
      }
      if (req.method === 'POST' && path === '/api/mcp/decisions/reset') { localMutation(); const decisions = resetProjectDecisions(); scheduleSync(activeProject); return send(res, 200, decisions) }
      if (req.method === 'GET' && /^\/api\/mcp\/changes\//.test(path)) {
        // Where each approved section is on GitHub: its pull request, open or merged.
        const links = project ? proposalLinks(project) : {}
        const writebacks = Object.entries(links).map(([proposal, l]) => ({ proposal, target: { system: 'GitHub', title: `${l.repo}${l.number ? ` #${l.number}` : ''}`, url: l.url ?? `https://github.com/${l.repo}` }, version: l.number ?? 0, at: l.at, label: l.state === 'merged' ? (l.number ? `PR #${l.number} gemergt` : 'Schon im Repository') : l.state === 'edited' ? `PR #${l.number} (von Hand geändert)` : `In PR #${l.number}` }))
        // Sections written back to Confluence: the page with its new version.
        for (const [proposal, l] of Object.entries(project ? confluenceLinks(project) : {})) if (l.state === 'written') writebacks.push({ proposal, target: { system: 'Confluence', title: `Seite ${l.pageId}`, url: l.url }, version: l.version, at: l.at, label: l.partial ? `Confluence Version ${l.version} (teilweise)` : `In Confluence, Version ${l.version}` })
        return send(res, 200, { checks: [], mrComment: null, approvers: approvers({ ...local(), self: true }), writeBack: false, writebacks, targets: {} })
      }
      if (req.method === 'GET' && path === '/api/mcp/activity') return send(res, 200, { log: [], checks: [], questions: [], writebacks: [], mrComments: [], stats: { calls: 0, answer: 0, raw: 0, perTool: {} } })
      if (req.method === 'POST' && path === '/api/mcp/rules') throw new DraftError('Lokale Projekte verwenden persönliche Freigaben und Dokumentexport.', 400)
      if (req.method === 'GET' && path === '/api/mcp/info') return send(res, 200, {
        server: SERVER_INFO, token: TOKEN, protocol: SUPPORTED[0], drafting: draftingStatus(), stdioPath: STDIO,
        tools: projectTools, surfaceTokens: Math.ceil(JSON.stringify(projectTools).length / 4),
        docTypes: docTypeOrder.map((t) => ({ type: t, label: docTypes[t].label, audience: 'Leser der importierten Dokumentation' })),
        people: [local()], rules: { writeBack: false, mrComment: false, approvers: approvers('local') },
        sources: project ? [{ id: 'git', name: 'Repository', items: `${project.files.length} Code-Dateien · ${project.name}` }, { id: 'documents', name: 'Dokumente', items: `${project.docSources.length} Dokumente · ${project.docFiles.length} Abschnitte` }] : [],
      })
      return send(res, 404, { error: 'Nicht gefunden' })
    }

    // Showcase mode: the prepared MOBIQ example, no model calls.
    const showcase = await mobiq()
    if (req.method === 'POST' && path === '/api/mcp/drafts/generate') {
      // The showcase never calls a paid model: prepared examples only, free contexts are refused.
      localMutation(); const body = await readJsonBody(req, 65536)
      if (body.context) throw new DraftError('Der Showcase erzeugt keine Modelltexte. Eigene Projekte prüfst du in deiner eigenen neuraldoc-Installation.', 403)
      const proposal = showcase.exampleProposals.find((p) => p.id === body.id)
      if (!proposal) throw new Error('Unbekannter Beispielvorschlag.')
      const patch = { text: proposal.text, blocks: proposal.blocks, rows: proposal.rows, why: proposal.why, confidence: proposal.confidence, question: proposal.question, generation: { status: 'draft', id: proposal.id, model: 'Vorbereitetes Beispiel', createdAt: '2026-10-01T00:00:00Z', evidenceIds: [], usage: { inputTokens: null, outputTokens: 0, costUsd: null } } }
      return send(res, 200, { proposal: patch, result: { status: 'draft', question: proposal.question || '' } })
    }
    if (req.method === 'GET' && path === '/api/mcp/drafts') return send(res, 200, {})
    if (req.method === 'GET' && path === '/api/mcp/usage') {
      const params = new URL(req.url, 'http://localhost').searchParams
      return send(res, 200, showcase.usage(params), params.has('download') ? { 'Content-Disposition': 'attachment; filename="neuraldoc-nutzungsverlauf.json"' } : {})
    }
    if (req.method === 'GET' && path === '/api/mcp/info') return send(res, 200, { server: SERVER_INFO, token: TOKEN, protocol: SUPPORTED[0], ...showcase.info() })
    if (req.method === 'POST' && path === '/api/mcp/rules') return send(res, 200, showcase.setRules(await readJsonBody(req)))
    if (req.method === 'GET' && path === '/api/mcp/activity') return send(res, 200, showcase.activity())

    if (req.method === 'GET' && path === '/api/mcp/decisions') return send(res, 200, showcase.decisions())
    if (req.method === 'POST' && path === '/api/mcp/decisions') {
      const body = await readJsonBody(req)
      for (const id of body.ids ?? [body.id]) showcase.setDecision(id, body.decision ?? null, body.by)
      return send(res, 200, showcase.decisions())
    }
    if (req.method === 'POST' && path === '/api/mcp/decisions/reset') return send(res, 200, showcase.resetDecisions())

    const change = path.match(/^\/api\/mcp\/changes\/([\w-]+)$/)
    if (req.method === 'GET' && change) return send(res, 200, showcase.changeStatus(change[1]))
    return send(res, 404, { error: 'Nicht gefunden' })
  } catch (e) {
    const status = e instanceof DraftError ? e.status : 400
    logError('api', e, { method: req.method, path, status })
    if (!res.headersSent) return send(res, status, { error: e.message })
    res.end()
  }
}

/** Connect-style middleware: handles /mcp and /api/mcp/*, passes everything else on. */
export function middleware(req, res, next) {
  const path = (req.url ?? '/').split('?')[0]
  if (path !== '/mcp' && !path.startsWith('/api/mcp/')) return next?.()
  // Changes and failures appear in the container log; successful reads stay quiet.
  const started = Date.now()
  res.on('finish', () => { if (req.method !== 'GET' || res.statusCode >= 400) log[res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info']('http', `${req.method} ${path} ${res.statusCode}`, { ms: Date.now() - started }) })
  if (path === '/mcp') return void mcpEndpoint(req, res).catch((e) => { logError('mcp', e); if (!res.headersSent) send(res, 500, { error: 'Interner Fehler' }) })
  return void api(req, res, path)
}
