// Scores ways to map documentation sections to code files against the mined ground truth (mine.mjs).
// Per section with ground truth: hit@k (a linked file among the first k), recall@10, MRR. Averaged per repository,
// then over the dev and the test repositories (each repository counts once). Rankings are scored over product files
// only (no tests, build files, CI or documentation-site code), the same files the ground truth can contain.
//
//   node mcp/eval/brain/run.mjs [--repo ky,zx] [--split dev|test] [--methods a,b] [--show 3]
import fs from 'node:fs'
import path from 'node:path'
import { REPOS } from './repos.mjs'
import { snapshot } from './snapshot.mjs'
import { brainDir, productFile } from './mine.mjs'
import { METHODS } from './methods.mjs'
import { headingsOf } from '../../code-brain.mjs'

const arg = (n, d) => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d
const only = arg('--repo')?.split(','), split = arg('--split'), show = Number(arg('--show', 0)), lang = arg('--lang'), strict = process.argv.includes('--strict')
const methods = (arg('--methods')?.split(',') ?? Object.keys(METHODS).filter((m) => !METHODS[m].optional))
const K = [1, 3, 5]

function scoreRanking(ranked, truth) {
  const want = new Set(Object.keys(truth))
  const first = ranked.findIndex((p) => want.has(p))
  const out = { mrr: first < 0 ? 0 : 1 / (first + 1), r10: ranked.slice(0, 10).filter((p) => want.has(p)).length / Math.min(10, want.size) }
  for (const k of K) out[`h${k}`] = first >= 0 && first < k ? 1 : 0
  return out
}
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
const pct = (v) => Number.isNaN(v) ? '   –' : `${(v * 100).toFixed(0).padStart(3)}%`
const metrics = ['h1', 'h3', 'h5', 'r10', 'mrr']

const results = {}
for (const r of REPOS.filter((r) => (!only || only.includes(r.name)) && (!split || r.split === split))) {
  const gtFile = path.join(brainDir, `${r.name}.gt.json`)
  if (!fs.existsSync(gtFile)) { console.log(`${r.name}: keine Ground Truth (mine.mjs)`); continue }
  const gt = JSON.parse(fs.readFileSync(gtFile, 'utf8'))
  const t0 = Date.now(), snap = snapshot(r.name, r.ref)
  const ctx = { snap, repo: r, cache: new Map() }
  // --lang de: the same sections in German (translate.mjs); repositories without a translation are skipped.
  if (lang) {
    const file = path.join(brainDir, `${r.name}.${lang}.json`)
    if (!fs.existsSync(file)) continue
    const tr = JSON.parse(fs.readFileSync(file, 'utf8'))
    snap.docFiles = snap.docFiles.filter((s) => tr[s.id]).map((s) => ({ ...s, text: tr[s.id], heading: headingsOf(tr[s.id], 'x.md')[0]?.title ?? s.heading }))
  }
  const sections = new Map(snap.docFiles.map((s) => [s.id, s]))
  // --strict: only links from commits that changed at most two sections and three product files.
  const cases = gt.links.filter((l) => sections.has(l.section) && (!strict || l.strict)).map((l) => strict ? { ...l, files: l.strict } : l)
  for (const m of methods) {
    const t = Date.now(), rows = []
    for (const l of cases) {
      const ranked = (await METHODS[m].rank(ctx, sections.get(l.section))).filter(productFile)
      const s = scoreRanking(ranked, l.files)
      rows.push(s)
      if (show && s.h3 === 0 && rows.filter((x) => x.h3 === 0).length <= show) console.log(`  miss ${m} ${l.section} „${l.heading}“ want ${Object.keys(l.files).slice(0, 4).join(', ')} got ${ranked.slice(0, 4).join(', ')}`)
    }
    const agg = Object.fromEntries(metrics.map((k) => [k, mean(rows.map((x) => x[k]))]))
    ;(results[m] ??= {})[r.name] = { ...agg, n: rows.length, split: r.split, ms: Date.now() - t }
  }
  console.log(`${r.name} (${r.split}): ${cases.length} Abschnitte, ${snap.files.length} Code-Dateien, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}

const repos = [...new Set(Object.values(results).flatMap((x) => Object.keys(x)))]
console.log(`\n${'method'.padEnd(26)} ${'split'.padEnd(5)} ${metrics.map((m) => m.padStart(5)).join(' ')}   per repo h3`)
for (const m of methods) {
  for (const sp of ['dev', 'test']) {
    const rs = repos.filter((r) => results[m]?.[r]?.split === sp)
    if (!rs.length) continue
    const line = metrics.map((k) => pct(mean(rs.map((r) => results[m][r][k]))).padStart(5)).join(' ')
    console.log(`${m.padEnd(26)} ${sp.padEnd(5)} ${line}   ${rs.map((r) => `${r.slice(0, 8)} ${pct(results[m][r].h3).trim()}`).join(' · ')}`)
  }
}
fs.writeFileSync(path.join(brainDir, `results-${Date.now()}.json`), JSON.stringify(results, null, 1))
