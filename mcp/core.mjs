// neuraldoc MCP — three tools for the developer, nothing else:
//   check_change    a merge request, branch, ticket or commits → which documentation no longer fits,
//                   drafts ready, one link to approve them; after approval neuraldoc writes them back
//   ask             a business question → passages with a truth status (matches the code, outdated, incomplete)
//   ticket_context  a ticket → rules from the code, the documentation as it stands, open points, who approves later
// neuraldoc reads GitLab, Jira, Confluence and SharePoint itself (sources.mjs) and returns only what the
// answer needs. The proposals, documents and the audience filter are the same the dashboard shows
// (frontend/src/dashboard/features/docs/data.ts and logic.ts), so a link from here opens exactly that.
import './showcase-init.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundles, changeKinds, docTypeOrder, docTypes, docs, natures, people, proposals, release } from '../frontend/src/dashboard/features/docs/data.ts'
import { docOf, list, locationOf, natureOf, plural, routing } from '../frontend/src/dashboard/features/docs/logic.ts'
import { approxTokens, bm25, commitBySha, commitsMentioning, jiraIssue, jiraText, mergeRequest, mergeRequestByBranch, mergeRequestOfCommit, mergeRequestText, sourcesInfo, targetOf } from './sources.mjs'
import { answerTable, changeFacts, completeAnswer, inspectImpact, reviewAnswer, sourceEvidence } from './impact.mjs'
import { generateProposalDraft, generatedProposals } from './draft-context.mjs'
import { draftingStatus } from './drafting.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const STATE = process.env.NEURALDOC_STATE_DIR ? path.resolve(process.env.NEURALDOC_STATE_DIR) : path.resolve(HERE, 'state')

/* ------------------------------------------------------------------ */
/* State: rules, decisions, write-backs, merge-request comments, log  */
/* ------------------------------------------------------------------ */

function stateFile(name) {
  fs.mkdirSync(STATE, { recursive: true })
  return path.join(STATE, name)
}
const readState = (name, fallback) => (fs.existsSync(stateFile(name)) ? JSON.parse(fs.readFileSync(stateFile(name), 'utf8')) : fallback)
const writeState = (name, value) => fs.writeFileSync(stateFile(name), JSON.stringify(value, null, 2))
const appendState = (name, entry) => fs.appendFileSync(stateFile(name), JSON.stringify(entry) + '\n')
const readLines = (name) => (fs.existsSync(stateFile(name)) ? fs.readFileSync(stateFile(name), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
const now = () => new Date().toISOString()

/* ---------- Who approves which doc type ---------- */

export const SELF = 'entwickler'
const DEFAULT_RULES = {
  approvers: { nutzer: 'kroeger', dialog: 'thelen', parameter: 'thelen', technik: SELF, installation: 'brenner', architektur: 'reuter' },
  writeBack: true,
  mrComment: true,
}

export function rules() {
  const saved = readState('rules.json', {})
  return { ...DEFAULT_RULES, ...saved, approvers: { ...DEFAULT_RULES.approvers, ...saved.approvers } }
}

export function setRules(patch) {
  const next = rules()
  for (const [type, who] of Object.entries(patch.approvers ?? {})) {
    if (!docTypes[type] || (who !== SELF && !people[who])) throw new Error('Ungültige Freigaberegel')
    next.approvers[type] = who
  }
  if (typeof patch.writeBack === 'boolean') next.writeBack = patch.writeBack
  if (typeof patch.mrComment === 'boolean') next.mrComment = patch.mrComment
  writeState('rules.json', next)
  return next
}

export function approverOf(type) {
  const who = rules().approvers[type]
  return who === SELF ? { id: SELF, name: 'Entwickler selbst', role: 'wer die Änderung gebaut hat', self: true } : { id: who, ...people[who], self: false }
}
const approverText = (type) => {
  const a = approverOf(type)
  return a.self ? 'darfst du selbst freigeben' : `gibt frei: ${a.name} (${a.role})`
}

/* ---------- Decisions (shared with the dashboard) and write-back ---------- */

export const decisions = () => readState('decisions.json', {})

export function writebacks() {
  const out = []
  for (const e of readLines('writebacks.jsonl')) {
    if (e.action === 'undo') {
      const w = out.findLast((x) => x.proposal === e.proposal && !x.undone)
      if (w) w.undone = e.at
    } else out.push(e)
  }
  return out
}

function writeBack(p, decision, by) {
  const target = targetOf(p.doc)
  if (!target) return
  const before = writebacks().filter((w) => w.target.id === target.id && !w.undone).length
  appendState('writebacks.jsonl', { at: now(), proposal: p.id, bundle: p.bundle, doc: p.doc, title: p.title, target, version: target.version + before + 1, edited: !!decision.edited, by })
}

/** Records a decision from the dashboard (null takes it back). An approval is written back to Confluence or SharePoint. */
export function setDecision(id, decision, by = 'neuraldoc') {
  const p = proposals.find((x) => x.id === id)
  if (!p) throw new Error(`Unbekannter Entwurf: ${id}`)
  const all = decisions()
  const wasApproved = all[id]?.state === 'uebernommen'
  if (wasApproved && writebacks().some((w) => w.proposal === id && !w.undone)) appendState('writebacks.jsonl', { action: 'undo', proposal: id, title: p.title, doc: p.doc, by, at: now() })
  if (!decision) delete all[id]
  else {
    if (!['uebernommen', 'verworfen'].includes(decision.state)) throw new Error('Ungültige Entscheidung')
    const generated = generatedProposals()[id]
    if (decision.state === "uebernommen" && generated?.generation.status === "needs_context" && !decision.edited) throw new Error("Beantworte zuerst die Rückfrage an dieser Stelle.")
    if (decision.state === 'uebernommen' && !decision.edited && generated) {
      decision = { ...decision, edited: { ...(generated.text !== undefined ? { text: generated.text } : {}), ...(generated.blocks ? { blocks: generated.blocks } : {}), ...(generated.rows ? { rows: generated.rows } : {}) } }
    }
    all[id] = { state: decision.state, ...(decision.edited ? { edited: decision.edited } : {}), at: now(), by }
    if (decision.state === 'uebernommen' && rules().writeBack) writeBack(p, decision, by)
  }
  writeState('decisions.json', all)
  appendState('decisions-log.jsonl', { at: now(), proposal: id, doc: p.doc, title: p.title, by, action: decision ? decision.state : 'undo', edited: !!decision?.edited })
  return all
}

export function resetDecisions() {
  for (const id of Object.keys(decisions())) {
    const p = proposals.find((x) => x.id === id)
    appendState('decisions-log.jsonl', { at: now(), proposal: id, doc: p?.doc, title: p?.title ?? id, by: 'neuraldoc-Dashboard', action: 'reset' })
  }
  writeState('decisions.json', {})
  for (const w of writebacks().filter((w) => !w.undone)) appendState('writebacks.jsonl', { action: 'undo', proposal: w.proposal, title: w.title, doc: w.doc, by: 'neuraldoc-Dashboard', at: now() })
  return {}
}

const stateOf = (d) => (!d ? 'offen' : d.state === 'verworfen' ? 'verworfen' : 'freigegeben')
const live = () => {
  const d = decisions()
  const generated = generatedProposals()
  return proposals.map((p) => ({ ...p, ...generated[p.id], state: stateOf(d[p.id]), decision: d[p.id] }))
}

/* ---------- Merge-request comments and the call log ---------- */

export const mrComments = () => readState('mr-comments.json', {})
function commentOnMr(mr, text, by) {
  const all = mrComments()
  all[mr] = { mr, at: now(), by, text }
  writeState('mr-comments.json', all)
  appendState('mr-comments-log.jsonl', all[mr])
}

export const callLog = (limit = 80) => readLines('log.jsonl').slice(-limit).reverse()
const log = (entry) => appendState('log.jsonl', { at: now(), ...entry })

/* ------------------------------------------------------------------ */
/* Helpers shared by the tools                                        */
/* ------------------------------------------------------------------ */

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}
const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
const blockText = (b) => (b.kind === 'table' ? [b.head.join(' | '), ...b.rows.map((r) => r.join(' | '))].join('\n') : b.kind === 'figure' ? `[Bild: ${b.caption}]` : b.text)
const docText = (d) => d.blocks.map(blockText).join('\n')

/** What a draft would put into the document (the edited version once someone changed it). */
function draftText(p) {
  const e = p.decision?.edited
  if (p.op === 'replace') return e?.text ?? p.text
  if (p.op === 'rows') return (e?.rows ?? p.rows).map((r) => r.join(' | ')).join('; ')
  const blocks = e?.blocks ?? p.blocks ?? []
  return blocks.map(blockText).join('\n') || p.task || p.text || ''
}

const draftUrl = (origin, p) => `${origin}/app/dokumente/${p.doc}?p=${p.id}`
const changePath = (b) => `/app/aenderungen/${b.id}`
const ticketKey = (s) => String(s ?? '').toUpperCase().match(/MOB-?(\d{3,5})/)?.[1]
const evidenceRef = (e) => e.system === 'Jira' ? `Jira ${e.issue}, Kommentar ${e.author} (${e.at})` : `${e.file}:${e.line}`

/** Every route by which a developer may name a change: MR, branch, ticket or commits. */
function resolveChange({ merge_request, branch, ticket, commits }) {
  const byMr = (iid) => bundles.find((b) => b.mr === `!${iid}`)
  const byTicket = (key) => {
    const k = ticketKey(key)
    if (!k) return null
    const own = bundles.find((b) => b.ticket === `MOB-${k}`)
    if (own) return own
    // A bug fixed inside a feature branch (e.g. MOB-4829) belongs to that feature's merge request.
    for (const c of commitsMentioning(`MOB-${k}`)) {
      const m = mergeRequestOfCommit(c.id)
      if (m && byMr(m.iid)) return byMr(m.iid)
    }
    return null
  }
  if (merge_request) {
    const m = mergeRequest(merge_request)
    const b = m && byMr(m.iid)
    if (b) return { bundle: b, via: `Merge-Request !${m.iid}` }
  }
  if (branch) {
    const m = mergeRequestByBranch(branch)
    const b = (m && byMr(m.iid)) || byTicket(branch)
    if (b) return { bundle: b, via: `Branch ${branch}` }
  }
  for (const sha of commits ?? []) {
    const own = bundles.find((b) => b.commits.some((c) => c.hash.startsWith(String(sha).slice(0, 7))))
    if (own) return { bundle: own, via: `Commit ${String(sha).slice(0, 8)}` }
    const c = commitBySha(sha)
    const m = c && mergeRequestOfCommit(c.id)
    const b = (m && byMr(m.iid)) || (c && byTicket(c.title))
    if (b) return { bundle: b, via: `Commit ${c.short_id ?? c.id.slice(0, 8)}` }
  }
  if (ticket) {
    const b = byTicket(ticket)
    if (b) return { bundle: b, via: `Ticket MOB-${ticketKey(ticket)}` }
  }
  return null
}

/* ---------- Documentation units and truth status (ask, ticket_context) ---------- */

/** Every document cut into its chapters: heading plus the blocks up to the next heading. */
const sections = docs
  .filter((d) => !d.planned)
  .flatMap((d) => {
    const out = []
    d.blocks.forEach((b, i) => {
      if (b.kind === 'h' || !out.length) out.push({ doc: d, heading: b.kind === 'h' ? b.text : d.title, from: i, to: i + 1, parts: b.kind === 'h' ? [] : [blockText(b)] })
      else {
        out.at(-1).to = i + 1
        out.at(-1).parts.push(blockText(b))
      }
    })
    return out
  })
/** How a chapter is quoted: its prose, or for a bare table its header and size (a flattened table reads badly). */
const sectionQuote = (s) => {
  const blocks = s.doc.blocks.slice(s.from, s.to)
  const prose = blocks.filter((b) => b.kind === 'p').map((b) => b.text)
  if (prose.length) return prose.join(' ')
  const t = blocks.find((b) => b.kind === 'table')
  return t ? `Tabelle mit ${t.rows.length} Zeilen: ${t.head.join(', ')}` : s.parts.join(' ')
}
const searchSections = bm25(sections, (s) => `${s.doc.title} ${s.heading} ${s.heading} ${s.parts.join(' ')}`)
const changeIndex = bm25(bundles, (b) => [b.title, b.title, b.summary, ...b.aspects.map((a) => a.text), ...b.commits.map((c) => c.message), ...(b.after ?? []).map((s) => s.text)].join(' '))
/** Changes that clearly concern the text; a weak match on one common word is not enough, and test-only changes never count. */
const searchChanges = (query, limit, min) => changeIndex(query, 5).filter((r) => r.score >= min && natureOf(r.item) !== 'intern').slice(0, limit)

export const STATUS = {
  stimmt: 'Stimmt mit dem Code überein',
  veraltet: 'Veraltet, der Code macht es anders',
  unvollstaendig: 'Unvollständig, Neues aus dem Code fehlt',
  aktualisiert: 'Aktualisiert und freigegeben',
}

/** Checks one chapter against the code: open drafts mean it no longer fits, approved ones that it was updated. */
function verify(s, all, origin) {
  const touching = all.filter((p) => p.doc === s.doc.id && p.at >= s.from && p.at < s.to)
  const open = touching.filter((p) => p.state === 'offen')
  const replaced = open.find((p) => p.op === 'replace')
  const lead = replaced ?? open[0] ?? touching.find((p) => p.state === 'freigegeben')
  const status = replaced ? 'veraltet' : open.length ? 'unvollstaendig' : lead ? 'aktualisiert' : 'stimmt'
  const b = lead && bundles.find((x) => x.id === lead.bundle)
  return {
    status,
    doc: s.doc.id,
    docTitle: s.doc.title,
    type: s.doc.type,
    chapter: s.heading,
    quote: clip(replaced ? replaced.find : status === 'aktualisiert' ? draftText(lead) : sectionQuote(s), 260),
    code: status === 'veraltet' || status === 'unvollstaendig' ? open.map(draftText).filter(Boolean).join('\n') : null,
    quoteTruncated: (replaced ? replaced.find : status === 'aktualisiert' ? draftText(lead) : sectionQuote(s)).length > 260,
    because: b ? { ticket: b.ticket, mr: b.mr, merged: b.merged, commits: mergeRequest(b.mr)?.sha ? [mergeRequest(b.mr).sha.slice(0, 12)] : [], title: b.title, method: 'prepared-draft' } : null,
    draft: lead && lead.state === 'offen' ? { id: lead.id, title: lead.title, url: draftUrl(origin, lead) } : null,
  }
}

function verifyText(v) {
  const head = `[${STATUS[v.status]}] ${v.docTitle} › ${v.chapter}`
  if (v.status === 'veraltet') return `${head}\n   Doku: „${v.quote}“\n   Änderung aus vorbereitetem Doku-Entwurf (${v.because.ticket}, ${v.because.mr}, MR-Stand ${v.because.commits.join(', ') || 'nicht belegt'}): ${v.code}\n   Entwurf zur Freigabe: ${v.draft.url}`
  if (v.status === 'unvollstaendig') return `${head}\n   Doku: „${v.quote}“\n   Fehlt (${v.because.ticket}): ${v.code}\n   Entwurf zur Freigabe: ${v.draft.url}`
  if (v.status === 'aktualisiert') return `${head}\n   „${v.quote}“ (freigegeben, ${v.because.ticket})`
  return `${head}\n   „${v.quote}“`
}

/* ------------------------------------------------------------------ */
/* The three tools                                                    */
/* ------------------------------------------------------------------ */

const str = (description) => ({ type: 'string', description })
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const format = { type: 'string', enum: ['text', 'structured'], description: 'Standard text: vollständige kompakte Antwort. structured: zusätzlich das Datenmodell, etwa für eine Oberfläche (mehr Tokens).' }

export const tools = [
  {
    name: 'check_change',
    title: 'Änderung prüfen',
    description:
      'Nur für Aufträge zur Prüfung von Doku-Auswirkungen: 1. Änderung angeben (details standardmäßig weglassen); vollständige Quellen-/Stellentabelle erhalten. 2. Den Antwortentwurf mit answer prüfen. Die zurückgegebene vervollständigte Antwort einschließlich aller Tabellenzeilen und Angaben unverändert in die Schlussantwort übernehmen, nicht erneut kürzen. Pflichtprüfung nur für diesen Doku-Auftrag; Fachfragen mit ask und Ticketvorbereitung mit ticket_context benötigen keine Doku-Gesamtprüfung. source_id lädt Originaltext/Codebelege gezielt nach. Originalnamen, IDs, Zahlen, Felder, Sonderfälle und Freigabelink behalten. Unzugeordnete Quellen sind ungeprüft; Fundstellen sind keine freigegebenen Entwürfe.',
    inputSchema: obj({
      merge_request: str('Merge-Request-Nummer, z. B. 1287 oder !1287'),
      branch: str('Branch, z. B. feature/MOB-4812-teillieferung'),
      ticket: str('Jira-Ticket, z. B. MOB-4812'),
      commits: { type: 'array', items: { type: 'string' }, description: 'Commit-Hashes (mind. 7 Zeichen)' },
      details: { type: 'boolean', description: 'true: auch den Text jedes Entwurfs mitliefern (mehr Tokens)' },
      draft_id: str('Optional, nur bei ausdrücklichem Auftrag zur Texterstellung: diesen einzelnen offenen Entwurf mit Gemini Flash-Lite formulieren (kostenpflichtig, gespeicherter Text wird wiederverwendet). Kein automatischer LLM-Aufruf bei normalen Prüfungen.'),
      source_id: str('Optional: Quellen-ID aus der Fundstellenliste, um nur diese Quelle mit Originaltext und Codebelegen nachzuladen.'),
      answer: { ...str('Antwortentwurf zum Doku-Prüfauftrag: auf Lücken prüfen und eine vollständige Antwort zum unveränderten Übernehmen erhalten. Nicht für Fachfragen/Ticketvorbereitung; nicht gemeinsam mit source_id.'), maxLength: 100000 },
      format,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    example: { merge_request: '1287' },
    run: checkChange,
  },
  {
    name: 'ask',
    title: 'Fragen',
    description:
      'Beantwortet eine Fachfrage zum Produkt MOBIQ aus der Doku und prüft jede Fundstelle gegen den Code-Stand: „stimmt“, „veraltet“ (mit dem, was der Code wirklich tut) oder „unvollständig“. Liefert kurze Zitate mit Quelle statt ganzer Seiten. Für Fragen wie „Wie wird die Anzahlung bei Teillieferung verrechnet?“. Wo Doku und Code abweichen, gilt der Code.',
    inputSchema: obj({ question: str('Die Frage, Deutsch oder Englisch'), limit: { type: 'integer', minimum: 1, maximum: 6, description: 'Höchstzahl Doku-Zitate, Standard 3. Code-Regeln werden unabhängig davon vollständig geliefert.' }, format }, ['question']),
    annotations: { readOnlyHint: true, openWorldHint: false },
    example: { question: 'Wie wird die Anzahlung bei einer Teillieferung verrechnet?' },
    run: ask,
  },
  {
    name: 'ticket_context',
    title: 'Ticket-Kontext',
    description:
      'Alles, was du vor dem Programmieren an einem Jira-Ticket wissen musst: Ticket, die Änderung, auf der es aufbaut, Geschäftsregeln und Parameter aus dem Code, wie die Doku es heute beschreibt (mit Wahrheitsstatus), die Code-Stellen, offene Fragen und wer die Doku später freigibt. Zu Beginn der Arbeit an einem Ticket aufrufen.',
    inputSchema: obj({ ticket: str('Jira-Ticket, z. B. MOB-4844'), format }, ['ticket']),
    annotations: { readOnlyHint: true, openWorldHint: false },
    example: { ticket: 'MOB-4844' },
    run: ticketContext,
  },
]

/* ---------- check_change ---------- */

async function checkChange(args, ctx) {
  if (!args.merge_request && !args.branch && !args.ticket && !args.commits?.length) throw new Error('Bitte merge_request, branch, ticket oder commits angeben.')
  const hit = resolveChange(args)
  if (!hit) {
    const known = bundles.map((b) => `- ${b.mr} ${b.title} (${b.ticket})`).join('\n')
    return {
      text: `neuraldoc kann diese Änderung im aktuellen Datensatz nicht zuordnen. Die automatische Erkennung neuer Branches ist noch nicht angebunden. Für die Texterstellung können eigene Schreibkontexte an den Generator übergeben werden (mcp/DRAFTING.md).\n\nGeprüfte Änderungen in ${release.id}:\n${known}`,
      data: { found: false, known: bundles.map((b) => ({ id: b.id, title: b.title, ticket: b.ticket, mr: b.mr })) },
      summary: 'Änderung unbekannt',
      raw: '',
    }
  }
  const b = hit.bundle
  if (args.draft_id) {
    if (args.source_id || args.answer !== undefined) throw new Error('draft_id darf nicht gemeinsam mit source_id oder answer verwendet werden.')
    if (!proposals.some((p) => p.id === args.draft_id && p.bundle === b.id)) throw new Error('Der Entwurf gehört nicht zu dieser Änderung.')
    const draft = await generateProposalDraft(args.draft_id)
    return { text: draft.result.status === 'draft' ? `Neuer Text für ${args.draft_id} erstellt (${draft.model}). Fachlich prüfen und freigeben: ${draftUrl(ctx.origin, proposals.find((p) => p.id === args.draft_id))}\n\n${draft.result.text || draft.result.blocks.map(blockText).join('\n\n') || draft.result.rows.map((r) => r.join(' | ')).join('\n')}` : `Für einen Text fehlen Angaben: ${draft.result.question}`, data: draft, summary: `Texterstellung ${args.draft_id}`, raw: '', ref: { change: b.id, draft: args.draft_id } }
  }
  const all = live().filter((p) => p.bundle === b.id)
  const routes = routing(b)
  const url = `${ctx.origin}${changePath(b)}`
  const docsHit = new Set(all.map((p) => p.doc)).size
  const approved = all.filter((p) => p.state === 'freigegeben').length
  const rejected = all.filter((p) => p.state === 'verworfen').length
  const open = all.length - approved - rejected
  const r = rules()
  const inspection = inspectImpact(b.mr)
  if (args.answer !== undefined) {
    if (args.source_id || typeof args.answer !== 'string' || !args.answer.trim() || args.answer.length > 100000) throw new Error('answer muss eine nicht leere Antwort bis 100.000 Zeichen sein; nicht gemeinsam mit source_id verwenden.')
    const review = reviewAnswer(args.answer, inspection)
    const finalAnswer = completeAnswer(inspection, url)
    const finalReview = finalAnswer ? reviewAnswer(finalAnswer, inspection) : null
    return { text: review.supported ? `Antwortentwurf: ${review.found}/${review.total} Fundstellen mit wichtigen Angaben erhalten. ${review.limitation}\n\nDie folgende Antwort ist aus dem Quelleninventar vollständig ergänzt und formal geprüft (${finalReview.found}/${finalReview.total}). Übernimm sie unverändert einschließlich aller Tabellenzeilen und konkreten Angaben; keine weitere Zusammenfassung.\n\nBEGINN VOLLSTÄNDIGE ANTWORT\n${finalAnswer}\nENDE VOLLSTÄNDIGE ANTWORT` : `Für diesen Änderungstyp ist keine vollständige Quellen-Prüfliste verfügbar. ${review.limitation}`, data: { review, finalAnswer, finalReview, url }, summary: `Antwortprüfung: ${review.found}/${review.total} Fundstellen`, ref: { change: b.id, path: changePath(b), review: true }, raw: args.answer + inspection.raw }
  }
  if (args.source_id) {
    const source = sourceEvidence(args.source_id)
    if (!source) throw new Error('Quellen-ID unbekannt. Eine ID aus der Fundstellenliste verwenden.')
    const impacts = inspection.impacts.filter((i) => i.sourceId === source.id)
    const ids = new Set(impacts.flatMap((i) => i.facts))
    const facts = inspection.facts.filter((f) => ids.has(f.id))
    const lines = [`${source.title} [${source.id}] · ${source.system} · Version ${source.version}`, source.url,
      ...impacts.map((i) => `- ${source.title} [${source.id}] › ${i.section}: ${i.what}`),
      !impacts.length ? 'Keine automatische Zuordnung für diese Quelle; das ist kein Nachweis, dass sie nicht betroffen ist.' : '',
      '', 'Originaltext, ungekürzt:', ...source.units.map((u) => `${u.section}\n${u.text}`),
      '', 'Code- und Fachbelege:', ...facts.flatMap((f) => f.evidence.map((e) => `${f.id}: ${evidenceRef(e)} (${e.revision ?? e.system})\n${e.url}\n${e.excerpt}`)),
      `Freigabe vorbereiteter Entwürfe: ${url}`].filter(Boolean)
    return { text: lines.join('\n'), data: { found: true, source, impacts, facts, url, coverage: inspection.coverage }, summary: `Quelle nachgeladen: ${source.title}`, ref: { change: b.id, source: source.id, path: changePath(b) }, raw: source.units.map((u) => u.text).join('\n') + facts.flatMap((f) => f.evidence.map((e) => e.excerpt)).join('\n') }
  }

  const types = routes.map((rt) => {
    const drafts = all
      .filter((p) => docOf(p.doc).type === rt.type)
      .map((p) => ({ id: p.id, doc: p.doc, docTitle: docOf(p.doc).title, where: locationOf(p), title: p.title, size: p.size, confidence: p.confidence, state: p.state, question: p.question ?? null, task: p.task ?? null, url: draftUrl(ctx.origin, p), target: targetOf(p.doc), text: args.details ? draftText(p) : undefined }))
    return { type: rt.type, label: docTypes[rt.type].label, status: rt.status, reason: rt.reason, approver: approverOf(rt.type), drafts }
  })
  const questions = all.filter((p) => p.state === 'offen' && p.question).map((p) => ({ id: p.id, title: p.title, ask: p.question, url: draftUrl(ctx.origin, p) }))
  const tasks = all.filter((p) => p.state === 'offen' && p.task).map((p) => ({ id: p.id, title: p.title, task: p.task, doc: docOf(p.doc).title, url: draftUrl(ctx.origin, p) }))

  const lines = [`${b.title} · ${b.ticket} · ${b.mr} · ${natures[natureOf(b)]} (erkannt über ${hit.via})`]
  if (inspection.supported) lines.unshift('Bei einem Doku-Prüfauftrag: Vor der Schlussantwort check_change mit derselben Änderung und answer=dem Antwortentwurf aufrufen, anschließend die vervollständigte Antwort unverändert übernehmen. Fachfragen und Ticketvorbereitung erfordern keine Doku-Gesamtprüfung.')
  if (!all.length) lines.push(`Keine Doku betroffen. ${b.noDocsReason ?? 'Geprüft, nichts zu ändern.'}`)
  else {
    lines.push(`${plural(all.length, 'Entwurf', 'Entwürfe')} in ${plural(docsHit, 'Dashboard-Dokument', 'Dashboard-Dokumenten')} sind vorbereitet. Weitere Fundstellen unten sind Prüfhilfen, noch keine freigegebenen Entwürfe. Prüfen und freigeben: ${url}`)
    lines.push(`Stand: ${approved} freigegeben, ${open} offen${rejected ? `, ${rejected} verworfen` : ''}.`)
  }
  if (inspection.supported) {
    lines.push('', `Quellenprüfung: ${inspection.coverage.locations} Fundstellen in ${inspection.coverage.affected} Originalquellen, ${inspection.coverage.scanned} Quellen durchsucht.`,
      `Antwortvorlage für den Doku-Prüfauftrag: alle ${inspection.coverage.locations} Zeilen mit allen drei Spalten vollständig übernehmen. Mehrere Stellen nicht zu einem Dokumentpunkt zusammenfassen. Mit check_change(answer=...) prüfen und anschließend die vervollständigte Antwort unverändert übernehmen:`, answerTable(inspection.impacts))
    lines.push('', 'Code- und Jira-Belege; Originaltext und Ausschnitte gezielt mit check_change und source_id nachladen:')
    for (const f of inspection.facts) lines.push(`- ${f.id}: ${[...new Set(f.evidence.map(evidenceRef))].join(', ')} (Code: release/26.4)`)
    for (const source of inspection.unaffected) lines.push(`- Nicht betroffen: ${source.title} [${source.sourceId}]. ${source.reason}`)
    lines.push('', `${inspection.coverage.unassigned.length} Quellen ohne automatische Zuordnung; damit nicht als unbetroffen bestätigt. ${inspection.coverage.limitation}`)
    for (const warning of inspection.coverage.warnings) lines.push(`Prüfgrenze: ${warning}`)
  } else lines.push('', 'Prüfgrenze: Für diese Änderung liegen vorbereitete Dashboard-Entwürfe vor; der zusätzliche Quellen-Detektor unterstützt diesen Änderungstyp noch nicht.')
  for (const t of types.filter((x) => x.status === 'vorschlaege')) {
    lines.push('', `${t.label} · ${plural(t.drafts.length, 'Entwurf', 'Entwürfe')} · ${approverText(t.type)}`)
    for (const d of t.drafts) {
      const flag = d.confidence === 'pruefen' ? ' (kurz prüfen)' : ''
      const state = d.state === 'offen' ? '' : ` [${d.state}]`
      if (!inspection.supported || args.details) lines.push(`- ${d.docTitle} › ${d.where}: ${d.title}${flag}${state}`)
      if (args.details && d.text) lines.push(`  neu, ungekürzt: ${d.text}`)
    }
  }
  // The rest in one line each kind: checked and still right, no document, or readers not affected.
  const rest = [
    ['passt', 'Geprüft, stimmt noch'],
    ['fehlt', 'Kein Dokument vorhanden'],
    ['nicht', 'Nicht betroffen'],
  ]
  for (const [status, label] of rest) {
    const ts = types.filter((x) => x.status === status)
    if (!ts.length) continue
    const reasons = [...new Set(ts.map((x) => x.reason))]
    lines.push('', reasons.length === 1 ? `${label}: ${list(ts.map((x) => x.label))}. ${reasons[0]}` : `${label}: ${ts.map((x) => `${x.label} (${x.reason.replace(/\.$/, '')})`).join(', ')}.`)
  }
  if (questions.length) {
    lines.push('', 'Offene Rückfragen (der Code allein beantwortet sie nicht, bitte den Nutzer fragen):')
    for (const q of questions) lines.push(`- ${q.title}: ${q.ask}`)
  }
  if (tasks.length) {
    lines.push('', 'Von Hand zu erledigen (neuraldoc kann es nicht selbst ändern):')
    for (const t of tasks) lines.push(`- ${t.doc}: ${t.task}`)
  }
  let mrComment = null
  if (all.length) {
    const targets = [...new Set(all.map((p) => targetOf(p.doc)?.system).filter(Boolean))]
    lines.push('', r.writeBack ? `Nach der Freigabe schreibt neuraldoc die Änderungen nach ${list(targets)}.` : 'Zurückschreiben ist aus: Freigegebenes bleibt in neuraldoc, bis jemand es überträgt.')
    if (r.mrComment && mergeRequest(b.mr)) {
      const selfTypes = types.filter((t) => t.drafts.length && t.approver.self).map((t) => t.label)
      const others = types.filter((t) => t.drafts.length && !t.approver.self).map((t) => `${t.label}: ${t.approver.name}`)
      mrComment = [
        `**neuraldoc:** Diese Änderung betrifft ${plural(docsHit, 'Dokument', 'Dokumente')}. ${plural(all.length, 'Entwurf liegt', 'Entwürfe liegen')} bereit: ${url}`,
        selfTypes.length ? `Selbst freigeben: ${list(selfTypes)}.` : '',
        others.length ? `Geht zur Freigabe an ${list(others)}.` : '',
        questions.length ? `${plural(questions.length, 'Rückfrage', 'Rückfragen')} offen.` : '',
      ]
        .filter(Boolean)
        .join(' ')
      commentOnMr(b.mr, mrComment, ctx.client)
      lines.push(`Kommentar mit dem Link in ${b.mr} gesetzt.`)
    }
  }

  const checked = new Set(routes.flatMap((rt) => rt.checkedDocs.map((d) => d.id)))
  const raw = [mergeRequestText(b.mr), ...[b.ticket].map((k) => jiraText(jiraIssue(k))), ...docs.filter((d) => checked.has(d.id)).map(docText), inspection.raw].join('\n')
  return {
    text: lines.join('\n'),
    data: { found: true, via: hit.via, change: { id: b.id, title: b.title, ticket: b.ticket, mr: b.mr, merged: b.merged, nature: natureOf(b), summary: b.summary }, url, counts: { drafts: all.length, docs: docsHit, approved, open, rejected }, types, questions, tasks, writeBack: r.writeBack, mrComment, impacts: inspection.impacts, coverage: inspection.coverage },
    summary: all.length ? `${b.title}: ${plural(all.length, 'Entwurf', 'Entwürfe')}, ${plural(docsHit, 'Dokument', 'Dokumente')}` : `${b.title}: keine Doku betroffen`,
    ref: { change: b.id, title: b.title, mr: b.mr, path: changePath(b), drafts: all.length },
    raw,
  }
}

/* ---------- ask ---------- */

function ask({ question, limit = 3 }, ctx) {
  if (!question?.trim()) throw new Error('Bitte eine Frage angeben.')
  const all = live()
  const hits = searchSections(question, Math.min(6, Math.max(1, limit)))
  const found = hits.map((h) => verify(h.item, all, ctx.origin))
  const change = searchChanges(question, 1, 2.5)[0]?.item
  const code = change ? changeFacts(change.mr) : null
  const factSearch = bm25(code?.facts ?? [], (f) => f.text)
  const facts = factSearch(question, 3).filter((f) => f.score >= 1).map((f) => f.item)
  const lines = [`Frage: ${question}`, `Geprüft gegen den Code-Stand von Release ${release.id}. Wo Doku und Code abweichen, gilt der Code.`, '']
  if (!found.length) lines.push('Dazu steht nichts in der Doku.')
  if (facts.length) lines.push('Regeln aus dem aktuellen Code und Jira (einschließlich Sonderfällen):', ...facts.map((f) => `- ${f.text} Quelle: ${[...new Set(f.evidence.map(evidenceRef))].join(', ')}.`), '')
  found.forEach((v, i) => lines.push(`${i + 1}. ${verifyText(v)}`))
  if (change) lines.push('', `Zuletzt im Code geändert: ${change.title} (${change.ticket}, ${change.mr}, gemergt ${fmtDate(change.merged)}): ${change.summary}`)

  const statuses = Object.fromEntries(Object.keys(STATUS).map((k) => [k, found.filter((v) => v.status === k).length]))
  const cited = [...new Set(found.map((v) => v.because?.mr).filter(Boolean).concat(change ? [change.mr] : []))]
  const raw = [...new Set(found.map((v) => v.doc))].map((id) => docText(docOf(id))).concat(cited.map((mr) => mergeRequestText(mr)), code?.files.map((f) => f.text) ?? []).join('\n')
  return {
    text: lines.join('\n'),
    data: { question, release: release.id, found, facts, change: change ? { id: change.id, title: change.title, ticket: change.ticket, mr: change.mr, merged: change.merged, summary: change.summary } : null, statuses },
    summary: question,
    ref: { statuses },
    raw,
  }
}

/* ---------- ticket_context ---------- */

function ticketContext({ ticket }, ctx) {
  const issue = jiraIssue(ticket)
  if (!issue) throw new Error(`Ticket ${ticket} gibt es in Jira nicht.`)
  const own = bundles.find((b) => b.ticket === issue.key)
  const linked = issue.links.map((k) => bundles.find((b) => b.ticket === k)).filter(Boolean)
  const similar = searchChanges(`${issue.summary} ${issue.description}`, 1, 3).map((r) => r.item)
  const related = [...new Set([own, ...linked, ...(linked.length || own ? [] : similar)].filter(Boolean))].slice(0, 2)
  const all = live()

  const codeByChange = new Map(related.map((b) => [b.id, changeFacts(b.mr)]))
  const rulesFromCode = related.flatMap((b) => {
    const code = codeByChange.get(b.id)
    if (code.supported) return [...code.facts.map((f) => `${f.text} Quelle: ${[...new Set(f.evidence.map(evidenceRef))].join(', ')}`), ...code.parameters.map((p) => `Parameter ${p.name}: ${p.description}, Standard ${p.standard === 'false' ? 'Nein' : p.standard}${p.min != null ? `, Bereich ${p.min} bis ${p.max}` : ''}`)]
    const params = all.filter((p) => p.bundle === b.id && p.op === 'rows' && docOf(p.doc).type === 'parameter')
    return [
      // With the parameter rows at hand, the aspect „new parameters“ says nothing extra.
      ...b.aspects.filter((a) => changeKinds[a.kind].nature !== 'intern' && !(a.kind === 'parameter' && params.length)).map((a) => `${changeKinds[a.kind].label} · ${a.text}`),
      ...params.flatMap((p) => (p.decision?.edited?.rows ?? p.rows).map(([name, what, def, min, max, unit]) => `Parameter ${name}: ${what}, Standard ${def}${min !== '–' ? ` (${min} bis ${max} ${unit})` : ''}`)),
    ]
  })
  const query = [issue.summary, issue.description, ...related.map((b) => b.title)].join(' ')
  // Chapters of this area only: drafts from unrelated changes (a rename elsewhere) are noise here.
  const tickets = new Set(related.map((b) => b.ticket))
  const hits = searchSections(query, 12)
    .map((h) => ({ score: h.score, v: verify(h.item, all, ctx.origin) }))
    .filter((h) => !h.v.because || tickets.has(h.v.because.ticket))
  const today = hits
    .filter((h) => h.score >= hits[0].score * (related.length ? 0.3 : 0.5))
    .map((h) => h.v)
    .slice(0, 3)
  const files = [...new Set([...codeByChange.values()].flatMap((c) => c.files.map((f) => f.file)))]
  // Open tickets around this one, also those hanging on the change it builds on (e.g. a pending clarification).
  const around = [...new Set([...issue.links, ...related.flatMap((b) => jiraIssue(b.ticket)?.links ?? [])])]
  const openLinks = around.map(jiraIssue).filter((i) => i && !i.done && i.key !== issue.key && !tickets.has(i.key))
  const openQuestions = all.filter((p) => related.some((b) => b.id === p.bundle) && p.state === 'offen' && p.question)
  const laterTypes = docTypeOrder.filter((t) => all.some((p) => related.some((b) => b.id === p.bundle) && docOf(p.doc).type === t))

  const lines = [`${issue.key} ${issue.summary} · ${issue.type} · ${issue.status}${issue.fixVersions.length ? ` · ${issue.fixVersions.join(', ')}` : ''}`, issue.description.trim() || '(keine Beschreibung)']
  for (const c of issue.comments) lines.push(`Kommentar ${c.author}, ${c.at}: ${clip(c.text, 200)}`)
  for (const b of related) lines.push('', `${b === own ? 'Die Änderung zu diesem Ticket' : 'Baut auf'}: ${b.ticket} ${b.title} (${b.mr}, gemergt ${fmtDate(b.merged)})`, `  ${b.summary}`)
  if (!related.length) lines.push('', 'Keine frühere Änderung im selben Bereich gefunden.')
  if (rulesFromCode.length) lines.push('', `Regeln aus Code und Jira (Stand ${release.id}):`, ...rulesFromCode.map((r) => `- ${r}`))
  if (today.length) lines.push('', 'So steht es heute in der Doku:', ...today.map((v) => `- ${verifyText(v).replace(/\n {3}/g, '\n  ')}`))
  if (files.length) lines.push('', `Code-Stellen: ${files.join(', ')}`)
  if (openLinks.length || openQuestions.length) {
    lines.push('', 'Offen, vor dem Programmieren klären:')
    for (const i of openLinks) lines.push(`- ${i.key}: offen, ${i.summary} (${i.status})`)
    for (const p of openQuestions) lines.push(`- ${p.title}: ${p.question}`)
  }
  if (laterTypes.length) lines.push('', `Doku, die deine Änderung wahrscheinlich berührt: ${laterTypes.map((t) => `${docTypes[t].label} (${approverOf(t).self ? 'du selbst' : approverOf(t).name})`).join(', ')}.`)
  lines.push('Nach dem Push check_change mit dem Branch aufrufen, dann liegen die Doku-Entwürfe bereit.')

  const raw = [jiraText(issue), ...issue.links.map((k) => jiraText(jiraIssue(k))), ...related.map((b) => mergeRequestText(b.mr)), ...[...codeByChange.values()].flatMap((c) => c.files.map((f) => f.text)), ...[...new Set(today.map((v) => v.doc))].map((id) => docText(docOf(id)))].join('\n')
  return {
    text: lines.join('\n'),
    data: {
      ticket: issue,
      related: related.map((b) => ({ id: b.id, title: b.title, ticket: b.ticket, mr: b.mr, merged: b.merged, summary: b.summary, own: b === own })),
      rules: rulesFromCode,
      today,
      files,
      open: [...openLinks.map((i) => ({ kind: 'ticket', key: i.key, text: i.summary, status: i.status, url: i.url })), ...openQuestions.map((p) => ({ kind: 'frage', key: p.id, text: p.question, title: p.title, url: draftUrl(ctx.origin, p) }))],
      later: laterTypes.map((t) => ({ type: t, label: docTypes[t].label, approver: approverOf(t) })),
    },
    summary: `${issue.key} ${issue.summary}`,
    ref: { ticket: issue.key },
    raw,
  }
}

/* ------------------------------------------------------------------ */
/* Calling a tool                                                     */
/* ------------------------------------------------------------------ */

export const APP_URL = process.env.NEURALDOC_APP_URL ?? 'http://localhost:5173'

/** Runs a tool and logs it with what it cost: the answer's tokens next to the raw text neuraldoc read for it. */
export async function callTool(name, args = {}, ctx = {}) {
  const t = tools.find((x) => x.name === name)
  const client = ctx.client ?? 'unbekannt'
  if (!t) {
    const message = `Unbekanntes Tool: ${name}. Verfügbar: ${tools.map((x) => x.name).join(', ')}`
    log({ client, tool: name, args, ok: false, ms: 0, summary: message })
    return { content: [{ type: 'text', text: message }], isError: true }
  }
  const started = Date.now()
  try {
    const out = await t.run(args, { origin: ctx.origin ?? APP_URL, client })
    const tokens = { answer: 0, raw: approxTokens(out.raw), method: 'mcp-response-v2' }
    const response = { content: [{ type: 'text', text: out.text }], structuredContent: { ...(args.format === 'structured' ? { result: out.data } : {}), tokens } }
    tokens.answer = approxTokens(JSON.stringify(response))
    tokens.answer = approxTokens(JSON.stringify(response))
    log({ client, tool: name, args, ok: true, ms: Date.now() - started, summary: out.summary, ref: out.ref ?? null, tokens })
    // Human/MCP clients get one complete representation, rather than the same content twice.
    // An explicit structured format retains the dashboard contract.
    return response
  } catch (e) {
    log({ client, tool: name, args, ok: false, ms: Date.now() - started, summary: e.message })
    return { content: [{ type: 'text', text: e.message }], isError: true }
  }
}

/** What an MCP client sees in tools/list. */
export const toolList = () => tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...t.annotations } }))

export const catalog = () => tools.map((t) => ({ name: t.name, title: t.title, description: t.description, example: t.example, inputSchema: t.inputSchema }))

/* ------------------------------------------------------------------ */
/* For the dashboard                                                  */
/* ------------------------------------------------------------------ */

export function info() {
  return {
    drafting: draftingStatus(),
    sources: sourcesInfo(),
    stdioPath: path.join(HERE, 'stdio.mjs').split(path.sep).join('/'),
    tools: catalog(),
    surfaceTokens: approxTokens(JSON.stringify(toolList())),
    rules: rules(),
    docTypes: docTypeOrder.map((t) => ({ type: t, label: docTypes[t].label, audience: docTypes[t].audience })),
    people: [{ id: SELF, name: 'Entwickler selbst', role: 'wer die Änderung gebaut hat' }, ...Object.entries(people).map(([id, p]) => ({ id, ...p }))],
  }
}

export function activity() {
  const entries = callLog(Infinity).filter((e) => !e.benchmarkRun)
  const d = decisions()
  const checks = []
  for (const e of entries) {
    if (e.tool !== 'check_change' || !e.ok || !e.ref?.change || e.ref.source || e.ref.review || checks.some((c) => c.change === e.ref.change)) continue
    const ps = proposals.filter((p) => p.bundle === e.ref.change)
    checks.push({ ...e.ref, at: e.at, client: e.client, total: ps.length, approved: ps.filter((p) => d[p.id]?.state === 'uebernommen').length, rejected: ps.filter((p) => d[p.id]?.state === 'verworfen').length })
  }
  const questions = entries.filter((e) => e.tool === 'ask' && e.ok).map((e) => ({ at: e.at, client: e.client, question: e.args.question, statuses: e.ref?.statuses ?? {} }))
  const ok = entries.filter((e) => e.ok && e.tokens)
  const perTool = Object.fromEntries(tools.map((t) => [t.name, { calls: ok.filter((e) => e.tool === t.name).length, answer: ok.filter((e) => e.tool === t.name).reduce((n, e) => n + e.tokens.answer, 0), raw: ok.filter((e) => e.tool === t.name).reduce((n, e) => n + e.tokens.raw, 0) }]))
  return {
    log: entries.slice(0, 40),
    checks,
    questions: questions.slice(0, 12),
    writebacks: writebacks().filter((w) => !w.undone).reverse().slice(0, 12),
    mrComments: Object.values(mrComments()).sort((a, b) => b.at.localeCompare(a.at)),
    stats: { calls: entries.length, answer: ok.reduce((n, e) => n + e.tokens.answer, 0), raw: ok.reduce((n, e) => n + e.tokens.raw, 0), perTool },
  }
}

/** Everything the change page needs to show where a check came from and where approvals went. */
export function changeStatus(id) {
  const b = bundles.find((x) => x.id === id)
  if (!b) throw new Error('Unbekannte Änderung')
  const checks = callLog(200).filter((e) => e.tool === 'check_change' && e.ok && e.ref?.change === id && !e.ref.source && !e.ref.review)
  return {
    checks: checks.map((e) => ({ at: e.at, client: e.client })),
    mrComment: mrComments()[b.mr] ?? null,
    approvers: Object.fromEntries(docTypeOrder.map((t) => [t, approverOf(t)])),
    writeBack: rules().writeBack,
    writebacks: writebacks().filter((w) => w.bundle === id && !w.undone),
    targets: Object.fromEntries(proposals.filter((p) => p.bundle === id).map((p) => [p.doc, targetOf(p.doc)])),
  }
}
