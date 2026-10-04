// What the evaluation has spent so far, summed from the caches below mcp/state/eval (every paid answer is cached once).
//   node mcp/eval/costs.mjs
import fs from 'node:fs'
import path from 'node:path'
import { evalDir } from './benchmarks.mjs'
import { INPUT_USD_PER_MILLION } from '../semantic-mapping.mjs'

const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const files = (dir, test) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(test).map((f) => path.join(dir, f)) : []
const sum = { jev: 0, findings: 0, drafts: 0, judge: 0 }, count = { jev: 0, findings: 0, drafts: 0, judge: 0 }
for (const id of fs.readdirSync(path.join(evalDir, 'projects')).filter((x) => /^[a-f0-9]{20}$/.test(x))) {
  const dir = path.join(evalDir, 'projects', id), jev = path.join(dir, 'jev-cache.json')
  if (fs.existsSync(jev)) for (const entry of Object.values(json(jev))) { sum.jev += entry.response.usage.input_tokens * INPUT_USD_PER_MILLION / 1e6; count.jev++ }
  for (const f of files(path.join(dir, 'findings'), (f) => f.endsWith('.json'))) { sum.findings += json(f).usage?.costUsd || 0; count.findings++ }
  for (const f of files(dir, (f) => /^draft-.*\.json$/.test(f))) { sum.drafts += json(f).usage?.costUsd || 0; count.drafts++ }
}
for (const f of files(path.join(evalDir, 'judge'), (f) => f.endsWith('.json'))) { sum.judge += json(f).usd || 0; count.judge++ }
for (const k of Object.keys(sum)) console.log(`${k.padEnd(9)} ${String(count[k]).padStart(4)} Aufrufe  ${sum[k].toFixed(4)} USD`)
console.log(`gesamt              ${Object.values(sum).reduce((a, b) => a + b, 0).toFixed(4)} USD (ohne Aufrufe, die vor dem Cache scheiterten)`)
