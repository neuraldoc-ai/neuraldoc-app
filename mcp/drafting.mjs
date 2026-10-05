// Narrow, provider-backed text generation. No retrieval, approval or source write-back here.
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PATCH_PROMPT, PATCH_PROMPT_VERSION, PROMPT_VERSION, responseSchema, SYSTEM_PROMPT } from './draft-prompt.mjs'
import { runtimeEnv } from './settings.mjs'
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
  if (!['replace', 'patch', 'insert', 'rows'].includes(target.op)) throw new DraftError('Nur replace, patch, insert und rows können formuliert werden.')
  if (['replace', 'patch'].includes(target.op)) requireText(document.before, 'Zu ersetzender Text')
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
  const context = { change: { id: change.id, title: change.title }, document: Object.fromEntries(['id', 'title', 'type', 'audience', 'section', 'before', 'surrounding'].map((k) => [k, document[k]])), target: { id: target.id, op: target.op, instruction: target.instruction, ...(target.columns ? { columns: target.columns } : {}), ...(target.heading ? { heading: requireText(target.heading, 'target.heading', 400) } : {}), ...(target.question ? { question: requireText(target.question, 'target.question', 1000) } : {}), ...(target.preserve === true ? { preserve: true } : {}) }, evidence: evidence.map((e) => ({ id: e.id, source: e.source, text: e.text })) }
  if (Buffer.byteLength(JSON.stringify(context)) > 40000) throw new DraftError('Der Schreibkontext ist zu groß. Bitte nur die relevanten Belege übergeben.')
  return context
}

// A correction of an existing section keeps most of it and never pastes source code into documentation.
const meaningful = (text) => text.split('\n').map((l) => l.trim()).filter((l) => l.length > 2)
const looksLikeCode = (line) => line.length >= 20 && (line.match(/[{}();<>=]/g) || []).length >= 3
function checkPreserved(text, context) {
  const before = meaningful(context.document.before), after = new Set(meaningful(text))
  const kept = before.filter((line) => after.has(line)).length
  if (before.length >= 4 && kept / before.length < 0.6) throw new DraftError(`Entwurf verworfen: Er hätte ${before.length - kept} von ${before.length} unveränderten Zeilen entfernt oder umgeschrieben. Bitte erneut formulieren lassen.`, 502)
  const code = new Set(context.evidence.flatMap((e) => meaningful(e.text)).filter(looksLikeCode))
  const copied = [...after].filter((line) => code.has(line) && !before.includes(line))
  if (copied.length >= 2) throw new DraftError('Entwurf verworfen: Er enthält Quellcode aus den Belegen statt einer Beschreibung. Bitte erneut formulieren lassen.', 502)
}

/** The section with line numbers, as the model sees it for line edits. */
export const numbered = (text) => text.split('\n').map((line, i) => `${i + 1}| ${line}`).join('\n')
const MAX_EDITS = 20
/** Applies line edits ({ op: replace | insert_after | delete, start, end, text }) to the original section, bottom-up. */
export function applyEdits(before, edits) {
  const lines = before.split('\n'), n = lines.length
  const ranges = edits.map((e) => {
    if (!e || !['replace', 'insert_after', 'delete'].includes(e.op) || !Number.isInteger(e.start) || !Number.isInteger(e.end) || typeof e.text !== 'string') throw new DraftError('Das Modell hat ungültige Zeilenänderungen geliefert.', 502)
    if (e.op === 'insert_after' ? e.start < 0 || e.start > n : e.start < 1 || e.end < e.start || e.end > n) throw new DraftError('Eine Zeilenänderung liegt außerhalb des Abschnitts.', 502)
    if (e.op !== 'delete' && !e.text.trim()) throw new DraftError('Eine Zeilenänderung enthält keinen Text.', 502)
    return { ...e, end: e.op === 'insert_after' ? e.start : e.end }
  }).sort((a, b) => b.start - a.start || (a.op === 'insert_after') - (b.op === 'insert_after'))
  for (let i = 1; i < ranges.length; i++) if (ranges[i].op !== 'insert_after' && ranges[i - 1].op !== 'insert_after' && ranges[i].end >= ranges[i - 1].start) throw new DraftError('Zeilenänderungen überschneiden sich.', 502)
  for (const e of ranges) {
    const text = e.text.replace(/\n$/, '').split('\n')
    if (e.op === 'insert_after') lines.splice(e.start, 0, ...text)
    else lines.splice(e.start - 1, e.end - e.start + 1, ...(e.op === 'delete' ? [] : text))
  }
  return lines.join('\n')
}
// Quotes are compared without Markdown emphasis, quote styles and whitespace differences.
const plain = (s) => String(s || '').replace(/[`*_>#|]/g, '').replace(/[„“”"'’]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()
export const quoted = (text, quote) => { const q = plain(quote); return q.length >= 4 && plain(text).includes(q) }
// German or English by function words; null when unclear. A correction never switches the language of its section.
const WORDS = { de: /^(der|die|das|und|ist|nicht|mit|für|wird|eine|einen|den|dem|auf|sie|bei|oder|wenn|auch|sind)$/, en: /^(the|and|is|are|to|of|with|for|this|that|you|be|not|can|when|or|it|an|by|if)$/ }
export function language(text) {
  const words = String(text).toLowerCase().match(/\p{L}+/gu) || [], de = words.filter((w) => WORDS.de.test(w)).length, en = words.filter((w) => WORDS.en.test(w)).length
  return de >= 3 && de > 2 * en ? 'de' : en >= 3 && en > 2 * de ? 'en' : null
}
function validatePatch(value, context) {
  if (!value || !['draft', 'needs_context', 'no_change'].includes(value.status) || !Array.isArray(value.edits) || !Array.isArray(value.findings) || typeof value.question !== 'string' || typeof value.reason !== 'string' || !Array.isArray(value.evidenceIds)) throw new DraftError('Das Modell hat keinen gültigen Entwurf geliefert.', 502)
  const allowed = new Set(context.evidence.map((e) => e.id)), before = context.document.before
  if (value.evidenceIds.some((id) => !allowed.has(id))) throw new DraftError('Der Entwurf verweist auf unbekannte Belege.', 502)
  // A finding counts only with a literal quote from the section and from a code excerpt.
  const findings = value.findings.filter((f) => f && quoted(before, f.doc_quote) && String(f.evidence_id).startsWith('code:') && quoted(context.evidence.find((e) => e.id === f.evidence_id)?.text, f.code_quote) && typeof f.problem === 'string' && f.problem.trim())
  let text = ''
  if (value.status === 'needs_context') {
    if (!value.question.trim() || value.edits.length) throw new DraftError('Eine Rückfrage darf keinen ungesicherten Entwurf enthalten.', 502)
  } else if (value.status === 'no_change') {
    if (!/status=no_change/.test(context.target.instruction)) throw new DraftError('Für diese Textstelle ist „keine Änderung“ nicht vorgesehen.', 502)
    if (!value.reason.trim() || value.edits.length) throw new DraftError('„Keine Änderung“ braucht eine Begründung und keine Zeilenänderung.', 502)
  } else {
    if (!value.evidenceIds.length || !value.reason.trim()) throw new DraftError('Belegverweise oder Begründung fehlen.', 502)
    if (!findings.length) throw new DraftError('Entwurf verworfen: Kein Befund mit wörtlichem Zitat aus Abschnitt und Code.', 502)
    if (!value.edits.length || value.edits.length > MAX_EDITS) throw new DraftError(`Ein Entwurf braucht 1 bis ${MAX_EDITS} Zeilenänderungen.`, 502)
    text = applyEdits(before, value.edits)
    if (text.trim() === before.trim()) throw new DraftError('Der Entwurf ändert den Abschnitt nicht.', 502)
    const was = language(before), now = language(value.edits.map((e) => e.text).join('\n'))
    if (was && now && was !== now) throw new DraftError('Entwurf verworfen: Er wechselt die Sprache des Abschnitts.', 502)
    checkPreserved(text, context)
  }
  return { status: value.status, text, blocks: [], rows: [], reason: value.reason, question: value.question, evidenceIds: [...new Set(value.evidenceIds)], edits: value.edits.map(({ op, start, end, text }) => ({ op, start, end, text })), findings: findings.map(({ doc_quote, evidence_id, code_quote, problem }) => ({ doc_quote, evidence_id, code_quote, problem })) }
}

export function validateDraft(value, context) {
  if (context.target.op === 'patch') return validatePatch(value, context)
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
    if (context.target.preserve && op === 'replace') checkPreserved(value.text, context)
  }
  return { status: value.status, text: value.text, blocks: value.blocks.map((b) => ({ kind: b.kind, text: b.text })), rows: value.rows, reason: value.reason, question: value.question, evidenceIds: [...new Set(value.evidenceIds)] }
}

export const draftStateDir = (env = process.env) => path.resolve(env.NEURALDOC_STATE_DIR || DEFAULT_STATE)

export function draftingConfig(env = runtimeEnv()) {
  const provider = env.NEURALDOC_DRAFT_PROVIDER === 'claude' ? 'anthropic' : env.NEURALDOC_DRAFT_PROVIDER || 'vertex'
  if (!Object.hasOwn(PROVIDER_LABELS, provider)) throw new DraftError('Anbieter muss vertex, gemini, openai, anthropic oder local sein.')
  const google = ['vertex', 'gemini'].includes(provider)
  const model = env.NEURALDOC_LLM_MODEL || (google ? env.NEURALDOC_GEMINI_MODEL || 'gemini-3.5-flash-lite' : DEFAULT_MODELS[provider])
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]{0,199}$/.test(model)) throw new DraftError('Ungültiger Modellname.')
  if (google && !PRICES[model]) throw new DraftError(`Für Gemini sind nur ${Object.keys(PRICES).join(', ')} freigeschaltet.`)
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
export function draftingStatus(env = runtimeEnv()) {
  if (!env.NEURALDOC_DRAFT_PROVIDER && !env.NEURALDOC_LLM_MODEL && !env.GOOGLE_CLOUD_PROJECT) return { configured: false, error: 'Noch kein LLM gewählt.' }
  try {
    const config = draftingConfig(env)
    return { ...draftConnection(config), label: PROVIDER_LABELS[config.provider], model: config.model, configured: config.provider === 'local' || !!config.apiKey, verification: 'configuration-only' }
  } catch (error) { return { configured: false, error: error.message } }
}
export const draftKey = (context, model, connection) => createHash('sha256').update(JSON.stringify({ version: context?.target?.op === 'patch' ? PATCH_PROMPT_VERSION : PROMPT_VERSION, model, connection, context: validateContext(context) })).digest('hex')

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

/** One JSON call to the configured provider: { value, inputTokens, outputTokens, costUsd }. Used for drafts and for check findings. */
export async function callModel(config, { system, content, schema, fetchImpl = fetch, price = modelPrice(config), temperature = 0.2, outputLimit = OUTPUT_LIMIT }) {
  if (config.provider !== 'local' && !config.apiKey) throw new DraftError('Texterstellung ist noch nicht eingerichtet. LLM-Key unter Einstellungen hinterlegen.', 503)
  const google = ['vertex', 'gemini'].includes(config.provider), label = PROVIDER_LABELS[config.provider]
  const request = google ? {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(content) }] }],
    generationConfig: { temperature, maxOutputTokens: outputLimit, thinkingConfig: price.thinkingConfig, responseMimeType: 'application/json', responseJsonSchema: schema },
  } : providerRequest(config, content, system, schema, outputLimit)
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
  const outputTokens = Number.isInteger(normalized.outputTokens) && normalized.outputTokens >= 0 ? normalized.outputTokens : 0
  const inputTokens = Number.isInteger(normalized.inputTokens) && normalized.inputTokens >= 0 ? normalized.inputTokens : null
  const costUsd = config.provider === 'local' ? 0 : normalized.measuredOutput && inputTokens !== null && Number.isFinite(price.input) && Number.isFinite(price.output) ? (inputTokens * price.input + outputTokens * price.output) / 1e6 : null
  return { value, inputTokens, outputTokens, costUsd }
}

export function modelPrice(config) {
  const basePrice = ['vertex', 'gemini'].includes(config.provider) ? PRICES[config.model] : { input: config.inputPrice, output: config.outputPrice }
  if (!basePrice || !Object.hasOwn(PROVIDER_LABELS, config.provider)) throw new DraftError('Modell oder Anbieter nicht freigeschaltet.')
  const regionalMultiplier = config.provider === 'vertex' && config.location !== 'global' && config.model === 'gemini-3.5-flash-lite' ? 1.1 : 1
  return { ...basePrice, input: basePrice.input === null ? null : basePrice.input * regionalMultiplier, output: basePrice.output === null ? null : basePrice.output * regionalMultiplier }
}

async function run(input, { config = draftingConfig(), fetchImpl = fetch } = {}) {
  const context = validateContext(input), price = modelPrice(config)
  fs.mkdirSync(config.stateDir, { recursive: true })
  const connection = draftConnection(config)
  const key = draftKey(context, config.model, connection)
  const cacheFile = path.join(config.stateDir, `draft-${key}.json`)
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    validateDraft(cached.result, context)
    return { ...cached, cached: true }
  }
  const patch = context.target.op === 'patch'
  // Line edits see the section with line numbers; the cache key stays on the validated context.
  const content = patch ? { ...context, document: { ...context.document, numbered: numbered(context.document.before) } } : context
  const { value, inputTokens, outputTokens, costUsd } = await callModel(config, { system: patch ? PATCH_PROMPT : SYSTEM_PROMPT, content, schema: responseSchema(context.target.op), fetchImpl, price, ...(patch ? { outputLimit: 4000 } : {}) })
  const result = validateDraft(value, context)
  const draft = { id: `g-${key.slice(0, 20)}`, target: context.target.id, document: context.document.id, change: context.change.id, contextHash: key, connection, model: config.model, promptVersion: patch ? PATCH_PROMPT_VERSION : PROMPT_VERSION, createdAt: new Date().toISOString(), context, result, usage: { inputTokens, outputTokens, costUsd }, cached: false }
  // Rename makes completed caches atomic. Failed and incomplete responses are never reused.
  const temp = `${cacheFile}.${randomUUID()}.tmp`
  fs.writeFileSync(temp, JSON.stringify(draft, null, 2)); fs.renameSync(temp, cacheFile)
  return draft
}
