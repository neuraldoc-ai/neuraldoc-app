// The section check (check.mjs, with its second look) with any configured model on a chosen set of sections, with or
// without Jev's doubtful statements as hints. Answers come from the shared check cache, so repeats are free.
//   --sections all | jev        all checkable sections, or only those Jev's claims check flagged
//   --hints jev                 the statements Jev doubted go into the prompt as suspects
//   --jev-p 0.6 --jev-c 0.5     Jev thresholds for flagging and hints
//   NEURALDOC_DRAFT_PROVIDER=local NEURALDOC_LLM_BASE_URL=http://127.0.0.1:8081/v1 NEURALDOC_LLM_MODEL=qwen3.5-9b \
//     node --use-system-ca --env-file=frontend/.env.local mcp/eval/lab/llm-check.mjs --bench mobiq --sections jev --hints jev
import fs from 'node:fs'
import path from 'node:path'
import { arg, benchProject, check, labDir, pct, score } from './common.mjs'
import { evalDir } from '../benchmarks.mjs'

const { draftingConfig } = await import('../../drafting.mjs')
const { runtimeEnv } = await import('../../settings.mjs')
const benches = arg('--bench', 'mobiq').split(','), only = arg('--sections', 'all'), hints = arg('--hints', 'none')
const jp = Number(arg('--jev-p', 0.6)), jc = Number(arg('--jev-c', 0.5)), concurrency = Number(arg('--concurrency', 3))
const config = draftingConfig({ ...runtimeEnv(), NEURALDOC_STATE_DIR: path.join(labDir, 'state') })
const cacheDir = path.join(evalDir, 'check-cache')
const hit = (a, choice) => !!a && a.choice === choice && a.confidence >= jc && a.probabilities[choice] >= jp

for (const name of benches) {
  const ctx = await benchProject(name), started = Date.now()
  const jevFile = path.join(labDir, `jev-claims-${name}.json`)
  const jev = fs.existsSync(jevFile) ? new Map(JSON.parse(fs.readFileSync(jevFile, 'utf8')).rows.map((r) => [r.section, r])) : new Map()
  const suspectsOf = (section) => {
    const r = jev.get(section.id)
    if (!r?.answers) return []
    const out = (r.claims ?? []).flatMap((statement, i) => hit(r.answers[`claim_${i}`], 'outdated') ? [{ statement, why: `wirkt veraltet (Vorprüfung ${Math.round(r.answers[`claim_${i}`].probabilities.outdated * 100)} %)` }] : [])
    if (hit(r.answers.missing, 'missing')) out.push({ statement: '(ganzer Abschnitt)', why: `der Code zeigt hier vielleicht etwas, das fehlt (Vorprüfung ${Math.round(r.answers.missing.probabilities.missing * 100)} %)` })
    return out
  }
  const targets = only === 'jev' ? ctx.sections.filter((s) => suspectsOf(s).length) : ctx.sections
  const usage = { calls: 0, cached: 0, usd: 0, errors: 0 }, results = new Map()
  await check.pool(targets, concurrency, async (section) => {
    try {
      const r = await check.checkSection({ section, document: { title: section.title, path: section.path, kind: section.type }, code: ctx.code, retriever: ctx.retriever, config, cacheDir, suspects: hints === 'jev' ? suspectsOf(section) : [] })
      if (r.usage) { usage[r.cached ? 'cached' : 'calls']++; if (!r.cached) usage.usd += r.usage.costUsd || 0 }
      results.set(section.id, r)
    } catch (error) { usage.errors++; console.error(`Fehler ${section.path}: ${error.message}`) }
  })
  const flagged = new Set([...results].filter(([, r]) => r.status === 'findings' && r.findings.length).map(([id]) => id))
  const s = score(ctx, flagged)
  console.log(`${name} · ${config.model} · Abschnitte ${only} (${targets.length}) · Hinweise ${hints}: Recall ${pct(s.recallMust)} / ${pct(s.recallAny)} · Precision ${pct(s.precision)} (${s.flagged}) · ${usage.calls} Aufrufe, ${usage.cached} Cache, ${usage.errors} Fehler, ${usage.usd.toFixed(4)} USD · ${((Date.now() - started) / 60000).toFixed(1)} min`)
  fs.writeFileSync(path.join(labDir, `llm-${config.model}-${only}-${hints}-${name}.json`), JSON.stringify({ name, model: config.model, only, hints, flagged: [...flagged], score: s, usage }, null, 2))
}
