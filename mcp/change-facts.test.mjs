// Values in the code: what the commits since the last release changed, and where the code disagrees with itself.
import test from 'node:test'
import assert from 'node:assert/strict'
import { changeQuestion, codeChanges, conflictQuestion, literalPairs, normalizeValue, sectionChanges, valueConflicts } from './change-facts.mjs'
import { createSectionRetriever } from './check.mjs'

test('name–value pairs: fallbacks, keys, settings, flags and getter defaults; lists of names have no values', () => {
  assert.deepEqual(literalPairs('budget: Number(env.APP_BUDGET_USD || .25) })'), [{ name: 'APP_BUDGET_USD', value: '0.25' }])
  assert.deepEqual(literalPairs('const LIMITS = { rows: 1000, timeoutMs: 15_000 }'), [{ name: 'rows', value: '1000' }, { name: 'timeoutMs', value: '15000' }])
  assert.deepEqual(literalPairs("run('git', ['clone', '--depth', '300', url])"), [{ name: '--depth', value: '300' }])
  assert.deepEqual(literalPairs("timeout = int(os.environ.get('APP_TIMEOUT', 30))"), [{ name: 'APP_TIMEOUT', value: '30' }])
  assert.deepEqual(literalPairs('APP_MODE=fast'), [])
  assert.deepEqual(literalPairs("const NAMES = ['APP_A', 'APP_B', 'APP_C']"), [])
  assert.deepEqual(literalPairs('if (x == 5) return f(a, 2)'), [])
  assert.equal(normalizeValue('1_000'), '1000')
  assert.equal(normalizeValue('.5'), '0.5')
  assert.equal(normalizeValue('"fast"'), 'fast')
})

const commit = (id, title, files) => ({ id: id.repeat(40), title, files })
const history = (...commits) => ({ commits: [...commits].reverse().map(({ id, title }) => ({ id, title })) })
const diffsOf = (...commits) => Object.fromEntries(commits.map((c) => [c.id, c.files]))

test('changes since the release: values and renamed names, a value changed twice keeps its first old value', () => {
  const a = commit('a', 'perf: smaller limits', [{ new_path: 'src/db.js', diff: '@@ -1 +1 @@\n-const LIMITS = { rows: 1000, timeoutMs: 15_000 }\n+const LIMITS = { rows: 800, timeoutMs: 15_000 }\n' }])
  const b = commit('b', 'perf: even smaller', [{ new_path: 'src/db.js', diff: '@@ -1 +1 @@\n-const LIMITS = { rows: 800, timeoutMs: 15_000 }\n+const LIMITS = { rows: 500, timeoutMs: 15_000 }\n' }])
  const c = commit('c', 'refactor: token name', [{ new_path: 'src/upload.js', diff: '@@ -3 +3 @@\n-  const token = env.APP_GIT_TOKEN?.trim()\n+  const token = env.APP_GITHUB_TOKEN?.trim()\n' }])
  const t = commit('d', 'test: more', [{ new_path: 'test/db.test.js', diff: '@@ -1 +1 @@\n-const rows = 1\n+const rows = 2\n' }])
  const changes = codeChanges(history(a, b, c, t), diffsOf(a, b, c, t))
  assert.deepEqual(changes.map((x) => x.kind === 'rename' ? [x.from, x.to] : [x.name, x.from, x.to]), [['rows', '1000', '500'], ['APP_GIT_TOKEN', 'APP_GITHUB_TOKEN']])
  assert.equal(changes[0].commit.title, 'perf: even smaller')
  // The section that still states the old value or the old name gets the change, with its line.
  const doc = 'Queries return at most 1,000 rows.\n\nSet `APP_GIT_TOKEN` for private repositories.\nThe default is 500 rows now.'
  assert.deepEqual(sectionChanges(doc, changes).map((x) => [x.kind, x.line]), [['value', 1], ['rename', 3]])
  assert.deepEqual(sectionChanges('Queries return at most 500 rows.', changes), [], 'already updated')
  // A change no finding corrects becomes a question with the commit as evidence.
  assert.match(changeQuestion(changes[0]), /Commit bbbbbbb \(„perf: even smaller“\) hat rows .* von 1000 auf 500 geändert \(src\/db\.js\)\. .*Gilt jetzt 500\?/)
  assert.match(changeQuestion(changes[1]), /APP_GIT_TOKEN .* in APP_GITHUB_TOKEN umbenannt/)
})

test('a setting the code sets to different values is a question when the section states one of them', () => {
  const files = [
    { id: 'src/check.js', path: 'src/check.js', text: 'const budget = Number(env.APP_BUDGET_USD || .5)\n' },
    { id: 'src/mapping.js', path: 'src/mapping.js', text: 'const budget = Number(process.env.APP_BUDGET_USD || 0.25)\n' },
    { id: '.env.example', path: '.env.example', text: 'APP_BUDGET_USD=0.25\n' },
    { id: 'test/a.test.js', path: 'test/a.test.js', text: 'env.APP_BUDGET_USD = 3\n' },
  ]
  const retriever = createSectionRetriever(files)
  const conflicts = valueConflicts('| `APP_BUDGET_USD` | Spending cap | `0.25` |', ['APP_BUDGET_USD'], (n) => retriever.values(n))
  assert.deepEqual(conflicts, [{ name: 'APP_BUDGET_USD', stated: '0.25', values: [{ value: '0.5', where: ['src/check.js:1'] }, { value: '0.25', where: ['src/mapping.js:1'] }] }])
  assert.match(conflictQuestion(conflicts[0]), /APP_BUDGET_USD.*0\.5 \(src\/check\.js:1\).*0\.25 \(src\/mapping\.js:1\).*Welcher Wert gilt\?/)
  assert.deepEqual(valueConflicts('No value here: `APP_BUDGET_USD`.', ['APP_BUDGET_USD'], (n) => retriever.values(n)), [])
})
