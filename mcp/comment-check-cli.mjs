// Checks the comments inside the code of a folder against the code (mcp/comment-check.mjs) and prints the findings.
//   node --use-system-ca --env-file=frontend/.env.local mcp/comment-check-cli.mjs <folder> [--under src/,lib/] [--only a/b.js] [--json out.json] [--dry]
// Reads what an upload would read: no dependencies, build output, secrets, tests or files Git ignores.
import fs from 'node:fs'
import path from 'node:path'
import { classify, gitignore, ignored } from '../frontend/src/dashboard/features/docs/import-rules.mjs'
import { draftingConfig } from './drafting.mjs'
import { syntaxOf } from './comments.mjs'
import { isTest } from './retrieval.mjs'
import { checkComments } from './comment-check.mjs'

const [root] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))
const arg = (name) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null
if (!root) { console.error('Ordner fehlt: node mcp/comment-check-cli.mjs <ordner>'); process.exit(1) }

const all = []
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), rel = path.relative(root, abs).replaceAll('\\', '/')
    if (ignored(rel)) continue
    if (e.isDirectory()) walk(abs); else all.push(rel)
  }
}
walk(root)
const rules = Object.fromEntries(all.filter((p) => p.split('/').pop() === '.gitignore').map((p) => [p.split('/').slice(0, -1).join('/'), fs.readFileSync(path.join(root, p), 'utf8')]))
const skip = gitignore(rules)
const files = all.filter((p) => !skip(p) && classify(p, 'repo') === 'code' && !isTest(p) && syntaxOf(p))
  .map((p) => ({ id: p, path: p, text: fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n') }))
  .filter((f) => f.text.length <= 100_000)
// --under limits the check to folders (all files stay context), --only to single files.
const under = arg('--under')?.split(',')
const only = arg('--only')?.split(',') ?? (under ? files.map((f) => f.path).filter((p) => under.some((u) => p.startsWith(u))) : null)
console.error(`${files.length} Code-Dateien${only ? `, geprüft: ${only.length}` : ''}`)
if (process.argv.includes('--dry')) {
  const { commentBlocks } = await import('./comments.mjs'), { commentWindows } = await import('./comment-check.mjs')
  const windows = files.filter((f) => !only || only.includes(f.path)).reduce((n, f) => n + commentWindows(f, commentBlocks(f.text, f.path)).length, 0)
  console.log(Object.fromEntries(Object.entries(Object.groupBy(files, (f) => f.path.split('/').slice(0, 2).join('/'))).map(([k, v]) => [k, v.length])))
  console.log(`${windows} Fenster, also ${windows * 2} Modellaufrufe plus die zweite Prüfung der Fenster mit Befunden`)
  process.exit(0)
}

const cacheDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'state', 'comment-check-cache')
const result = await checkComments({ files, paths: only, config: draftingConfig(), cacheDir, concurrency: 8, onProgress: (n, total) => process.stderr.write(`${n}/${total}\r`) })
for (const r of result.results.filter((x) => x.error)) console.error(`Fehler in ${r.path} ${r.window.join('-')}: ${r.error}`)
const byFile = Object.groupBy(result.findings, (f) => f.path)
for (const [file, findings] of Object.entries(byFile)) {
  console.log(`\n${file}`)
  for (const f of findings) {
    console.log(`  Zeile ${f.line}: ${f.explanation}`)
    for (const l of f.comment_quote.split('\n')) console.log(`    - ${l.trim()}`)
    for (const l of (f.replacement || '(entfernen)').split('\n')) console.log(`    + ${l.trim()}`)
  }
}
console.log(`\n${result.findings.length} Befunde in ${Object.keys(byFile).length} Dateien, ${result.rejected.length} von der zweiten Prüfung verworfen, ${result.costUsd.toFixed(3)} USD`)
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ findings: result.findings, rejected: result.rejected }, null, 1))
