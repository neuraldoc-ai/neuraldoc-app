import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { generateDraft, draftingConfig, draftConnection } from './drafting.mjs'
import { setupStatus } from './setup.mjs'
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-providers-'))
after(() => { const p = fs.realpathSync(root); assert.equal(path.dirname(p), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(p).startsWith('neuraldoc-providers-')); fs.rmSync(p, { recursive: true }) })
const context = { change: { id: 'test', title: 'Datum ändern' }, document: { id: 'manual', title: 'Export', type: 'Handbuch', audience: 'Alle', section: 'Datum', before: 'Tagesdatum', surrounding: '' }, target: { id: 'target', op: 'replace', instruction: 'Datum aus Code dokumentieren' }, evidence: [{ id: 'code', source: 'export.ts', text: 'return report.createdAt' }] }
const draft = { status: 'draft', text: 'Der Export verwendet das Erstellungsdatum.', blocks: [], rows: [], question: '', reason: 'Der Code verwendet createdAt.', evidenceIds: ['code'] }
const completion = (value = draft, finish = 'stop') => ({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } })
const config = (provider, extra = {}) => ({ ...draftingConfig({ NEURALDOC_DRAFT_PROVIDER: provider, OPENAI_API_KEY: 'test-openai', ANTHROPIC_API_KEY: 'test-anthropic', ...extra }), stateDir: path.join(root, provider + Math.random()) })
test('OpenAI uses strict schema and bearer auth, validates and caches output; unconfigured prices stay unknown', async () => {
  const c = config('openai'); let requests = 0
  const options = { config: c, fetchImpl: async (url, init) => {
    requests++; assert.equal(url, 'https://api.openai.com/v1/chat/completions'); assert.equal(init.headers.Authorization, 'Bearer test-openai')
    const body = JSON.parse(init.body); assert.equal(body.response_format.json_schema.strict, true); assert.equal(body.max_completion_tokens, 1800); assert.equal(body.tools, undefined)
    return { ok: true, json: async () => completion() }
  } }
  const result = await generateDraft(context, options)
  assert.equal(result.connection.provider, 'openai'); assert.equal(result.usage.costUsd, null)
  await generateDraft(context, options); assert.equal(requests, 1); assert.ok(!JSON.stringify(result).includes('test-openai'))
})
test('Claude uses Messages and output_config with the common draft validator', async () => {
  const result = await generateDraft(context, { config: config('claude'), fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages'); assert.equal(init.headers['x-api-key'], 'test-anthropic')
    const body = JSON.parse(init.body); assert.equal(body.output_config.format.type, 'json_schema'); assert.equal(body.max_tokens, 1800)
    return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(draft) }], usage: { input_tokens: 100, output_tokens: 50 } }) }
  } })
  assert.equal(result.connection.provider, 'anthropic'); assert.equal(result.result.text, draft.text)
})
test('a real local HTTP endpoint works without a key and separates endpoint cache identities', async () => {
  let count = 0
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (v) => { body += v }); req.on('end', () => {
      count++; assert.equal(req.url, '/v1/chat/completions'); assert.equal(req.headers.authorization, undefined); assert.equal(JSON.parse(body).response_format.type, 'json_object')
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(completion()))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const c = config('local', { NEURALDOC_LLM_BASE_URL: `http://127.0.0.1:${server.address().port}/v1/`, NEURALDOC_LLM_FORMAT: 'json_object' })
    const result = await generateDraft(context, { config: c }); assert.equal(result.usage.costUsd, 0); assert.equal(result.result.text, draft.text)
    await generateDraft(context, { config: c }); assert.equal(count, 1)
    assert.notDeepEqual(draftConnection(c), draftConnection({ ...c, baseUrl: 'http://127.0.0.1:4321/v1' }))
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
test('refusals, truncation and invented evidence never create caches for the new providers', async () => {
  for (const provider of ['openai', 'local', 'anthropic']) for (const scenario of ['truncated', 'refused', 'fabricated']) {
    const c = config(provider)
    await assert.rejects(generateDraft(context, { config: c, fetchImpl: async () => ({ ok: true, json: async () => {
      const value = scenario === 'fabricated' ? { ...draft, evidenceIds: ['invented'] } : draft
      if (provider === 'anthropic') return { stop_reason: scenario === 'truncated' ? 'max_tokens' : scenario === 'refused' ? 'refusal' : 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }] }
      const raw = completion(value, scenario === 'truncated' ? 'length' : 'stop'); if (scenario === 'refused') raw.choices[0].message.refusal = 'Refused'; return raw
    } }) }))
    assert.equal(fs.readdirSync(c.stateDir).filter((f) => f.startsWith('draft-')).length, 0)
  }
})
test('setup requires Jev, reports only key presence, and rejects invalid endpoint, model and price settings', () => {
  const status = setupStatus({ NEURALDOC_DRAFT_PROVIDER: 'openai', OPENAI_API_KEY: 'secret-openai', TYPESAFE_API_KEY: 'secret-jev' })
  assert.equal(status.jev.required, true); assert.equal(status.jev.configured, true); assert.equal(status.drafting.configured, true); assert.ok(!JSON.stringify(status).includes('secret-'))
  assert.equal(setupStatus({ NEURALDOC_DRAFT_PROVIDER: 'local' }).drafting.configured, true)
  assert.throws(() => config('local', { NEURALDOC_LLM_BASE_URL: 'http://user:secret@localhost/v1' }), /Zugangsdaten/)
  assert.throws(() => config('openai', { NEURALDOC_LLM_MODEL: 'bad\nmodel' }), /Modellname/)
  assert.throws(() => config('openai', { NEURALDOC_LLM_INPUT_USD_PER_MILLION: '-1' }), /negative/)
})
// Jev as a precondition for working-demo drafts is covered in projects.test.mjs.
test('the showcase refuses free LLM draft contexts, even with a token', async () => {
  const oldState = process.env.NEURALDOC_STATE_DIR
  process.env.NEURALDOC_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-providers-'))
  const { middleware, TOKEN } = await import('./handler.mjs')
  const server = http.createServer((req, res) => middleware(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/mcp/drafts/generate`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ context }) })
    assert.equal(response.status, 403); assert.match((await response.json()).error, /Showcase/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(process.env.NEURALDOC_STATE_DIR, { recursive: true, force: true })
    if (oldState === undefined) delete process.env.NEURALDOC_STATE_DIR; else process.env.NEURALDOC_STATE_DIR = oldState
  }
})
