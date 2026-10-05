import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { applyEdits, generateDraft, draftingConfig, draftEndpoint, language, validateContext, validateDraft } from './drafting.mjs'
import { responseSchema } from './draft-prompt.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-drafting-test-'))
process.env.NEURALDOC_STATE_DIR = root
process.env.NEURALDOC_DRAFT_PROVIDER = 'vertex'
process.env.GOOGLE_CLOUD_PROJECT = 'test-project'
process.env.GOOGLE_CLOUD_LOCATION = 'global'
process.env.NEURALDOC_VERTEX_MODE = 'express'
delete process.env.VERTEX_API_KEY
const { generateProposalDraft, generatedProposals, proposalContext } = await import('./draft-context.mjs')
const { middleware, TOKEN } = await import('./handler.mjs')
after(() => {
  const resolved = fs.realpathSync(root)
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()))
  assert.ok(path.basename(resolved).startsWith('neuraldoc-drafting-test-'))
  fs.rmSync(resolved, { recursive: true, force: true })
})

const context = () => ({
  change: { id: 'foreign-feature', title: 'Exportdatum eines Lagerberichts' },
  document: { id: 'foreign-manual', title: 'Lagerberichte', type: 'Nutzerhandbuch', audience: 'Lagerleitung', section: 'Export', before: 'Der Export verwendet das Tagesdatum.', surrounding: 'Klicken Sie auf Exportieren.' },
  target: { id: 'foreign-target', op: 'replace', instruction: 'Beschreibe das belegte Exportdatum.' },
  evidence: [{ id: 'code:export', source: 'warehouse/export.ts (commit abcdef1)', text: 'const exportedAt = report.createdAt; return { exportedAt };' }],
})
const valid = (id = 'code:export') => ({ status: 'draft', text: 'Der Export verwendet das Erstellungsdatum des Berichts.', blocks: [], rows: [], reason: 'exportedAt wird aus report.createdAt gelesen.', question: '', evidenceIds: [id] })
const config = (name, extra = {}) => ({ ...draftingConfig({ NEURALDOC_DRAFT_PROVIDER: 'vertex', GOOGLE_CLOUD_PROJECT: 'test-project', NEURALDOC_GEMINI_MODEL: 'gemini-3.5-flash-lite' }), apiKey: 'test-key-never-sent', stateDir: path.join(root, name), ...extra })
function provider(result = valid(), { finishReason = 'STOP', inputTokens = 1200, status = 200 } = {}) {
  const calls = []
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body)
    calls.push({ url, body })
    if (url.endsWith(':countTokens')) return { ok: true, json: async () => ({ totalTokens: inputTokens }) }
    return { ok: status === 200, status, json: async () => ({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(result) }] } }], usageMetadata: { promptTokenCount: inputTokens, candidatesTokenCount: 120, thoughtsTokenCount: 5 } }) }
  }
  return { calls, fetchImpl }
}

test('foreign feature produces a draft through the mocked provider, minimal thinking, no tools, then reuses cache', async () => {
  const fake = provider(), options = { config: config('foreign'), fetchImpl: fake.fetchImpl }
  const first = await generateDraft(context(), options)
  const second = await generateDraft(context(), options)
  assert.equal(first.result.text, valid().text)
  assert.equal(first.cached, false)
  assert.equal(second.cached, true)
  assert.equal(fake.calls.length, 1)
  const request = fake.calls[0].body
  assert.ok(fake.calls[0].url.startsWith('https://aiplatform.googleapis.com/v1/publishers/google/'))
  assert.ok(fake.calls[0].body.systemInstruction)
  assert.deepEqual(request.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' })
  assert.equal(request.generationConfig.maxOutputTokens, 1800)
  assert.equal(request.tools, undefined)
  assert.ok(request.systemInstruction.parts[0].text.includes('Erfinde keine Felder'))
  assert.equal(first.usage.outputTokens, 125)
  assert.equal(first.usage.costUsd, (1200 * .3 + 125 * 2.5) / 1e6)
})

test('changed evidence invalidates the content-addressed cache', async () => {
  const fake = provider(), options = { config: config('revision'), fetchImpl: fake.fetchImpl }
  const first = await generateDraft(context(), options)
  const changed = context(); changed.evidence[0].text += '\n// revised'
  const second = await generateDraft(changed, options)
  assert.notEqual(first.contextHash, second.contextHash)
  assert.equal(fake.calls.length, 2)
})

test('simultaneous identical requests pay once', async () => {
  const fake = provider(), options = { config: config('concurrency'), fetchImpl: fake.fetchImpl }
  const [a, b] = await Promise.all([generateDraft(context(), options), generateDraft(context(), options)])
  assert.equal(a.id, b.id)
  assert.equal(fake.calls.length, 1)
})

test('different targets reach the provider concurrently and keep separate caches', async () => {
  const fake = provider(), cfg = config('parallel-targets')
  const waiting = []
  const options = { config: cfg, fetchImpl: async (...args) => {
    await new Promise((resolve) => waiting.push(resolve))
    return fake.fetchImpl(...args)
  } }
  const second = context(); second.target.id = 'another-target'
  const a = generateDraft(context(), options), b = generateDraft(second, options)
  assert.equal(waiting.length, 2)
  waiting.forEach((resolve) => resolve())
  const results = await Promise.all([a, b])
  assert.notEqual(results[0].id, results[1].id)
  assert.equal(fake.calls.length, 2)
})

test('open product questions reach the prompt without becoming product evidence', () => {
  const c = context(); c.target.question = 'Welches Datum soll künftig gelten?'
  assert.equal(validateContext(c).target.question, c.target.question)
  assert.deepEqual(validateContext(c).evidence, context().evidence)
})

test('failed requests are not cached and no daily limit blocks later generation', async () => {
  const failed = provider(valid(), { status: 429 }), cfg = config('no-budget', { dailyLimitUsd: 0 });
  await assert.rejects(generateDraft(context(), { config: cfg, fetchImpl: failed.fetchImpl }), /HTTP 429/)
  const fake = provider()
  await generateDraft(context(), { config: cfg, fetchImpl: fake.fetchImpl })
  assert.equal(fake.calls.length, 1)
  assert.equal(fs.existsSync(path.join(cfg.stateDir, 'draft-costs.jsonl')), false)
  assert.equal(draftingConfig({ GOOGLE_CLOUD_PROJECT: 'test-project', NEURALDOC_DRAFT_DAILY_USD: 'invalid' }).dailyLimitUsd, undefined)
})

test('persisted cache works after a process restart even without credentials', async () => {
  const cfg = config('restart'), fake = provider()
  const first = await generateDraft(context(), { config: cfg, fetchImpl: fake.fetchImpl })
  const { spawnSync } = await import('node:child_process')
  const script = `import { generateDraft } from ${JSON.stringify(new URL('./drafting.mjs', import.meta.url).href)}; const result = await generateDraft(${JSON.stringify(context())}, { config: ${JSON.stringify({ ...cfg, apiKey: '' })}, fetchImpl: () => { throw new Error('Cache must avoid network') } }); console.log(JSON.stringify(result));`
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  const cached = JSON.parse(child.stdout)
  assert.equal(cached.cached, true)
  assert.deepEqual(cached.result, first.result)
})

test('missing key and expensive models fail without any provider request', async () => {
  await assert.rejects(generateDraft(context(), { config: config('no-key', { apiKey: '' }), fetchImpl: () => assert.fail('No request allowed') }), /kein LLM eingerichtet/)
  assert.throws(() => draftingConfig({ NEURALDOC_GEMINI_MODEL: 'gemini-pro' }), /freigeschaltet/)
  assert.deepEqual(draftingConfig({ GOOGLE_CLOUD_PROJECT: 'test-project' }).model, 'gemini-3.5-flash-lite')
  assert.equal(draftingConfig({ GOOGLE_CLOUD_PROJECT: 'test-project', GEMINI_API_KEY: 'developer-key' }).apiKey, undefined)
})

test('Vertex standard endpoint is project-specific; express is global; cache never crosses projects', async () => {
  const a = config('project-boundary')
  const standard = { ...a, mode: 'standard', location: 'europe-west1' }
  assert.equal(draftEndpoint(standard, 'generateContent'), 'https://europe-west1-aiplatform.googleapis.com/v1/projects/test-project/locations/europe-west1/publishers/google/models/gemini-3.5-flash-lite:generateContent')
  assert.throws(() => draftingConfig({ GOOGLE_CLOUD_PROJECT: 'test-project', GOOGLE_CLOUD_LOCATION: 'eu', NEURALDOC_VERTEX_MODE: 'express' }), /global/)
  const fake = provider()
  const first = await generateDraft(context(), { config: a, fetchImpl: fake.fetchImpl })
  const second = await generateDraft(context(), { config: { ...a, project: 'another-project' }, fetchImpl: fake.fetchImpl })
  assert.notEqual(first.id, second.id)
  assert.equal(fake.calls.length, 2)
  assert.equal(JSON.stringify(first).includes(a.apiKey), false)
})

test('Gemini Developer API requires explicit provider selection and generates in a single call', async () => {
  const fake = provider()
  const developer = { ...draftingConfig({ NEURALDOC_DRAFT_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-developer-key' }), stateDir: path.join(root, 'developer') }
  const result = await generateDraft(context(), { config: developer, fetchImpl: fake.fetchImpl })
  assert.ok(fake.calls.every((call) => call.url.startsWith('https://generativelanguage.googleapis.com/')))
  assert.equal(fake.calls.length, 1)
  assert.equal(result.connection.provider, 'gemini')
})

test('duplicate or fabricated evidence and malformed output cannot become drafts', () => {
  const c = context(); c.evidence.push(c.evidence[0])
  assert.throws(() => validateContext(c), /eindeutig/)
  assert.throws(() => validateDraft(valid('invented'), context()), /unbekannte Belege/)
  assert.throws(() => validateDraft({ ...valid(), blocks: [{ kind: 'script', text: 'hello' }] }, context()), /ungültige Textblöcke/)
  assert.throws(() => validateDraft({ ...valid(), text: '' }, context()), /passt nicht/)
})

test('incomplete response is never cached', async () => {
  const fake = provider(valid(), { finishReason: 'MAX_TOKENS' }), options = { config: config('incomplete'), fetchImpl: fake.fetchImpl }
  await assert.rejects(generateDraft(context(), options), /nicht vollständig/)
  assert.equal(fs.readdirSync(options.config.stateDir).filter((f) => f.startsWith('draft-') && f.endsWith('.json')).length, 0)
})

test('missing context returns a question, without replacing existing text', async () => {
  const result = { ...valid(), status: 'needs_context', text: '', question: 'Welches Datum liefert der Bericht?', evidenceIds: [] }
  const fake = provider(result)
  const draft = await generateDraft(context(), { config: config('question'), fetchImpl: fake.fetchImpl })
  assert.equal(draft.result.status, 'needs_context')
  assert.throws(() => validateDraft({ ...result, text: 'Assumed behavior' }, context()), /keinen ungesicherten/)
})

test('insert headings and table widths are checked against the target', () => {
  const c = context(); c.target = { ...c.target, op: 'insert', heading: '4 Export' }
  assert.throws(() => validateDraft({ ...valid(), text: '', blocks: [{ kind: 'h', text: '5 Export' }] }, c), /Überschrift/)
  c.target = { ...c.target, op: 'rows', heading: undefined, columns: ['Name', 'Wert'] }
  assert.throws(() => validateDraft({ ...valid(), text: '', rows: [['one']] }, c), /passt nicht/)
  assert.deepEqual(validateDraft({ ...valid(), text: '', rows: [['Name', 'createdAt']] }, c).rows, [['Name', 'createdAt']])
})

test('provider schema enforces the output slot for each operation', () => {
  for (const op of ['replace', 'insert', 'rows']) {
    const schema = responseSchema(op).properties
    if (op !== 'replace') assert.deepEqual(schema.text.enum, [''])
    if (op !== 'insert') assert.equal(schema.blocks.maxItems, 0)
    if (op !== 'rows') assert.equal(schema.rows.maxItems, 0)
  }
})

test('all writable demo targets get original code paths; no prepared draft prose in provider context', async () => {
  const { proposals } = await import('../frontend/src/dashboard/features/docs/data.ts')
  for (const p of proposals.filter((p) => p.op !== 'note' && !p.task)) {
    const c = validateContext(proposalContext(p.id))
    assert.ok(c.evidence.some((e) => e.id.startsWith('code:')), p.id)
    assert.equal(c.target.text, undefined)
    assert.equal(c.target.blocks, undefined)
  }
  assert.ok(proposalContext('p05').evidence.some((e) => e.source.includes('/tour/StoppBuilder.java')))
  assert.throws(() => proposalContext('p19'), /von einer Person/)
})

test('dashboard draft stays open, persists across reads and appears in MCP; decided target cannot be regenerated', async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.VERTEX_API_KEY
  const c = proposalContext('p05'), fake = provider({ ...valid(c.evidence.find((e) => e.id.includes('StoppBuilder.java')).id), text: 'Bei einer Teillieferung wird jeder Lieferteil als eigener Tourstopp geplant.', reason: 'Der StoppBuilder plant die Lieferteile einzeln.' })
  globalThis.fetch = fake.fetchImpl
  process.env.VERTEX_API_KEY = 'test-key'
  try {
    const draft = await generateProposalDraft('p05')
    assert.equal(generatedProposals().p05.text, draft.result.text)
    assert.equal(generatedProposals().p05.confidence, 'pruefen')
    assert.equal(fs.existsSync(path.join(root, 'decisions.json')), false)
    const { callTool, setDecision } = await import('./core.mjs')
    const answer = await callTool('check_change', { merge_request: '1287', details: true })
    assert.ok(answer.content[0].text.includes(draft.result.text))
    setDecision('p05', { state: 'uebernommen' }, 'test')
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'decisions.json'), 'utf8')).p05.edited.text, draft.result.text)
    await assert.rejects(generateProposalDraft('p05'), /Entschiedene/)
    const file = path.join(root, 'generated-proposals.json')
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    saved.p05.generation.contextHash = 'old-revision'
    fs.writeFileSync(file, JSON.stringify(saved))
    assert.equal(generatedProposals().p05, undefined)
  } finally {
    globalThis.fetch = oldFetch
    if (oldKey === undefined) delete process.env.VERTEX_API_KEY; else process.env.VERTEX_API_KEY = oldKey
  }
})

test('HTTP showcase: cross-origin calls are rejected, prepared examples only, no model call even with token', async () => {
  const server = http.createServer((req, res) => middleware(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const oldFetch = globalThis.fetch
  process.env.NEURALDOC_MODE = 'showcase'
  try {
    const post = (headers, body) => oldFetch(`${base}/api/mcp/drafts/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    globalThis.fetch = () => assert.fail('Showcase must not call a provider')
    assert.equal((await post({ Origin: 'https://other.example' }, { id: 'p05' })).status, 403)
    assert.equal((await post({ Origin: base }, { context: context() })).status, 403)
    assert.equal((await post({ Authorization: `Bearer ${TOKEN}` }, { context: context() })).status, 403)
    const example = await post({ Origin: base }, { id: 'p05' })
    assert.equal(example.status, 200)
    assert.equal((await example.json()).proposal.generation.model, 'Vorbereitetes Beispiel')
  } finally { delete process.env.NEURALDOC_MODE; globalThis.fetch = oldFetch; await new Promise((resolve) => server.close(resolve)) }
})


test('block question persists, cannot be approved, and editorial answer produces a reloadable draft', async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.VERTEX_API_KEY
  process.env.VERTEX_API_KEY = 'test-key'
  try {
    globalThis.fetch = provider({ status: 'needs_context', text: '', blocks: [], rows: [], reason: 'Den Hinweis in diesem Abschnitt aufnehmen.', question: 'Hier aufnehmen?', evidenceIds: [] }).fetchImpl
    const pending = await generateProposalDraft('p01')
    assert.equal(pending.proposal.generation.status, 'needs_context')
    assert.equal(generatedProposals().p01.question, 'Hier aufnehmen?')
    const { setDecision } = await import('./core.mjs')
    assert.throws(() => setDecision('p01', { state: 'uebernommen' }), /Rückfrage/)
    const answer = 'Ja, den Hinweis hier aufnehmen.'
    const c = proposalContext('p01', answer)
    assert.equal(c.evidence.at(-1).text, answer)
    globalThis.fetch = provider({ ...valid(c.evidence[0].id), question: '' }).fetchImpl
    const resolved = await generateProposalDraft('p01', answer)
    assert.equal(resolved.proposal.generation.status, 'draft')
    assert.equal(generatedProposals().p01.generation.answer, answer)
    assert.equal(generatedProposals().p01.question, undefined)
    await assert.rejects(generateProposalDraft('p01', 'x'.repeat(2001)), /2.000/)
  } finally {
    globalThis.fetch = oldFetch
    if (oldKey === undefined) delete process.env.VERTEX_API_KEY; else process.env.VERTEX_API_KEY = oldKey
  }
})

test('line edits: replace, insert and delete apply bottom-up; overlaps and out-of-range edits fail', () => {
  const before = 'a\nb\nc\nd'
  assert.equal(applyEdits(before, [{ op: 'replace', start: 2, end: 3, text: 'B\nC' }, { op: 'insert_after', start: 0, end: 0, text: '#' }, { op: 'delete', start: 4, end: 4, text: '' }]), '#\na\nB\nC')
  assert.equal(applyEdits(before, [{ op: 'insert_after', start: 4, end: 4, text: 'e\n' }]), 'a\nb\nc\nd\ne')
  assert.throws(() => applyEdits(before, [{ op: 'replace', start: 1, end: 2, text: 'x' }, { op: 'replace', start: 2, end: 3, text: 'y' }]), /überschneiden/)
  assert.throws(() => applyEdits(before, [{ op: 'replace', start: 4, end: 5, text: 'x' }]), /außerhalb/)
  assert.throws(() => applyEdits(before, [{ op: 'replace', start: 1, end: 1, text: ' ' }]), /keinen Text/)
  assert.equal(language('Der Export wird mit dem Datum erzeugt, und die Datei ist für alle sichtbar.'), 'de')
  assert.equal(language('The export is created with the date and the file is visible to all users.'), 'en')
  assert.equal(language('Rabatt 10 %'), null)
})

test('patch drafts need a finding quoted from the section and a code excerpt, and keep the language', () => {
  const before = '# Export\n\nThe export uses the current date of the day.\nIt is written to the folder of the report.\nThe file name is the name of the report.\nThe export runs when the user clicks Export.\n'
  const patch = { ...context(), document: { ...context().document, before }, target: { id: 't', op: 'patch', preserve: true, instruction: 'Korrigiere. Sonst status=no_change.' } }
  const found = { doc_quote: 'The export uses the current date', evidence_id: 'code:export', code_quote: 'const exportedAt = report.createdAt', problem: 'Datum kommt aus createdAt.' }
  const draft = (extra = {}) => ({ status: 'draft', findings: [found], edits: [{ op: 'replace', start: 3, end: 3, text: 'The export uses the date on which the report was created.' }], reason: 'createdAt.', question: '', evidenceIds: ['code:export'], ...extra })
  const ok = validateDraft(draft(), patch)
  assert.equal(ok.text, before.replace('the current date of the day', 'the date on which the report was created'))
  assert.deepEqual(ok.findings, [found])
  assert.throws(() => validateDraft(draft({ findings: [{ ...found, code_quote: 'report.updatedAt' }] }), patch), /Kein Befund/)
  assert.throws(() => validateDraft(draft({ findings: [{ ...found, doc_quote: 'The export uses yesterday' }] }), patch), /Kein Befund/)
  assert.throws(() => validateDraft(draft({ edits: [{ op: 'replace', start: 3, end: 3, text: 'Der Export verwendet das Datum, an dem der Bericht erstellt wurde, und nicht das Tagesdatum.' }] }), patch), /Sprache/)
  assert.throws(() => validateDraft(draft({ edits: [{ op: 'replace', start: 3, end: 6, text: 'Rewritten.' }] }), patch), /unveränderten Zeilen/)
  assert.throws(() => validateDraft(draft({ edits: [] }), patch), /1 bis 20/)
  assert.equal(validateDraft({ status: 'no_change', findings: [], edits: [], reason: 'Stimmt.', question: '', evidenceIds: [] }, patch).status, 'no_change')
  assert.throws(() => validateDraft({ status: 'no_change', findings: [], edits: draft().edits, reason: 'Stimmt.', question: '', evidenceIds: [] }, patch), /keine Zeilenänderung/)
  assert.equal(responseSchema('patch').properties.edits.maxItems, 20)
})
