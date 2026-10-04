// Retrieval only, no model calls: does a section's candidate list contain the code files its expected changes depend on?
//   node --use-system-ca mcp/eval/retrieval.mjs [--bench mobiq,httpx,zx,cobra] [--strategies bm25,hybrid,graph]
import fs from 'node:fs'
import path from 'node:path'
import { evalDir, loadBenchmark, sectionsOf, BENCHMARKS } from './benchmarks.mjs'

const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
process.env.NEURALDOC_STATE_DIR = evalDir
delete process.env.NEURALDOC_MODE
const projects = await import('../projects.mjs')
const { createRetriever, pick } = await import('../retrieval.mjs')

export async function scoreRetrieval(name, strategies) {
  const bench = loadBenchmark(name)
  await projects.addProject(bench.upload)
  const p = projects.activeProject(), rows = []
  for (const strategy of strategies) {
    const retriever = createRetriever(p.files, p.graph, { strategy })
    let hit6 = 0, hit12 = 0, rr = 0
    const misses = []
    for (const item of bench.items) {
      const sections = sectionsOf(item, p.docFiles, bench.keyOf)
      let best = Infinity, in6 = false, in12 = false
      for (const s of sections) {
        const ranked = retriever.rank(s, 48)
        const rel = (c) => item.files.some((f) => c.path === f || c.path.endsWith(`/${f}`))
        const at = ranked.findIndex(rel); if (at >= 0) best = Math.min(best, at + 1)
        if (pick(ranked, 6).some(rel)) in6 = true
        if (pick(ranked, 12).some(rel)) in12 = true
      }
      hit6 += in6; hit12 += in12; rr += Number.isFinite(best) ? 1 / best : 0
      if (!in6) misses.push(`${item.id}${sections.length ? '' : ' (Abschnitt fehlt)'}`)
    }
    const n = bench.items.length
    rows.push({ bench: name, strategy, items: n, recall6: hit6 / n, recall12: hit12 / n, mrr: rr / n, misses })
  }
  return rows
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/').replace(/^(?=[A-Z]:)/, '/')}`) {
  const benches = arg('--bench', BENCHMARKS.join(',')).split(','), strategies = arg('--strategies', 'bm25,hybrid,graph').split(',')
  const all = []
  for (const name of benches) all.push(...await scoreRetrieval(name, strategies))
  for (const r of all) console.log(`${r.bench.padEnd(6)} ${r.strategy.padEnd(14)} n=${String(r.items).padEnd(3)} recall@6 ${(r.recall6 * 100).toFixed(0).padStart(3)} %  recall@12 ${(r.recall12 * 100).toFixed(0).padStart(3)} %  MRR ${r.mrr.toFixed(2)}  verpasst@6: ${r.misses.join(' ')}`)
  fs.mkdirSync(evalDir, { recursive: true })
  fs.writeFileSync(path.join(evalDir, `retrieval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(all, null, 2))
}
