// Adapter for the existing demo targets. The generator itself accepts arbitrary project contexts.
import './showcase-init.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { bundles, docs, docTypes, proposals } from '../frontend/src/dashboard/features/docs/data.ts'
import { locationOf } from '../frontend/src/dashboard/features/docs/logic.ts'
import { resolveCommitSource } from '../frontend/src/dashboard/features/docs/commit-source.ts'
import { changeFacts } from './impact.mjs'
import { jiraIssue, jiraText, mergeRequestFiles } from './sources.mjs'
import { dataPath } from './dataset.mjs'
import { DraftError, draftKey, draftStateDir, generateDraft } from './drafting.mjs'

const blockText = (b) => !b ? '' : b.kind === 'table' ? [b.head, ...b.rows].map((r) => r.join(' | ')).join('\n') : b.kind === 'figure' ? b.caption : b.text
const sourceCommits = JSON.parse(fs.readFileSync(dataPath('gitlab/commits.json'), 'utf8'))

export function proposalContext(id, answer) {
  const p = proposals.find((p) => p.id === id)
  if (!p) throw new DraftError('Unbekannter Entwurf.')
  if (p.op === 'note' || p.task) throw new DraftError('Aufgaben an Bildern und Dateien müssen von einer Person bearbeitet werden.')
  const doc = docs.find((d) => d.id === p.doc), bundle = bundles.find((b) => b.id === p.bundle)
  const files = mergeRequestFiles(bundle.mr)
  const touched = p.commits.flatMap((hash) => {
    const commit = resolveCommitSource(hash, sourceCommits)
    if (!commit) throw new DraftError(`Codebeleg für ${hash} fehlt.`)
    return JSON.parse(fs.readFileSync(dataPath(`gitlab/commits/${commit.id}/diff.json`), 'utf8')).filter((d) => !d.deleted_file).map((d) => d.new_path)
  })
  const selected = files.filter((f) => touched.includes(f.file) || /config\/parameter\//.test(f.file))
  const evidence = selected.filter((f) => f.text.trim()).map((f) => ({ id: `code:${f.file}`, source: `${f.file} (${f.revision})`, text: f.text }))
  // Include the detector's facts with their underlying source excerpts, never the prepared new prose.
  const facts = changeFacts(bundle.mr).facts.filter((f) => f.evidence.some((e) => selected.some((file) => file.file === e.file)))
  for (const f of facts) evidence.push({ id: `fact:${f.id}`, source: `Regel aus ${f.evidence.map((e) => e.file || `Jira ${e.issue}`).join(', ')}`, text: f.text + '\n' + f.evidence.map((e) => e.excerpt || '').join('\n') })
  const issue = jiraIssue(bundle.ticket)
  if (issue) evidence.push({ id: `ticket:${issue.key}`, source: `Jira ${issue.key} (Anforderung, keine Bestätigung der Umsetzung)`, text: jiraText(issue) })
  const heading = p.op === 'insert' ? p.blocks?.find((b) => b.kind === 'h')?.text : undefined
  return {
    change: { id: bundle.id, title: bundle.title },
    document: { id: doc.id, title: doc.title, type: docTypes[doc.type].label, audience: docTypes[doc.type].audience, section: locationOf(p), before: p.op === 'replace' ? p.find : blockText(doc.blocks[p.at]), surrounding: doc.blocks.map(blockText).join('\n\n') },
    target: { id: p.id, op: p.op, instruction: `${p.title}. ${p.why}`, ...(heading ? { heading } : {}), ...(p.op === 'rows' ? { columns: doc.blocks[p.at].head } : {}), ...(p.question ? { question: p.question } : {}) },
    evidence: answer ? [...evidence, { id: `editorial:${id}`, source: "Redaktionelle Antwort (kein Codebeleg)", text: answer }] : evidence,
  }
}

const stateFile = (name) => path.join(draftStateDir(), name)
const read = (name) => fs.existsSync(stateFile(name)) ? JSON.parse(fs.readFileSync(stateFile(name), 'utf8')) : {}
export const generatedProposals = () => Object.fromEntries(Object.entries(read('generated-proposals.json')).filter(([id, patch]) => {
  try { return patch.generation.contextHash === draftKey(proposalContext(id, patch.generation.answer), patch.generation.model, patch.generation.connection) }
  catch { return false }
}))

export async function generateProposalDraft(id, answer) {
  answer ??= generatedProposals()[id]?.generation.answer
  if (answer !== undefined && (typeof answer !== "string" || !answer.trim() || answer.length > 2000)) throw new DraftError("Antwort muss 1 bis 2.000 Zeichen enthalten.");
  if (read('decisions.json')[id]) throw new DraftError('Entschiedene Vorschläge bleiben erhalten. Zuerst die Entscheidung zurücknehmen.', 409)
  const draft = await generateDraft(proposalContext(id, answer))
  // A person may have accepted the old draft while Gemini was working.
  if (read('decisions.json')[id]) throw new DraftError('Die Stelle wurde inzwischen entschieden. Der erzeugte Text ersetzt diese Entscheidung nicht.', 409)
  const original = proposals.find((p) => p.id === id)
  const result = draft.result
  const patch = {
    ...(result.status === 'needs_context' ? {} : original.op === 'replace' ? { text: result.text } : original.op === 'insert' ? { blocks: result.blocks } : { rows: result.rows }),
    why: result.reason, confidence: 'pruefen', question: (answer ? result.question : [original.question, result.question].filter(Boolean).join(' ')) || undefined,
    generation: { status: result.status, recommendation: result.status === "needs_context" ? result.reason : undefined, answer, id: draft.id, contextHash: draft.contextHash, connection: draft.connection, model: draft.model, createdAt: draft.createdAt, evidenceIds: result.evidenceIds, usage: draft.usage },
  }
  const all = { ...generatedProposals(), [id]: patch }
  const file = stateFile('generated-proposals.json'), temp = file + '.tmp'
  fs.writeFileSync(temp, JSON.stringify(all, null, 2)); fs.renameSync(temp, file)
  return { ...draft, proposal: patch }
}
