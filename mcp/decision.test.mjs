// The optional decision model: off by default, Jev with its key, Microsoft-Decision-1 and Laya by address.
// Every request is mocked; nothing is sent.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { decisionConfig } from './decision.mjs'
import { createJevClient, MODEL } from './semantic-mapping.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-decision-'))
after(() => fs.rmSync(root, { recursive: true, force: true }))

const question = { verdict: { type: 'choice', instructions: 'Is the finding right?', criteria: { confirmed: 'yes', refuted: 'no', unclear: 'cannot tell' } } }
const answer = (extra = {}) => ({ verdict: { type: 'choice', choice: 'confirmed', probabilities: { confirmed: 0.8, refuted: 0.15, unclear: 0.05 }, ...extra } })

test('without a choice there is no decision model; a Jev key alone keeps Jev; off switches it off', () => {
  assert.deepEqual([decisionConfig({}).provider, decisionConfig({}).configured], ['off', false])
  const jev = decisionConfig({ TYPESAFE_API_KEY: 'k' })
  assert.deepEqual([jev.provider, jev.configured, jev.client.model], ['jev', true, MODEL])
  assert.equal(decisionConfig({ NEURALDOC_DECISION_PROVIDER: 'off', TYPESAFE_API_KEY: 'k' }).provider, 'off')
  assert.match(decisionConfig({ NEURALDOC_DECISION_PROVIDER: 'jev' }).error, /Jev-Key fehlt/)
  assert.equal(decisionConfig({ NEURALDOC_DECISION_PROVIDER: 'gpt' }).provider, 'off', 'unknown providers are not guessed')
})

test('Microsoft-Decision-1: the Foundry endpoint, the deployment name and the api-key header; its own model name in the answer is fine', async () => {
  assert.equal(decisionConfig({ NEURALDOC_DECISION_PROVIDER: 'microsoft', NEURALDOC_DECISION_URL: 'https://x.services.ai.azure.com' }).configured, false)
  const ms = decisionConfig({ NEURALDOC_DECISION_PROVIDER: 'microsoft', NEURALDOC_DECISION_URL: 'https://x.services.ai.azure.com/', NEURALDOC_DECISION_MODEL: 'nd-decision', NEURALDOC_DECISION_API_KEY: 'az-key' })
  assert.equal(ms.client.url, 'https://x.services.ai.azure.com/providers/microsoft/v1/systemone')
  let sent
  const client = createJevClient({ ...ms.client, cachePath: path.join(root, 'ms.json'), fetchImpl: async (url, init) => {
    sent = { url, headers: init.headers, body: JSON.parse(init.body) }
    return { ok: true, status: 200, json: async () => ({ model: 'microsoft-decision-1', answers: answer() }) }
  } })
  const result = await client.evaluate({ section: 'text' }, question)
  assert.equal(sent.url, ms.client.url)
  assert.equal(sent.headers['api-key'], 'az-key')
  assert.equal(sent.headers.Authorization, undefined)
  assert.equal(sent.body.model, 'nd-decision')
  assert.equal(result.response.answers.verdict.confidence, 0.8, 'without a confidence the chosen option’s probability stands in')
})

test('Laya on your own server: /v1/systemone, the multilingual checkpoint, no budget because nothing is billed', async () => {
  const laya = decisionConfig({ NEURALDOC_DECISION_PROVIDER: 'laya', NEURALDOC_DECISION_URL: 'http://laya:8000/' })
  assert.deepEqual([laya.client.url, laya.client.model, laya.client.price, laya.client.headers], ['http://laya:8000/v1/systemone', 'multilingual', 0, {}])
  assert.match(decisionConfig({ NEURALDOC_DECISION_PROVIDER: 'laya' }).error, /Adresse des Servers/)
  const client = createJevClient({ ...laya.client, budget: 0, cachePath: path.join(root, 'laya.json'), fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ answers: answer({ answer_confidence: 0.7 }), usage: { input_tokens: 12, output_tokens: 0 } }) }) })
  const result = await client.evaluate({ section: 'text' }, question)
  assert.equal(result.response.answers.verdict.confidence, 0.7)
  assert.equal(client.usage.estimatedUsd, 0)
})

test('Jev stays strict: an answer for another model is refused', async () => {
  const client = createJevClient({ key: 'k', cachePath: path.join(root, 'jev.json'), fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ model: 'other', answers: answer({ confidence: 0.9 }), usage: { input_tokens: 1, output_tokens: 1 } }) }) })
  await assert.rejects(client.evaluate({ section: 'text' }, question), /Ungültige Jev-Antwort/)
})
