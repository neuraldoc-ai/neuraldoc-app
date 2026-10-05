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
  'src/config.ts': "export const options = {\n  port: 3000,\n  host: 'localhost',\n  timeout: 30,\n  retries: 3,\n  logLevel: 'info',\n  maxSize: 10,\n  cacheDir: '.cache',\n}\n",
  'README.md': '# Shop\n\nDer Export verwendet das Erstellungsdatum des Berichts.\n',
  'LICENSE': 'MIT License',
  'CHANGELOG.md': '# Changelog\n\n- Rabatt geändert\n',
  '.env': 'SECRET=must-not-be-imported\n',
  'config/credentials.json': '{"token":"must-not-be-imported"}\n',
  'node_modules/lib/index.js': 'must-not-be-imported',
  'test/fixtures/sample.md': '# Fixture\n\nmust-not-be-a-document\n',
}
const docs = {
  'rabatt.md': '# Rabatt\n\nDer Rabatt beträgt immer 10 Prozent des Auftragswerts.\nMit `rabattTabelle()` lässt sich die Staffel ausgeben.\n',
  'optionen.md': '# Optionen\n\n- `port`: Port des Servers, Standard 3000.\n- `host`: Hostname, Standard localhost.\n- `timeout`: Zeitlimit in Sekunden, Standard 30.\n- `retries`: Wiederholungen, Standard 3.\n- `logLevel`: Protokollstufe, Standard info.\n- `maxSize`: Größte Datei in MB, Standard 10.\n',
  'installation.md': '# Installation\n\nDas Programm wird mit npm install eingerichtet.\n',
  'handbuch/rabatt.docx': office({ 'word/document.xml': '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Rabatt im Handbuch</w:t></w:r></w:p><w:p><w:r><w:t>Ab 1000 EUR gibt es 15 Prozent.</w:t></w:r></w:p></w:body></w:document>' }),
  'parameter.xlsx': office({ 'xl/workbook.xml': '<workbook><sheets><sheet name="Parameter" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/sharedStrings.xml': '<sst><si><t>Rabattgrenze</t></si><si><t>EUR</t></si></sst>', 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1000</v></c><c r="C1" t="s"><v>1</v></c></row></sheetData></worksheet>' }),
  'schulung.pptx': office({ 'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Rabatt erklären</a:t></a:r></a:p></p:sld>' }),
  'export.pdf': pdf(['Export', 'Der Export verwendet das heutige Datum.', 'Die Datei enthält alle Berichte des Tages und entsteht jeden Abend.']),
  'bild.png': 'not a document',
}

// Jev mock for the second opinion: every finding is confirmed, unless its claim says VETO. Answers pass validateResponse.
let jevCalls = 0
const jevFetch = ({ malformed } = {}) => async (_url, options) => {
  jevCalls++
  const request = JSON.parse(options.body), answers = {}
  if (malformed?.(request)) return { ok: true, status: 200, json: async () => ({ model: MODEL, answers: {}, usage: { input_tokens: 1, output_tokens: 1 } }) }
  for (const [id, q] of Object.entries(request.questions)) {
    const keys = Object.keys(q.criteria), claim = request.state.findings[Number(id.slice(8))].claim
    const choice = claim.includes('VETO') ? 'refuted' : 'confirmed', p = 0.9
    answers[id] = { type: 'choice', choice, confidence: 0.9, probabilities: Object.fromEntries(keys.map((k) => [k, k === choice ? p : (1 - p) / (keys.length - 1)])) }
  }
  return { ok: true, status: 200, json: async () => ({ model: MODEL, answers, usage: { input_tokens: 100, output_tokens: 3 } }) }
}
const jev = (fetchImpl = jevFetch()) => (options) => createJevClient({ ...options, fetchImpl })

// LLM mock speaks the OpenAI-compatible /v1 protocol of the local provider and answers the section check and the
// completeness pass like a model would; `reply` can replace the section answer.
let llmCalls = 0
const llmFetch = (reply = checkReply) => async (_url, request) => {
  llmCalls++
  const body = JSON.parse(request.body), system = body.messages[0].content, content = JSON.parse(body.messages[1].content)
  const value = system.startsWith('You check whether one document') ? listReply(content) : reply(content)
  return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 500, completion_tokens: 80 } }) }
}
const ok = { status: 'ok', findings: [], question: '', summary: 'Der Abschnitt stimmt mit dem Code überein.' }
const excerpt = (content, text) => content.code.find((c) => c.text.includes(text))
const lineOf = (numbered, text) => numbered.split('\n').findIndex((l) => l.includes(text)) + 1
function checkReply(content) {
  const text = content.section.numbered
  if (text.includes('immer 10 Prozent')) return {
    status: 'findings', question: '', summary: 'Rabattstaffel und entfernte Funktion.',
    findings: [
      { kind: 'contradicts', doc_quote: 'Der Rabatt beträgt immer 10 Prozent', evidence: [{ id: excerpt(content, 'total >= 1000').id, quote: 'total >= 1000 ? total * 0.15' }], absent: [], explanation: 'Der Abschnitt nennt immer 10 Prozent, discount() in src/pricing.ts gibt ab 1000 EUR 15 Prozent.', edits: [{ op: 'replace', start: 3, end: 3, text: 'Ab 1.000 EUR Auftragswert beträgt der Rabatt 15 Prozent, darunter 10 Prozent.' }] },
      { kind: 'removed', doc_quote: 'Mit `rabattTabelle()` lässt sich die Staffel ausgeben.', evidence: [], absent: ['rabattTabelle'], explanation: 'rabattTabelle() gibt es im Code nicht mehr.', edits: [{ op: 'delete', start: 4, end: 4, text: '' }] },
    ],
  }
  // The PDF finding is wrong on purpose: Jev refutes it and it never reaches the reviewer.
  if (text.includes('heutige Datum')) return { status: 'findings', question: '', summary: 'Datum.', findings: [{ kind: 'contradicts', doc_quote: 'Der Export verwendet das heutige Datum.', evidence: [{ id: excerpt(content, 'createdAt').id, quote: 'return report.createdAt' }], absent: [], explanation: 'VETO: das Datum kommt aus dem Bericht.', edits: [{ op: 'replace', start: lineOf(text, 'heutige Datum'), end: lineOf(text, 'heutige Datum'), text: 'Der Export verwendet das Erstellungsdatum.' }] }] }
  return ok
}
function listReply(content) {
  const lines = content.document.numbered.split('\n'), at = lines.findIndex((l) => l.includes('`maxSize`')) + 1
  return {
    summary: 'cacheDir fehlt.',
    entries: content.candidates.map(({ name }) => name === 'cacheDir'
      ? { name, add: true, reason: '', doc_quote: '- `maxSize`: Größte Datei in MB, Standard 10.', evidence: [{ id: excerpt(content, 'cacheDir').id, quote: "cacheDir: '.cache'" }], explanation: 'Der Code hat die Option cacheDir, die Liste nennt sie nicht.', edits: [{ op: 'insert_after', start: at, end: at, text: '- `cacheDir`: Cache-Verzeichnis, Standard .cache.' }] }
      : { name, add: false, reason: 'kein Optionsname', doc_quote: '', evidence: [], explanation: '', edits: [] }),
  }
}
const run = (fetchImpl = llmFetch(), jevImpl) => ({ fetchImpl, createClient: jev(jevImpl) })

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
  assert.match(await documentText('a.xlsx', docs['parameter.xlsx']), /## Parameter\n\n\| Rabattgrenze \| 1000 \| EUR \|\n\| --- \| --- \| --- \|/)
  assert.match(await documentText('a.pptx', docs['schulung.pptx']), /## Folie 1\n\nRabatt erklären/)
  assert.equal(await documentText('a.html', '<h1>Titel</h1><p>A &amp; B</p><script>x()</script>'), '# Titel\nA & B')
  await assert.rejects(documentText('a.pdf', Buffer.from('kein pdf')), /konnte nicht gelesen werden/)
  const long = Array.from({ length: 40 }, (_, i) => `## Kapitel ${i}\n\n${'Text '.repeat(60)}`).join('\n\n')
  const parts = sections(long, { max: 2000 })
  assert.ok(parts.length > 5 && parts.every((p) => p.length <= 2000))
  assert.equal(parts.join(''), long)
  assert.ok(parts.slice(1).every((p) => p.startsWith('## Kapitel')))
})

let first
test('upload: code and documents only; secrets, dependencies, legal texts and fixtures stay out', async () => {
  first = await projects.addProject(upload(repo, docs))
  assert.equal(first.mode, 'working')
  assert.equal(first.project.name, 'shop')
  assert.deepEqual(first.project.files.map((f) => f.path).sort(), ['src/config.ts', 'src/export.ts', 'src/pricing.ts', 'src/report.ts'])
  const paths = [...new Set(first.project.documents.map((d) => d.path))].sort()
  assert.deepEqual(paths, ['dokumentation/export.pdf', 'dokumentation/handbuch/rabatt.docx', 'dokumentation/installation.md', 'dokumentation/optionen.md', 'dokumentation/parameter.xlsx', 'dokumentation/rabatt.md', 'dokumentation/schulung.pptx', 'repository/README.md'])
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
  try {
    await assert.rejects(projects.checkProject(run(() => assert.fail('no model request without Jev'))), /Jev-Key fehlt/)
    assert.throws(() => projects.startCheck(), /Jev-Key fehlt/)
  } finally { process.env.TYPESAFE_API_KEY = key }
  assert.equal(projects.activeProject().mapping, null)
})

test('an LLM is required too: without one nothing is called', async () => {
  const provider = process.env.NEURALDOC_DRAFT_PROVIDER, model = process.env.NEURALDOC_LLM_MODEL
  delete process.env.NEURALDOC_DRAFT_PROVIDER; delete process.env.NEURALDOC_LLM_MODEL
  try {
    await assert.rejects(projects.checkProject(run(() => assert.fail('no request without an LLM'), () => assert.fail('no Jev request'))), /LLM/)
    assert.throws(() => projects.startCheck(), /LLM/)
  } finally { process.env.NEURALDOC_DRAFT_PROVIDER = provider; process.env.NEURALDOC_LLM_MODEL = model }
  assert.equal(projects.activeProject().mapping, null)
})

test('a check whose model fails for every section installs nothing', async () => {
  await assert.rejects(projects.checkProject(run(async () => ({ ok: false, status: 500 }))), /HTTP 500/)
  const p = projects.activeProject()
  assert.equal(p.mapping, null)
  assert.equal(p.dataset.proposals.length, 0)
})

let proposal, options
test('initial check: verified findings become proposals with their correction, reason and evidence', async () => {
  jevCalls = 0; llmCalls = 0
  const payload = await projects.checkProject(run())
  const p = projects.activeProject(), titles = payload.dataset.proposals.map((x) => x.title).sort()
  assert.deepEqual(titles, ['Optionen', 'Rabatt'], 'the PDF finding Jev refutes never becomes a proposal')
  proposal = payload.dataset.proposals.find((x) => x.title === 'Rabatt')
  options = payload.dataset.proposals.find((x) => x.title === 'Optionen')
  const rabatt = p.docSources.find((s) => s.path === 'dokumentation/rabatt.md')
  assert.equal(proposal.doc, rabatt.id, 'a proposal belongs to its document; the section is one block of it')
  assert.equal(proposal.at, 0)
  const g = p.generated[proposal.id]
  assert.equal(g.generation.status, 'draft')
  assert.equal(g.text, '# Rabatt\n\nAb 1.000 EUR Auftragswert beträgt der Rabatt 15 Prozent, darunter 10 Prozent.\n', 'both edits applied to the exact section')
  assert.deepEqual(g.generation.findings.map((f) => [f.kind, f.sure]), [['contradicts', true], ['removed', true]])
  assert.match(g.generation.findings[0].evidence[0].source, /^src\/pricing\.ts:1-/)
  assert.deepEqual(g.generation.findings[1].absent, ['rabattTabelle'])
  assert.equal(g.confidence, 'hoch', 'every finding confirmed by Jev')
  // The completeness pass adds the option the code has and the document's list leaves out, in the list's format.
  assert.match(p.generated[options.id].text, /- `maxSize`: Größte Datei in MB, Standard 10\.\n- `cacheDir`: Cache-Verzeichnis, Standard \.cache\./)
  assert.equal(p.mapping.lists.find((l) => l.doc === options.doc).added, 1)
  const pdf = p.docFiles.find((d) => d.path.endsWith('export.pdf'))
  assert.match(p.mapping.records.find((r) => r.doc === pdf.id).dropped[0].reason, /Jev widerspricht/)
  assert.ok(payload.graph.edges.some((e) => e.id.startsWith('check:') && e.target === 'file:src/pricing.ts' && e.kind === 'semantic'))
  const labels = fs.readFileSync(new URL('../frontend/src/dashboard/features/docs/brain/model.ts', import.meta.url), 'utf8')
  for (const kind of new Set(payload.graph.edges.map((e) => e.kind))) assert.ok(labels.includes(`  ${kind}: "`), kind)
  assert.deepEqual([payload.project.mapping.mismatches, payload.project.mapping.findings], [2, 3])
  assert.equal(payload.project.mapping.records, undefined, 'raw records stay on the server')
  assert.ok(llmCalls > 0 && jevCalls > 0)
  // Identical requests come from the caches: a repeated check costs nothing.
  const again = await projects.checkProject(run(async () => { throw new Error('must use the model cache') }, async () => { throw new Error('must use the Jev cache') }))
  assert.deepEqual(again.dataset.proposals.map((x) => x.id).sort(), payload.dataset.proposals.map((x) => x.id).sort())
})

test('the server keeps only what it can verify', async () => {
  const { verifyFindings, codeIndex, createSectionRetriever, pickExcerpts, excerptId, narrow, tidyEdit } = await import('./check.mjs')
  const p = projects.activeProject(), code = codeIndex(p.files), retriever = createSectionRetriever(p.files)
  const section = { text: '# Rabatt\n\nDer Rabatt beträgt immer 10 Prozent und gilt für den gesamten Auftrag.\nRabatte berechnet `discount()` aus dem Auftragswert.\n- Punkt eins\n' }
  const excerpts = pickExcerpts(retriever.rank(section, ['discount'])), ex = excerpts.find((c) => c.text.includes('0.15'))
  const finding = (patch) => ({ kind: 'contradicts', doc_quote: 'Der Rabatt beträgt immer 10 Prozent', evidence: [{ id: excerptId(ex), quote: 'total * 0.15' }], absent: [], explanation: 'Ab 1000 EUR gelten 15 Prozent.', edits: [{ op: 'replace', start: 3, end: 3, text: 'Der Rabatt beträgt ab 1000 EUR 15 Prozent.' }], ...patch })
  const verify = (...findings) => verifyFindings({ status: 'findings', findings, question: '', summary: 's' }, { section, excerpts, code, terms: [] })
  assert.equal(verify(finding()).findings.length, 1)
  const reasons = (f) => verify(f).dropped.map((d) => d.reason).join()
  assert.match(reasons(finding({ doc_quote: 'steht nirgends im Abschnitt' })), /Zitat/)
  assert.match(reasons(finding({ evidence: [{ id: excerptId(ex), quote: 'total * 0.99' }] })), /Codebeleg/)
  assert.match(reasons(finding({ kind: 'removed', evidence: [], absent: ['discount'], edits: [{ op: 'delete', start: 4, end: 4, text: '' }] })), /kommt im Code vor/)
  assert.match(reasons(finding({ edits: [{ op: 'replace', start: 3, end: 3, text: 'Der  Rabatt beträgt immer **10** Prozent und gilt für den gesamten Auftrag.' }] })), /Leerzeichen/)
  assert.match(reasons(finding({ edits: [{ op: 'replace', start: 3, end: 3, text: 'The discount is always 15 percent of the order value and it is not changed.' }] })), /Sprache/)
  assert.match(reasons(finding({ edits: [{ op: 'replace', start: 9, end: 9, text: 'x' }] })), /außerhalb/)
  assert.equal(verify(finding(), finding({ explanation: 'zweimal' })).dropped[0].reason, 'überschneidet sich mit einem anderen Befund')
  // A replacement that repeats unchanged lines is cut down to the changed line; list markers stay as they were.
  const lines = section.text.split('\n')
  assert.deepEqual(narrow({ op: 'replace', start: 1, end: 4, text: '# Rabatt\n\nDer Rabatt beträgt ab 1000 EUR 15 Prozent.\nRabatte berechnet `discount()` aus dem Auftragswert.' }, lines), [{ op: 'replace', start: 3, end: 3, text: 'Der Rabatt beträgt ab 1000 EUR 15 Prozent.' }])
  assert.equal(tidyEdit({ op: 'replace', start: 5, end: 5, text: '- - Punkt zwei' }, lines).text, '- Punkt zwei')
  assert.equal(tidyEdit({ op: 'insert_after', start: 5, end: 5, text: '- Punkt drei\n\n' }, lines).text, '- Punkt drei')
  // Names the original writes as code stay code, new names of the same style too.
  const table = ['| `OPENAI_API_KEY` / `GEMINI_API_KEY` | Key | none |']
  assert.equal(tidyEdit({ op: 'replace', start: 1, end: 1, text: '| OPENAI_API_KEY / GEMINI_API_KEY / VERTEX_API_KEY | Key | none |' }, table).text, '| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `VERTEX_API_KEY` | Key | none |')
})

test('re-check of one section: a question first, then the answer leads to the correction', async () => {
  const question = (content) => content.reviewer_answer === 'Netto.' ? checkReply(content) : { status: 'unclear', findings: [], question: 'Gilt die Grenze brutto oder netto?', summary: 'Grenze unklar.' }
  const asked = await projects.projectDraft(proposal.id, 'Bitte noch einmal prüfen.', run(llmFetch(question)))
  assert.equal(asked.result.status, 'needs_context')
  assert.equal(asked.proposal.question, 'Gilt die Grenze brutto oder netto?')
  assert.throws(() => projects.projectDecisions({ id: proposal.id, decision: { state: 'uebernommen' } }), /Rückfrage/)
  const answered = await projects.projectDraft(proposal.id, 'Netto.', run(llmFetch(question)))
  assert.equal(answered.result.status, 'draft')
  assert.equal(answered.proposal.generation.answer, 'Netto.')
  assert.equal(answered.result.findings.length, 2)
  await assert.rejects(projects.projectDraft(proposal.id, '', run()), /1 bis 2.000/)
})

test('re-checks of different sections run side by side; a full check waits for them', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const slow = async (url, request) => { await gate; return llmFetch((content) => ({ ...checkReply(content), summary: `Parallel ${content.section.heading}` }))(url, request) }
  const running = [proposal.id, options.id].map((id) => projects.projectDraft(id, 'Parallel.', run(slow)))
  await assert.rejects(projects.checkProject(run(async () => { throw new Error('must not run') })), /läuft schon/)
  assert.throws(() => projects.startCheck(), /läuft schon/)
  release()
  await Promise.all(running)
  const p = projects.activeProject()
  for (const id of [proposal.id, options.id]) assert.equal(p.generated[id].generation.answer, 'Parallel.', 'no re-check overwrites another')
})

test('one malformed Jev answer is retried once; the findings stay, unconfirmed', async () => {
  let calls = 0
  const flaky = jevFetch({ malformed: (request) => request.state.section.includes('immer 10 Prozent') && ++calls })
  const p0 = projects.activeProject()
  fs.rmSync(path.join(projects.projectsDir, p0.id, 'jev-cache.json'), { force: true })
  const payload = await projects.checkProject(run(llmFetch(), flaky))
  assert.equal(calls, 2, 'one retry')
  const p = projects.activeProject(), g = p.generated[payload.dataset.proposals.find((x) => x.title === 'Rabatt').id]
  assert.deepEqual(g.generation.findings.map((f) => [f.kind, f.sure]), [['contradicts', false]], 'without Jev a deletion is not kept')
  assert.equal(g.confidence, 'pruefen')
  fs.rmSync(path.join(projects.projectsDir, p.id, 'jev-cache.json'), { force: true })
  await projects.checkProject(run())
})

test('the check runs in the background and reports its progress', async () => {
  const started = projects.startCheck(run(async () => { throw new Error('must use the model cache') }))
  assert.equal(started.running, true)
  assert.ok(started.total >= 3)
  while (projects.checkStatus.running) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(projects.checkStatus.phase, 'done')
  assert.equal(projects.checkStatus.done, projects.checkStatus.total)
  assert.equal(projects.checkStatus.findings, 3)
})

test('approval, edit, revoke and export: approved text merged into its document', async () => {
  projects.projectDecisions({ id: proposal.id, decision: { state: 'uebernommen', edited: { text: '# Rabatt\n\nBearbeitet.\n' } } })
  let exported = projects.exportProject()
  assert.equal(exported.files.length, 1)
  assert.equal(exported.files[0].path, 'dokumentation/rabatt.md')
  assert.equal(exported.files[0].content, '# Rabatt\n\nBearbeitet.\n')
  await assert.rejects(projects.projectDraft(proposal.id, 'x', run()), /zurücknehmen/)
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
  assert.equal(projects.projectPayload().mode, 'empty', 'the normal app never falls back to the MOBIQ showcase')
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
    // An uploaded folder has no Git history: the code is there, commits are not.
    assert.equal((await fetch(`${base}/api/mcp/project/commit?sha=x`)).status, 400)
    assert.equal((await fetch(`${base}/api/mcp/project/commit?sha=abcdef1`)).status, 404)
    const source = await (await fetch(`${base}/api/mcp/project/source`)).json()
    assert.deepEqual([source.commits, source.mergeRequests, source.repository.ref], [[], [], null])
    assert.match(source.repository.files['src/pricing.ts'].content, /0\.15/)
    assert.equal(source.repository.files['.env'], undefined, 'secrets stay out')
    const documents = (await (await fetch(`${base}/api/mcp/project/documents`)).json()).documents
    assert.ok(documents.some((d) => d.path === 'dokumentation/rabatt.md' && /10 Prozent/.test(d.text) && d.sections.length === 1))
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

test('reset deletes every project; the app starts empty; the showcase refuses', async () => {
  process.env.NEURALDOC_MODE = 'showcase'
  try { assert.throws(() => projects.resetProjects(), /Showcase/) } finally { delete process.env.NEURALDOC_MODE }
  assert.ok(projects.projectList().length > 0)
  const payload = projects.resetProjects()
  assert.equal(payload.mode, 'empty')
  assert.deepEqual(projects.projectList(), [])
  assert.equal(projects.activeProject(), null)
})
