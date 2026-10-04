// Own-project flow: upload → initial check → draft → approval → export. Jev and the LLM are mocked
// through the real clients and validators; no paid request is ever sent.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { zipSync, strToU8 } from '../frontend/server-deps.mjs'

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-projects-test-')))
process.env.NEURALDOC_STATE_DIR = path.join(root, 'state')
process.env.TYPESAFE_API_KEY = 'test-only-never-sent'
process.env.NEURALDOC_DRAFT_PROVIDER = 'local'
process.env.NEURALDOC_LLM_MODEL = 'mock-model'
delete process.env.NEURALDOC_MODE
const projects = await import('./projects.mjs')
const { createJevClient, MODEL } = await import('./semantic-mapping.mjs')
const { generateDraft } = await import('./drafting.mjs')
const { middleware } = await import('./handler.mjs')
const { projectTool } = await import('./project-mcp.mjs')
const { documentText, sections } = await import('./doc-text.mjs')
const { classify, repoUrl } = await import('../frontend/src/dashboard/features/docs/import-rules.mjs')
after(() => fs.rmSync(root, { recursive: true, force: true }))

/** The browser's upload format: repo/…, docs/… and a manifest. */
const upload = (repo = {}, docs = {}, manifest = { repoName: 'shop' }) => Buffer.from(zipSync({
  'manifest.json': strToU8(JSON.stringify(manifest)),
  ...Object.fromEntries(Object.entries(repo).map(([f, t]) => [`repo/${f}`, typeof t === 'string' ? strToU8(t) : t])),
  ...Object.fromEntries(Object.entries(docs).map(([f, t]) => [`docs/${f}`, typeof t === 'string' ? strToU8(t) : t])),
}))
const office = (files) => zipSync(Object.fromEntries(Object.entries(files).map(([f, t]) => [f, strToU8(t)])))
function pdf(lines) {
  const stream = `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `(${l}) '`).join(' ')} ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let out = '%PDF-1.4\n', offsets = []
  objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(out, 'latin1')
}

const repo = {
  'src/pricing.ts': 'export function discount(total: number) {\n  return total >= 1000 ? total * 0.15 : total * 0.10\n}\n',
  'src/report.ts': "import { discount } from './pricing'\nexport function summary(total: number) {\n  return `Rabatt ${discount(total)}`\n}\n",
  'src/export.ts': 'export function exportDate(report: { createdAt: string }) {\n  return report.createdAt\n}\n',
  'README.md': '# Shop\n\nDer Export verwendet das Erstellungsdatum des Berichts.\n',
  'LICENSE': 'MIT License',
  'CHANGELOG.md': '# Changelog\n\n- Rabatt geändert\n',
  '.env': 'SECRET=must-not-be-imported\n',
  'config/credentials.json': '{"token":"must-not-be-imported"}\n',
  'node_modules/lib/index.js': 'must-not-be-imported',
  'test/fixtures/sample.md': '# Fixture\n\nmust-not-be-a-document\n',
}
const docs = {
  'rabatt.md': '# Rabatt\n\nDer Rabatt beträgt immer 10 Prozent des Auftragswerts.\n',
  'installation.md': '# Installation\n\nDas Programm wird mit npm install eingerichtet.\n',
  'handbuch/rabatt.docx': office({ 'word/document.xml': '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Rabatt im Handbuch</w:t></w:r></w:p><w:p><w:r><w:t>Ab 1000 EUR gibt es 15 Prozent.</w:t></w:r></w:p></w:body></w:document>' }),
  'parameter.xlsx': office({ 'xl/workbook.xml': '<workbook><sheets><sheet name="Parameter" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/sharedStrings.xml': '<sst><si><t>Rabattgrenze</t></si><si><t>EUR</t></si></sst>', 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1000</v></c><c r="C1" t="s"><v>1</v></c></row></sheetData></worksheet>' }),
  'schulung.pptx': office({ 'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Rabatt erklären</a:t></a:r></a:p></p:sld>' }),
  'export.pdf': pdf(['Export', 'Der Export verwendet das heutige Datum.']),
  'bild.png': 'not a document',
}

// Jev mock: answers follow document and code, every response passes validateResponse.
let jevCalls = 0
const jevFetch = (decide) => async (_url, options) => {
  jevCalls++
  const request = JSON.parse(options.body), doc = request.state.document, answers = {}
  for (const [id, q] of Object.entries(request.questions)) {
    const keys = Object.keys(q.criteria)
    const { choice, p } = id === 'component' ? { choice: keys[0], p: 0.95 } : decide(doc, request.state.code[Number(id.slice(5))])
    const rest = (1 - p) / (keys.length - 1)
    answers[id] = { type: 'choice', choice, confidence: p >= 0.9 ? 0.9 : 0.6, probabilities: Object.fromEntries(keys.map((k) => [k, k === choice ? p : rest])) }
  }
  return { ok: true, status: 200, json: async () => ({ model: MODEL, answers, usage: { input_tokens: 100, output_tokens: 3 } }) }
}
const decide = (doc, code) =>
  doc.content.includes('immer 10 Prozent') && code.path === 'src/pricing.ts' ? { choice: 'contradicts', p: 0.95 }
  : doc.path.endsWith('export.pdf') && code.path === 'src/export.ts' ? { choice: 'contradicts', p: 0.55 } // too uncertain
  : doc.path.endsWith('rabatt.docx') && code.path === 'src/report.ts' ? { choice: 'incomplete', p: 0.7 }
  : doc.path.endsWith('README.md') && code.path === 'src/export.ts' ? { choice: 'consistent', p: 0.95 }
  : { choice: 'unrelated', p: 0.9 }
const jev = (fetchImpl) => ({ createClient: (options) => createJevClient({ ...options, fetchImpl }) })

// LLM mock speaks the OpenAI-compatible /v1 protocol of the local provider.
let llmCalls = 0
const llm = (reply) => ({ generate: (context, options) => generateDraft(context, { ...options, fetchImpl: async (_url, request) => {
  llmCalls++
  const sent = JSON.parse(JSON.parse(request.body).messages[1].content)
  return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply(sent)) } }], usage: { prompt_tokens: 500, completion_tokens: 80 } }) }
} }) })
// Own-project drafts are line edits (target.op patch) with findings quoted from the section and the code.
const finding = (sent) => ({ doc_quote: 'Der Rabatt beträgt immer 10 Prozent', evidence_id: sent.evidence[0].id, code_quote: 'total >= 1000 ? total * 0.15', problem: 'Ab 1000 gilt 15 Prozent.' })
const draftReply = (sent) => ({ status: 'draft', findings: [finding(sent)], edits: [{ op: 'replace', start: 3, end: 3, text: 'Ab 1.000 EUR Auftragswert beträgt der Rabatt 15 Prozent, darunter 10 Prozent.' }], reason: 'discount() staffelt ab 1000.', question: '', evidenceIds: [sent.evidence[0].id] })
const questionReply = () => ({ status: 'needs_context', findings: [], edits: [], reason: 'Gilt die Grenze brutto oder netto?', question: 'Ist der Auftragswert brutto oder netto?', evidenceIds: [] })
const noChangeReply = (sent) => ({ status: 'no_change', findings: [], edits: [], reason: 'Der Code bestätigt den Text.', question: '', evidenceIds: [sent.evidence[0].id] })

test('import rules: repository documents, ignored folders, secrets and URLs', () => {
  assert.equal(classify('README.md', 'repo'), 'doc')
  assert.equal(classify('README', 'repo'), 'doc')
  assert.equal(classify('docs/setup.txt', 'repo'), 'doc')
  assert.equal(classify('notes/spec.pdf', 'repo'), 'doc')
  assert.equal(classify('requirements.txt', 'repo'), null)
  assert.equal(classify('LICENSE.md', 'repo'), null)
  assert.equal(classify('CHANGELOG.md', 'repo'), null)
  assert.equal(classify('.github/pull_request_template.md', 'repo'), null)
  assert.equal(classify('test/fixtures/a.md', 'repo'), null)
  assert.equal(classify('src/a.ts', 'repo'), 'code')
  assert.equal(classify('node_modules/a/index.js', 'repo'), null)
  assert.equal(classify('package-lock.json', 'repo'), null)
  assert.equal(classify('.env.local', 'repo'), null)
  assert.equal(classify('handbuch.pdf', 'docs'), 'doc')
  assert.equal(classify('logo.png', 'docs'), null)
  assert.deepEqual(repoUrl('github.com/org/repo'), { url: 'https://github.com/org/repo.git', name: 'repo' })
  assert.equal(repoUrl('https://github.com/org/repo.git').name, 'repo')
  for (const bad of ['file:///etc', 'git@github.com:org/repo.git', 'ssh://host/repo', 'https://github.com', 'ext::sh -c id']) assert.equal(repoUrl(bad), null, bad)
})

test('documents: PDF, Word, Excel, PowerPoint and HTML become text; sections are exact slices', async () => {
  assert.match(await documentText('a.pdf', pdf(['Hallo PDF'])), /Seite 1[\s\S]*Hallo PDF/)
  assert.match(await documentText('a.docx', docs['handbuch/rabatt.docx']), /^# Rabatt im Handbuch\nAb 1000 EUR/)
  assert.match(await documentText('a.xlsx', docs['parameter.xlsx']), /## Parameter\n\nRabattgrenze \| 1000 \| EUR/)
  assert.match(await documentText('a.pptx', docs['schulung.pptx']), /## Folie 1\n\nRabatt erklären/)
  assert.equal(await documentText('a.html', '<h1>Titel</h1><p>A &amp; B</p><script>x()</script>'), '# Titel\nA & B')
  await assert.rejects(documentText('a.pdf', Buffer.from('kein pdf')), /konnte nicht gelesen werden/)
  const long = Array.from({ length: 40 }, (_, i) => `## Kapitel ${i}\n\n${'Text '.repeat(60)}`).join('\n\n')
  const parts = sections(long, 2000)
  assert.ok(parts.length > 5 && parts.every((p) => p.length <= 2000))
  assert.equal(parts.join(''), long)
  assert.ok(parts.slice(1).every((p) => p.startsWith('## Kapitel')))
})

let first
test('upload: code and documents only; secrets, dependencies, legal texts and fixtures stay out', async () => {
  first = await projects.addProject(upload(repo, docs))
  assert.equal(first.mode, 'working')
  assert.equal(first.project.name, 'shop')
  assert.deepEqual(first.project.files.map((f) => f.path).sort(), ['src/export.ts', 'src/pricing.ts', 'src/report.ts'])
  const paths = [...new Set(first.project.documents.map((d) => d.path))].sort()
  assert.deepEqual(paths, ['dokumentation/export.pdf', 'dokumentation/handbuch/rabatt.docx', 'dokumentation/installation.md', 'dokumentation/parameter.xlsx', 'dokumentation/rabatt.md', 'dokumentation/schulung.pptx', 'repository/README.md'])
  assert.equal(first.dataset.docs.find((d) => d.title === 'parameter').type, 'parameter')
  assert.equal(first.dataset.docs.find((d) => d.title === 'Installation').type, 'installation')
  const stored = JSON.stringify(projects.activeProject())
  for (const secret of ['must-not-be-imported', 'must-not-be-a-document', 'MIT License', 'Rabatt geändert']) assert.ok(!stored.includes(secret), secret)
  assert.ok(first.graph.nodes.some((n) => n.type === 'function' && n.label === 'discount()'))
  assert.ok(first.graph.edges.some((e) => e.kind === 'calls' || e.kind === 'imports'), 'TypeScript call/import resolved')
  assert.equal(first.dataset.proposals.length, 0)
  assert.equal(first.dataset.bundles[0].commits.length, 0)
  assert.ok(!JSON.stringify(first.dataset).includes('MOBIQ'))
  assert.ok(!fs.readdirSync(projects.projectsDir).some((f) => f.startsWith('.upload-')), 'upload folder removed')
})

test('repository only: README and docs/ count as documentation; without any document the import stops', async () => {
  const only = await projects.addProject(upload({ ...repo, 'docs/betrieb.md': '# Betrieb\n\nDer Dienst startet auf Port 3000.\n' }, {}, { repoName: 'nur-repo' }))
  assert.deepEqual([...new Set(only.project.documents.map((d) => d.path))].sort(), ['repository/README.md', 'repository/docs/betrieb.md'])
  assert.equal(only.project.sources.docs, null)
  await assert.rejects(projects.addProject(upload({ 'src/a.ts': 'export const a = 1\n' })), /keine Dokumentation/)
  projects.activateProject(first.project.id)
})

test('invalid uploads are rejected before anything is stored', async () => {
  const count = projects.projectList().length
  await assert.rejects(projects.addProject(upload({}, docs)), /Repository fehlt/)
  await assert.rejects(projects.addProject(upload({ 'README.md': '# Nur Text' })), /Keine Code-Dateien/)
  await assert.rejects(projects.addProject(upload({}, {}, { repoUrl: 'file:///etc/passwd' })), /https-URL/)
  await assert.rejects(projects.addProject(Buffer.from('kein zip')), /./)
  const traversal = Buffer.from(zipSync({ 'repo/src/a.ts': strToU8('export const a = 1\n'), 'repo/README.md': strToU8('# A\n\nText\n'), '../evil.ts': strToU8('x'), 'repo/../../evil2.ts': strToU8('x') }))
  await projects.addProject(traversal)
  assert.ok(!fs.existsSync(path.join(projects.projectsDir, '..', 'evil.ts')) && !fs.existsSync(path.join(projects.projectsDir, 'evil2.ts')))
  assert.equal(projects.projectList().length, count + 1)
  projects.activateProject(first.project.id)
})

test('approval is refused before any draft exists', async () => {
  assert.throws(() => projects.projectDecisions({ id: 'missing', decision: { state: 'uebernommen' } }), /Unbekannter/)
})

test('Jev is required: without a key no check and no proposal exist', async () => {
  const key = process.env.TYPESAFE_API_KEY
  delete process.env.TYPESAFE_API_KEY
  try { await assert.rejects(projects.checkProject(jev(() => assert.fail('no request without key'))), /Jev-Key fehlt/) }
  finally { process.env.TYPESAFE_API_KEY = key }
  assert.equal(projects.activeProject().mapping, null)
})

test('a failing Jev run installs nothing', async () => {
  await assert.rejects(projects.checkProject(jev(async () => ({ ok: false, status: 500 }))), /HTTP 500/)
  const p = projects.activeProject()
  assert.equal(p.mapping, null)
  assert.equal(p.dataset.proposals.length, 0)
})

let proposal
test('initial check: confident contradictions with the current code become proposals; the rest stays unchanged', async () => {
  jevCalls = 0
  const payload = await projects.checkProject(jev(jevFetch(decide)))
  assert.ok(jevCalls >= 5)
  assert.equal(payload.dataset.proposals.length, 2, 'a contradiction and an omission; the uncertain PDF verdict stays out')
  const rabatt = payload.project.documents.find((d) => d.path === 'dokumentation/rabatt.md')
  proposal = payload.dataset.proposals.find((x) => x.doc === rabatt.id)
  assert.ok(proposal)
  assert.equal(proposal.text, proposal.find, 'no text invented before a draft')
  assert.match(proposal.why, /src\/pricing\.ts/)
  const links = payload.graph.edges.filter((e) => e.kind === 'semantic' && e.target.startsWith('file:'))
  assert.deepEqual(links.map((e) => [e.target, e.evidence.decision.verdict]).sort(), [['file:src/export.ts', 'consistent'], ['file:src/pricing.ts', 'contradicts'], ['file:src/report.ts', 'incomplete']])
  assert.ok(payload.graph.edges.some((e) => e.kind === 'documents' && e.target === `doc:${rabatt.id}`))
  const labels = fs.readFileSync(new URL('../frontend/src/dashboard/features/docs/brain/model.ts', import.meta.url), 'utf8')
  for (const kind of new Set(payload.graph.edges.map((e) => e.kind))) assert.ok(labels.includes(`  ${kind}: "`), kind)
  assert.equal(payload.project.mapping.mismatches, 2)
  assert.equal(payload.project.mapping.consistent, 1)
  assert.equal(payload.project.mapping.records, undefined, 'raw records stay on the server')
  const again = await projects.checkProject(jev(async () => { throw new Error('must use cache') }))
  assert.ok(again.dataset.proposals.some((x) => x.id === proposal.id))
})

test('drafts: question, "no change" and a validated correction from the current code', async () => {
  llmCalls = 0
  const question = await projects.projectDraft(proposal.id, undefined, llm(questionReply))
  assert.equal(question.result.status, 'needs_context')
  assert.throws(() => projects.projectDecisions({ id: proposal.id, decision: { state: 'uebernommen' } }), /Rückfrage/)
  const same = await projects.projectDraft(proposal.id, 'Prüfen.', llm(noChangeReply))
  assert.equal(same.proposal.generation.status, 'no_change')
  assert.match(same.proposal.question, /verwerfen/)
  assert.throws(() => projects.projectDecisions({ id: proposal.id, decision: { state: 'uebernommen' } }), /Textentwurf/)
  await assert.rejects(projects.projectDraft(proposal.id, 'Brutto.', llm(() => draftReply({ evidence: [{ id: 'invented' }] }))), /unbekannte Belege/)
  await assert.rejects(projects.projectDraft(proposal.id, 'Ohne Beleg.', llm((sent) => ({ ...draftReply(sent), findings: [{ ...finding(sent), code_quote: 'total * 0.20' }] }))), /Kein Befund/)
  const draft = await projects.projectDraft(proposal.id, 'Netto.', llm(draftReply))
  assert.equal(draft.result.status, 'draft')
  assert.equal(draft.result.text, '# Rabatt\n\nAb 1.000 EUR Auftragswert beträgt der Rabatt 15 Prozent, darunter 10 Prozent.\n', 'edits applied to the exact section')
  assert.equal(draft.proposal.generation.findings[0].problem, 'Ab 1000 gilt 15 Prozent.')
  assert.match(draft.context.evidence[0].source, /Prüfung: widerspricht dem Abschnitt/)
  assert.ok(draft.context.evidence.some((e) => e.id.startsWith('code:') && e.text.includes('0.15') && /src\/pricing\.ts, Zeilen 1-/.test(e.source)))
  assert.ok(Buffer.byteLength(JSON.stringify(draft.context)) <= 40000)
  assert.equal(llmCalls, 5)
  const cached = await projects.projectDraft(proposal.id, 'Netto.', llm(() => { throw new Error('must use cache') }))
  assert.equal(cached.cached, true)
})

test('"no change" is only valid where the task allows it', async () => {
  const context = { change: { id: 'c', title: 'c' }, document: { id: 'd', title: 'd', type: 't', audience: 'a', section: 's', before: 'Alt', surrounding: '' }, target: { id: 't', op: 'replace', instruction: 'Formuliere neu.' }, evidence: [{ id: 'e', source: 's', text: 'x' }] }
  const noChangeFull = (sent) => ({ status: 'no_change', text: '', blocks: [], rows: [], reason: 'Der Code bestätigt den Text.', question: '', evidenceIds: [sent.evidence[0].id] })
  await assert.rejects(llm(noChangeFull).generate(context, { config: { ...(await import('./drafting.mjs')).draftingConfig({ ...process.env, NEURALDOC_STATE_DIR: path.join(root, 'nc') }) } }), /nicht vorgesehen/)
})

test('one malformed Jev answer is retried once, then only its section is skipped', async () => {
  let calls = 0
  const flaky = async (url, options) => {
    if (JSON.parse(options.body).state.document.path.endsWith('export.pdf')) { calls++; return { ok: true, status: 200, json: async () => ({ model: MODEL, answers: {}, usage: { input_tokens: 1, output_tokens: 1 } }) } }
    return jevFetch(decide)(url, options)
  }
  const payload = await projects.checkProject({ createClient: (options) => createJevClient({ ...options, cachePath: path.join(root, 'flaky-cache.json'), fetchImpl: flaky }) })
  assert.equal(calls, 2, 'one retry')
  const p = projects.activeProject(), pdf = p.docFiles.find((d) => d.path.endsWith('export.pdf'))
  assert.equal(p.mapping.records.find((r) => r.doc === pdf.id).skipped, 'Jev-Antwort ungültig.')
  assert.ok(payload.dataset.proposals.some((x) => x.id === proposal.id), 'the other sections are still checked')
})

test('approval, edit, revoke and export: approved text merged into its document', async () => {
  projects.projectDecisions({ id: proposal.id, decision: { state: 'uebernommen', edited: { text: '# Rabatt\n\nBearbeitet.\n' } } })
  let exported = projects.exportProject()
  assert.equal(exported.files.length, 1)
  assert.equal(exported.files[0].path, 'dokumentation/rabatt.md')
  assert.equal(exported.files[0].content, '# Rabatt\n\nBearbeitet.\n')
  await assert.rejects(projects.projectDraft(proposal.id, 'x', llm(draftReply)), /zurücknehmen/)
  projects.projectDecisions({ id: proposal.id, decision: null })
  assert.equal(projects.exportProject().files.length, 0)
  projects.projectDecisions({ id: proposal.id, decision: { state: 'uebernommen' } })
  assert.equal(projects.activeProject().decisions[proposal.id].edited, undefined, 'unchanged approval is not an edit')
  exported = projects.exportProject()
  assert.match(exported.files[0].content, /15 Prozent/)
  assert.equal(exported.files[0].edited, false)
})

test('export of a PDF section comes back as Markdown next to the original name', async () => {
  const p = projects.activeProject(), pdfDoc = p.docFiles.find((d) => d.path.endsWith('export.pdf'))
  p.dataset.proposals.push({ id: 'proposal-pdftest', bundle: 'erstpruefung', doc: pdfDoc.id, text: pdfDoc.text, find: pdfDoc.text, op: 'replace', title: 't' })
  p.generated['proposal-pdftest'] = { text: '## Seite 1\n\nDer Export verwendet das Erstellungsdatum.', generation: { status: 'draft' } }
  p.decisions['proposal-pdftest'] = { state: 'uebernommen' }
  fs.writeFileSync(path.join(projects.projectsDir, p.id, 'project.json'), JSON.stringify(p))
  const file = projects.exportProject().files.find((f) => f.original === 'dokumentation/export.pdf')
  assert.equal(file.path, 'dokumentation/export.pdf.md')
  assert.match(file.content, /Erstellungsdatum/)
  assert.match(file.beforeSha256, /^[a-f0-9]{64}$/)
  delete p.decisions['proposal-pdftest']; p.dataset.proposals.pop(); delete p.generated['proposal-pdftest']
  fs.writeFileSync(path.join(projects.projectsDir, p.id, 'project.json'), JSON.stringify(p))
})

test('re-import of the same state keeps decisions; another project is isolated; switching works', async () => {
  const again = await projects.addProject(upload(repo, docs))
  assert.equal(again.project.id, first.project.id)
  assert.equal(projects.activeProject().decisions[proposal.id].state, 'uebernommen')
  const second = await projects.addProject(upload(repo, { 'other.md': '# Anderes\n\nNichts zum Rabatt.\n' }))
  assert.notEqual(second.project.id, first.project.id)
  assert.deepEqual(projects.activeProject().decisions, {})
  assert.equal(projects.exportProject().files.length, 0)
  projects.activateProject(first.project.id)
  assert.equal(projects.exportProject().files.length, 1)
  projects.activateProject(null)
  assert.equal(projects.projectPayload().mode, 'showcase')
  projects.activateProject(first.project.id)
})

test('MCP project tools search own sources only and log calls', async () => {
  const result = await projectTool('ask', { question: 'Rabatt Prozent' })
  assert.equal(result.isError, false)
  assert.ok(result.structuredContent.sources.length)
  assert.ok(result.structuredContent.sources.every((s) => !s.text.includes('MOBIQ')))
  const status = await projectTool('check_change', {})
  assert.ok(status.structuredContent.proposals.some((x) => x.id === proposal.id))
  assert.equal(status.structuredContent.check.mismatches, 2)
  assert.ok(fs.readFileSync(path.join(projects.projectsDir, first.project.id, 'calls.jsonl'), 'utf8').includes('"tool":"ask"'))
})

test('HTTP: ZIP import, origin check on mutations, export', async () => {
  const server = http.createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const payload = await (await fetch(`${base}/api/mcp/project`)).json()
    assert.equal(payload.mode, 'working')
    assert.ok(payload.projects.length >= 3)
    const foreign = await fetch(`${base}/api/mcp/project/activate`, { method: 'POST', headers: { Origin: 'http://evil.example' }, body: '{}' })
    assert.equal(foreign.status, 403)
    const foreignImport = await fetch(`${base}/api/mcp/project/import`, { method: 'POST', headers: { Origin: 'http://evil.example' }, body: upload(repo, docs) })
    assert.equal(foreignImport.status, 403)
    const imported = await fetch(`${base}/api/mcp/project/import`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/zip' }, body: upload(repo, docs) })
    assert.equal(imported.status, 200)
    assert.equal((await imported.json()).project.id, first.project.id)
    const decision = await fetch(`${base}/api/mcp/decisions`, { method: 'POST', headers: { Origin: 'http://evil.example' }, body: JSON.stringify({ id: proposal.id, decision: null }) })
    assert.equal(decision.status, 403)
    assert.equal((await fetch(`${base}/api/mcp/project/commit?sha=x`)).status, 404)
    const exported = await (await fetch(`${base}/api/mcp/project/export`)).json()
    assert.equal(exported.files.length, 1)
    const drafts = await (await fetch(`${base}/api/mcp/drafts`)).json()
    assert.equal(drafts[proposal.id].generation.status, 'draft')
  } finally { server.close() }
})

test('showcase mode hides projects and blocks import', async () => {
  process.env.NEURALDOC_MODE = 'showcase'
  try {
    assert.equal(projects.activeProject(), null)
    assert.equal(projects.projectPayload().canImport, false)
    assert.deepEqual(projects.projectList(), [])
    await assert.rejects(projects.addProject(upload(repo, docs)), /Showcase/)
  } finally { delete process.env.NEURALDOC_MODE }
})

test('a correction may not drop most of the section or paste source code', async () => {
  const { validateDraft } = await import('./drafting.mjs')
  const before = '# Dialog\n\nFeld Menge ist Pflicht.\nFeld Montage ist optional.\nFeld Lieferung ist Pflicht.\nFeld Termin ist optional.\n'
  const context = { document: { before }, target: { op: 'replace', preserve: true, instruction: 'x' }, evidence: [{ id: 'code:a', source: 's', text: "<Checkbox label={t('kv.teil')} onChange={(v) => set(v)} />\n<Button disabled={!kv.teil} onClick={() => open(kv)}>Aufteilen</Button>" }] }
  const draft = (text) => ({ status: 'draft', text, blocks: [], rows: [], reason: 'r', question: '', evidenceIds: ['code:a'] })
  assert.doesNotThrow(() => validateDraft(draft(before + 'Feld Teillieferung ist optional.\n'), context))
  assert.throws(() => validateDraft(draft('# Dialog\n\nFeld Teillieferung ist optional.\n'), context), /entfernt/)
  assert.throws(() => validateDraft(draft(before + "<Checkbox label={t('kv.teil')} onChange={(v) => set(v)} />\n<Button disabled={!kv.teil} onClick={() => open(kv)}>Aufteilen</Button>\n"), context), /Quellcode/)
  assert.doesNotThrow(() => validateDraft(draft('# Neu\n\nAlles anders.\n'), { ...context, target: { op: 'replace', instruction: 'x' } }), 'only corrections with preserve are checked')
})
