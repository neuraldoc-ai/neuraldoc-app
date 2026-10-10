// Shared pieces of the detection lab: a benchmark as imported project, the excerpts the section check would show,
// a Jev client with its own cache and budget, and scoring exactly like run.mjs (an item is found when one of its
// sections is flagged; section precision = flagged sections that carry an expected item).
import fs from 'node:fs'
import path from 'node:path'
import { evalDir, loadBenchmark, sectionsOf } from '../benchmarks.mjs'

// Own projects folder: lab runs must not switch the active project of a running run.mjs.
process.env.NEURALDOC_STATE_DIR = path.join(evalDir, 'lab', 'state')
delete process.env.NEURALDOC_MODE
const projects = await import('../../projects.mjs')
const check = await import('../../check.mjs')
const { createJevClient } = await import('../../semantic-mapping.mjs')

export const labDir = path.join(evalDir, 'lab')
fs.mkdirSync(labDir, { recursive: true })
export const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback

/** The benchmark imported as a project, with the retriever and identifier index of the section check. */
export async function benchProject(name) {
  const bench = loadBenchmark(name)
  await projects.addProject(bench.upload)
  const p = projects.activeProject()
  const inScope = (d) => name === 'mobiq' ? d.origin === 'docs' : true
  const sections = p.docFiles.filter((d) => d.checkable !== false && inScope(d))
  const retriever = check.createSectionRetriever(p.files), code = check.codeIndex(p.files)
  return { name, bench, p, sections, retriever, code }
}

/** The excerpts the section check would give the model for a section (same ranking, same budget). */
export function excerptsFor({ retriever }, section, { k, budget } = {}) {
  const terms = check.sectionTerms(section.text), files = retriever.named?.(section.text).size ?? 0
  return check.pickExcerpts(retriever.rank(section, terms), { k: k ?? 14 + files, budget: budget ?? Math.min(48000, 28000 + Math.max(0, files - 6) * 2500) })
}

export function jevClient(label, budget = 1) {
  const key = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY
  if (!key) throw new Error('TYPESAFE_API_KEY fehlt (frontend/.env.local)')
  return createJevClient({ key: key.trim(), cachePath: path.join(labDir, `jev-cache-${label}.json`), budget })
}

/** Item recall (must / all) and section precision for a set of flagged section ids. */
export function score({ bench, p, sections }, flagged) {
  const ids = new Set(sections.map((s) => s.id)), hit = new Set([...flagged].filter((id) => ids.has(id)))
  const itemSections = new Map(bench.items.map((i) => [i.id, sectionsOf(i, p.docFiles, bench.keyOf)]))
  const found = (i) => itemSections.get(i.id).some((s) => hit.has(s.id))
  const must = bench.items.filter((i) => i.level === 'must')
  const withItems = new Set(bench.items.flatMap((i) => itemSections.get(i.id).map((s) => s.id)))
  return {
    recallMust: must.length ? must.filter(found).length / must.length : null,
    recallAny: bench.items.filter(found).length / bench.items.length,
    flagged: hit.size, precision: hit.size ? [...hit].filter((id) => withItems.has(id)).length / hit.size : null,
    relevant: withItems.size, missed: bench.items.filter((i) => !found(i)).map((i) => i.id),
  }
}

export const pct = (v) => v === null || v === undefined || Number.isNaN(v) ? '  –' : `${(v * 100).toFixed(0).padStart(3)}%`
export { check, projects }
