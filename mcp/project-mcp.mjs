import { activeProject, projectDraft, projectsDir } from './projects.mjs'
import { bm25 } from './search.mjs'
import { logError } from './log.mjs'
import fs from 'node:fs'
import path from 'node:path'

export const projectTools = [
  { name: 'ask', title: 'Quellen im Projekt suchen', description: 'Sucht belegte Fundstellen im hochgeladenen Code und in den Dokumenten. Kein Modellurteil darüber, ob die Dokumentation noch stimmt.', inputSchema: { type: 'object', properties: { question: { type: 'string' }, source_id: { type: 'string' } }, additionalProperties: false }, example: { question: 'Wie funktioniert die Druckausgabe?' } },
  { name: 'check_change', title: 'Doku-Abweichungen anzeigen', description: 'Zeigt das Ergebnis der Erstprüfung: welche Doku-Abschnitte dem aktuellen Code widersprechen und welche Entwürfe es gibt. Jede Änderung trägt ihren Grund und die belegende Codestelle. draft_id prüft einen Abschnitt ausdrücklich neu (kostenpflichtiger LLM-Aufruf).', inputSchema: { type: 'object', properties: { draft_id: { type: 'string' } }, additionalProperties: false }, example: {} },
  { name: 'ticket_context', title: 'Kontext suchen', description: 'Sucht Kontext zu einer Frage im eigenen Projekt. Jira-Tickets werden in dieser Version nicht importiert.', inputSchema: { type: 'object', properties: { ticket: { type: 'string' } }, required: ['ticket'], additionalProperties: false }, example: { ticket: 'Druckausgabe ändern' } },
  { name: 'code_map', title: 'Code und Doku zuordnen', description: 'Zeigt aus der Zuordnung beim Import, welche Doku-Abschnitte eine Code-Datei beschreiben (path) oder welche Dateien zu Abschnitten über ein Thema gehören (query), jeweils mit Wahrscheinlichkeit und Begründung. Ohne Argumente: was der Doku fehlt (Namen ohne Doku), was sie nennt, das es im Code nicht gibt, und Abschnitte ohne Code. Kein Modellaufruf.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, query: { type: 'string' } }, additionalProperties: false }, example: { path: 'src/client.ts' } },
]

/** Answers of the code_map tool from the brain the import built (code-brain.mjs). */
function codeMap(p, { path: file, query } = {}) {
  const brain = p.brain
  if (!brain) throw new Error('Dieses Projekt wurde vor der Zuordnung importiert. Bitte neu importieren.')
  const section = (id) => { const d = p.docFiles.find((x) => x.id === id); return d ? { id, title: d.title, document: d.path } : { id } }
  if (file) {
    const clean = String(file).replace(/^\.?\//, '')
    const paths = p.files.map((f) => f.path).filter((x) => x === clean || x.endsWith('/' + clean))
    if (!paths.length) throw new Error('Datei nicht im Projekt.')
    const hits = (map) => Object.entries(map).flatMap(([id, links]) => links.filter((l) => paths.includes(l.path)).map((l) => ({ ...section(id), file: l.path, p: l.p, why: l.why, names: l.names })))
    return { project: p.name, files: paths, sections: hits(brain.links).sort((a, b) => b.p - a.p), possibly: hits(brain.weak).sort((a, b) => b.p - a.p).slice(0, 10) }
  }
  if (query) {
    if (typeof query !== 'string' || query.length > 2000) throw new Error('Eine Suche bis 2.000 Zeichen angeben.')
    const found = bm25(p.docFiles, (d) => `${d.title}\n${d.text}`)(query, 5)
    return { project: p.name, query, sections: found.map(({ item }) => ({ ...section(item.id), code: brain.links[item.id] ?? [], possibly: brain.weak[item.id] ?? [], tests: brain.tests[item.id] ?? [] })) }
  }
  return { project: p.name, method: brain.method, stats: brain.stats, undocumented: brain.cleanup.undocumented.slice(0, 30), unknownInCode: brain.cleanup.dead.slice(0, 30).map((d) => ({ name: d.name, sections: d.sections.slice(0, 5).map(section) })), sectionsWithoutCode: brain.cleanup.unlinked.slice(0, 30).map(section), limitations: ['Zuordnung aus Namen, Pfaden, Imports und Begriffen, ohne Modell; etwa 85 % der Verknüpfungen sind in Stichproben fachlich richtig.', 'Namen ohne Doku sind Kandidaten, keine Pflicht: nicht jeder öffentliche Name gehört in die Doku.'] }
}
export async function projectTool(name, args) {
  const p = activeProject()
  try {
    if (!p) throw new Error('Kein eigenes Projekt aktiv.')
    let result
    if (name === 'check_change') {
      if (args.draft_id) result = await projectDraft(args.draft_id)
      else result = { project: p.name, check: p.mapping ? { model: p.mapping.model, sections: p.mapping.subjects, mismatches: p.mapping.mismatches, createdAt: p.mapping.createdAt } : null, proposals: p.dataset.proposals.map((proposal) => ({ id: proposal.id, title: proposal.title, doc: proposal.doc, decision: p.decisions[proposal.id] || null, generated: !!p.generated[proposal.id], changes: (p.generated[proposal.id]?.generation?.findings ?? []).map((f) => ({ kind: f.kind, reason: f.explanation, evidence: f.evidence.map((e) => e.source), confirmed: f.sure })) })), url: `/app/aenderungen/${p.dataset.bundles[0].id}`, limitations: ['Nur der hochgeladene Stand, kein Live-Connector.', 'Abweichungen sind Modellbefunde von Jev. Freigaben erfolgen im Dashboard.'] }
    } else if (name === 'ask' || name === 'ticket_context') {
      const sources = [...p.docFiles.map((doc) => ({ id: `doc:${doc.id}`, source: doc.path, text: doc.text })), ...p.files.map((file) => ({ id: file.id, source: file.path, text: file.text }))]
      if (args.source_id) { const source = sources.find((s) => s.id === args.source_id); if (!source) throw new Error('Quelle nicht gefunden.'); result = source }
      else {
        const question = name === 'ask' ? args.question : args.ticket
        if (typeof question !== 'string' || !question.trim() || question.length > 2000) throw new Error('Eine Frage bis 2.000 Zeichen angeben.')
        result = { project: p.name, question, sources: bm25(sources, (s) => `${s.source}\n${s.text}`)(question).map(({ item, score }) => ({ ...item, text: item.text.slice(0, 1800), score })), limitations: ['Fundstellensuche, keine Bestätigung der fachlichen Richtigkeit.', 'Tickets aus externen Systemen sind nicht angebunden.'] }
      }
    } else if (name === 'code_map') result = codeMap(p, args)
    else throw new Error('Unbekanntes Werkzeug.')
    const log = { at: new Date().toISOString(), client: 'MCP', tool: name, ok: true, summary: name === 'check_change' ? 'Erstprüfung abgefragt' : name === 'code_map' ? `Zuordnung: ${args.path || args.query || 'Überblick'}` : args.question || args.ticket || args.source_id, args, tokens: { answer: Math.ceil(JSON.stringify(result).length / 4), raw: 0 } }
    fs.appendFileSync(path.join(projectsDir, p.id, 'calls.jsonl'), JSON.stringify(log) + '\n')
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: false }
  } catch (error) { logError('mcp', error, { tool: name }); return { content: [{ type: 'text', text: error.message }], isError: true } }
}
