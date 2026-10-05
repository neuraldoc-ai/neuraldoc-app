// The change view of the dashboard: line edits, word diff and the rows a section is shown with.
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEdits } from './drafting.mjs'
import { applyLineEdits as serverEdits } from './check.mjs'

const { applyLineEdits, changeRows, editsBetween, wordDiff } = await import('../frontend/src/dashboard/features/docs/line-diff.ts')

test('three sentences, one goes, the others only change spacing: one line, only the sentence is marked', () => {
  const before = 'Erster Satz bleibt. Zweiter Satz geht. Dritter  Satz bleibt.'
  const after = 'Erster Satz bleibt.  Dritter Satz bleibt.'
  const segs = wordDiff(before, after)
  assert.deepEqual(segs.filter((s) => s.kind !== 'same').map((s) => [s.kind, s.text.trim()]), [['del', 'Zweiter Satz geht.']])
  const rows = changeRows(before, [{ edits: [{ op: 'replace', start: 1, end: 1, text: after }] }])
  assert.equal(rows.length, 1, 'not an old and a new line under each other')
  assert.equal(rows[0].mark, 'mod')
  assert.equal(rows[0].change, 1)
})

test('code spans and links are compared as one piece', () => {
  const segs = wordDiff('Use `chalk.keyword()` or [hex](https://x.y).', 'Use `chalk.hex()` or [hex](https://x.y).')
  assert.deepEqual(segs.filter((s) => s.kind !== 'same').map((s) => s.text), ['`chalk.keyword()`', '`chalk.hex()`'])
})

test('rows: inserted lines are added, deleted lines removed, every change numbered once', () => {
  const before = '# Liste\n\n- a\n- b\n- c\n'
  const rows = changeRows(before, [{ edits: [{ op: 'insert_after', start: 4, end: 4, text: '- b2\n- b3' }] }, { edits: [{ op: 'delete', start: 5, end: 5, text: '' }] }, { edits: [] }])
  assert.deepEqual(rows.map((r) => [r.text, r.mark ?? '', r.first ? r.change : '']), [['# Liste', '', ''], ['', '', ''], ['- a', '', ''], ['- b', '', ''], ['- b2', 'add', 1], ['- b3', 'add', ''], ['- c', 'del', 2], ['', '', '']])
  // A replaced block whose lines no longer resemble each other: removed and added rows.
  const swap = changeRows('alt eins\nalt zwei', [{ edits: [{ op: 'replace', start: 1, end: 2, text: 'völlig neuer Text' }] }])
  assert.deepEqual(swap.map((r) => r.mark), ['del', 'del', 'add'])
})

test('the dashboard applies a subset of changes exactly like the server applies all of them', () => {
  const before = 'a\nb\nc\nd\ne'
  const edits = [{ op: 'replace', start: 2, end: 2, text: 'B' }, { op: 'insert_after', start: 3, end: 3, text: 'c2' }, { op: 'insert_after', start: 3, end: 3, text: 'c3' }, { op: 'delete', start: 5, end: 5, text: '' }]
  assert.equal(applyLineEdits(before, edits), serverEdits(before, edits))
  assert.equal(applyLineEdits(before, edits), 'a\nB\nc\nc2\nc3\nd')
  assert.equal(applyLineEdits(before, edits.slice(0, 1)), applyEdits(before, edits.slice(0, 1)))
  for (const after of ['a\nB\nc\nd\ne', 'x\na\nb\nc\nd\ne', 'a\nb\nd', 'a\nb\nc\nd\ne\nf', 'q']) assert.equal(applyLineEdits(before, editsBetween(before, after)), after, after)
})
