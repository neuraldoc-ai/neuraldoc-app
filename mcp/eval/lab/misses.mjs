// For every expected item: is a file it depends on among the excerpts the section check shows (retrieval), and did a
// run flag its section (judgement)? Separates search misses from model misses. No model calls.
//   node mcp/eval/lab/misses.mjs --bench mobiq --project <run project id in mcp/state/eval/projects>
import fs from 'node:fs'
import path from 'node:path'
import { arg, benchProject, excerptsFor } from './common.mjs'
import { evalDir, sectionsOf } from '../benchmarks.mjs'

const name = arg('--bench', 'mobiq'), ctx = await benchProject(name), { bench, p } = ctx
const run = arg('--project') && JSON.parse(fs.readFileSync(path.join(evalDir, 'projects', arg('--project'), 'project.json'), 'utf8'))
const flagged = new Set(run ? run.dataset.proposals.filter((x) => run.generated[x.id]?.generation?.status === 'draft').map((x) => x.section) : [])
const rows = { found: 0, judged: [], retrieval: [], nofiles: [] }
for (const item of bench.items) {
  const secs = sectionsOf(item, p.docFiles, bench.keyOf)
  if (secs.some((s) => flagged.has(s.id))) { rows.found++; continue }
  if (!item.files.length) { rows.nofiles.push(item.id); continue }
  const shown = secs.some((s) => excerptsFor(ctx, s).some((c) => item.files.some((f) => c.path === f || c.path.endsWith(`/${f}`))))
  ;(shown ? rows.judged : rows.retrieval).push(`${item.id} (${item.files.map((f) => f.split('/').pop()).join(', ')})`)
}
console.log(`${name}: ${bench.items.length} Items, gefunden ${rows.found}`)
console.log(`  Code war im Prompt, Modell hat nicht gemeldet (${rows.judged.length}): ${rows.judged.join(' · ')}`)
console.log(`  Code fehlte im Prompt (${rows.retrieval.length}): ${rows.retrieval.join(' · ')}`)
if (rows.nofiles.length) console.log(`  ohne Code-Dateien in der Lösung (${rows.nofiles.length}): ${rows.nofiles.join(' · ')}`)
