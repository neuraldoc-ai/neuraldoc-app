// Working-demo project flow against a throwaway Git repository. Jev and the LLM are mocked
// through the real clients and validators; no paid request is ever sent.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { execFileSync } from 'node:child_process'

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
after(() => fs.rmSync(root, { recursive: true, force: true }))

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' })
const put = (dir, file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text) }

const repo = path.join(root, 'repo'), docs = path.join(root, 'docs')
fs.mkdirSync(repo); git(repo, 'init', '-q', '-b', 'main')
put(repo, 'src/pricing.ts', 'export function discount(total: number) {\n  return total * 0.10\n}\n')
put(repo, 'src/report.ts', "import { discount } from './pricing'\nexport function summary(total: number) {\n  return `Rabatt ${discount(total)}`\n}\n")
put(repo, 'legacy/Old.java', 'class Old { void run() {} }\n')
put(repo, '.env', 'SECRET=must-not-be-imported\n')
put(repo, 'config/credentials.json', '{"token":"must-not-be-imported"}\n')
git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'Initial')
put(repo, 'src/pricing.ts', 'export function discount(total: number) {\n  return total >= 1000 ? total * 0.15 : total * 0.10\n}\n')
fs.rmSync(path.join(repo, 'legacy/Old.java'))
git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'Staffelrabatt ab 1000 EUR')
put(repo, 'src/pricing.ts', 'uncommitted working copy change\n') // must never be imported

put(docs, 'rabatt.md', '# Rabatt\n\nDer Rabatt beträgt immer 10 Prozent des Auftragswerts.\n')
put(docs, 'installation.md', '# Installation\n\nDas Programm wird mit npm install eingerichtet.\n')
put(docs, 'unklar.md', '# Berichte\n\nDer Bericht zeigt einen Rabatt. Details folgen.\n')
put(docs, 'leer.md', '   \n')
put(docs, 'notes.txt.bak', 'ignored extension')
try { fs.symlinkSync(path.join(repo, '.env'), path.join(docs, 'link.md')) } catch { /* symlinks need extra rights on Windows */ }

// Jev mock: answers follow the document text, every response passes validateResponse.
let jevCalls = 0
const jevFetch = (decide) => async (_url, options) => {
  jevCalls++
  const request = JSON.parse(options.body), doc = request.state.document.content, answers = {}
  for (const [id, q] of Object.entries(request.questions)) {
    const keys = Object.keys(q.criteria)
    let choice, p
    if (id === 'component') { choice = keys[0]; p = 0.95 }
    else ({ choice, p } = decide(doc, request.state.changes[Number(id.slice(5))]))
    const rest = (1 - p) / (keys.length - 1)
    answers[id] = { type: 'choice', choice, confidence: p >= 0.9 ? 0.9 : 0.6, probabilities: Object.fromEntries(keys.map((k) => [k, k === choice ? p : rest])) }
  }
  return { ok: true, status: 200, json: async () => ({ model: MODEL, answers, usage: { input_tokens: 100, output_tokens: 3 } }) }
}
const decide = (doc, change) => doc.includes('immer 10 Prozent') && change.path === 'src/pricing.ts' ? { choice: 'affected', p: 0.95 } : doc.includes('Details folgen') ? { choice: 'affected', p: 0.85 } : { choice: 'unrelated', p: 0.9 }
const jev = (fetchImpl) => ({ createClient: (options) => createJevClient({ ...options, fetchImpl }) })

// LLM mock speaks the OpenAI-compatible /v1 protocol of the local provider.
let llmCalls = 0
const llm = (reply) => ({ generate: (context, options) => generateDraft(context, { ...options, fetchImpl: async (_url, request) => {
  llmCalls++
  const sent = JSON.parse(JSON.parse(request.body).messages[1].content)
  return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply(sent)) } }], usage: { prompt_tokens: 500, completion_tokens: 80 } }) }
} }) })
const draftReply = (sent) => ({ status: 'draft', text: '# Rabatt\n\nAb 1.000 EUR Auftragswert beträgt der Rabatt 15 Prozent, darunter 10 Prozent.\n', blocks: [], rows: [], reason: 'discount() staffelt ab 1000.', question: '', evidenceIds: [sent.evidence[0].id] })
const questionReply = () => ({ status: 'needs_context', text: '', blocks: [], rows: [], reason: 'Gilt die Grenze brutto oder netto?', question: 'Ist der Auftragswert brutto oder netto?', evidenceIds: [] })

let first
test('import reads only committed code and own documents; secrets, symlinks and working copy stay out', async () => {
  const before = fs.readFileSync(path.join(repo, 'src/pricing.ts'), 'utf8')
  first = await projects.addProject({ repository: repo, documentation: docs, name: 'Testprojekt' })
  assert.equal(first.mode, 'working')
  const files = first.project.files.map((f) => f.path).sort()
  assert.deepEqual(files, ['legacy/Old.java', 'src/pricing.ts', 'src/report.ts'])
  assert.equal(first.project.files.find((f) => f.path === 'legacy/Old.java').deleted, true)
  assert.deepEqual(first.project.files.filter((f) => f.changed).map((f) => f.path).sort(), ['legacy/Old.java', 'src/pricing.ts'])
  assert.deepEqual(first.project.documents.map((d) => d.path).sort(), ['installation.md', 'rabatt.md', 'unklar.md'])
  const stored = JSON.stringify(projects.activeProject())
  assert.ok(!stored.includes('must-not-be-imported') && !stored.includes('uncommitted working copy change'))
  assert.equal(fs.readFileSync(path.join(repo, 'src/pricing.ts'), 'utf8'), before)
  assert.ok(first.graph.nodes.some((n) => n.type === 'function' && n.label === 'discount()'))
  assert.ok(first.graph.edges.some((e) => e.kind === 'calls' || e.kind === 'imports'), 'TypeScript call/import resolved')
  assert.equal(first.dataset.proposals.length, 0)
  assert.ok(!JSON.stringify(first.dataset).includes('MOBIQ'))
})

test('Windows: a path typed in another letter case is the same repository and the same project', { skip: process.platform !== 'win32' }, async () => {
  const swapped = repo.replace(/[a-z]/i, (c) => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()).replace('neuraldoc-projects-test', 'NEURALDOC-projects-test')
  const again = await projects.addProject({ repository: swapped, documentation: docs.toUpperCase(), name: 'Testprojekt' })
  assert.equal(again.project.id, first.project.id)
})

test('invalid inputs are rejected before anything is stored', async () => {
  const count = projects.projectList().length
  await assert.rejects(projects.addProject({ repository: 'relative/path', documentation: docs }), /absoluten/)
  await assert.rejects(projects.addProject({ repository: path.join(repo, 'src'), documentation: docs }), /Stammordner/)
  await assert.rejects(projects.addProject({ repository: repo, documentation: docs, base: 'does-not-exist' }), /nicht gefunden/)
  await assert.rejects(projects.addProject({ repository: repo, documentation: docs, base: '--output=x' }), /Ungültiger Git-Stand/)
  const empty = path.join(root, 'empty-docs'); fs.mkdirSync(empty)
  await assert.rejects(projects.addProject({ repository: repo, documentation: empty }), /Keine Markdown/)
  const big = path.join(root, 'big-docs'); put(big, 'big.md', 'x'.repeat(9000))
  await assert.rejects(projects.addProject({ repository: repo, documentation: big }), /8\.000 Zeichen/)
  const single = path.join(root, 'single'); fs.mkdirSync(single); git(single, 'init', '-q'); put(single, 'a.ts', 'export const a = 1\n'); git(single, 'add', '-A'); git(single, 'commit', '-q', '-m', 'one')
  await assert.rejects(projects.addProject({ repository: single, documentation: docs }), /Kein vorheriger Commit/)
  assert.equal(projects.projectList().length, count)
  assert.equal(projects.activeProject().id, first.project.id)
})

test('approval is refused before any draft exists', async () => {
  assert.throws(() => projects.projectDecisions({ id: 'missing', decision: { state: 'uebernommen' } }), /Unbekannter/)
})

test('Jev is required: without a key no mapping and no proposal exist', async () => {
  const key = process.env.TYPESAFE_API_KEY
  delete process.env.TYPESAFE_API_KEY
  try { await assert.rejects(projects.mapProject(jev(() => assert.fail('no request without key'))), /Jev-Key fehlt/) }
  finally { process.env.TYPESAFE_API_KEY = key }
  assert.equal(projects.activeProject().mapping, null)
})

test('a failing Jev run installs nothing; the cache is not written', async () => {
  await assert.rejects(projects.mapProject(jev(async () => ({ ok: false, status: 500 }))), /HTTP 500/)
  const p = projects.activeProject()
  assert.equal(p.mapping, null)
  assert.equal(p.dataset.proposals.length, 0)
})

let proposal
test('Jev mapping: only confident links become proposals; uncertain and unrelated documents stay open', async () => {
  jevCalls = 0
  const payload = await projects.mapProject(jev(jevFetch(decide)))
  assert.equal(jevCalls, 3)
  assert.equal(payload.dataset.proposals.length, 1)
  proposal = payload.dataset.proposals[0]
  const rabatt = payload.project.documents.find((d) => d.path === 'rabatt.md')
  assert.equal(proposal.doc, rabatt.id)
  assert.equal(proposal.text, proposal.find, 'no text invented before a draft')
  const links = payload.graph.edges.filter((e) => e.kind === 'semantic' && e.target.startsWith('file:'))
  assert.deepEqual(links.map((e) => e.target), ['file:src/pricing.ts'])
  assert.ok(links.every((e) => !Array.isArray(e.evidence) && e.evidence.decision.probability >= 0.9))
  assert.ok(payload.graph.edges.some((e) => e.kind === 'documents' && e.target === `doc:${rabatt.id}`))
  // Every edge kind must be one the dashboard can label.
  const labels = fs.readFileSync(new URL('../frontend/src/dashboard/features/docs/brain/model.ts', import.meta.url), 'utf8')
  for (const kind of new Set(payload.graph.edges.map((e) => e.kind))) assert.ok(labels.includes(`  ${kind}: "`), kind)
  assert.equal(payload.project.mapping.deferred.length, 2)
  // A repeated run is served from the project cache and keeps the same proposal id.
  const again = await projects.mapProject(jev(async () => { throw new Error('must use cache') }))
  assert.equal(again.dataset.proposals[0].id, proposal.id)
})

test('needs_context cannot be approved; the reviewer answer leads to a validated draft', async () => {
  llmCalls = 0
  const question = await projects.projectDraft(proposal.id, undefined, llm(questionReply))
  assert.equal(question.result.status, 'needs_context')
  assert.throws(() => projects.projectDecisions({ id: proposal.id, decision: { state: 'uebernommen' } }), /Rückfrage/)
  await assert.rejects(projects.projectDraft(proposal.id, 'Brutto.', llm(() => draftReply({ evidence: [{ id: 'invented' }] }))), /unbekannte Belege/)
  const draft = await projects.projectDraft(proposal.id, 'Netto.', llm(draftReply))
  assert.equal(draft.result.status, 'draft')
  assert.ok(draft.context.evidence.some((e) => e.id.startsWith('diff:') && e.text.includes('0.15')))
  assert.ok(Buffer.byteLength(JSON.stringify(draft.context)) <= 40000)
  assert.equal(llmCalls, 3)
  const cached = await projects.projectDraft(proposal.id, 'Netto.', llm(() => { throw new Error('must use cache') }))
  assert.equal(cached.cached, true)
})

test('approval, edit, revoke and export: only approved text, originals untouched', async () => {
  const original = fs.readFileSync(path.join(docs, 'rabatt.md'), 'utf8')
  projects.projectDecisions({ id: proposal.id, decision: { state: 'uebernommen', edited: { text: '# Rabatt\n\nBearbeitet.\n' } } })
  let exported = projects.exportProject()
  assert.equal(exported.files.length, 1)
  assert.equal(exported.files[0].path, 'rabatt.md')
  assert.equal(exported.files[0].content, '# Rabatt\n\nBearbeitet.\n')
  await assert.rejects(projects.projectDraft(proposal.id, 'x', llm(draftReply)), /zurücknehmen/)
  projects.projectDecisions({ id: proposal.id, decision: null })
  assert.equal(projects.exportProject().files.length, 0)
  projects.projectDecisions({ id: proposal.id, decision: { state: 'uebernommen' } })
  assert.equal(projects.activeProject().decisions[proposal.id].edited, undefined, 'unchanged approval is not an edit')
  exported = projects.exportProject()
  assert.match(exported.files[0].content, /15 Prozent/)
  assert.equal(exported.files[0].edited, false)
  assert.equal(fs.readFileSync(path.join(docs, 'rabatt.md'), 'utf8'), original)
})

test('re-import of the same state keeps decisions; a second project is isolated; switching works', async () => {
  const again = await projects.addProject({ repository: repo, documentation: docs, name: 'Testprojekt' })
  assert.equal(again.project.id, first.project.id)
  assert.equal(projects.activeProject().decisions[proposal.id].state, 'uebernommen')
  const otherDocs = path.join(root, 'docs2'); put(otherDocs, 'other.md', '# Anderes\n\nNichts zum Rabatt.\n')
  const second = await projects.addProject({ repository: repo, documentation: otherDocs, name: 'Zweites' })
  assert.notEqual(second.project.id, first.project.id)
  assert.deepEqual(projects.activeProject().decisions, {})
  assert.equal(projects.exportProject().files.length, 0)
  assert.equal(projects.projectList().length, 2)
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
  assert.equal(status.structuredContent.proposals[0].id, proposal.id)
  assert.ok(fs.readFileSync(path.join(projects.projectsDir, first.project.id, 'calls.jsonl'), 'utf8').includes('"tool":"ask"'))
})

test('HTTP: project payload, origin check on mutations, commit diffs, export', async () => {
  const server = http.createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const payload = await (await fetch(`${base}/api/mcp/project`)).json()
    assert.equal(payload.mode, 'working')
    assert.equal(payload.projects.length, 2)
    const foreign = await fetch(`${base}/api/mcp/project/activate`, { method: 'POST', headers: { Origin: 'http://evil.example' }, body: '{}' })
    assert.equal(foreign.status, 403)
    const decision = await fetch(`${base}/api/mcp/decisions`, { method: 'POST', headers: { Origin: 'http://evil.example' }, body: JSON.stringify({ id: proposal.id, decision: null }) })
    assert.equal(decision.status, 403)
    const sha = payload.dataset.bundles[0].commits[0].hash
    const commit = await (await fetch(`${base}/api/mcp/project/commit?sha=${sha}`)).json()
    assert.ok(commit.files.some((f) => f.new_path === 'src/pricing.ts' && f.diff.includes('0.15')))
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
    await assert.rejects(projects.addProject({ repository: repo, documentation: docs }), /Showcase/)
  } finally { delete process.env.NEURALDOC_MODE }
})
