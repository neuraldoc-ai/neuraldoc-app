// Evaluation of the comment check on the comment benchmark (mcp/eval/benchmarks/comments.json). Model answers are
// cached below mcp/state/eval/comments, so a repeated run costs nothing.
//   node --use-system-ca --env-file=frontend/.env.local mcp/eval/comments-run.mjs [--repo ky,httpx] [--dry] [--label name] [--original]
// --dry builds the inputs only (no model call) and prints their size and the free signals.
// --original checks the released code without planted comments (precision on real code).
import fs from 'node:fs'
import path from 'node:path'
import { draftingConfig } from '../drafting.mjs'
import { commentBlocks } from '../comments.mjs'
import { checkComments, commentContext, commentInput, commentSignals, commentWindows, relatedCode } from '../comment-check.mjs'
import { COMMENT_REPOS, commentEvalDir, loadCommentBench } from './comment-bench.mjs'

const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const repos = arg('--repo', COMMENT_REPOS.join(',')).split(','), dry = process.argv.includes('--dry'), original = process.argv.includes('--original')
const label = arg('--label', original ? 'original' : 'planted')
const overlaps = (f, lines) => f.start <= lines[1] && lines[0] <= f.end
const summary = []

for (const repo of repos) {
  const bench = loadCommentBench(repo, { planted: !original })
  if (dry) {
    const context = commentContext(bench.files)
    let windows = 0, chars = 0, signals = 0
    for (const f of bench.commented) {
      const file = context.files.get(f.path), blocks = commentBlocks(f.text, f.path)
      for (const w of commentWindows(file, blocks)) {
        const related = relatedCode(file, w, context), s = commentSignals(file, w.blocks, context)
        windows++; chars += JSON.stringify(commentInput(file, w, related, s)).length
        const hits = bench.items.filter((i) => i.file === f.path && w.blocks.some((b) => b.start <= i.lines[1] && i.lines[0] <= b.end))
        if (process.argv.includes('--signals') && (s.absent_names.length || s.parameter_mismatches.length || s.doc_name_mismatches.length)) console.log(`  ${f.path} ${w.from}-${w.to}`, JSON.stringify(s))
        signals += s.parameter_mismatches.length + s.doc_name_mismatches.length
        for (const i of hits) if (process.argv.includes('--related')) console.log(`  ${i.id} ${f.path}:${w.from}-${w.to} related:`, related.map((r) => `${r.path}:${r.start}-${r.end} (${r.why})`).join(' | '))
      }
    }
    console.log(`${repo}: ${windows} Fenster, ${(chars / 1e3).toFixed(0)}k Zeichen Eingabe (~${(chars / 3.5 / 1e3).toFixed(0)}k Tokens), ${signals} Signale`)
    continue
  }
  const started = Date.now()
  const result = await checkComments({ files: bench.files, config: draftingConfig(), cacheDir: path.join(commentEvalDir, 'cache'), concurrency: 8, onProgress: (n, total) => { if (n % 20 === 0 || n === total) process.stderr.write(`${repo} ${n}/${total}\r`) } })
  const hit = (list) => (i) => list.some((f) => f.path === i.file && overlaps(f, i.lines))
  const found = hit(result.findings), beforeReview = hit([...result.findings, ...result.rejected])
  const known = [...bench.items, ...bench.real]
  const other = result.findings.filter((f) => !known.some((i) => f.path === i.file && overlaps(f, i.lines)))
  const row = {
    repo, label, windows: result.results.length, errors: result.results.filter((r) => r.error).length,
    planted: bench.items.length, found: bench.items.filter(found).length, foundBeforeReview: bench.items.filter(beforeReview).length, missed: bench.items.filter((i) => !found(i)).map((i) => i.id),
    real: bench.real.map((i) => `${i.id}:${found(i) ? 'gefunden' : 'verpasst'}`), other: other.length, rejected: result.rejected.length, dropped: result.results.reduce((n, r) => n + r.dropped.length, 0),
    usd: result.costUsd, seconds: (Date.now() - started) / 1000,
  }
  summary.push(row)
  fs.mkdirSync(path.join(commentEvalDir, 'runs'), { recursive: true })
  fs.writeFileSync(path.join(commentEvalDir, 'runs', `${label}-${repo}.json`), JSON.stringify({ ...row, findings: result.findings, rejectedFindings: result.rejected, results: result.results.map(({ path, window, findings, dropped, error, signals }) => ({ path, window, findings: findings.length, dropped, error, signals })) }, null, 1))
  console.log(JSON.stringify(row))
}
if (summary.length > 1) {
  const sum = (k) => summary.reduce((n, r) => n + r[k], 0)
  console.log(`gesamt: ${sum('found')}/${sum('planted')} gefunden (${sum('foundBeforeReview')} vor der zweiten Prüfung), ${sum('other')} weitere Befunde, ${sum('rejected')} von der zweiten Prüfung verworfen, ${sum('dropped')} vom Server verworfen, ${sum('usd').toFixed(3)} USD`)
}
