// Offline threshold sweep over the cached Jev answers of the last check per benchmark. No model calls.
//   node mcp/eval/sweep.mjs [--bench mobiq,httpx,zx,cobra]
import fs from 'node:fs'
import path from 'node:path'
import { evalDir, loadBenchmark, sectionsOf, BENCHMARKS } from './benchmarks.mjs'

const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const projectsDir = path.join(evalDir, 'projects')
const latest = (name) => fs.readdirSync(projectsDir).filter((id) => /^[a-f0-9]{20}$/.test(id)).map((id) => JSON.parse(fs.readFileSync(path.join(projectsDir, id, 'project.json'), 'utf8'))).find((p) => p.mapping && (name === 'mobiq' ? p.name === 'mobiq-code' : p.name.startsWith(`${name}-`)))
const rule = (c, i) => (a) => a && ((a.choice === 'contradicts' && a.probabilities.contradicts >= c) || (a.choice === 'incomplete' && a.probabilities.incomplete >= i))
const grid = [[0.6, 0.6], [0.6, 0.7], [0.6, 0.75], [0.6, 0.8], [0.6, 0.85], [0.6, 0.9], [0.5, 0.8], [0.7, 0.8], [0.6, 1.1]]
for (const name of arg('--bench', BENCHMARKS.join(',')).split(',')) {
  const bench = loadBenchmark(name), p = latest(name)
  const itemSections = bench.items.map((i) => sectionsOf(i, p.docFiles, bench.keyOf).map((s) => s.id)), withItems = new Set(itemSections.flat())
  console.log(`\n${name} (k=${p.mapping.candidates ?? 6})`)
  for (const [c, i] of grid) {
    const flag = rule(c, i), flagged = new Set(p.mapping.records.filter((r) => Object.entries(r.response?.answers || {}).some(([q, a]) => q.startsWith('code_') && a.confidence >= 0.5 && flag(a))).map((r) => r.doc).filter((id) => p.docFiles.find((d) => d.id === id)?.origin === 'docs'))
    const recall = itemSections.filter((ids) => ids.some((id) => flagged.has(id))).length / itemSections.length
    const precision = flagged.size ? [...flagged].filter((id) => withItems.has(id)).length / flagged.size : NaN
    console.log(`  contradicts ≥ ${c}, incomplete ≥ ${i > 1 ? 'aus' : i}: Item-Recall ${(recall * 100).toFixed(0)} %, Abschnitts-Precision ${(precision * 100).toFixed(0)} % (${flagged.size} Abschnitte)`)
  }
}
