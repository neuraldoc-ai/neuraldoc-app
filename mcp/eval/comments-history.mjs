// The comment check on real comment rot: comments that maintainers later fixed (mcp/eval/benchmarks/comments.json,
// "history"). The check sees the code of the parent commit, as the project was before the fix.
//   node --use-system-ca --env-file=frontend/.env.local mcp/eval/comments-history.mjs [--label name]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { classify } from '../../frontend/src/dashboard/features/docs/import-rules.mjs'
import { draftingConfig } from '../drafting.mjs'
import { syntaxOf } from '../comments.mjs'
import { isTest } from '../retrieval.mjs'
import { checkComments } from '../comment-check.mjs'
import { evalDir } from './benchmarks.mjs'
import { commentEvalDir, spec } from './comment-bench.mjs'

const label = process.argv.includes('--label') ? process.argv[process.argv.indexOf('--label') + 1] : 'history'
const git = (repo, ...args) => execFileSync('git', args, { cwd: path.join(evalDir, 'src', repo), encoding: 'utf8', maxBuffer: 1 << 28 })

/** The code files of a commit, read once from Git and kept below mcp/state/eval/comments/history. */
function filesAt(repo, commit) {
  const cache = path.join(commentEvalDir, 'history', `${repo}-${commit}.json`)
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'))
  const paths = git(repo, 'ls-tree', '-r', '--name-only', commit).split('\n').filter((p) => p && classify(p, 'repo') === 'code' && !isTest(p) && syntaxOf(p))
  const files = paths.map((p) => ({ id: p, path: p, text: git(repo, 'show', `${commit}:${p}`).replace(/\r\n/g, '\n') }))
  fs.mkdirSync(path.dirname(cache), { recursive: true })
  fs.writeFileSync(cache, JSON.stringify(files))
  return files
}

const rows = []
let usd = 0
for (const item of spec.history) {
  const files = filesAt(item.repo, item.parent)
  const result = await checkComments({ files, paths: [item.file], config: draftingConfig(), cacheDir: path.join(commentEvalDir, 'cache'), concurrency: 8 })
  usd += result.costUsd
  const hit = (f) => f.path === item.file && f.start <= item.lines[1] && item.lines[0] <= f.end
  const found = result.findings.find(hit), rejected = result.rejected.find(hit)
  rows.push({ id: item.id, what: item.what, found: !!found, rejectedByReview: !!rejected, others: result.findings.filter((f) => !hit(f)).length, explanation: (found ?? rejected)?.explanation, replacement: (found ?? rejected)?.replacement, reason: rejected?.reason })
  console.log(`${item.id}: ${found ? 'gefunden' : rejected ? 'von der zweiten Prüfung verworfen' : 'verpasst'} (${item.what})${found ? `\n   ${found.explanation}\n   => ${JSON.stringify(found.replacement)}` : ''}`)
}
fs.mkdirSync(path.join(commentEvalDir, 'runs'), { recursive: true })
fs.writeFileSync(path.join(commentEvalDir, 'runs', `${label}.json`), JSON.stringify(rows, null, 1))
console.log(`${rows.filter((r) => r.found).length}/${rows.length} gefunden, ${usd.toFixed(3)} USD`)
