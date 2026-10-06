// neuraldoc's initial check on neuraldoc itself, with the planted mismatches of benchmarks/self.json: item recall,
// a confusion matrix per documentation section, and every finding for hand review. Real LLM and Jev calls; answers
// are cached below mcp/state/eval, so a repeated run costs nothing.
//   node --use-system-ca --env-file=frontend/.env.local mcp/eval/self-run.mjs [--label name] [--clean] [--history]
// --clean checks the repository without the planted mismatches (the drift that is really there).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classify, ignored } from '../../frontend/src/dashboard/features/docs/import-rules.mjs'
import { evalDir } from './benchmarks.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const clean = process.argv.includes('--clean'), history = process.argv.includes('--history'), label = arg('--label', clean ? 'self-clean' : history ? 'self-history' : 'self')
const spec = JSON.parse(fs.readFileSync(new URL('./benchmarks/self.json', import.meta.url), 'utf8'))
process.env.NEURALDOC_STATE_DIR = evalDir
delete process.env.NEURALDOC_MODE
const projects = await import('../projects.mjs')
const { zipSync, strToU8 } = await import('../../frontend/server-deps.mjs')

// The repository as a clone would bring it: tracked and new files Git does not ignore, without submodules and
// without the ground truth of the evaluation.
const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
const mutate = (rel, text, which) => {
  for (const m of which.filter((x) => x.file === rel)) {
    const n = text.split(m.find).length - 1
    if (!n || (!m.all && n > 1)) throw new Error(`${m.item}: Stelle in ${rel} ${n ? 'nicht eindeutig' : 'nicht gefunden'}`)
    text = text.split(m.find).join(m.replace)
  }
  return text
}
const texts = new Map()
for (const rel of listed) {
  const abs = path.join(root, rel)
  if (/^mcp\/eval\/benchmarks\//.test(rel) || ignored(rel) || !classify(rel, 'repo') || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue
  texts.set(rel, fs.readFileSync(abs, 'utf8'))
}
const planted = clean ? [] : spec.mutations
for (const m of planted) if (!texts.has(m.file)) throw new Error(`${m.item}: ${m.file} fehlt im Upload`)

const started = Date.now()
if (history) {
  // A Git repository like a clone by URL: the release (tag v1.0) holds the documentation mutations, every code
  // mutation comes after it as a commit, so the check sees them in the history and its diffs.
  const dir = path.join(evalDir, 'self-git'), run = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=Eval', '-c', 'user.email=eval@example.com', ...args], { cwd: dir, encoding: 'utf8' })
  fs.rmSync(dir, { recursive: true, force: true })
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) }
  for (const [rel, text] of texts) put(rel, mutate(rel, text, planted.filter((m) => m.side === 'docs')))
  run('init', '-q'); run('add', '-A'); run('commit', '-q', '-m', 'release 1.0'); run('tag', 'v1.0')
  for (const subject of [...new Set(planted.filter((m) => m.commit).map((m) => m.commit))]) {
    const group = planted.filter((m) => m.commit === subject)
    for (const rel of new Set(group.map((m) => m.file))) put(rel, mutate(rel, fs.readFileSync(path.join(dir, rel), 'utf8'), group))
    run('add', '-A'); run('commit', '-q', '-m', subject)
  }
  const { importProject } = await import('../project-import.mjs')
  const project = await importProject({ name: 'neuraldoc-app', repo: { dir, label: 'neuraldoc-app', source: 'url' }, docs: null }, { projectsDir: projects.projectsDir })
  fs.mkdirSync(path.join(projects.projectsDir, project.id), { recursive: true })
  fs.writeFileSync(path.join(projects.projectsDir, project.id, 'project.json'), JSON.stringify(project))
  fs.writeFileSync(path.join(projects.projectsDir, 'active.json'), JSON.stringify({ id: project.id }))
  console.log(`Historie: ${project.history.commits.length} Commits seit ${project.history.tag}`)
} else {
  const entries = { 'manifest.json': strToU8(JSON.stringify({ repoName: 'neuraldoc-app' })) }
  for (const [rel, text] of texts) entries[`repo/${rel}`] = strToU8(mutate(rel, text, planted))
  await projects.addProject(Buffer.from(zipSync(entries)))
}
if (process.argv.includes('--dry')) {
  // Free: the hints the sections would get (changes since the release they still state, values the code disagrees on).
  const { codeChanges, sectionChanges, valueConflicts } = await import('../change-facts.mjs')
  const { createSectionRetriever, sectionTerms } = await import('../check.mjs')
  const p = projects.activeProject(), retriever = createSectionRetriever(p.files)
  const diffs = fs.existsSync(path.join(projects.projectsDir, p.id, 'diffs.json')) ? JSON.parse(fs.readFileSync(path.join(projects.projectsDir, p.id, 'diffs.json'), 'utf8')) : {}
  const changes = p.history ? codeChanges(p.history, diffs) : []
  console.log('Änderungen seit dem Release:', JSON.stringify(changes.map((c) => c.kind === 'rename' ? `${c.from} → ${c.to}` : `${c.name}: ${c.from} → ${c.to}`)))
  for (const s of p.docFiles.filter((d) => d.checkable !== false)) {
    const mine = sectionChanges(s.text, changes), conflicts = valueConflicts(s.text, sectionTerms(s.text), (n) => retriever.values(n))
    if (mine.length || conflicts.length) console.log(`  ${s.title}: ${mine.map((c) => `Zeile ${c.line} ${c.kind === 'rename' ? c.from : `${c.name} ${c.from}→${c.to}`}`).join('; ')} ${conflicts.map((c) => `[Widerspruch ${c.name}: ${c.values.map((v) => v.value).join(' / ')}]`).join(' ')}`)
  }
  process.exit(0)
}
const checked = await projects.checkProject()
const p = projects.activeProject()
const docKey = (d) => d.path.replace(/^(dokumentation|repository)\//, '')
const records = new Map(p.mapping.records.map((r) => [r.doc, r]))
const sections = p.docFiles.filter((d) => records.has(d.id))
const squash = (s) => String(s ?? '').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim()
// Every finding with what it quotes (its quote plus the lines its edits replace) and what it adds.
const findings = checked.dataset.proposals.flatMap((x) => {
  const g = p.generated[x.id]?.generation, section = p.docFiles.find((d) => d.id === x.section)
  if (!g?.findings?.length || !section) return []
  const lines = section.text.split('\n')
  return g.findings.map((f) => ({
    section: section.id, file: docKey(section), heading: section.title, kind: f.kind, sure: f.sure, jev: f.jev?.verdict,
    quote: f.doc_quote, replaced: f.edits.filter((e) => e.op !== 'insert_after').map((e) => lines.slice(e.start - 1, e.end).join('\n')).join('\n'),
    added: f.edits.map((e) => e.text ?? '').join('\n'), explanation: f.explanation, evidence: f.evidence?.map((e) => e.quote).slice(0, 2),
  }))
})
// Questions of the check (two places in the code disagree): an item the check asks about is reported separately.
const questions = checked.dataset.proposals.map((x) => ({ file: docKey(p.docFiles.find((d) => d.id === x.section) ?? { path: '' }), question: p.generated[x.id]?.question ?? '' })).filter((q) => q.question)
const askedAbout = (item) => questions.filter((q) => item.expect.some((e) => e.quote && e.file === q.file && squash(q.question).includes(squash(e.quote))))
const hits = (item) => findings.filter((f) => item.expect.some((e) => e.file === f.file && (e.quote ? squash(`${f.quote}\n${f.replaced}`).includes(squash(e.quote)) : squash(f.added).includes(squash(e.added)))))
const items = clean ? [] : spec.items.map((i) => ({ ...i, found: hits(i), asked: askedAbout(i) }))

// Sections that hold a planted mismatch: the stale statement is in them, or (a missing entry) the finding that adds it.
const positive = new Set()
for (const i of items) {
  for (const e of i.expect.filter((x) => x.quote)) for (const s of sections.filter((s) => docKey(s) === e.file && squash(s.text).includes(squash(e.quote)))) positive.add(s.id)
  for (const f of i.found) positive.add(f.section)
}
const flagged = new Set(findings.map((f) => f.section))
const caught = new Set(items.flatMap((i) => i.found.map((f) => f.section)))
const matrix = {
  truePositive: [...positive].filter((s) => caught.has(s)).length,
  falseNegative: [...positive].filter((s) => !caught.has(s)).length,
  falsePositive: [...flagged].filter((s) => !positive.has(s)).length,
  trueNegative: sections.filter((s) => !positive.has(s.id) && !flagged.has(s.id)).length,
}
const report = {
  label, at: new Date().toISOString(), model: p.mapping.model, sections: sections.length, documents: new Set(sections.map(docKey)).size, codeFiles: p.files.length,
  recall: items.length ? items.filter((i) => i.found.length).length / items.length : null, matrix,
  items: items.map((i) => ({ id: i.id, kind: i.kind, found: i.found.length > 0, asked: i.asked.length > 0, by: i.found.map((f) => `${f.file} › ${f.heading}: ${f.explanation}`), questions: i.asked.map((q) => `${q.file}: ${q.question}`) })),
  questions,
  other: findings.filter((f) => !items.some((i) => i.found.includes(f))),
  llm: p.mapping.usage.llm, jevUsd: p.mapping.usage.estimatedUsd, seconds: (Date.now() - started) / 1000,
}
fs.mkdirSync(path.join(evalDir, 'self'), { recursive: true })
fs.writeFileSync(path.join(evalDir, 'self', `${label}.json`), JSON.stringify(report, null, 1))
console.log(`${label}: ${report.sections} Abschnitte in ${report.documents} Dokumenten, ${report.codeFiles} Code-Dateien`)
if (items.length) {
  console.log(`Items: ${items.filter((i) => i.found.length).length}/${items.length}`)
  for (const i of report.items) console.log(`  ${i.found ? '✓' : i.asked ? '?' : '✗'} ${i.id} ${i.kind}${i.found ? `: ${i.by[0].slice(0, 160)}` : i.asked ? ` (als Rückfrage): ${i.questions[0].slice(0, 160)}` : ''}`)
  console.log(`Matrix (Abschnitte): TP ${matrix.truePositive} · FN ${matrix.falseNegative} · FP ${matrix.falsePositive} · TN ${matrix.trueNegative}`)
}
for (const q of report.questions ?? []) console.log(`Rückfrage ${q.file}: ${q.question}`)
console.log(`Weitere Befunde (von Hand prüfen):${report.other.length}`)
for (const f of report.other) console.log(`  - ${f.file} › ${f.heading} [${f.kind}${f.jev ? `, Jev ${f.jev}` : ''}]: ${f.explanation.slice(0, 200)}`)
console.log(`Kosten: LLM ${report.llm.usd.toFixed(3)} USD (${report.llm.calls} Aufrufe, ${report.llm.cached} Cache) · Jev ${(report.jevUsd || 0).toFixed(3)} USD · ${report.seconds.toFixed(0)} s`)
