import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
process.env.NEURALDOC_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-models-'))
delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY
const { listModels } = await import('./models.mjs')
const { saveSettings } = await import('./settings.mjs')
after(() => fs.rmSync(process.env.NEURALDOC_STATE_DIR, { recursive: true, force: true }))
const never = () => assert.fail('no request expected')

test('Gemini offers only the models with known cost rates; without a key a built-in list, no request', async () => {
  assert.deepEqual((await listModels('gemini', { fetchImpl: never })).models.map((m) => m.id), ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'])
  const openai = await listModels('openai', { fetchImpl: never })
  assert.equal(openai.source, 'built-in')
  assert.ok(openai.models.some((m) => m.id === 'gpt-4.1-mini'))
})
test('with a key the provider list is used: chat models only, Claude with display names', async () => {
  saveSettings({ OPENAI_API_KEY: 'test-openai', ANTHROPIC_API_KEY: 'test-anthropic' })
  const openai = await listModels('openai', { fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/models'); assert.equal(init.headers.Authorization, 'Bearer test-openai')
    return { ok: true, json: async () => ({ data: [{ id: 'gpt-4.1-mini' }, { id: 'text-embedding-3-small' }, { id: 'gpt-4o-realtime-preview' }, { id: 'o4-mini' }, { id: 'whisper-1' }] }) }
  } })
  assert.deepEqual(openai.models.map((m) => m.id), ['gpt-4.1-mini', 'o4-mini'])
  const claude = await listModels('anthropic', { fetchImpl: async (_url, init) => {
    assert.equal(init.headers['x-api-key'], 'test-anthropic')
    return { ok: true, json: async () => ({ data: [{ id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' }] }) }
  } })
  assert.deepEqual(claude.models, [{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' }])
})
test('a local server lists its loaded models; when it is down the user is told', async () => {
  const local = await listModels('local', { baseUrl: 'http://127.0.0.1:11434/v1', fetchImpl: async (url) => {
    assert.equal(url, 'http://127.0.0.1:11434/v1/models')
    return { ok: true, json: async () => ({ data: [{ id: 'qwen2.5:7b' }, { id: 'llama3.2' }] }) }
  } })
  assert.deepEqual(local.models.map((m) => m.id), ['llama3.2', 'qwen2.5:7b'])
  const down = await listModels('local', { baseUrl: 'http://127.0.0.1:1/v1', fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
  assert.deepEqual(down.models, [])
  assert.match(down.error, /nicht erreichbar/)
})
