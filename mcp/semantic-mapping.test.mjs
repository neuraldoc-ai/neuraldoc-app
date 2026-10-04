import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { acceptedModules, createJevClient, MODEL, validateResponse } from './semantic-mapping.mjs'

const questions = { primary: { type: 'choice', criteria: { auftrag: 'orders', unknown: 'unknown' } } }
const response = { model: MODEL, answers: { primary: { type: 'choice', choice: 'auftrag', confidence: 0.98, probabilities: { auftrag: 0.99, unknown: 0.01 } } }, usage: { input_tokens: 10, output_tokens: 5 } }
test('malformed API distributions, unknown labels, wrong model and missing answers fail closed', () => {
  assert.equal(validateResponse(response, { model: MODEL, questions }), response)
  for (const change of [ {model:'other'}, {answers:{}}, {usage:{input_tokens:-1,output_tokens:0}}, {answers:{primary:{...response.answers.primary,choice:'invented'}}}, {answers:{primary:{...response.answers.primary,probabilities:{auftrag:0.2,unknown:0.1}}}} ]) assert.throws(() => validateResponse({ ...response, ...change }, { model: MODEL, questions }))
})
test('a clear primary domain is accepted; ambiguous cases abstain; independent high secondary scores support multi-label mapping', () => {
  assert.deepEqual(acceptedModules(response.answers), ['auftrag'])
  const ambiguous = { primary: { choice: 'unknown', confidence: 0.2, probabilities: { unknown: 0.51, auftrag: 0.49 } } }
  assert.deepEqual(acceptedModules(ambiguous), [])
  assert.deepEqual(acceptedModules({ ...ambiguous, module_tour: { noul: 0.95 }, module_fibu: { noul: 0.94 } }), ['tour', 'fibu'])
})
test('cache prevents paid duplicate calls; changed content misses cache; budget rejects before a request', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-jev-'))
  try {
    let calls = 0
    const client = createJevClient({ key: 'test-only', cachePath: path.join(dir, 'cache.json'), fetchImpl: async () => { calls++; return { ok: true, json: async () => response } } })
    await client.evaluate({ content: 'order' }, questions)
    await client.evaluate({ content: 'order' }, questions)
    assert.equal(calls, 1)
    await client.evaluate({ content: 'changed' }, questions)
    assert.equal(calls, 2)
    const limited = createJevClient({ key: 'test-only', cachePath: path.join(dir, 'limited.json'), budget: 0.000001, fetchImpl: async () => { throw new Error('must not send') } })
    await assert.rejects(limited.evaluate({ content: 'order' }, questions), /Budget/)
    assert.ok(!fs.readFileSync(path.join(dir, 'cache.json'), 'utf8').includes('test-only'))
  } finally { fs.rmSync(dir, { recursive: true }) }
})
test('HTTP authentication failures and network timeouts do not silently retry or create results', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-jev-'))
  try {
    let calls = 0
    const client = createJevClient({ key: 'test-only', cachePath: path.join(dir, 'cache.json'), fetchImpl: async () => { calls++; return { ok: false, status: 401 } } })
    await assert.rejects(client.evaluate('state', questions), /HTTP 401/)
    assert.equal(calls, 1)
    assert.equal(fs.existsSync(path.join(dir, 'cache.json')), false)
  } finally { fs.rmSync(dir, { recursive: true }) }
})
