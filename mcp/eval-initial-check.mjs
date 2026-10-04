// Evaluates the initial check on MOBIQ: code of release 26.4 against the documentation of 26.3
// (33 Confluence pages + 7 files). Scores document-level recall/precision against ground-truth.json.
// The ground truth is read only here, never by the product.
//
//   node --use-system-ca --env-file=frontend/.env.local mcp/eval-initial-check.mjs [--drafts] [--fresh] [--label name]
//
// Jev (and with --drafts the LLM) are called for real; repeated identical requests come from the cache in the
// eval state folder. A run on MOBIQ costs well below 0.01 USD.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataPath } from './dataset.mjs'

const args = process.argv.slice(2), flag = (name) => args.includes(name)
const label = args[args.indexOf('--label') + 1] && args.includes('--label') ? args[args.indexOf('--label') + 1] : 'run'
const root = fileURLToPath(new URL('..', import.meta.url))
const stateDir = path.join(root, 'mcp', 'state', 'eval')
if (flag('--fresh')) fs.rmSync(stateDir, { recursive: true, force: true })
process.env.NEURALDOC_STATE_DIR = stateDir
delete process.env.NEURALDOC_MODE
const { zipSync, strToU8 } = await import('../frontend/server-deps.mjs')
const projects = await import('./projects.mjs')

// Upload exactly as the browser would: repo/… and docs/…
const entries = { 'manifest.json': strToU8(JSON.stringify({ repoName: 'mobiq-code', docsName: 'mobiq-doku' })) }
const add = (dir, prefix) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === '.git') continue; const p = path.join(dir, e.name); if (e.isDirectory()) add(p, `${prefix}${e.name}/`); else entries[`${prefix}${e.name}`] = fs.readFileSync(p) } }
add(path.join(root, 'datasets', 'mobiq-code'), 'repo/')
add(path.join(root, 'datasets', 'mobiq-docs', 'dokumente', 'files'), 'docs/dateien/')
const storage = path.join(root, 'datasets', 'mobiq-docs', 'confluence', 'storage')
for (const file of fs.readdirSync(storage)) {
  const xml = fs.readFileSync(path.join(storage, file), 'utf8'), title = xml.match(/<!--\s*\w+ \/ (.+?) \(Version/)?.[1] || file
  entries[`docs/confluence/${file.replace(/\.xml$/, '.html')}`] = strToU8(`<h1>${title}</h1>\n${xml.replace(/<!--[\s\S]*?-->/g, '')}`)
}

const started = Date.now()
const imported = await projects.addProject(Buffer.from(zipSync(entries)))
const checked = await projects.checkProject()
const p = projects.activeProject()

// Ground truth on document level: Confluence pages by id, files by name.
const truth = JSON.parse(fs.readFileSync(dataPath('ground-truth.json'), 'utf8'))
const expected = truth.changes.flatMap((c) => c.expected.map((e) => ({ ...e, change: c.id })))
const keyOf = (docPath) => docPath.match(/confluence\/(\d+)-/)?.[1] || path.basename(docPath)
const levels = new Map()
for (const e of expected) {
  const key = e.source === 'confluence' ? e.pageId : e.source === 'datei' ? e.title : null
  if (!key) continue
  if (levels.get(key) !== 'must') levels.set(key, e.level)
}
const docs = [...new Map(p.docFiles.filter((d) => d.origin === 'docs').map((d) => [keyOf(d.path), d])).values()]
const flaggedDocs = new Set(checked.dataset.proposals.map((x) => keyOf(p.docFiles.find((d) => d.id === x.doc).path)))
const rows = docs.map((d) => { const key = keyOf(d.path); return { key, title: p.docFiles.find((x) => x.path === d.path).title.split(' · ')[0], expected: levels.get(key) || '-', flagged: flaggedDocs.has(key) } })
const must = rows.filter((r) => r.expected === 'must'), any = rows.filter((r) => r.expected !== '-')
const tp = rows.filter((r) => r.flagged && r.expected !== '-').length, flagged = rows.filter((r) => r.flagged).length
const result = {
  label, at: new Date().toISOString(), documents: rows.length, sections: p.docFiles.length, codeFiles: p.files.length,
  recallMust: must.filter((r) => r.flagged).length / must.length, recallAny: any.filter((r) => r.flagged).length / any.length,
  precision: flagged ? tp / flagged : 0, flagged, jevUsd: p.mapping.usage.estimatedUsd, jevRequests: p.mapping.usage.requests, ms: Date.now() - started,
  missed: must.filter((r) => !r.flagged).map((r) => r.title), falsePositives: rows.filter((r) => r.flagged && r.expected === '-').map((r) => r.title),
}

if (flag('--drafts')) {
  result.drafts = []
  for (const proposal of checked.dataset.proposals) {
    const title = p.docFiles.find((d) => d.id === proposal.doc).title
    try { const d = await projects.projectDraft(proposal.id); result.drafts.push({ title, status: d.result.status, reason: d.result.reason, usd: d.usage?.costUsd ?? null }) }
    catch (error) { result.drafts.push({ title, status: 'rejected', reason: error.message }) }
  }
}

console.log(`\n${result.label}: ${result.documents} Dokumente, ${result.sections} Abschnitte, ${result.codeFiles} Code-Dateien`)
console.log(`Recall (must): ${(result.recallMust * 100).toFixed(0)} % · Recall (must+should): ${(result.recallAny * 100).toFixed(0)} % · Precision: ${(result.precision * 100).toFixed(0)} % (${result.flagged} gemeldet) · Jev ${result.jevUsd.toFixed(4)} USD`)
console.log('Verpasst:', result.missed.join(' | ') || '–')
console.log('Falsch gemeldet:', result.falsePositives.join(' | ') || '–')
for (const r of rows) console.log(`  ${r.flagged ? '●' : '○'} ${r.expected.padEnd(6)} ${r.title}`)
if (result.drafts) for (const d of result.drafts) console.log(`  Entwurf ${d.status.padEnd(13)} ${d.title}: ${d.reason.slice(0, 140)}`)
fs.mkdirSync(stateDir, { recursive: true })
fs.writeFileSync(path.join(stateDir, `report-${result.at.replace(/[:.]/g, '-')}-${label}.json`), JSON.stringify(result, null, 2))
