import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { usage } from './usage.mjs'

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-test-'))
  t.after(() => {
    const resolved = fs.realpathSync(dir)
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('neuraldoc-test-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  })
  return dir
}

test('usage keeps more than 200 entries, filters periods and reports corrupt log lines', (t) => {
  const root = temp(t), state = path.join(root, 'state')
  fs.mkdirSync(state)
  fs.writeFileSync(path.join(state, 'log.jsonl'), Array.from({ length: 205 }, (_, i) => JSON.stringify({ at: i ? '2026-10-03T08:00:00Z' : '2026-09-01T08:00:00Z', client: 'test', tool: 'ask', ok: i % 2 === 0, ms: 10, tokens: { answer: 10, raw: 20 }, summary: 'test' })).join('\n') + '\ncorrupt\n')
  const result = usage(new URLSearchParams(), { state })
  assert.equal(result.estimated.totals.calls, 205)
  assert.equal(result.estimated.totals.answer, 1030)
  assert.equal(result.warnings.length, 1)
  assert.equal(usage(new URLSearchParams('from=2026-10-01'), { state }).estimated.totals.calls, 204)
  assert.throws(() => usage(new URLSearchParams('from=invalid'), { state }))
  assert.throws(() => usage(new URLSearchParams('from=2026-10-03&until=2026-10-01'), { state }))
})

test('agent totals exclude historical test calls and failed text estimates; missing durations remain unknown', (t) => {
  const root = temp(t), state = path.join(root, 'state')
  fs.mkdirSync(state)
  const rows = [
    { at: '2026-10-03T10:00:00Z', client: 'Agent A', tool: 'ask', ok: false, ms: 80, tokens: { answer: 1000, raw: 2000 } },
    { at: '2026-10-03T09:00:00Z', client: 'Agent A', tool: 'ask', ok: true, ms: 20, tokens: { answer: 20, raw: 80 } },
    { at: '2026-10-03T11:00:00Z', client: 'Agent B', tool: 'ask', ok: true, tokens: { answer: 5, raw: 10 } },
    { at: '2026-10-03T12:00:00Z', tool: 'ask', ok: true, ms: 0, tokens: { answer: 1, raw: 2 } },
    { at: '2026-10-03T13:00:00Z', client: 'Agent A', tool: 'ask', ok: true, ms: 500, tokens: { answer: 999, raw: 999 }, benchmarkRun: 'isolated-test' },
  ]
  fs.writeFileSync(path.join(state, 'log.jsonl'), rows.map(JSON.stringify).join('\n'))
  const result = usage(new URLSearchParams(), { state }).estimated
  assert.equal(result.totals.calls, 4)
  assert.equal(result.totals.answer, 26)
  assert.equal(result.perClient[0].client, 'Agent A')
  assert.deepEqual(result.perClient[0], { client: 'Agent A', calls: 2, answer: 20, raw: 80, failed: 1, timedCalls: 2, durationMs: 100, lastAt: '2026-10-03T10:00:00Z' })
  assert.equal(result.perClient.find((c) => c.client === 'Agent B').timedCalls, 0)
  assert.equal(result.perClient.find((c) => c.client === 'Unbekannt').timedCalls, 1)
  assert.equal(result.perTool[0].timedCalls, 3)
  const filtered = usage(new URLSearchParams('from=2026-10-03T10:00:00Z'), { state }).estimated
  assert.equal(filtered.perClient.find((c) => c.client === 'Agent A').answer, 0)
})

