// Offline combination of detectors on one benchmark: the sections an LLM run flagged (its project in mcp/state/eval)
// and the sections Jev flagged (lab/jev-<variant>-<bench>.json), as union and intersection. No model calls.
//   node mcp/eval/lab/combine.mjs --bench mobiq --project <id> --variant excerpt
import fs from 'node:fs'
import path from 'node:path'
import { arg, benchProject, labDir, pct, score } from './common.mjs'
import { evalDir } from '../benchmarks.mjs'

const name = arg('--bench', 'mobiq'), variant = arg('--variant', 'excerpt')
const ctx = await benchProject(name)
const llm = JSON.parse(fs.readFileSync(path.join(evalDir, 'projects', arg('--project'), 'project.json'), 'utf8'))
const llmFlagged = new Set(llm.dataset.proposals.filter((x) => llm.generated[x.id]?.generation?.status === 'draft').map((x) => x.section))
const jev = JSON.parse(fs.readFileSync(path.join(labDir, `jev-${variant}-${name}.json`), 'utf8'))
const hit = (a, choices, p, c) => !!a && choices.includes(a.choice) && a.confidence >= c && a.probabilities[a.choice] >= p
const jevFlagged = (p, c) => new Set(jev.rows.filter((r) => r.answers && (variant === 'claims'
  ? Object.entries(r.answers).some(([id, a]) => id.startsWith('claim_') ? hit(a, ['outdated'], p, c) : hit(a, ['missing'], p, c))
  : Object.values(r.answers).some((a) => hit(a, ['contradicts', 'incomplete'], p, c)))).map((r) => r.section))
const line = (label, set) => { const s = score(ctx, set); console.log(`${label.padEnd(30)} Recall ${pct(s.recallMust)} / ${pct(s.recallAny)} · Precision ${pct(s.precision)} (${s.flagged})`) }
line('LLM allein', llmFlagged)
for (const [p, c] of [[0.6, 0.5], [0.8, 0.7]]) {
  const j = jevFlagged(p, c)
  line(`Jev ${variant} p≥${p}`, j)
  line(`  LLM ∪ Jev`, new Set([...llmFlagged, ...j]))
  line(`  LLM ∩ Jev`, new Set([...llmFlagged].filter((x) => j.has(x))))
}
