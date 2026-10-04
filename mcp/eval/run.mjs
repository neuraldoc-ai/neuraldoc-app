// End-to-end evaluation of the initial check: import → Jev check → (drafts) → (judge). Jev, the drafting model and the
// judge are called for real; identical requests come from the caches below mcp/state/eval (git-ignored).
//
//   node --use-system-ca --env-file=frontend/.env.local mcp/eval/run.mjs [--bench mobiq,httpx,zx,cobra] [--k 6]
//        [--drafts] [--draft-model gemini-3.5-flash-lite] [--judge] [--label name]
// The variants compared in mcp/eval/README.md (hybrid/graph retrieval, model findings, full-text drafts) live in commit be7355f.
import fs from 'node:fs'
import path from 'node:path'
import { evalDir, loadBenchmark, sectionsOf, BENCHMARKS } from './benchmarks.mjs'
import { judge, JUDGE_MODEL } from './judge.mjs'

const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const benches = arg('--bench', BENCHMARKS.join(',')).split(','), k = Number(arg('--k', 6))
const drafts = process.argv.includes('--drafts'), draftModel = arg('--draft-model', null), withJudge = process.argv.includes('--judge')
const label = arg('--label', `jev-bm25-k${k}${drafts ? '-patch2' : ''}${draftModel ? `-${draftModel}` : ''}`)
process.env.NEURALDOC_STATE_DIR = evalDir
delete process.env.NEURALDOC_MODE
if (draftModel) process.env.NEURALDOC_GEMINI_MODEL = draftModel
const projects = await import('../projects.mjs')
const { INPUT_USD_PER_MILLION } = await import('../semantic-mapping.mjs')
const pct = (v) => v === null || Number.isNaN(v) ? '–' : `${(v * 100).toFixed(0)} %`

async function evaluate(name) {
  const started = Date.now(), bench = loadBenchmark(name)
  await projects.addProject(bench.upload)
  const checked = await projects.checkProject({ k }), p = projects.activeProject()
  const docs = p.docFiles.filter((d) => d.origin === 'docs'), sectionOf = new Map(p.docFiles.map((d) => [d.id, d]))
  const flaggedSections = new Set(checked.dataset.proposals.map((x) => x.doc).filter((id) => sectionOf.get(id)?.origin === 'docs'))
  const itemSections = new Map(bench.items.map((i) => [i.id, sectionsOf(i, p.docFiles, bench.keyOf)]))
  const unmapped = bench.items.filter((i) => !itemSections.get(i.id).length).map((i) => i.id)
  // Document level, as before: a document counts as found if any of its sections is flagged.
  const level = new Map()
  for (const i of bench.items) if (level.get(i.doc) !== 'must') level.set(i.doc, i.level)
  const docKeys = [...new Set(docs.map((d) => bench.keyOf(d.path)))]
  const flaggedDocs = new Set([...flaggedSections].map((id) => bench.keyOf(sectionOf.get(id).path)))
  const mustDocs = docKeys.filter((key) => level.get(key) === 'must'), anyDocs = docKeys.filter((key) => level.has(key))
  // Item level: an item is found when the section that holds it is flagged.
  const found = (i) => itemSections.get(i.id).some((s) => flaggedSections.has(s.id))
  const must = bench.items.filter((i) => i.level === 'must')
  const sectionsWithItems = new Set(bench.items.flatMap((i) => itemSections.get(i.id).map((s) => s.id)))
  const records = p.mapping.records.filter((r) => r.response)
  const result = {
    bench: name, label, retrieval: 'bm25', k, check: 'jev', at: new Date().toISOString(), documents: docKeys.length, sections: docs.length, codeFiles: p.files.length, items: bench.items.length, unmapped,
    doc: { recallMust: mustDocs.filter((key) => flaggedDocs.has(key)).length / (mustDocs.length || NaN), recallAny: anyDocs.filter((key) => flaggedDocs.has(key)).length / anyDocs.length, precision: flaggedDocs.size ? [...flaggedDocs].filter((key) => level.has(key)).length / flaggedDocs.size : null, flagged: flaggedDocs.size },
    item: { recallMust: must.length ? must.filter(found).length / must.length : null, recallAny: bench.items.filter(found).length / bench.items.length },
    section: { flagged: flaggedSections.size, precision: flaggedSections.size ? [...flaggedSections].filter((id) => sectionsWithItems.has(id)).length / flaggedSections.size : null },
    jev: { requests: records.length, inputTokens: records.reduce((s, r) => s + r.response.usage.input_tokens, 0), usd: records.reduce((s, r) => s + r.response.usage.input_tokens, 0) * INPUT_USD_PER_MILLION / 1e6, seconds: records.reduce((s, r) => s + (r.elapsedMs || 0), 0) / 1000, freshUsd: p.mapping.usage.estimatedUsd },
    missedItems: bench.items.filter((i) => !found(i)).map((i) => `${i.id} (${i.level})`),
    falseSections: [...flaggedSections].filter((id) => !sectionsWithItems.has(id)).map((id) => sectionOf.get(id).title),
  }
  if (drafts) {
    const usage = { judgeUsd: 0, judgeCalls: 0 }, rows = []
    for (const proposal of checked.dataset.proposals.filter((x) => sectionOf.get(x.doc)?.origin === 'docs')) {
      const section = sectionOf.get(proposal.doc), items = bench.items.filter((i) => itemSections.get(i.id).some((s) => s.id === section.id))
      const row = { section: section.title, items: items.map((i) => i.id) }
      try {
        const d = await projects.projectDraft(proposal.id)
        Object.assign(row, { status: d.result.status, reason: d.result.reason, text: d.result.text, usd: d.usage?.costUsd ?? null, model: d.model })
        if (withJudge && d.result.status === 'draft') row.judge = (await judge({ section, draft: d.result, items, evidence: d.context.evidence }, { cacheDir: path.join(evalDir, 'judge'), usage })).verdict
      } catch (error) { Object.assign(row, { status: 'rejected', reason: error.message }) }
      rows.push(row)
    }
    const score = (row, id) => ({ covered: 1, partial: 0.5 }[row.judge?.items.find((v) => v.id === id)?.verdict] || 0)
    const coverage = new Map()
    for (const row of rows) for (const id of row.items) coverage.set(id, Math.max(coverage.get(id) || 0, score(row, id)))
    const correct = (row) => row.items.length ? row.status === 'draft' && row.judge && row.judge.items.some((v) => v.verdict === 'covered') && !row.judge.false_statements.length : row.status === 'no_change'
    result.drafts = {
      variant: 'patch', model: rows.find((r) => r.model)?.model || draftModel, total: rows.length,
      status: Object.fromEntries(['draft', 'no_change', 'needs_context', 'rejected'].map((s) => [s, rows.filter((r) => r.status === s).length])),
      correct: withJudge ? rows.filter(correct).length : null,
      withFalse: withJudge ? rows.filter((r) => r.judge?.false_statements.length).length : null,
      falseStatements: withJudge ? rows.reduce((s, r) => s + (r.judge?.false_statements.length || 0), 0) : null,
      unnecessary: withJudge ? rows.filter((r) => r.judge?.unnecessary).length : null,
      itemCoverage: withJudge ? bench.items.reduce((s, i) => s + (coverage.get(i.id) || 0), 0) / bench.items.length : null,
      usd: rows.reduce((s, r) => s + (r.usd || 0), 0), judgeModel: withJudge ? JUDGE_MODEL : null, judgeUsd: usage.judgeUsd, rows,
    }
  }
  result.seconds = (Date.now() - started) / 1000
  return result
}

const all = []
for (const name of benches) {
  const r = await evaluate(name); all.push(r)
  console.log(`\n${r.bench} · ${r.label}: ${r.documents} Dokumente, ${r.sections} Abschnitte, ${r.codeFiles} Code-Dateien, ${r.items} Items${r.unmapped.length ? ` (ohne Abschnitt: ${r.unmapped.join(' ')})` : ''}`)
  console.log(`  Dokument: Recall must ${pct(r.doc.recallMust)} · alle ${pct(r.doc.recallAny)} · Precision ${pct(r.doc.precision)} (${r.doc.flagged} gemeldet)`)
  console.log(`  Item: Recall must ${pct(r.item.recallMust)} · alle ${pct(r.item.recallAny)} · Abschnitts-Precision ${pct(r.section.precision)} (${r.section.flagged} Abschnitte)`)
  console.log(`  Jev: ${r.jev.requests} Anfragen, ${r.jev.inputTokens} Tokens, ${r.jev.usd.toFixed(4)} USD (neu ${r.jev.freshUsd.toFixed(4)}), ${r.jev.seconds.toFixed(0)} s Modellzeit`)
  console.log(`  Verpasst: ${r.missedItems.join(' ') || '–'}`)
  console.log(`  Ohne erwartete Änderung gemeldet: ${r.falseSections.join(' | ') || '–'}`)
  if (r.drafts) {
    const d = r.drafts
    console.log(`  Entwürfe (${d.variant}, ${d.model}): ${JSON.stringify(d.status)} · korrekt ${d.correct ?? '–'}/${d.total} · mit falscher Aussage ${d.withFalse ?? '–'} (${d.falseStatements ?? '–'} Aussagen) · unnötig ${d.unnecessary ?? '–'} · Item-Abdeckung ${pct(d.itemCoverage)} · ${d.usd.toFixed(4)} USD · Richter ${d.judgeUsd.toFixed(4)} USD`)
    for (const row of d.rows) console.log(`    ${row.status.padEnd(13)} ${row.section.slice(0, 50).padEnd(50)} ${row.judge ? row.judge.items.map((v) => `${v.id}:${v.verdict[0]}`).join(' ') + (row.judge.false_statements.length ? ` ✗${row.judge.false_statements.length}` : '') : ''}`)
  }
}
fs.mkdirSync(evalDir, { recursive: true })
fs.writeFileSync(path.join(evalDir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`), JSON.stringify(all, null, 2))
