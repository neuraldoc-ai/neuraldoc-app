// Narrow, provider-backed text generation. No retrieval, approval or source write-back here.
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PROMPT_VERSION, responseSchema, SYSTEM_PROMPT } from './draft-prompt.mjs'
import { compatibleBase, DEFAULT_MODELS, PROVIDER_LABELS, providerRequest, providerResponse } from './llm-providers.mjs'

const DEFAULT_STATE = fileURLToPath(new URL('./state/', import.meta.url))
const PRICES = {
  'gemini-3.5-flash-lite': { input: 0.30, output: 2.50, thinkingConfig: { thinkingLevel: 'minimal' } },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40, thinkingConfig: { thinkingBudget: 0 } },
}
const OUTPUT_LIMIT = 1800
export class DraftError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const requireText = (value, label, max = 8000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new DraftError(`${label} muss Text mit 1 bis ${max} Zeichen sein.`)
  return value
}

/** Project-neutral contract: a target, surrounding text and attributable evidence. */
export function validateContext(input) {
  if (!input || typeof input !== 'object') throw new DraftError('Schreibkontext fehlt.')
  const { change, document, target, evidence } = input
  requireText(change?.id, 'change.id', 200)
  requireText(change?.title, 'change.title', 400)
  for (const field of ['id', 'title', 'type', 'audience', 'section']) requireText(document?.[field], `document.${field}`, 500)
  for (const field of ['before', 'surrounding']) if (typeof document[field] !== 'string' || document[field].length > 10000) throw new DraftError(`document.${field} muss Text bis 10.000 Zeichen sein.`)
  requireText(target?.id, 'target.id', 200)
  requireText(target?.instruction, 'target.instruction', 1600)
  if (!['replace', 'insert', 'rows'].includes(target.op)) throw new DraftError('Nur replace, insert und rows können formuliert werden.')
  if (target.op === 'replace') requireText(document.before, 'Zu ersetzender Text')
  if (target.op === 'rows' && (!Array.isArray(target.columns) || !target.columns.length || target.columns.length > 12 || target.columns.some((s) => typeof s !== 'string' || s.length > 200))) throw new DraftError('Tabellenspalten fehlen oder sind ungültig.')
  if (!Array.isArray(evidence) || !evidence.length || evidence.length > 30) throw new DraftError('1 bis 30 Belege sind erforderlich.')
  const ids = new Set()
  for (const e of evidence) {
    requireText(e?.id, 'evidence.id', 200)
    requireText(e.source, 'evidence.source', 500)
    requireText(e.text, 'evidence.text', 20000)
    if (ids.has(e.id)) throw new DraftError('Beleg-IDs müssen eindeutig sein.')
    ids.add(e.id)
  }
  // Whitelist data fields; never let the caller set model, endpoint, system prompt or budget.
  const context = { change: { id: change.id, title: change.title }, document: Object.fromEntries(['id', 'title', 'type', 'audience', 'section', 'before', 'surrounding'].map((k) => [k, document[k]])), target: { id: target.id, op: target.op, instruction: target.instruction, ...(target.columns ? { columns: target.columns } : {}), ...(target.heading ? { heading: requireText(target.heading, 'target.heading', 400) } : {}), ...(target.question ? { question: requireText(target.question, 'target.question', 1000) } : {}) }, evidence: evidence.map((e) => ({ id: e.id, source: e.source, text: e.text })) }
  if (Buffer.byteLength(JSON.stringify(context)) > 40000) throw new DraftError('Der Schreibkontext ist zu groß. Bitte nur die relevanten Belege übergeben.')
  return context
}

export function validateDraft(value, context) {
  if (!value || !['draft', 'needs_context', 'no_change'].includes(value.status) || typeof value.text !== 'string' || !Array.isArray(value.blocks) || !Array.isArray(value.rows) || typeof value.question !== 'string' || typeof value.reason !== 'string' || !Array.isArray(value.evidenceIds)) throw new DraftError('Das Modell hat keinen gültigen Entwurf geliefert.', 502)
  if (JSON.stringify(value).length > 16000 || value.blocks.some((b) => !b || !['h', 'p'].includes(b.kind) || typeof b.text !== 'string' || !b.text.trim()) || value.rows.some((r) => !Array.isArray(r) || r.some((s) => typeof s !== 'string'))) throw new DraftError('Das Modell hat ungültige Textblöcke geliefert.', 502)
  const allowed = new Set(context.evidence.map((e) => e.id))
  if (value.evidenceIds.some((id) => !allowed.has(id))) throw new DraftError('Der Entwurf verweist auf unbekannte Belege.', 502)
  const { op, columns, heading } = context.target
  if (value.status === 'needs_context') {
    if (!value.question.trim() || value.text || value.blocks.length || value.rows.length) throw new DraftError('Eine Rückfrage darf keinen ungesicherten Entwurf enthalten.', 502)
  } else if (value.status === 'no_change') {
    if (!/status=no_change/.test(context.target.instruction)) throw new DraftError('Für diese Textstelle ist „keine Änderung“ nicht vorgesehen.', 502)
    if (!value.reason.trim() || value.text || value.blocks.length || value.rows.length) throw new DraftError('„Keine Änderung“ braucht eine Begründung und keinen Text.', 502)
  } else {
    if (!value.evidenceIds.length || !value.reason.trim()) throw new DraftError('Belegverweise oder Begründung fehlen.', 502)
    if (op === 'replace' && (!value.text.trim() || value.blocks.length || value.rows.length) || op === 'insert' && (!value.blocks.length || value.text || value.rows.length) || op === 'rows' && (!value.rows.length || value.rows.some((r) => r.length !== columns.length) || value.text || value.blocks.length)) throw new DraftError('Der Entwurf passt nicht zur ausgewählten Textstelle.', 502)
    if (heading && op === 'insert' && !value.blocks.some((b) => b.kind === 'h' && b.text === heading)) throw new DraftError('Die vorgegebene Überschrift wurde verändert.', 502)
  }
  return { status: value.status, text: value.text, blocks: value.blocks.map((b) => ({ kind: b.kind, text: b.text })), rows: value.rows, reason: value.reason, question: value.question, evidenceIds: [...new Set(value.evidenceIds)] }
}

export const draftStateDir = (env = process.env) => path.resolve(env.NEURALDOC_STATE_DIR || DEFAULT_STATE)

export function draftingConfig(env = process.env) {
  const provider = env.NEURALDOC_DRAFT_PROVIDER === 'claude' ? 'anthropic' : env.NEURALDOC_DRAFT_PROVIDER || 'vertex'
  if (!Object.hasOwn(PROVIDER_LABELS, provider)) throw new DraftError('Anbieter muss vertex, gemini, openai, anthropic oder local sein.')
  const google = ['vertex', 'gemini'].includes(provider)
  const model = env.NEURALDOC_LLM_MODEL || (google ? env.NEURALDOC_GEMINI_MODEL || (provider === 'vertex' ? 'gemini-2.5-flash-lite' : 'gemini-3.5-flash-lite') : DEFAULT_MODELS[provider])
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]{0,199}$/.test(model)) throw new DraftError('Ungültiger Modellname.')
  if (google && !PRICES[model]) throw new DraftError('Für Gemini sind nur Flash-Lite-Modelle freigeschaltet.')
  const project = env.GOOGLE_CLOUD_PROJECT || ''
  const location = env.GOOGLE_CLOUD_LOCATION || 'global'
  const mode = env.NEURALDOC_VERTEX_MODE || 'express'
  if (provider === 'vertex') {
    if (env.NEURALDOC_VERTEX_AUTH && env.NEURALDOC_VERTEX_AUTH !== 'api-key') throw new DraftError('Dieser Vertex-Adapter verwendet einen vorhandenen Vertex-API-Key.')
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)) throw new DraftError('GOOGLE_CLOUD_PROJECT muss die Google-Cloud-Projekt-ID enthalten.', 503)
    if (!['express', 'standard'].includes(mode)) throw new DraftError('NEURALDOC_VERTEX_MODE muss express oder standard sein.')
    if (!/^[a-z][a-z0-9-]{0,49}$/.test(location) || mode === 'express' && location !== 'global') throw new DraftError('Vertex Express verwendet GOOGLE_CLOUD_LOCATION=global.')
  }
  const format = env.NEURALDOC_LLM_FORMAT || 'json_schema'
  if (!['json_schema', 'json_object'].includes(format) || format === 'json_object' && provider !== 'local') throw new DraftError('JSON-Modus ist nur für lokale LLMs konfigurierbar.')
  let baseUrl
  try { baseUrl = provider === 'local' ? compatibleBase(env.NEURALDOC_LLM_BASE_URL || 'http://127.0.0.1:11434/v1') : provider === 'openai' ? 'https://api.openai.com/v1' : undefined } catch (e) { throw new DraftError(e.message) }
  const rate = (name) => {
    if (!env[name]) return null
    const v = Number(env[name]); if (!Number.isFinite(v) || v < 0) throw new DraftError(`${name} muss eine nicht negative Zahl sein.`)
    return v
  }
  const apiKey = { vertex: env.VERTEX_API_KEY, gemini: env.GEMINI_API_KEY || env.GOOGLE_API_KEY, openai: env.OPENAI_API_KEY, anthropic: env.ANTHROPIC_API_KEY, local: env.NEURALDOC_LLM_API_KEY }[provider]
  return { provider, model, project, location, mode, baseUrl, format, apiKey: apiKey?.trim(), inputPrice: rate('NEURALDOC_LLM_INPUT_USD_PER_MILLION'), outputPrice: rate('NEURALDOC_LLM_OUTPUT_USD_PER_MILLION'), stateDir: draftStateDir(env) }
}

// Cache identity includes the provider/project, never credentials.
export const draftConnection = ({ provider, project, location, mode, baseUrl, format }) => ({ provider, ...(provider === 'vertex' ? { project, location, mode } : {}), ...(['openai', 'local'].includes(provider) ? { baseUrl, format } : {}) })
export function draftingStatus(env = process.env) {
  try {
    const config = draftingConfig(env)
    return { ...draftConnection(config), label: PROVIDER_LABELS[config.provider], model: config.model, configured: config.provider === 'local' || !!config.apiKey, verification: 'configuration-only' }
  } catch (error) { return { configured: false, error: error.message } }
}
export const draftKey = (context, model, connection) => createHash('sha256').update(JSON.stringify({ version: PROMPT_VERSION, model, connection, context: validateContext(context) })).digest('hex')

export function draftEndpoint(config, method) {
  if (!['countTokens', 'generateContent'].includes(method)) throw new DraftError('Ungültige Modelloperation.')
  if (config.provider === 'gemini') return `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:${method}`
  const host = config.location === 'global' ? 'aiplatform.googleapis.com' : `${config.location}-aiplatform.googleapis.com`
  const resource = config.mode === 'express' ? '' : `projects/${config.project}/locations/${config.location}/`
  return `https://${host}/v1/${resource}publishers/google/models/${config.model}:${method}`
}

// Different targets run concurrently; duplicate requests share one provider call.
const pending = new Map()
export function generateDraft(input, options = {}) {
  const config = options.config ?? draftingConfig()
  const key = `${config.stateDir}:${draftKey(input, config.model, draftConnection(config))}`
  if (pending.has(key)) return pending.get(key).then((draft) => ({ ...draft, cached: true }))
  const job = run(input, { ...options, config }).finally(() => pending.delete(key))
  pending.set(key, job)
  return job
}

async function run(input, { config = draftingConfig(), fetchImpl = fetch } = {}) {
  const context = validateContext(input)
  const google = ['vertex', 'gemini'].includes(config.provider)
  const basePrice = google ? PRICES[config.model] : { input: config.inputPrice, output: config.outputPrice }
  if (!basePrice || !Object.hasOwn(PROVIDER_LABELS, config.provider)) throw new DraftError('Modell oder Anbieter nicht freigeschaltet.')
  const regionalMultiplier = config.provider === 'vertex' && config.location !== 'global' && config.model === 'gemini-3.5-flash-lite' ? 1.1 : 1
  const price = { ...basePrice, input: basePrice.input === null ? null : basePrice.input * regionalMultiplier, output: basePrice.output === null ? null : basePrice.output * regionalMultiplier }
  fs.mkdirSync(config.stateDir, { recursive: true })
  const connection = draftConnection(config)
  const key = draftKey(context, config.model, connection)
  const cacheFile = path.join(config.stateDir, `draft-${key}.json`)
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    validateDraft(cached.result, context)
    return { ...cached, cached: true }
  }
  if (config.provider !== 'local' && !config.apiKey) throw new DraftError('Texterstellung ist noch nicht eingerichtet. API-Key serverseitig setzen.', 503)
  const label = PROVIDER_LABELS[config.provider]
  const request = google ? {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(context) }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: OUTPUT_LIMIT, thinkingConfig: price.thinkingConfig, responseMimeType: 'application/json', responseJsonSchema: responseSchema(context.target.op) },
  } : providerRequest(config, context, SYSTEM_PROMPT, responseSchema(context.target.op), OUTPUT_LIMIT)
  const call = async (method, body) => {
    let response
    try { response = await fetchImpl(google ? draftEndpoint(config, method) : request.url, { method: 'POST', headers: google ? { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey } : request.headers, body: JSON.stringify(google ? body : request.body), signal: AbortSignal.timeout(config.provider === 'local' ? 120000 : 45000) }) }
    catch { throw new DraftError(`${label} ist nicht erreichbar. Kein automatischer Wiederholungsversuch.`, 502) }
    // Provider bodies can include prompts or credentials. Only expose a safe status.
    if (!response.ok) throw new DraftError(`${label}-Anfrage fehlgeschlagen (HTTP ${response.status}). Modellzugriff und API-Key prüfen; kein automatischer Modellwechsel.`, 502)
    try { return await response.json() } catch { throw new DraftError(`${label} hat eine unlesbare Antwort geliefert.`, 502) }
  }
  const raw = await call('generateContent', request)
  let normalized
  if (google) {
    const candidate = raw.candidates?.[0]
    if (candidate?.finishReason !== 'STOP') throw new DraftError('Gemini hat den Entwurf nicht vollständig abgeschlossen. Der bisherige Vorschlag bleibt erhalten.', 502)
    const usage = raw.usageMetadata || {}
    normalized = { text: (candidate.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text || '').join(''), inputTokens: usage.promptTokenCount, outputTokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0), measuredOutput: Number.isInteger(usage.candidatesTokenCount) }
  } else {
    try { normalized = providerResponse(config, raw); normalized.measuredOutput = Number.isInteger(normalized.outputTokens) } catch (e) { throw new DraftError(e.message, 502) }
  }
  let value
  try { value = JSON.parse(normalized.text) }
  catch { throw new DraftError(`${label} hat ungültiges JSON geliefert. Der bisherige Vorschlag bleibt erhalten.`, 502) }
  const result = validateDraft(value, context)
  const outputTokens = Number.isInteger(normalized.outputTokens) && normalized.outputTokens >= 0 ? normalized.outputTokens : 0
  const actualInput = Number.isInteger(normalized.inputTokens) && normalized.inputTokens >= 0 ? normalized.inputTokens : null
  const costUsd = config.provider === 'local' ? 0 : normalized.measuredOutput && actualInput !== null && Number.isFinite(price.input) && Number.isFinite(price.output) ? (actualInput * price.input + outputTokens * price.output) / 1e6 : null
  const draft = { id: `g-${key.slice(0, 20)}`, target: context.target.id, document: context.document.id, change: context.change.id, contextHash: key, connection, model: config.model, promptVersion: PROMPT_VERSION, createdAt: new Date().toISOString(), context, result, usage: { inputTokens: actualInput, outputTokens, costUsd }, cached: false }
  // Rename makes completed caches atomic. Failed and incomplete responses are never reused.
  const temp = `${cacheFile}.${randomUUID()}.tmp`
  fs.writeFileSync(temp, JSON.stringify(draft, null, 2)); fs.renameSync(temp, cacheFile)
  return draft
}
