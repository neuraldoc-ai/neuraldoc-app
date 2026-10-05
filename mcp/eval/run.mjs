// End-to-end evaluation of the initial check: import → section check (LLM + Jev) → judge. All model calls are real;
// identical requests come from the caches below mcp/state/eval (git-ignored), so a repeated run costs nothing.
//
//   node --use-system-ca --env-file=frontend/.env.local mcp/eval/run.mjs [--bench chalk,ky] [--model gemini-3.5-flash-lite]
//        [--no-judge] [--no-veto] [--label name]
// The Jev-only check with separate drafts (October 4) is in commit 2433c97.
import fs from 'node:fs'
import path from 'node:path'
import { evalDir, loadBenchmark, sectionsOf, BENCHMARKS } from './benchmarks.mjs'
import { judgeFindings } from './judge.mjs'

const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const benches = arg('--bench', BENCHMARKS.join(',')).split(','), model = arg('--model', null)
const withJudge = !process.argv.includes('--no-judge'), jevVeto = !process.argv.includes('--no-veto')
const label = arg('--label', `check${model ? `-${model}` : ''}${jevVeto ? '' : '-noveto'}`)
process.env.NEURALDOC_STATE_DIR = evalDir
delete process.env.NEURALDOC_MODE
if (model) process.env.NEURALDOC_GEMINI_MODEL = model
const projects = await import('../projects.mjs')
const pct = (v) => v === null || Number.isNaN(v) ? '–' : `${(v * 100).toFixed(0)} %`

async function evaluate(name) {
  const started = Date.now(), bench = loadBenchmark(name)
  await projects.addProject(bench.upload)
  const checked = await projects.checkProject({ jevVeto }), p = projects.activeProject()
  // Only the documents the benchmark brings count (MOBIQ's repository README is not part of its ground truth).
  const keys = new Set(bench.items.map((i) => i.doc))
  const inScope = (d) => name === 'mobiq' ? d.origin === 'docs' : true
  const sections = p.docFiles.filter(inScope), sectionOf = new Map(p.docFiles.map((d) => [d.id, d]))
  const proposals = checked.dataset.proposals.filter((x) => inScope(sectionOf.get(x.section)))
  const flagged = new Set(proposals.filter((x) => p.generated[x.id]?.generation.status === 'draft').map((x) => x.section))
  // An item belongs to the section of its anchor, or to the flagged section of the same document whose correction adds
  // the item's key name (the completeness pass inserts missing entries where the document's list is, not at the anchor).
  const keyNames = (i) => (`${i.what}`.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\b|\b[a-z]+(?:_[a-z0-9]+)+\b/g) ?? [])
  const addedText = (x) => (p.generated[x.id]?.generation.findings ?? []).flatMap((f) => f.edits.map((e) => e.text)).join('\n')
  const byName = (i) => proposals.filter((x) => bench.keyOf(sectionOf.get(x.section).path) === i.doc && keyNames(i).some((n) => addedText(x).includes(n) && !sectionOf.get(x.section).text.includes(n))).map((x) => sectionOf.get(x.section))
  const itemSections = new Map(bench.items.map((i) => { const named = byName(i); return [i.id, named.length ? named : sectionsOf(i, p.docFiles, bench.keyOf)] }))
  const found = (i) => itemSections.get(i.id).some((s) => flagged.has(s.id))
  const must = bench.items.filter((i) => i.level === 'must')
  const withItems = new Set(bench.items.flatMap((i) => itemSections.get(i.id).map((s) => s.id)))
  const records = new Map(p.mapping.records.map((r) => [r.doc, r]))
  const result = {
    bench: name, label, model: p.mapping.model, at: new Date().toISOString(), documents: new Set(sections.map((s) => s.source)).size, sections: sections.length,
    checked: sections.filter((s) => records.has(s.id)).length, codeFiles: p.files.length, items: bench.items.length, docsWithItems: keys.size,
    item: { recallMust: must.length ? must.filter(found).length / must.length : null, recallAny: bench.items.filter(found).length / bench.items.length },
    section: { flagged: flagged.size, precision: flagged.size ? [...flagged].filter((id) => withItems.has(id)).length / flagged.size : null },
    status: Object.fromEntries(['findings', 'ok', 'unclear', 'skipped', 'rejected', 'error'].map((s) => [s, sections.filter((x) => records.get(x.id)?.status === s).length])),
    findings: proposals.reduce((n, x) => n + (p.generated[x.id]?.generation.findings?.length || 0), 0),
    dropped: sections.reduce((n, s) => n + (records.get(s.id)?.dropped?.length || 0), 0),
    droppedReasons: Object.entries(sections.flatMap((s) => records.get(s.id)?.dropped ?? []).reduce((m, d) => ({ ...m, [d.reason.replace(/\(.*\)|\d+ %/g, '').trim()]: (m[d.reason.replace(/\(.*\)|\d+ %/g, '').trim()] || 0) + 1 }), {})),
    llm: p.mapping.usage.llm, jevUsd: p.mapping.usage.estimatedUsd,
    missedItems: bench.items.filter((i) => !found(i)).map((i) => `${i.id} (${i.level})`),
  }
  if (withJudge) {
    const usage = { judgeUsd: 0, judgeCalls: 0 }, rows = []
    const retriever = (await import('../check.mjs')).createSectionRetriever(p.files)
    const chunkById = new Map(retriever.chunks.map((c) => [c.id, c]))
    for (const x of proposals) {
      const section = sectionOf.get(x.section), g = p.generated[x.id], items = bench.items.filter((i) => itemSections.get(i.id).some((s) => s.id === section.id))
      if (g.generation.status !== 'draft') { rows.push({ section: section.title, status: g.generation.status, items: items.map((i) => i.id), question: g.question }); continue }
      const excerpts = (records.get(section.id)?.candidates ?? []).map((id) => chunkById.get(id)).filter(Boolean)
      const j = (await judgeFindings({ section, corrected: g.text, findings: g.generation.findings, items, excerpts }, { cacheDir: path.join(evalDir, 'judge'), usage })).verdict
      rows.push({ section: section.title, status: 'draft', items: items.map((i) => i.id), judge: j, findings: g.generation.findings.map((f, i) => ({ kind: f.kind, sure: f.sure, jev: f.jev?.verdict, explanation: f.explanation, verdict: j.findings[i]?.verdict, note: j.findings[i]?.note })) })
    }
    // Items whose section was not flagged count as missing.
    const coverage = new Map()
    for (const row of rows) for (const v of row.judge?.items ?? []) coverage.set(v.id, Math.max(coverage.get(v.id) || 0, { covered: 1, partial: 0.5 }[v.verdict] || 0))
    const verdicts = rows.flatMap((r) => r.findings ?? [])
    const share = (v) => verdicts.length ? verdicts.filter((f) => f.verdict === v).length / verdicts.length : null
    result.judge = {
      itemCoverage: bench.items.reduce((s, i) => s + (coverage.get(i.id) || 0), 0) / bench.items.length,
      mustCoverage: must.length ? must.reduce((s, i) => s + (coverage.get(i.id) || 0), 0) / must.length : null,
      findings: verdicts.length, correct: share('correct'), trivial: share('trivial'), unproven: share('unproven'), wrong: share('wrong'),
      sureCorrect: verdicts.filter((f) => f.sure).length ? verdicts.filter((f) => f.sure && f.verdict === 'correct').length / verdicts.filter((f) => f.sure).length : null, sure: verdicts.filter((f) => f.sure).length,
      falseStatements: rows.reduce((n, r) => n + (r.judge?.false_statements.length || 0), 0), usd: usage.judgeUsd, rows,
    }
  }
  result.seconds = (Date.now() - started) / 1000
  return result
}

const all = []
for (const name of benches) {
  const r = await evaluate(name); all.push(r)
  console.log(`\n${r.bench} · ${r.label} (${r.model}): ${r.documents} Dokumente, ${r.sections} Abschnitte (${r.checked} geprüft), ${r.codeFiles} Code-Dateien, ${r.items} Items`)
  console.log(`  Status: ${JSON.stringify(r.status)} · ${r.findings} Befunde, ${r.dropped} verworfen ${JSON.stringify(r.droppedReasons)}`)
  console.log(`  Item-Recall (Abschnitt gemeldet): must ${pct(r.item.recallMust)} · alle ${pct(r.item.recallAny)} · Abschnitts-Precision ${pct(r.section.precision)} (${r.section.flagged} gemeldet)`)
  if (r.judge) console.log(`  Richter: Abdeckung alle ${pct(r.judge.itemCoverage)} · must ${pct(r.judge.mustCoverage)} · Befunde ${r.judge.findings}: korrekt ${pct(r.judge.correct)}, trivial ${pct(r.judge.trivial)}, unbelegt ${pct(r.judge.unproven)}, falsch ${pct(r.judge.wrong)} · „sicher“ ${r.judge.sure} davon korrekt ${pct(r.judge.sureCorrect)} · falsche Aussagen ${r.judge.falseStatements}`)
  console.log(`  Kosten: LLM ${r.llm.usd.toFixed(4)} USD (${r.llm.calls} Aufrufe, ${r.llm.cached} Cache) · Jev ${(r.jevUsd || 0).toFixed(4)} USD · Richter ${(r.judge?.usd || 0).toFixed(4)} USD · ${r.seconds.toFixed(0)} s`)
  console.log(`  Verpasst: ${r.missedItems.join(' ') || '–'}`)
}
fs.mkdirSync(evalDir, { recursive: true })
fs.writeFileSync(path.join(evalDir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`), JSON.stringify(all, null, 2))
