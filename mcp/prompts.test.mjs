import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The prepared prompts belong to the MOBIQ showcase. An empty state directory: no imported project.
process.env.NEURALDOC_MODE = 'showcase'
process.env.NEURALDOC_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-prompts-'))
after(() => fs.rmSync(process.env.NEURALDOC_STATE_DIR, { recursive: true, force: true }))
const { handleMessage } = await import('./handler.mjs')
const rpc = (method, params) => handleMessage({ jsonrpc: '2.0', id: 1, method, params })
test('initialize advertises prompts alongside the unchanged three tools', async () => {
  assert.ok((await rpc('initialize', { protocolVersion: '2025-11-25' })).result.capabilities.prompts)
  assert.equal((await rpc('tools/list')).result.tools.length, 3)
  assert.deepEqual((await rpc('prompts/list')).result.prompts.map((p) => p.name), ['ticket_context', 'ask', 'check_change'])
})
test('prompts resolve user input without calling tools or producing approvals', async () => {
  for (const [name, args, target] of [
    ['ticket_context', { ticket: 'MOB-4844' }, 'neuraldoc.ticket_context'],
    ['ask', { question: 'Wie wird die Anzahlung verrechnet?' }, 'neuraldoc.ask'],
    ['check_change', { change: '!1287' }, '"merge_request":"!1287"'],
    ['check_change', { change: 'mob-4812' }, '"ticket":"MOB-4812"'],
  ]) {
    const response = await rpc('prompts/get', { name, arguments: args })
    assert.equal(response.result.messages[0].role, 'user')
    assert.ok(response.result.messages[0].content.text.includes(target))
  }
})
test('invalid prompt requests return JSON-RPC invalid params', async () => {
  for (const params of [
    { name: 'missing' },
    { name: 'ask', arguments: {} },
    { name: 'ask', arguments: { question: 42 } },
    { name: 'ask', arguments: { question: '   ' } },
    { name: 'ask', arguments: { question: 'x', extra: 'y' } },
    { name: 'check_change', arguments: { change: 'some-branch' } },
  ]) assert.equal((await rpc('prompts/get', params)).error.code, -32602)
})
test('the normal app serves neither MOBIQ prompts nor MOBIQ tools', async () => {
  delete process.env.NEURALDOC_MODE
  try {
    assert.deepEqual((await rpc('prompts/list')).result.prompts, [])
    assert.ok((await rpc('tools/list')).result.tools.every((t) => !JSON.stringify(t).includes('MOB-')))
    assert.match((await rpc('initialize', {})).result.instructions, /Noch kein Projekt/)
  } finally { process.env.NEURALDOC_MODE = 'showcase' }
})
