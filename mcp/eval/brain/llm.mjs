// Gemini calls of the code-brain lab: cached by content (a repeated run costs nothing) and counted in one ledger.
// A call that would take the lab past its budget is refused before it is sent.
import fs from 'node:fs'
import path from 'node:path'
import { brainDir } from './mine.mjs'

const BUDGET_USD = Number(process.env.BRAIN_BUDGET_USD || 1.0)
const ledgerFile = path.join(brainDir, 'ledger.json')
const ledger = () => fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) : { spentUsd: 0, calls: 0, byPurpose: {} }
export const spent = () => ledger().spentUsd

export async function ask({ purpose, system, content, schema, model = 'gemini-2.5-flash-lite', thinking }) {
  const { draftingConfig } = await import('../../drafting.mjs')
  const { cachedCall } = await import('../../check.mjs')
  const config = draftingConfig({ ...process.env, NEURALDOC_LLM_MODEL: model })
  const l = ledger()
  if (l.spentUsd >= BUDGET_USD - 0.01) throw new Error(`Budget erreicht: ${l.spentUsd.toFixed(3)} USD von ${BUDGET_USD}`)
  const { raw, usage, cached } = await cachedCall({ system, content, config, cacheDir: path.join(brainDir, 'llm-cache'), prefix: purpose, thinking, schema })
  if (!cached) {
    const now = ledger(), cost = usage?.costUsd ?? 0
    now.spentUsd += cost; now.calls++
    now.byPurpose[purpose] = (now.byPurpose[purpose] ?? 0) + cost
    fs.writeFileSync(ledgerFile, JSON.stringify(now, null, 1))
  }
  return { value: raw, cached, cost: cached ? 0 : usage?.costUsd ?? 0 }
}
