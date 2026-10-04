import { activeProject, projectDraft, projectsDir } from './projects.mjs'
import { bm25 } from './sources.mjs'
import fs from 'node:fs'
import path from 'node:path'

export const projectTools = [
  { name: 'ask', title: 'Quellen im Projekt suchen', description: 'Sucht belegte Fundstellen im importierten Code und in Dokumenten. Kein Modellurteil darüber, ob die Dokumentation noch stimmt.', inputSchema: { type: 'object', properties: { question: { type: 'string' }, source_id: { type: 'string' } }, additionalProperties: false }, example: { question: 'Wie funktioniert die Druckausgabe?' } },
  { name: 'check_change', title: 'Importierte Änderungen prüfen', description: 'Zeigt die Jev-Zuordnungen und offenen Dokumententwürfe des importierten Git-Vergleichs. draft_id erzeugt ausdrücklich einen kostenpflichtigen LLM-Entwurf.', inputSchema: { type: 'object', properties: { ref: { type: 'string' }, draft_id: { type: 'string' } }, additionalProperties: false }, example: {} },
  { name: 'ticket_context', title: 'Kontext suchen', description: 'Sucht Kontext zu einer Frage im lokalen Projekt. Jira-Tickets werden in dieser Version nicht importiert.', inputSchema: { type: 'object', properties: { ticket: { type: 'string' } }, required: ['ticket'], additionalProperties: false }, example: { ticket: 'Druckausgabe ändern' } },
]
export async function projectTool(name, args) {
  const p = activeProject()
  try {
    if (!p) throw new Error('Kein eigenes Projekt aktiv.')
    let result
    if (name === 'check_change') {
      if (args.draft_id) result = await projectDraft(args.draft_id)
      else result = { project: p.name, base: p.base, head: p.head, mapping: p.mapping ? { model: p.mapping.model, subjects: p.mapping.subjects, deferred: p.mapping.deferred } : null, proposals: p.dataset.proposals.map((proposal) => ({ id: proposal.id, title: proposal.title, doc: proposal.doc, decision: p.decisions[proposal.id] || null, generated: !!p.generated[proposal.id] })), url: `/app/aenderungen/${p.dataset.bundles[0].id}`, limitations: ['Nur der importierte Git-Vergleich, kein Live-Connector.', 'Jev-Zuordnungen sind Modellvorschläge. Freigaben erfolgen im Dashboard.'] }
    } else if (name === 'ask' || name === 'ticket_context') {
      const sources = [...p.docFiles.map((doc) => ({ id: `doc:${doc.id}`, source: doc.path, text: doc.text })), ...p.files.map((file) => ({ id: file.id, source: `${file.path} @ ${(file.deleted ? p.base : p.head).slice(0, 8)}`, text: file.text }))]
      if (args.source_id) { const source = sources.find((s) => s.id === args.source_id); if (!source) throw new Error('Quelle nicht gefunden.'); result = source }
      else {
        const question = name === 'ask' ? args.question : args.ticket
        if (typeof question !== 'string' || !question.trim() || question.length > 2000) throw new Error('Eine Frage bis 2.000 Zeichen angeben.')
        result = { project: p.name, question, sources: bm25(sources, (s) => `${s.source}\n${s.text}`)(question).map(({ item, score }) => ({ ...item, text: item.text.slice(0, 1800), score })), limitations: ['Fundstellensuche, keine Bestätigung der fachlichen Richtigkeit.', 'Tickets aus externen Systemen sind nicht angebunden.'] }
      }
    } else throw new Error('Unbekanntes Werkzeug.')
    const log = { at: new Date().toISOString(), client: 'MCP', tool: name, ok: true, summary: name === 'check_change' ? 'Importierte Änderungen geprüft' : args.question || args.ticket || args.source_id, args, tokens: { answer: Math.ceil(JSON.stringify(result).length / 4), raw: 0 } }
    fs.appendFileSync(path.join(projectsDir, p.id, 'calls.jsonl'), JSON.stringify(log) + '\n')
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: false }
  } catch (error) { return { content: [{ type: 'text', text: error.message }], isError: true } }
}
