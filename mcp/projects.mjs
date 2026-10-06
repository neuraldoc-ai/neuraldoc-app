import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { importProject, digest, BUNDLE_ID } from './project-import.mjs'
import { withFeatures } from './project-features.mjs'
import { describeFeatures } from './feature-texts.mjs'
import { codeChanges, sectionChanges, valueConflicts } from './change-facts.mjs'
import { withUpload } from './project-upload.mjs'
import { createJevClient, MODEL } from './semantic-mapping.mjs'
import { codeChunks } from './retrieval.mjs'
import { DraftError, draftingConfig, draftingStatus } from './drafting.mjs'
import { applyLineEdits, CHECK_PROMPT_VERSION, checkDocumentLists, checkSection, codeIndex, createSectionRetriever, excerptId, pool, sectionTerms, verifyWithJev } from './check.mjs'
import { log, logError } from './log.mjs'
import { profile, reviewer, runtimeEnv } from './settings.mjs'
import { scheduleSync } from './github.mjs'

export const projectsDir = path.join(process.env.NEURALDOC_STATE_DIR || fileURLToPath(new URL('./state/', import.meta.url)), 'projects')
const activePath = path.join(projectsDir, 'active.json')
// Model answers of the check, content-addressed: the same request gives the same answer in every project and import.
const checkCache = path.join(projectsDir, '..', 'check-cache')
let busy = false
let drafting = 0 // drafts run side by side; imports, checks, switches and resets wait for all of them
const fileFor = (id) => {
  if (!/^[a-f0-9]{20}$/.test(id)) throw new Error('Ungültige Projekt-ID.')
  return path.join(projectsDir, id, 'project.json')
}
const read = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(value)); fs.renameSync(file + '.tmp', file) }
export const showcaseOnly = () => process.env.NEURALDOC_MODE === 'showcase'
export function activeProject() {
  if (showcaseOnly()) return null
  const active = read(activePath, null)
  const project = active?.id ? read(fileFor(active.id), null) : null
  return project?.docSources ? project : null // projects of the old diff importer are not loaded
}
export function projectPayload(project = activeProject()) {
  const mapping = project?.mapping ? (({ records, ...rest }) => rest)(project.mapping) : null
  // The prepared MOBIQ showcase exists only in showcase mode; the normal app starts empty.
  return { mode: showcaseOnly() ? 'showcase' : project ? 'working' : 'empty', canImport: !showcaseOnly(), project: project ? { id: project.id, name: project.name, sources: project.sources, createdAt: project.createdAt, warnings: project.warnings, mapping, files: project.files.map(({ text, ...rest }) => rest), documents: project.docFiles.map(({ text, ...rest }) => rest), moduleDefs: project.moduleDefs } : null, dataset: project?.dataset ? withReviewer(withFeatures(project, project.dataset)) : null, history: project?.history ? { ref: project.history.ref, tag: project.history.tag, commits: project.history.commits.length } : null, graph: project?.graph ?? null }
}
// Approvals carry the name from the settings, also for projects imported before it was entered.
function withReviewer(dataset) {
  const { name, role } = profile(), local = { name: name || 'Lokaler Nutzer', role: role || 'Prüfung & Freigabe' }
  // Checks before 2026-10-05 stored a placeholder as question and a suffix in the title; a question comes only from the model.
  const proposals = dataset.proposals.map((p) => ({ ...p, title: p.title.replace(/: weicht vom Code ab$/, ''), question: /^Korrektur noch nicht formuliert/.test(p.question || '') ? '' : p.question }))
  return { ...dataset, proposals, currentUser: { ...local, initials: initials(local.name) }, people: { ...dataset.people, local } }
}
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'DU'
async function exclusive(run) {
  if (busy || drafting) throw new DraftError('Es läuft schon ein Import oder Modelllauf. Versuch es gleich noch einmal.', 409)
  busy = true
  try { return await run() } finally { busy = false }
}
async function concurrent(run) {
  if (busy) throw new DraftError('Es läuft schon ein Import oder Modelllauf. Versuch es gleich noch einmal.', 409)
  drafting++
  try { return await run() } finally { drafting-- }
}

/** Imports an upload (ZIP from the browser, optionally with Git URLs in its manifest). */
export async function addProject(zip) {
  if (showcaseOnly()) throw new DraftError('Im Showcase ist der Import ausgeschaltet.', 403)
  return exclusive(async () => {
    fs.mkdirSync(projectsDir, { recursive: true })
    log.info('import', 'Upload empfangen', { bytes: zip?.length ?? 0 })
    const project = await withUpload(zip, projectsDir, (input) => importProject(input, { projectsDir }))
    const previous = read(fileFor(project.id), null)
    if (previous?.docSources) { write(activePath, { id: previous.id }); log.info('import', 'Gleicher Stand schon importiert, Projekt wieder aktiviert', { id: previous.id }); return projectPayload(previous) }
    write(fileFor(project.id), project); write(activePath, { id: project.id })
    return projectPayload(project)
  })
}
export function activateProject(id) {
  if (busy || drafting) throw new DraftError('Du kannst das Projekt wechseln, sobald der laufende Import oder Modelllauf fertig ist.', 409)
  if (showcaseOnly()) throw new DraftError('Der Showcase verwendet nur Beispieldaten.', 403)
  if (id && !fs.existsSync(fileFor(id))) throw new Error('Projekt nicht gefunden.')
  write(activePath, { id: id || null }); return projectPayload()
}
/** Deletes every imported project with its check, drafts, decisions and caches; the app starts empty again. */
export function resetProjects() {
  if (showcaseOnly()) throw new DraftError('Im Showcase gibt es nichts zurückzusetzen.', 403)
  if (busy || drafting) throw new DraftError('Es läuft gerade ein Import oder Modelllauf. Setz danach zurück.', 409)
  const count = projectList().length
  fs.rmSync(projectsDir, { recursive: true, force: true }); fs.rmSync(checkCache, { recursive: true, force: true })
  log.info('reset', 'Projekte gelöscht', { projects: count })
  return projectPayload()
}
export function projectList() {
  if (showcaseOnly()) return []
  return fs.existsSync(projectsDir) ? fs.readdirSync(projectsDir).filter((id) => /^[a-f0-9]{20}$/.test(id)).map((id) => read(fileFor(id), null)).filter((p) => p?.docSources).map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt })) : []
}
const save = (p) => write(fileFor(p.id), p)
const requireProject = () => { const project = activeProject(); if (!project) throw new Error('Zuerst ein eigenes Projekt importieren.'); return project }
const key = (env) => { const value = env.TYPESAFE_API_KEY || env.JEV_API_KEY; if (!value?.trim()) throw new DraftError('Jev-Key fehlt. Unter Einstellungen hinterlegen.', 503); return value.trim() }

export { codeChunks }
const TYPE_LABELS = { nutzer: 'Nutzerhandbuch', dialog: 'Dialogbeschreibung', parameter: 'Parametertabelle', technik: 'Technische Dokumentation', installation: 'Installationsanleitung', architektur: 'Architekturbeschreibung' }
// Jev's second opinion on a finding. Confirmed findings are marked "sicher", findings Jev clearly refutes are dropped,
// everything else stays "prüfen". Thresholds tuned on the benchmarks in mcp/eval (README there).
const JEV_SURE = 0.7, JEV_VETO = 0.75, JEV_VETO_CONFIDENCE = 0.6
/** What the code says about the values of a section: changes since the last release it still states, and values the code sets differently in different places (change-facts.mjs). */
function valueFacts(section, retriever, changes) {
  return { changes: sectionChanges(section.text, changes), conflicts: valueConflicts(section.text, sectionTerms(section.text), (n) => retriever.values(n)) }
}

export const sectionDocument = (p, section) => ({ title: p.docSources.find((s) => s.id === section.source)?.title ?? section.title, path: section.path, kind: TYPE_LABELS[section.type] || 'Dokumentation' })

/** Jev weighs the findings of one section: clear contradictions are dropped, deletions need a confirmation. */
async function weigh(p, section, result, jev, jevVeto = true) {
  if (!result.findings.length || !jev) return result
  const opinions = await verifyWithJev(jev, { section, findings: result.findings, excerpts: result.excerpts, total: p.files.length })
  const findings = [], dropped = [...result.dropped]
  result.findings.forEach((f, i) => {
    const o = opinions[i]
    if (jevVeto && o.verdict === 'refuted' && o.refuted >= JEV_VETO && o.confidence >= JEV_VETO_CONFIDENCE) dropped.push({ kind: f.kind, doc_quote: f.doc_quote, reason: `Jev widerspricht (${Math.round(o.refuted * 100)} %)` })
    // Deleting text rests on a name the uploaded code lacks; dependencies are never uploaded. So a deletion needs Jev's confirmation too.
    else if (jevVeto && f.kind === 'removed' && !(o.verdict === 'confirmed' && o.confirmed >= JEV_SURE)) dropped.push({ kind: f.kind, doc_quote: f.doc_quote, reason: 'Streichung ohne Bestätigung durch Jev' })
    else findings.push({ ...f, jev: o.verdict ? o : null, sure: o.verdict === 'confirmed' && o.confirmed >= JEV_SURE })
  })
  if (findings.length === result.findings.length) return { ...result, findings }
  return { ...result, findings, dropped, status: findings.length ? 'findings' : 'ok', text: findings.length ? applyLineEdits(section.text, findings.flatMap((f) => f.edits)) : section.text }
}

/** Adds the entries the completeness pass found to a section's result, unless they touch the same lines or names. */
function mergeListFindings(result, section, extra, excerpts) {
  const named = (f) => new Set(f.edits.flatMap((e) => e.text.match(/`([^`\n]+)`/g) ?? []))
  const kept = [...result.findings]
  for (const f of extra) {
    const mine = named(f)
    if (kept.some((k) => [...named(k)].some((n) => mine.has(n)))) continue
    try { applyLineEdits(section.text, [...kept, f].flatMap((x) => x.edits)) } catch { continue }
    kept.push(f)
  }
  if (kept.length === result.findings.length) return result
  return { ...result, status: 'findings', findings: kept, excerpts: [...result.excerpts, ...excerpts.filter((c) => !result.excerpts.includes(c))], text: applyLineEdits(section.text, kept.flatMap((x) => x.edits)), summary: result.findings.length ? result.summary : `${kept.length} Abweichung${kept.length === 1 ? '' : 'en'} zum aktuellen Code.` }
}

/** What a proposal carries for the dashboard: the corrected section and every finding with its reason and evidence. */
function generationOf(result, section) {
  const status = result.status === 'findings' ? 'draft' : 'needs_context'
  return {
    text: status === 'draft' ? result.text : section.text,
    why: result.summary || (status === 'draft' ? `${result.findings.length} Abweichung${result.findings.length === 1 ? '' : 'en'} zum aktuellen Code.` : 'Rückfrage zur Prüfung.'),
    confidence: result.findings.length && result.findings.every((f) => f.sure) ? 'hoch' : 'pruefen',
    // A draft can carry a question too: two places in the code set different values for what the section states.
    question: result.question || '',
    generation: {
      status, recommendation: result.summary, id: `check-${digest(JSON.stringify(result.findings)).slice(0, 16)}`, model: result.model, createdAt: new Date().toISOString(),
      evidenceIds: [...new Set(result.findings.flatMap((f) => f.evidence.map((e) => e.id)))],
      findings: result.findings.map(({ kind, doc_quote, explanation, evidence, absent, edits, jev, sure }) => ({ kind, doc_quote, explanation, evidence, absent, edits, sure: !!sure, jev: jev ? { verdict: jev.verdict, probability: jev.probability } : null })),
      usage: result.usage ?? { inputTokens: null, outputTokens: 0, costUsd: null },
      ...(result.answer ? { answer: result.answer } : {}),
    },
  }
}

/** Progress of the running (or last) initial check, for the dashboard: phase sections → lists → jev. */
export const checkStatus = { running: false, phase: null, done: 0, total: 0, findings: 0, startedAt: null, finishedAt: null, error: null }
const progress = (patch) => Object.assign(checkStatus, patch)

/** Starts the initial check in the background; setup errors (no project, no LLM, no Jev key, busy) come back at once. */
export function startCheck(options) {
  if (checkStatus.running || busy || drafting) throw new DraftError('Es läuft schon ein Import oder Modelllauf. Versuch es gleich noch einmal.', 409)
  const p = requireProject(), env = runtimeEnv()
  if (!draftingStatus(env).configured) throw new DraftError('Zuerst ein LLM unter Einstellungen einrichten.', 503)
  key(env)
  progress({ running: true, phase: 'sections', done: 0, total: p.docFiles.filter((d) => d.checkable !== false).length, findings: 0, startedAt: new Date().toISOString(), finishedAt: null, error: null, project: p.id })
  checkProject(options)
    // A new check can change approved corrections (their decision is then dropped): the pull requests follow.
    .then((payload) => { progress({ running: false, phase: 'done', findings: payload.project?.mapping?.findings ?? 0, finishedAt: new Date().toISOString() }); scheduleSync(activeProject) })
    .catch((error) => { logError('check', error); progress({ running: false, phase: 'failed', error: error.message, finishedAt: new Date().toISOString() }) })
  return { ...checkStatus }
}

/**
 * Initial check: every section of every document against the current code, as if the last release had just shipped.
 * Each section with a verified finding becomes a proposal that already carries its correction; sections the code
 * cannot decide become a question.
 */
export async function checkProject({ createClient = createJevClient, fetchImpl, concurrency = 3, jevVeto = true } = {}) {
  return exclusive(async () => {
    const p = requireProject(), started = Date.now()
    const env = runtimeEnv()
    // Findings without an LLM to verify and correct them are a dead end, and Jev costs money: both are set up first.
    if (!draftingStatus(env).configured) throw new DraftError('Zuerst ein LLM unter Einstellungen einrichten.', 503)
    const jev = createClient({ key: key(env), cachePath: path.join(projectsDir, p.id, 'jev-cache.json'), budget: Number(env.NEURALDOC_JEV_BUDGET_USD || .25) })
    const config = draftingConfig({ ...env, NEURALDOC_STATE_DIR: path.join(projectsDir, p.id) })
    const code = codeIndex(p.files), retriever = createSectionRetriever(p.files), cacheDir = checkCache
    // Values and names the commits since the last release changed (from the stored diffs; none for an uploaded folder).
    const changes = p.history ? codeChanges(p.history, projectDiffs(p)) : []
    const targets = p.docFiles.filter((d) => d.checkable !== false)
    log.info('check', 'Erstprüfung gestartet', { project: p.name, sections: targets.length, skipped: p.docFiles.length - targets.length, excerpts: retriever.chunks.length, model: config.model })
    let done = 0, failures = 0, firstError = null
    const llm = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, usd: 0 }
    // The changes of the history in plain words (a few cents, cached): what is different now, for whom, where.
    if (p.history?.features?.length) {
      progress({ phase: 'features' })
      try {
        const described = await describeFeatures({ name: p.name, history: p.history, diffs: projectDiffs(p), config, cacheDir, fetchImpl })
        p.featureTexts = described.texts
        llm.calls += described.usage.calls; llm.cached += described.usage.cached; llm.usd += described.usage.usd
      } catch (error) {
        if (error.status === 503 || [401, 403].includes(error.httpStatus)) throw error
        log.warn('check', 'Änderungen nicht beschrieben', { error: error.message })
      }
    }
    const results = await pool(targets, concurrency, async (section) => {
      try {
        const r = await checkSection({ section, document: sectionDocument(p, section), code, retriever, config, cacheDir, fetchImpl, ...valueFacts(section, retriever, changes) })
        if (r.usage) { llm[r.cached ? 'cached' : 'calls']++; if (!r.cached) { llm.inputTokens += r.usage.inputTokens || 0; llm.outputTokens += r.usage.outputTokens || 0; llm.usd += r.usage.costUsd || 0 } }
        return r
      } catch (error) {
        // A wrong key or a missing model fails every section: stop instead of collecting the same error.
        if (error.status === 503 || [401, 403, 404].includes(error.httpStatus) || /Jev lehnt den Key ab|Jev-Budget/.test(error.message)) throw error
        failures++; firstError ??= error
        log.warn('check', 'Abschnitt nicht geprüft', { doc: section.path, part: section.part, error: error.message })
        return { status: 'error', reason: error.message, findings: [], dropped: [], excerpts: [], terms: [] }
      } finally {
        progress({ done: ++done, total: targets.length })
        if (done % 10 === 0) log.info('check', `${done}/${targets.length} Abschnitte geprüft`, { llmUsd: llm.usd.toFixed(4), jevUsd: jev.usage.estimatedUsd?.toFixed?.(4) })
      }
    })
    // Without a single section the model actually checked, the run says nothing: keep the previous result.
    if (failures && !results.some((r) => !['error', 'skipped'].includes(r.status))) throw firstError
    // Completeness per document: names of the documented kind the code has and no document mentions.
    const allDocs = p.docSources.map((d) => d.text).join('\n'), fatal = (error) => error.status === 503 || [401, 403, 404].includes(error.httpStatus)
    const sources = p.docSources.filter((d) => targets.some((t) => t.source === d.id))
    progress({ phase: 'lists' })
    const lists = await pool(sources, concurrency, async (source) => {
      try {
        const l = await checkDocumentLists({ source, sections: p.docFiles.filter((d) => d.source === source.id), allDocs, code, retriever, config, cacheDir, fetchImpl })
        if (l.usage) { llm[l.cached ? 'cached' : 'calls']++; if (!l.cached) { llm.inputTokens += l.usage.inputTokens || 0; llm.outputTokens += l.usage.outputTokens || 0; llm.usd += l.usage.costUsd || 0 } }
        return l
      } catch (error) {
        if (fatal(error)) throw error
        log.warn('check', 'Vollständigkeit nicht geprüft', { doc: source.path, error: error.message })
        return { bySection: {}, dropped: [] }
      }
    })
    lists.forEach((l) => { for (const [id, extra] of Object.entries(l.bySection)) { const i = targets.findIndex((t) => t.id === id); if (i >= 0 && results[i].status !== 'error') results[i] = mergeListFindings(results[i], targets[i], extra, l.excerpts) } })
    progress({ phase: 'jev' })
    // Jev weighs every finding (one request per section with findings).
    const weighed = await pool(results, concurrency, (r, i) => r.findings.length ? weigh(p, targets[i], r, jev, jevVeto).catch((error) => { if (/Jev lehnt den Key ab|Jev-Budget/.test(error.message)) throw error; log.warn('check', 'Jev-Prüfung fehlgeschlagen', { doc: targets[i].path, error: error.message }); return r }) : r)
    results.splice(0, results.length, ...weighed)
    // Install the complete run at once; a failed run only keeps the caches.
    const previous = p.generated
    p.dataset.proposals = []; p.generated = {}; p.graph.edges = p.graph.edges.filter((edge) => !edge.id.startsWith('jev:') && !edge.id.startsWith('check:'))
    const records = []
    results.forEach((r, i) => {
      const section = targets[i]
      records.push({ doc: section.id, status: r.status, findings: r.findings.length, dropped: r.dropped, reason: r.reason, terms: r.terms?.length ?? 0, candidates: r.excerpts.map((c) => c.id), contradicts: [...new Set(r.findings.flatMap((f) => f.evidence.map((e) => r.excerpts.find((c) => excerptId(c) === e.id)?.id)).filter(Boolean))] })
      if (!['findings', 'unclear'].includes(r.status)) return
      const id = `proposal-${digest(`${p.id}:${section.id}`).slice(0, 16)}`
      const generated = generationOf(r, section)
      p.dataset.proposals.push({ id, bundle: BUNDLE_ID, doc: section.source, section: section.id, at: section.part - 1, op: 'replace', find: section.text, text: generated.text, size: 'absatz', title: section.title, why: generated.why, confidence: generated.confidence, commits: [], question: generated.question })
      p.generated[id] = generated
      // A decision on a different correction no longer applies.
      if (p.decisions[id] && previous[id]?.text !== generated.text) delete p.decisions[id]
      for (const file of new Set(r.findings.flatMap((f) => f.evidence.map((e) => `file:${e.file}`)))) {
        if (p.graph.edges.some((e) => e.id === `check:${section.source}:${file}`)) continue
        p.graph.edges.push({ id: `check:${section.source}:${file}`, source: `doc:${section.source}`, target: file, kind: 'semantic', certainty: 'abgeleitet', evidence: { source: 'Erstprüfung', text: r.findings.filter((f) => f.evidence.some((e) => `file:${e.file}` === file)).map((f) => f.explanation).join(' '), method: `${r.model} + Jev` } })
      }
    })
    for (const id of Object.keys(p.decisions)) if (!p.generated[id]) delete p.decisions[id]
    const count = (status) => records.filter((r) => r.status === status).length
    p.mapping = { model: config.model, verifier: MODEL, kind: 'section-check', promptVersion: CHECK_PROMPT_VERSION, createdAt: new Date().toISOString(), subjects: targets.length, skipped: p.docFiles.length - targets.length, mismatches: count('findings'), consistent: count('ok'), unclear: count('unclear'), errors: failures, findings: records.reduce((n, r) => n + r.findings, 0), usage: { ...jev.usage, llm }, deferred: records.filter((r) => r.status === 'ok').map((r) => `doc:${r.doc}`), records, lists: lists.map((l, i) => ({ doc: sources[i].id, status: l.status ?? null, skipped: l.skipped, candidates: l.candidates ?? [], added: Object.values(l.bySection).flat().length, dropped: l.dropped })) }
    p.graph.metadata.semantic = { status: 'ready', model: `${config.model} + ${MODEL}`, createdAt: p.mapping.createdAt, subjects: targets.length, edges: p.graph.edges.filter((e) => e.id.startsWith('check:')).length, deferred: p.mapping.deferred, usage: p.mapping.usage }
    p.events.push({ at: p.mapping.createdAt, kind: 'mapping', title: `Erstprüfung: ${targets.length} Abschnitte, ${p.mapping.mismatches} mit Abweichung` }); save(p)
    log.info('check', 'Erstprüfung fertig', { sections: targets.length, mismatches: p.mapping.mismatches, findings: p.mapping.findings, consistent: p.mapping.consistent, unclear: p.mapping.unclear, errors: failures, llmCalls: llm.calls, cached: llm.cached, llmUsd: llm.usd.toFixed(4), jevUsd: jev.usage.estimatedUsd?.toFixed?.(4), ms: Date.now() - started })
    return projectPayload(p)
  })
}

/** Checks one section again, optionally with the reviewer's answer to a question or a request for another wording. */
export async function projectDraft(id, answer, { createClient = createJevClient, fetchImpl } = {}) {
  return concurrent(async () => {
    const p = requireProject(), proposal = p.dataset.proposals.find((x) => x.id === id)
    if (!proposal) throw new Error('Unbekannter Entwurf.')
    if (p.decisions[id]) throw new DraftError('Entschiedene Vorschläge zuerst zurücknehmen.', 409)
    if (answer !== undefined && (typeof answer !== 'string' || !answer.trim() || answer.length > 2000)) throw new Error('Antwort muss 1 bis 2.000 Zeichen enthalten.')
    const env = runtimeEnv()
    if (!draftingStatus(env).configured) throw new DraftError('Zuerst ein LLM unter Einstellungen einrichten.', 503)
    const section = p.docFiles.find((d) => d.id === (proposal.section ?? proposal.doc))
    const config = draftingConfig({ ...env, NEURALDOC_STATE_DIR: path.join(projectsDir, p.id) })
    const jev = createClient({ key: key(env), cachePath: path.join(projectsDir, p.id, 'jev-cache.json'), budget: Number(env.NEURALDOC_JEV_BUDGET_USD || .25) })
    const started = Date.now()
    const retriever = createSectionRetriever(p.files)
    const checked = await checkSection({ section, document: sectionDocument(p, section), code: codeIndex(p.files), retriever, config, cacheDir: checkCache, answer, fetchImpl, ...valueFacts(section, retriever, p.history ? codeChanges(p.history, projectDiffs(p)) : []) })
    const r = await weigh(p, section, checked, jev)
    const generated = r.status === 'findings' || r.status === 'unclear' ? generationOf({ ...r, answer }, section) : { text: section.text, why: r.summary || 'Laut Prüfung stimmt der Abschnitt mit dem Code überein.', confidence: 'pruefen', question: '', generation: { status: 'no_change', recommendation: r.summary, id: `check-none-${digest(section.id).slice(0, 8)}`, model: r.model ?? config.model, createdAt: new Date().toISOString(), evidenceIds: [], findings: [], usage: r.usage ?? { inputTokens: null, outputTokens: 0, costUsd: null }, ...(answer ? { answer } : {}) } }
    // Other sections may have been saved meanwhile: read, change and write without awaiting in between.
    const fresh = requireProject()
    fresh.generated[id] = generated; fresh.events.push({ at: new Date().toISOString(), kind: 'draft', title: section.title, usage: r.usage }); save(fresh)
    log.info('draft', 'Abschnitt neu geprüft', { doc: section.path, part: section.part, status: generated.generation.status, findings: r.findings.length, model: r.model, cached: r.cached || undefined, ms: Date.now() - started })
    return { id: generated.generation.id, model: generated.generation.model, result: { status: generated.generation.status, question: generated.question, reason: generated.why, findings: generated.generation.findings }, proposal: generated }
  })
}

export function projectDecisions(input) {
  const p = requireProject()
  if (busy || drafting) throw new DraftError('Gerade werden Texte formuliert. Entscheide, sobald das fertig ist.', 409)
  for (const id of input.ids || [input.id]) {
    const proposal = p.dataset.proposals.find((x) => x.id === id)
    if (!proposal) throw new Error('Unbekannter Vorschlag.')
    const decision = input.decision
    if (!decision) { delete p.decisions[id]; continue }
    if (!['uebernommen', 'verworfen'].includes(decision.state)) throw new Error('Ungültige Entscheidung.')
    if (decision.state === 'uebernommen') {
      if (p.generated[id]?.generation.status !== 'draft') throw new Error('Lass zuerst einen Entwurf formulieren. Eine offene Rückfrage lässt sich nicht übernehmen.')
      const text = decision.edited?.text ?? p.generated[id].text
      if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw new Error('Ungültiger freizugebender Text.')
      // Only a real edit is stored as one; the dashboard labels it "angepasst".
      p.decisions[id] = { state: decision.state, ...(text !== p.generated[id].text ? { edited: { text } } : {}), at: new Date().toISOString(), by: reviewer() }
    } else p.decisions[id] = { state: decision.state, at: new Date().toISOString(), by: reviewer() }
    p.events.push({ at: new Date().toISOString(), kind: 'decision', title: proposal.title, action: decision.state })
  }
  save(p); return p.decisions
}
export function resetProjectDecisions() { const p = requireProject(); if (busy || drafting) throw new DraftError('Gerade werden Texte formuliert. Versuch es danach noch einmal.', 409); p.decisions = {}; save(p); return {} }

/** Approved sections merged back into their documents. PDF, Office and HTML come back as Markdown text. */
export function exportProject() {
  const p = requireProject(), bySource = new Map()
  for (const proposal of p.dataset.proposals) {
    const decision = p.decisions[proposal.id]
    if (decision?.state !== 'uebernommen') continue
    const section = p.docFiles.find((d) => d.id === (proposal.section ?? proposal.doc))
    const items = bySource.get(section.source) || []
    items.push({ section, content: decision.edited?.text ?? p.generated[proposal.id].text, edited: !!decision.edited, proposal: proposal.id })
    bySource.set(section.source, items)
  }
  const files = []
  for (const [sourceId, items] of bySource) {
    const source = p.docSources.find((s) => s.id === sourceId)
    let text = source.text
    for (const item of items) { const at = text.indexOf(item.section.text); if (at >= 0) text = text.slice(0, at) + item.content + text.slice(at + item.section.text.length) }
    files.push({ path: source.binary ? `${source.path}.md` : source.path, original: source.path, beforeSha256: source.sha256, content: text, edited: items.some((i) => i.edited), proposals: items.map((i) => i.proposal) })
  }
  return { project: p.name, exportedAt: new Date().toISOString(), files }
}

/* ---------- Sources for the Daten page: repository, history and documents of the active project ---------- */

const projectDiffs = (p) => read(path.join(projectsDir, p.id, 'diffs.json'), {})

/** The repository as the code editor shows it: files with their last commit, history and merge requests. */
export function projectSource() {
  const p = requireProject(), history = p.history, diffs = history ? projectDiffs(p) : {}
  const last = new Map()
  // Commits are newest first: the first one that touches a file is its last change.
  for (const c of history?.commits ?? []) for (const f of diffs[c.id] ?? []) if (!last.has(f.new_path)) last.set(f.new_path, { short_id: c.id.slice(0, 7), title: c.title, author_name: c.author_name, committed_date: c.committed_date })
  const files = {}
  for (const f of p.files) files[f.path] = { content: f.text, lastCommit: last.get(f.path) ?? null }
  for (const d of p.docSources.filter((s) => s.origin === 'repo')) files[d.path.replace(/^repository\//, '')] ??= { content: d.text, lastCommit: last.get(d.path.replace(/^repository\//, '')) ?? null, extracted: d.binary }
  return {
    repository: { project: p.sources.repo?.label ?? p.name, ref: history?.ref ?? null, tag: history?.tag ?? null, head: history?.head ?? null, files },
    commits: history?.commits ?? [],
    mergeRequests: history?.mergeRequests ?? [],
  }
}

/** One commit with its stored diffs; accepts a full or abbreviated hash. */
export function projectCommit(sha) {
  const p = requireProject(), value = String(sha || '')
  if (!/^[a-f0-9]{4,40}$/i.test(value)) throw new DraftError('Ungültiger Commit-Hash.', 400)
  const matches = (p.history?.commits ?? []).filter((c) => c.id.startsWith(value.toLowerCase()))
  if (matches.length !== 1) throw new DraftError(matches.length ? 'Der Hash ist nicht eindeutig.' : 'Diesen Commit gibt es in der importierten Historie nicht.', 404)
  return { commit: matches[0], files: projectDiffs(p)[matches[0].id] ?? [] }
}

/** Documents with their full text (the page list carries only metadata). */
export function projectDocuments() {
  const p = requireProject()
  return { documents: p.docSources.map(({ id, path: file, origin, format, binary, text }) => ({ id, path: file, origin, format, binary, text, sections: p.docFiles.filter((d) => d.source === id).map((d) => d.id) })) }
}
