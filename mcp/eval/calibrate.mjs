// Agreement between the draft judge and the hand labels in labels.json, read from the latest run reports. No model calls.
//   node mcp/eval/calibrate.mjs
import fs from 'node:fs'
import path from 'node:path'
import { evalDir } from './benchmarks.mjs'

const labels = JSON.parse(fs.readFileSync(new URL('./labels.json', import.meta.url), 'utf8'))
const reports = fs.readdirSync(evalDir).filter((f) => f.startsWith('run-')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8')))
const rowOf = (l) => { for (const report of reports.toReversed()) for (const b of report) if (b.bench === l.bench && b.drafts?.variant === l.variant && b.retrieval === 'bm25' && (b.check ?? 'jev') === 'jev') { const row = b.drafts.rows.find((r) => r.section.startsWith(l.section) && r.judge); if (row) return row } }
const rank = { missing: 0, partial: 1, covered: 2 }
let exact = 0, binary = 0, n = 0, fs1 = 0, fn = 0
for (const l of labels.items) {
  const verdict = rowOf(l)?.judge.items.find((v) => v.id === l.item)?.verdict
  if (!verdict) { console.log(`ohne Richterurteil: ${l.variant} ${l.section} ${l.item}`); continue }
  n++; exact += verdict === l.label; binary += (rank[verdict] > 0) === (rank[l.label] > 0)
  if (verdict !== l.label) console.log(`  abweichend: ${l.variant} ${l.section} ${l.item}: Hand ${l.label}, Richter ${verdict}`)
}
for (const l of labels.falseStatements) { const row = rowOf(l); if (!row) continue; fn++; fs1 += (row.judge.false_statements.length > 0) === l.label }
console.log(`Items: ${n} · exakt ${exact}/${n} (${(exact / n * 100).toFixed(0)} %) · abgedeckt-oder-teilweise vs. fehlt ${binary}/${n} (${(binary / n * 100).toFixed(0)} %)`)
console.log(`Falsche Aussage ja/nein: ${fs1}/${fn} (${(fs1 / fn * 100).toFixed(0)} %)`)
