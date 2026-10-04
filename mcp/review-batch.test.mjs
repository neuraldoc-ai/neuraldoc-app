import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareReview } from '../frontend/src/dashboard/features/docs/review-batch.mjs'

test('review runs four targets concurrently and reports errors and questions', async () => {
  const targets = Array.from({ length: 7 }, (_, i) => ({ id: String(i), title: `Stelle ${i}` }))
  const waiting = [], started = [], progress = []
  const work = prepareReview(targets, async (id) => {
    started.push(id)
    await new Promise((resolve) => waiting.push(resolve))
    if (id === '1') throw new Error('Provider nicht erreichbar')
    return { result: { status: id === '2' ? 'needs_context' : 'draft', question: id === '2' ? 'Welches Datum?' : '' } }
  }, (done, total) => progress.push([done, total]))
  assert.equal(started.length, 4)
  waiting.splice(0).forEach((resolve) => resolve())
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(started.length, 7)
  waiting.splice(0).forEach((resolve) => resolve())
  const issues = await work
  assert.deepEqual(issues.map((issue) => issue.id).sort(), ['1', '2'])
  assert.equal(issues.find((issue) => issue.id === '2').message, 'Welches Datum?')
  assert.deepEqual(progress.map(([done]) => done), [1, 2, 3, 4, 5, 6, 7])
  assert.ok(progress.every(([, total]) => total === 7))
})

test('review without writable targets makes no provider calls', async () => {
  assert.deepEqual(await prepareReview([], () => { throw new Error('Unexpected call') }, () => {}), [])
})
