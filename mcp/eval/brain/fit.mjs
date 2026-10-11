// Learns how to weigh the signals, on the dev repositories only, and scores the result leave-one-repository-out:
// the weights used for a repository were fitted on the other dev repositories. Writes the weights fitted on all dev
// repositories to weights.json; run.mjs scores them on the test repositories (method "learned").
//
//   node mcp/eval/brain/fit.mjs [--no-emb] [--strict]
import fs from 'node:fs'
import path from 'node:path'
import { REPOS } from './repos.mjs'
import { snapshot } from './snapshot.mjs'
import { brainDir, productFile } from './mine.mjs'
import { candidates, FEATURES, fitLogistic, scoreWith } from './methods.mjs'

const useEmb = !process.argv.includes('--no-emb'), strict = process.argv.includes('--strict')
const data = []
for (const r of REPOS.filter((r) => r.split === 'dev')) {
  const gt = JSON.parse(fs.readFileSync(path.join(brainDir, `${r.name}.gt.json`), 'utf8'))
  const snap = snapshot(r.name, r.ref), ctx = { snap, repo: r, cache: new Map() }
  const sections = new Map(snap.docFiles.map((s) => [s.id, s]))
  for (const l of gt.links.filter((l) => sections.has(l.section) && (!strict || l.strict)).map((l) => strict ? { ...l, files: l.strict } : l)) {
    const cands = (await candidates(ctx, sections.get(l.section), { emb: useEmb })).filter((c) => productFile(snap.files[c.file].path))
    data.push({ repo: r.name, truth: new Set(Object.keys(l.files)), cands: cands.map((c) => ({ path: snap.files[c.file].path, x: c.x })) })
  }
  process.stderr.write(`${r.name} `)
}
const evaluate = (w, rows) => {
  const per = new Map()
  for (const d of rows) {
    const ranked = d.cands.map((c) => [c.path, scoreWith(w, c.x)]).sort((a, b) => b[1] - a[1]).map(([p]) => p)
    const first = ranked.findIndex((p) => d.truth.has(p))
    const m = per.get(d.repo) ?? { h1: [], h3: [], h5: [], mrr: [] }
    m.h1.push(first === 0 ? 1 : 0); m.h3.push(first >= 0 && first < 3 ? 1 : 0); m.h5.push(first >= 0 && first < 5 ? 1 : 0); m.mrr.push(first < 0 ? 0 : 1 / (first + 1))
    per.set(d.repo, m)
  }
  return per
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const repos = [...new Set(data.map((d) => d.repo))]
const loro = new Map()
for (const r of repos) {
  const w = fitLogistic(data.filter((d) => d.repo !== r))
  loro.set(r, evaluate(w, data.filter((d) => d.repo === r)).get(r))
}
console.log('\nleave-one-repository-out on dev:')
for (const k of ['h1', 'h3', 'h5', 'mrr']) console.log(`  ${k}: ${(100 * mean(repos.map((r) => mean(loro.get(r)[k])))).toFixed(0)}%   ${repos.map((r) => `${r.slice(0, 8)} ${(100 * mean(loro.get(r)[k])).toFixed(0)}`).join(' · ')}`)
// Which links to keep: the share of the softmax mass a file gets. Precision is a lower bound (the ground truth knows
// only the files a commit changed together with the section), "found" is the share of sections with a linked file kept.
console.log('\nthreshold (leave-one-repository-out weights):')
for (const tau of [0.05, 0.1, 0.15, 0.2, 0.3, 0.5]) {
  let kept = 0, right = 0, found = 0, any = 0
  for (const r of repos) {
    const w = fitLogistic(data.filter((d) => d.repo !== r))
    for (const d of data.filter((d) => d.repo === r)) {
      const s = d.cands.map((c) => scoreWith(w, c.x)), m = Math.max(...s), e = s.map((v) => Math.exp(v - m)), z = e.reduce((a, b) => a + b, 0)
      const keep = d.cands.filter((c, i) => e[i] / z >= tau).slice(0, 8)
      kept += keep.length; right += keep.filter((c) => d.truth.has(c.path)).length
      if (keep.length) any++
      if (keep.some((c) => d.truth.has(c.path))) found++
    }
  }
  console.log(`  p ≥ ${tau}: ${(kept / data.length).toFixed(1)} Dateien pro Abschnitt, ${(100 * any / data.length).toFixed(0)}% mit Verknüpfung, Präzision ≥ ${(100 * right / Math.max(1, kept)).toFixed(0)}%, richtige Datei dabei ${(100 * found / data.length).toFixed(0)}%`)
}
const all = fitLogistic(data)
fs.writeFileSync(path.join(brainDir, `weights${useEmb ? '' : '-noemb'}.json`), JSON.stringify({ features: FEATURES(useEmb), weights: all }, null, 1))
console.log('weights:', FEATURES(useEmb).map((f, i) => `${f} ${all[i].toFixed(2)}`).join(', '), `bias ${all.at(-1).toFixed(2)}`)
