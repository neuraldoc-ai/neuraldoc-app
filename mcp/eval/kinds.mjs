// Offline: which finding kinds should raise a proposal? Uses the stored findings of the last check per benchmark.
//   node mcp/eval/kinds.mjs
import fs from 'node:fs'
import path from 'node:path'
import { evalDir, loadBenchmark, sectionsOf, BENCHMARKS } from './benchmarks.mjs'

const projectsDir = path.join(evalDir, 'projects')
const latest = (name) => fs.readdirSync(projectsDir).filter((id) => /^[a-f0-9]{20}$/.test(id)).map((id) => JSON.parse(fs.readFileSync(path.join(projectsDir, id, 'project.json'), 'utf8'))).find((p) => p.mapping && (name === 'mobiq' ? p.name === 'mobiq-code' : p.name.startsWith(`${name}-`)))
const plain = (s) => String(s || '').replace(/[`*_>#|]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const rules = { alle: () => true, 'ohne fehlt': (f) => f.kind !== 'fehlt', 'fehlt neu in Doku': (f, docs) => f.kind !== 'fehlt' || !docs.includes(plain(f.new)), 'nur fehlt neu': (f, docs) => f.kind === 'fehlt' && !docs.includes(plain(f.new)) }
for (const name of BENCHMARKS) {
  const bench = loadBenchmark(name), p = latest(name)
  const itemSections = bench.items.map((i) => sectionsOf(i, p.docFiles, bench.keyOf).map((s) => s.id)), withItems = new Set(itemSections.flat())
  console.log(`\n${name} (${p.mapping.judge}, ${p.mapping.llmModel})`)
  const docs = plain(p.docSources.map((d) => d.text).join('\n'))
  for (const [label, keep] of Object.entries(rules)) {
    const flagged = new Set(p.mapping.records.filter((r) => r.findings ? r.findings.some((f) => keep(f, docs)) : r.contradicts.length).map((r) => r.doc).filter((id) => p.docFiles.find((d) => d.id === id)?.origin === 'docs'))
    const recall = itemSections.filter((ids) => ids.some((id) => flagged.has(id))).length / itemSections.length
    const precision = flagged.size ? [...flagged].filter((id) => withItems.has(id)).length / flagged.size : NaN
    console.log(`  ${label.padEnd(16)} Item-Recall ${(recall * 100).toFixed(0).padStart(3)} %, Abschnitts-Precision ${(precision * 100).toFixed(0).padStart(3)} % (${flagged.size})`)
  }
}
