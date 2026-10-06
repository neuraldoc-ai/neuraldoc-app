// What the section check saw and answered for sections of the last eval project (cached answers only, no calls).
//   node --env-file=frontend/.env.local mcp/eval/section-why.mjs "README › Configuration" [--input]
import fs from 'node:fs'
import path from 'node:path'
import { evalDir } from './benchmarks.mjs'

process.env.NEURALDOC_STATE_DIR = evalDir
const { sectionDocument } = await import('../projects.mjs')
const { draftingConfig } = await import('../drafting.mjs')
const { CHECK_THINKING, cachedCall, checkVariant, codeIndex, createSectionRetriever, factDense, pickExcerpts, sectionInput, sectionTerms } = await import('../check.mjs')

const dir = path.join(evalDir, 'projects'), active = JSON.parse(fs.readFileSync(path.join(dir, 'active.json'), 'utf8'))
const p = JSON.parse(fs.readFileSync(path.join(dir, active.id, 'project.json'), 'utf8'))
const config = draftingConfig({ ...process.env, NEURALDOC_STATE_DIR: path.join(dir, p.id) })
const code = codeIndex(p.files), retriever = createSectionRetriever(p.files)
for (const want of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const section = p.docFiles.find((d) => d.title === want || d.title.endsWith(want))
  const terms = sectionTerms(section.text), files = retriever.named?.(section.text).size ?? 0
  const chunks = pickExcerpts(retriever.rank(section, terms), { k: 14 + files, budget: Math.min(48000, 28000 + Math.max(0, files - 6) * 2500) })
  const excerpts = [...chunks, ...(factDense(section.text) ? retriever.facts?.(section, terms, chunks) ?? [] : [])]
  const content = sectionInput({ section, document: sectionDocument(p, section), terms, excerpts, code })
  try {
    const { raw } = await cachedCall({ ...checkVariant(section.text), content, config, cacheDir: path.join(evalDir, 'check-cache'), prefix: 'check', thinking: CHECK_THINKING[config.model], fetchImpl: async () => { throw new Error('nicht im Cache') } })
    console.log(`## ${section.title}: ${raw.status}, ${raw.findings.length} Befunde`)
    for (const f of raw.findings) console.log(`   [${f.kind}] ${f.doc_quote.slice(0, 120)} — ${f.explanation.slice(0, 160)}`)
  } catch (e) { console.log(`## ${section.title}: ${e.message}`) }
  if (process.argv.includes('--input')) for (const c of content.code) console.log(`   ${c.source}${c.why ? ` (${c.why})` : ''}`)
}
