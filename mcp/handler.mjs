// MCP protocol (JSON-RPC 2.0) and the HTTP endpoints.
//  - POST /mcp          Streamable HTTP transport, JSON responses (no SSE stream needed for tools)
//  - /api/mcp/*         small REST API for the neuraldoc dashboard (tools, rules, activity, decisions)
// Used by http.mjs (standalone server) and by the Vite dev server (same port as the app).
import { randomUUID } from 'node:crypto'
import { activity, callTool, changeStatus, decisions, info, resetDecisions, setDecision, setRules, toolList } from './core.mjs'
import { getPrompt, promptList } from './prompts.mjs'
import { usage } from './usage.mjs'
import { DraftError } from './drafting.mjs'
import { setupStatus } from './setup.mjs'
import { activeProject, addProject, activateProject, projectList, projectPayload, mapProject, projectDraft, projectDecisions, resetProjectDecisions, exportProject, showcaseOnly } from './projects.mjs'
import { proposals as exampleProposals } from '../frontend/src/dashboard/features/docs/showcase-data.ts'
import { projectTools, projectTool } from './project-mcp.mjs'
import { projectUsage } from './project-usage.mjs'

export const TOKEN = process.env.NEURALDOC_MCP_TOKEN ?? 'nd_demo_mobiq_2b7f9c41e8'
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_INFO = { name: 'neuraldoc', title: 'neuraldoc', version: '0.2.1' }
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
        instructions: activeProject() ? 'neuraldoc liest den importierten Git-Snapshot und lokale Dokumente. Fundstellen sind keine Bestätigung der Dokumentrichtigkeit. Freigabe und Export erfolgen im Dashboard.' : INSTRUCTIONS,
      })
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: activeProject() ? projectTools : toolList() })
    case 'prompts/list':
      // The prepared prompts describe the MOBIQ showcase; own projects have none yet.
      return reply({ prompts: activeProject() ? [] : promptList() })
    case 'prompts/get':
      if (activeProject()) return fail(-32602, 'Für eigene Projekte gibt es keine vorbereiteten Prompts.')
      try {
        return reply(getPrompt(msg.params?.name, msg.params?.arguments))
      } catch (e) {
        return fail(-32602, e.message)
      }
    case 'tools/call': {
      const { name, arguments: args } = msg.params ?? {}
      if (activeProject()) return reply(await projectTool(name, args ?? {}))
      if (name === 'check_change' && args?.draft_id) return reply({ content: [{ type: 'text', text: 'Der Showcase verwendet vorbereitete Entwürfe. Eigene Daten unter Daten → Eigenes Projekt importieren.' }], isError: true })
      return reply(await callTool(name, args ?? {}, { client: ctx.client ?? 'unbekannt', origin: ctx.origin }))
    }
    default:
      return isNotification ? null : fail(-32601, `Method not found: ${msg.method}`)
  }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

const readBody = (req, limit = 1048576) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new DraftError('Anfrage zu groß.', 413)); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
const readJsonBody = async (req, limit) => JSON.parse((await readBody(req, limit)) || '{}')

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

const originOf = (req) => `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:5174'}`

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
    if (req.method === 'GET' && path === '/api/mcp/project') return send(res, 200, { ...projectPayload(), projects: projectList() }, { 'Cache-Control': 'no-store' })
    if (path.startsWith('/api/mcp/project/') && req.method === 'POST') {
      localMutation()
      if (path === '/api/mcp/project/import') return send(res, 200, await addProject(await readJsonBody(req, 65536)))
      if (path === '/api/mcp/project/activate') return send(res, 200, activateProject((await readJsonBody(req)).id))
      if (path === '/api/mcp/project/map') return send(res, 200, await mapProject())
    }
    if (req.method === 'GET' && path === '/api/mcp/project/export') {
      return send(res, 200, exportProject(), { 'Content-Disposition': 'attachment; filename="neuraldoc-dokumentaenderungen.json"', 'Cache-Control': 'no-store' })
    }
    const project = activeProject()
    if (project) {
      if (req.method === 'GET' && path === '/api/mcp/project/commit') {
        const sha = new URL(req.url, 'http://localhost').searchParams.get('sha'), commit = project.dataset.bundles.flatMap((b) => b.commits).find((c) => c.hash === sha)
        if (!commit) throw new Error('Importierter Commit nicht gefunden.')
        const files = project.commitDiffs?.[sha] || []
        return send(res, 200, { commit: { id: commit.hash, title: commit.message, message: commit.message, author_name: commit.author, committed_date: commit.date, stats: { additions: files.reduce((n, f) => n + f.diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).length, 0), deletions: files.reduce((n, f) => n + f.diff.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---')).length, 0) } }, files })
      }
      if (req.method === 'GET' && path === '/api/mcp/usage') return send(res, 200, projectUsage(new URL(req.url, 'http://localhost').searchParams))
      if (req.method === 'GET' && path === '/api/mcp/drafts') return send(res, 200, project.generated)
      if (req.method === 'POST' && path === '/api/mcp/drafts/generate') { localMutation(); const body = await readJsonBody(req); return send(res, 200, await projectDraft(body.id, body.answer)) }
      if (req.method === 'GET' && path === '/api/mcp/decisions') return send(res, 200, project.decisions)
      if (req.method === 'POST' && path === '/api/mcp/decisions') { localMutation(); return send(res, 200, projectDecisions(await readJsonBody(req))) }
      if (req.method === 'POST' && path === '/api/mcp/decisions/reset') { localMutation(); return send(res, 200, resetProjectDecisions()) }
      if (req.method === 'GET' && /^\/api\/mcp\/changes\//.test(path)) return send(res, 200, { checks: [], mrComment: null, approvers: Object.fromEntries(['nutzer','dialog','parameter','technik','installation','architektur'].map((id) => [id, { id: 'local', name: 'Lokaler Nutzer', role: 'Prüfung & Freigabe', self: true }])), writeBack: false, writebacks: [], targets: {} })
      if (req.method === 'GET' && path === '/api/mcp/activity') return send(res, 200, { log: [], checks: [], questions: [], writebacks: [], mrComments: [], stats: { calls: 0, answer: 0, raw: 0, perTool: {} } })
      if (req.method === 'POST' && path === '/api/mcp/rules') throw new DraftError('Lokale Projekte verwenden persönliche Freigaben und Dokumentexport.', 400)
      if (req.method === 'GET' && path === '/api/mcp/info') return send(res, 200, { server: SERVER_INFO, token: TOKEN, protocol: SUPPORTED[0], ...info(), tools: projectTools, people: [{ id: 'local', name: 'Lokaler Nutzer', role: 'Prüfung & Freigabe' }], rules: { writeBack: false, mrComment: false, approvers: Object.fromEntries(['nutzer','dialog','parameter','technik','installation','architektur'].map((id) => [id, 'local'])) }, sources: [{ id: 'git', name: 'Git', items: `${project.files.length} Dateien · ${project.name}` }, { id: 'documents', name: 'Dokumente', items: `${project.docFiles.length} lokale Dokumente` }] })
    }
    if (!project && req.method === 'POST' && path === '/api/mcp/drafts/generate') {
      // The showcase never calls a paid model: prepared examples only, free contexts are refused.
      localMutation(); const body = await readJsonBody(req, 65536)
      if (body.context) throw new DraftError('Der Showcase erzeugt keine Modelltexte. Eigenes Projekt importieren, um Entwürfe zu formulieren.', 403)
      const proposal = exampleProposals.find((p) => p.id === body.id)
      if (!proposal) throw new Error('Unbekannter Beispielvorschlag.')
      const patch = { text: proposal.text, blocks: proposal.blocks, rows: proposal.rows, why: proposal.why, confidence: proposal.confidence, question: proposal.question, generation: { status: 'draft', id: proposal.id, model: 'Vorbereitetes Beispiel', createdAt: '2026-10-01T00:00:00Z', evidenceIds: [], usage: { inputTokens: null, outputTokens: 0, costUsd: null } } }
      return send(res, 200, { proposal: patch, result: { status: 'draft', question: proposal.question || '' } })
    }
    if (!project && req.method === 'GET' && path === '/api/mcp/drafts') return send(res, 200, {})
    if (req.method === 'GET' && path === '/api/mcp/setup') return send(res, 200, setupStatus(), { 'Cache-Control': 'no-store' })
    if (req.method === 'GET' && path === '/api/mcp/usage') {
      const params = new URL(req.url, 'http://localhost').searchParams
      return send(res, 200, usage(params), params.has('download') ? { 'Content-Disposition': 'attachment; filename="neuraldoc-nutzungsverlauf.json"' } : {})
    }
    if (req.method === 'GET' && path === '/api/mcp/info') return send(res, 200, { server: SERVER_INFO, token: TOKEN, protocol: SUPPORTED[0], ...info() })
    if (req.method === 'POST' && path === '/api/mcp/rules') return send(res, 200, setRules(await readJsonBody(req)))
    if (req.method === 'GET' && path === '/api/mcp/activity') return send(res, 200, activity())

    if (req.method === 'GET' && path === '/api/mcp/decisions') return send(res, 200, decisions())
    if (req.method === 'POST' && path === '/api/mcp/decisions') {
      const body = await readJsonBody(req)
      for (const id of body.ids ?? [body.id]) setDecision(id, body.decision ?? null, body.by)
      return send(res, 200, decisions())
    }
    if (req.method === 'POST' && path === '/api/mcp/decisions/reset') return send(res, 200, resetDecisions())

    const change = path.match(/^\/api\/mcp\/changes\/([\w-]+)$/)
    if (req.method === 'GET' && change) return send(res, 200, changeStatus(change[1]))
    return send(res, 404, { error: 'Nicht gefunden' })
  } catch (e) {
    return send(res, e instanceof DraftError ? e.status : 400, { error: e.message })
  }
}

/** Connect-style middleware: handles /mcp and /api/mcp/*, passes everything else on. */
export function middleware(req, res, next) {
  const path = (req.url ?? '/').split('?')[0]
  if (path === '/mcp') return void mcpEndpoint(req, res)
  if (path.startsWith('/api/mcp/')) return void api(req, res, path)
  return next?.()
}
