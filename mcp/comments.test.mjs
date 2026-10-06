// Comments inside the code: which lines are comments, which blocks are checked, and what the server verifies.
import test from 'node:test'
import assert from 'node:assert/strict'
import { commentBlocks, commentMask } from './comments.mjs'
import { codeLikeNames, commentContext, commentSignals, commentWindows, documentedName, documentedParams, signatureParams, verifyCommentFindings } from './comment-check.mjs'

test('comment lines in JavaScript, Python and Go; a regular expression with \\/\\/ is code', () => {
  assert.deepEqual(commentMask('// a\nconst x = 1 // b\n/**\n * c\n */\nconst re = /^([a-z]+:)?\\/\\//i\n', 'a.js'), ['comment', 'trailing', 'comment', 'comment', 'comment', 'code', 'blank'])
  assert.deepEqual(commentMask('def f():\n    """Doc\n    more."""\n    return 1  # one\n', 'a.py'), ['code', 'comment', 'comment', 'trailing', 'blank'])
  assert.deepEqual(commentMask('url := "http://x" // y\n', 'a.go'), ['trailing', 'blank'])
})

test('blocks: licence headers, directives and commented-out code are left out, short trailing comments stay', () => {
  const text = '// Copyright 2024 Example. Licensed under the MIT licence.\n\n// eslint-disable-next-line no-console\nconsole.log(1)\n// foo(bar);\nconst maxAge = 60 * 60 * 24 // 1 day\n// Returns the number of retries.\nfunction retries() { return 2 }\n'
  const blocks = commentBlocks(text, 'a.js')
  assert.deepEqual(blocks.map((b) => [b.start, b.kind]), [[6, 'trailing'], [7, 'line']])
  assert.deepEqual(blocks[1].subject, [8, 8])
})

test('a Python docstring describes its def line', () => {
  const [block] = commentBlocks('def limit(a, b):\n    """Return the smaller value."""\n    return min(a, b)\n', 'm.py')
  assert.equal(block.kind, 'doc')
  assert.deepEqual(block.subject, [1, 3], 'the def line and its body')
})

test('parameters of a signature and of a doc comment', () => {
  assert.deepEqual(signatureParams(['export default function combineURLs(baseURL, relativeURL) {'], 1), ['baseURL', 'relativeURL'])
  assert.deepEqual(signatureParams(['def get(self, url: str, *, params=None) -> Response:'], 1), ['url', 'params'])
  assert.deepEqual(signatureParams(['func (c *Command) SetOut(newOut io.Writer) {'], 1), ['newOut'])
  assert.equal(signatureParams(['function f({ a, b }) {'], 1), null, 'destructured parameters can document any name')
  assert.deepEqual(documentedParams(' * @param {string} baseURL The base\n * @param {?(object|Function)} [options]\n'), ['baseURL', 'options'])
  assert.deepEqual(documentedParams('    """Send.\n\n    Args:\n        url (str): where\n        timeout: seconds\n    """'), ['url', 'timeout'])
})

test('names that look like code; examples and link anchors do not count', () => {
  assert.deepEqual(codeLikeNames('Unlike error bodies (`#readErrorBody`), see [docs](#kystop) and issue #91. Calls parseHeaders() and max_age.'), ['#readErrorBody', 'parseHeaders', 'max_age'])
  assert.deepEqual(codeLikeNames('Example:\n```js\nconst usersApi = ky.create()\n```\nUses retryLimit.'), ['retryLimit'])
  assert.equal(documentedName('\tlimit?: number;'), 'limit')
  assert.equal(documentedName('  timeout: 0,'), 'timeout')
  assert.equal(documentedName('function retry(limit) {'), null)
})

test('signals: a documented parameter the function lacks, a Go doc comment naming another function', () => {
  const files = [
    { id: 'a.js', path: 'a.js', text: '/**\n * @param {string} relativePath The relative URL\n */\nfunction combine(baseURL, relativeURL) {\n  return baseURL + relativeURL\n}\n' },
    { id: 'c.go', path: 'c.go', text: '// SetUsageHandler sets usage function.\nfunc (c *Command) SetUsageFunc(f func(*Command) error) {\n\tc.usageFunc = f\n}\n' },
  ]
  const context = commentContext(files)
  const js = context.files.get('a.js'), go = context.files.get('c.go')
  const s1 = commentSignals(js, commentBlocks(js.text, js.path), context), s2 = commentSignals(go, commentBlocks(go.text, go.path), context)
  assert.deepEqual(s1.absent_names, ['relativePath'])
  assert.match(s1.parameter_mismatches[0], /relativePath/)
  assert.match(s2.doc_name_mismatches[0], /SetUsageHandler.*SetUsageFunc/)
})

test('verification: quotes must be comments, evidence must be code, the correction must stay a comment', () => {
  const text = 'const defaults = {\n  // Retries twice by default.\n  retries: 3, // three tries\n}\n'
  const context = commentContext([{ id: 'a.js', path: 'a.js', text }])
  const file = context.files.get('a.js'), blocks = commentBlocks(text, 'a.js')
  const [window] = commentWindows(file, blocks)
  const signals = { absent_names: [], parameter_mismatches: [], doc_name_mismatches: [] }
  const verify = (findings) => verifyCommentFindings({ findings }, { file, window, related: [], signals, files: context.files })
  const base = { line: 2, explanation: 'x', sure: true }
  const ok = verify([{ ...base, comment_quote: 'Retries twice by default.', evidence: [{ source: 'file', quote: 'retries: 3, // three tries' }], replacement: 'Retries three times by default.' }])
  assert.equal(ok.findings.length, 1)
  assert.equal(ok.findings[0].after, '  // Retries three times by default.')
  // A retyped marker (" * " instead of "//") is still found; the correction keeps the real marker.
  const loose = verify([{ ...base, comment_quote: '  * Retries twice by default.', evidence: [{ source: 'file', quote: 'retries: 3,' }], replacement: '  * Retries three times by default.' }])
  assert.equal(loose.findings[0].after, '  // Retries three times by default.')
  const bad = verify([
    { ...base, comment_quote: 'retries: 3', evidence: [{ source: 'file', quote: 'retries: 3,' }], replacement: 'retries: 2' },
    { ...base, comment_quote: 'Retries twice by default.', evidence: [{ source: 'file', quote: '// three tries' }], replacement: 'Retries three times.' },
    { ...base, comment_quote: 'Retries twice by default.', evidence: [{ source: 'file', quote: 'retries: 3,' }], replacement: 'Retries twice  by default.' },
    { ...base, comment_quote: '// Retries twice by default.', evidence: [{ source: 'file', quote: 'retries: 3,' }], replacement: 'retries = 3' },
  ])
  assert.deepEqual(bad.dropped.map((d) => d.reason), ['Zitat steht in keinem Kommentar', 'kein Beleg im Code', 'Änderung nur an Leerzeichen', 'Korrektur ist kein Kommentar mehr'])
})
