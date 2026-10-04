// Small, manually labelled use-case check. This is not a production benchmark.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJevClient, mappingQuestions, MODEL } from './semantic-mapping.mjs'
import { dataPath } from './dataset.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const graph = JSON.parse(fs.readFileSync(path.join(root, 'frontend/src/dashboard/features/docs/brain/source-graph.json'), 'utf8'))
const base = 'server/src/main/java/de/musterhaus/mobiq/'
export const cases = [
  ['doc:nh-kaufvertrag', base + 'auftrag/Kaufvertrag.java', 'relevant', 'Lieferbereitschaft eines Kaufvertrags'],
  ['doc:nh-kaufvertrag', base + 'auftrag/TeillieferungService.java', 'relevant', 'Alte vollständige Lieferung vs. neue Aufteilung: Doku-Auswirkung'],
  ['doc:nh-tour', base + 'tour/TourPruefung.java', 'relevant', 'Ladevolumen und Tourprüfung'],
  ['doc:nh-kasse', base + 'kasse/GutscheinService.java', 'relevant', 'Veraltete Beschreibung der Gutscheineinlösung'],
  ['doc:nh-fibu', base + 'fibu/export/GutscheinBuchung.java', 'relevant', 'Buchung der Gutscheinverbindlichkeit'],
  ['doc:td-kasse', base + 'kasse/Tagesabschluss.java', 'relevant', 'Belegabfrage des Tagesabschlusses'],
  ['doc:nh-kasse', base + 'tour/TourPruefung.java', 'unrelated', 'Gutscheine vs. Ladevolumen'],
  ['doc:nh-tour', base + 'kasse/GutscheinService.java', 'unrelated', 'Touren vs. Gutscheineinlösung'],
  ['doc:nh-kaufvertrag', base + 'admin/VorlagenKonvertieren.java', 'unrelated', 'Auftragsabwicklung vs. Vorlagenkonvertierung'],
  ['doc:td-fibu', base + 'auftrag/TeillieferungService.java', 'unrelated', 'Buchhaltungsexport wird nicht im Aufteilungsservice implementiert'],
  ['doc:td-kasse', 'web/src/kaufvertrag/LieferungAufteilen.tsx', 'unrelated', 'Kassenbelegschema vs. Aufteilungsdialog'],
  ['doc:dlg-kaufvertrag', 'web/src/stamm/Fahrzeug.tsx', 'unrelated', 'Lieferregister vs. Fahrzeugstamm'],
  ['doc:dlg-fahrzeug', 'web/src/stamm/Fahrzeug.tsx', 'insufficient', 'Geplantes Dokument enthält noch keinen Text'],
]
if (process.argv.includes('--live')) {
  process.loadEnvFile(path.join(root, 'frontend/.env.local'))
  const client = createJevClient({ key: process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY, cachePath: path.join(root, 'mcp/state/jev-evaluation-cache.json'), budget: 0.1 })
  const results = []
  for (const [docId, file, expected, rationale] of cases) {
    const doc = graph.nodes.find((n) => n.id === docId)
    const candidate = { id: `file:${file}`, code: fs.readFileSync(dataPath(`repo/${file}`), 'utf8') }
    const state = { subject: { id: docId, title: doc.label, content: doc.evidence.map((e) => e.text).join('\n'), planned: !!doc.planned }, candidates: [candidate] }
    const { response } = await client.evaluate(state, { file_0: mappingQuestions([candidate]).file_0 })
    const answer = response.answers.file_0
    const accepted = !!state.subject.content.trim() && answer.choice === 'relevant' && answer.probabilities.relevant >= 0.9 && answer.confidence >= 0.8
    results.push({ doc: docId, file, expected, rationale, answer, accepted })
    console.log(`${expected} → ${answer.choice} (${answer.probabilities[answer.choice]}) · ${path.basename(file)}`)
  }
  const tp = results.filter((r) => r.accepted && r.expected === 'relevant').length
  const fp = results.filter((r) => r.accepted && r.expected !== 'relevant').length
  const positives = results.filter((r) => r.expected === 'relevant').length
  const report = { model: MODEL, createdAt: new Date().toISOString(), note: '13 manuell beschriftete Fälle aus demselben Beispieldatensatz; sechs positive, sechs negative und ein Fall ohne Dokumentinhalt. Keine repräsentative oder unabhängige Qualitätsmessung.', cases: results, summary: { choiceCorrect: results.filter((r) => r.answer.choice === r.expected).length, total: results.length, acceptedTruePositive: tp, acceptedFalsePositive: fp, positives, acceptedPrecision: tp + fp ? tp / (tp + fp) : null, acceptedRecall: tp / positives }, usage: client.usage }
  fs.writeFileSync(path.join(root, 'mcp/state/jev-evaluation-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ summary: report.summary, usage: report.usage }))
}
