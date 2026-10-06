// Changes of an own project in plain words, and the exact code places the section check adds for names and numbers.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describeFeatures, featureInput, plainFeature } from './feature-texts.mjs'
import { CHECK_PROMPT, CHECK_PROMPT_PLAIN, checkVariant, createSectionRetriever, factDense, sectionTerms } from './check.mjs'
import { withFeatures } from './project-features.mjs'

const feature = (title, kinds = ['prozess']) => ({ id: 'f', title, summary: '', commits: kinds.map((kind, i) => ({ id: String(i).repeat(40), kind, files: [] })) })

test('without a model: the commit subject without its prefix, the type from the prefix', () => {
  assert.deepEqual(plainFeature(feature('feat(mcp): settings page, empty start')), { title: 'Settings page, empty start', summary: '', type: 'neu', areas: ['mcp'], source: 'commit' })
  assert.equal(plainFeature(feature('test: readme benchmarks')).type, 'intern')
  assert.equal(plainFeature(feature('fix: tables as Markdown')).type, 'fix')
  assert.equal(plainFeature(feature('Rabatt ab 1000 EUR')).type, 'geaendert')
  assert.equal(plainFeature(feature('Update fixtures', ['test'])).type, 'intern')
})

test('the model input: product code first, tests and evaluation last, lock files never', () => {
  const id = 'a'.repeat(40)
  const history = { commits: [{ id, title: 'feat: retry limit', message: 'feat: retry limit\n\nRetries up to 3 times.' }] }
  const diffs = { [id]: [
    { new_path: 'tests/retry.test.js', diff: '+expect(3)\n' },
    { new_path: 'package-lock.json', diff: '+"x": 1\n' },
    { new_path: 'src/retry.js', diff: '-const LIMIT = 2\n+const LIMIT = 3\n' },
  ] }
  const input = featureInput('demo', { title: 'feat: retry limit', commits: [{ id }], mr: null }, new Map(history.commits.map((c) => [c.id, c])), diffs)
  assert.ok(input.diff.indexOf('src/retry.js') < input.diff.indexOf('tests/retry.test.js'))
  assert.ok(!input.diff.includes('package-lock'))
  assert.deepEqual(input.commits[0].files, ['tests/retry.test.js (+1 −0)', 'package-lock.json (+1 −0)', 'src/retry.js (+1 −1)'])
  assert.equal(input.commits[0].message, 'Retries up to 3 times.')
})

test('model descriptions are cleaned and cached; a failed answer keeps the plain one', async () => {
  const id = 'b'.repeat(40)
  const other = 'c'.repeat(40)
  const history = { commits: [{ id, title: 'feat: retry limit', message: 'feat: retry limit' }, { id: other, title: 'chore: deps', message: 'chore: deps' }], features: [{ id: 'f1', title: 'feat: retry limit', summary: '', mr: null, commits: [{ id, kind: 'prozess', files: [] }] }, { id: 'f2', title: 'chore: deps', summary: '', mr: null, commits: [{ id: other, kind: 'intern', files: [] }] }] }
  let calls = 0
  const fetchImpl = async (url, init) => {
    calls++
    const body = JSON.parse(init.body), input = JSON.parse(body.contents[0].parts[0].text)
    const value = input.commits[0].subject.startsWith('feat') && body.contents ? { title: 'feat: Mehr Wiederholungen bei Fehlern', summary: 'Anfragen werden jetzt bis zu dreimal wiederholt.', type: 'geaendert', areas: ['Anfragen', '', 'Fehler', 'Netz', 'zu viel'] } : { title: '', summary: '', type: 'unbekannt', areas: [] }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } }), { status: 200 })
  }
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-feature-texts-'))
  const config = { provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: 'test-only', inputPrice: 0, outputPrice: 0 }
  const { texts } = await describeFeatures({ name: 'demo', history, diffs: {}, config, cacheDir, fetchImpl })
  assert.deepEqual(texts.f1, { title: 'Mehr Wiederholungen bei Fehlern', summary: 'Anfragen werden jetzt bis zu dreimal wiederholt.', type: 'geaendert', areas: ['Anfragen', 'Fehler', 'Netz'], source: 'model', model: 'gemini-3.5-flash-lite' })
  assert.equal(texts.f2.source, 'commit', 'an invalid answer falls back to the subject')
  const before = calls
  await describeFeatures({ name: 'demo', history, diffs: {}, config, cacheDir, fetchImpl })
  assert.equal(calls, before, 'the second run comes from the cache')
  // The pages use the description, keep the subject and add size and authors.
  const p = { history: { ...history, commits: [{ ...history.commits[0], author_name: 'Erika', committed_date: '2026-10-01T10:00:00Z', stats: { additions: 5, deletions: 2 } }], features: [{ ...history.features[0], ticket: null, merged: '2026-10-01T10:00:00Z', files: ['src/a.js'] }] }, moduleDefs: [], dataset: { modules: {} }, featureTexts: texts }
  const [b] = withFeatures(p, { release: { id: 'x' }, bundles: [], proposals: [] }).bundles
  assert.deepEqual([b.title, b.subject, b.type, b.stats, b.authors], ['Mehr Wiederholungen bei Fehlern', 'feat: retry limit', 'geaendert', { files: 1, additions: 5, deletions: 2 }, ['Erika']])
})

test('exact places: the lines behind the names and numbers of a long section', () => {
  const files = [
    { id: 'src/limits.js', path: 'src/limits.js', text: 'export const LIMITS = { codeFiles: 1500, uploadBytes: 200_000_000 }\n' },
    { id: 'src/history.js', path: 'src/history.js', text: "const range = tag ? [tag] : ['HEAD', '--since=90.days.ago']\n" },
    { id: 'src/run.js', path: 'src/run.js', text: 'const budget = Number(env.APP_BUDGET_USD || 0.5)\nconst other = 1\n' },
    { id: 'test/run.test.js', path: 'test/run.test.js', text: 'process.env.APP_BUDGET_USD = 0.25\n' },
  ]
  const retriever = createSectionRetriever(files)
  const section = { heading: 'Limits', text: '| `APP_BUDGET_USD` | Spending cap | `0.25` |\n\nUp to 3,000 code files per upload. Without a tag the last 30 days are read.\n' }
  const facts = retriever.facts(section, sectionTerms(section.text), [])
  const at = (p) => facts.filter((f) => f.path === p).map((f) => f.why)
  assert.ok(at('src/run.js').includes('Fundstelle von APP_BUDGET_USD'), 'the line that sets the default, before the test')
  assert.ok(at('src/limits.js').some((w) => w.startsWith('Zahl')), '"3,000 code files" finds codeFiles')
  assert.ok(at('src/history.js').some((w) => w.startsWith('Zahl')), '"30 days" finds 90.days')
  assert.deepEqual(retriever.family(['APP_'], new Set(['APP_OTHER']), 5).map((f) => f.name), ['APP_BUDGET_USD'])
})

test('only sections that state many values get the statement list and the exact places', () => {
  assert.equal(factDense('- Up to 1,500 code files (100 KB each), 400 sections, 200 MB per upload.'), true)
  assert.equal(factDense('| `APP_A` | x |\n| `APP_B` | x |\n| `APP_C` | x |\n| `APP_D` | x |\n| `APP_E` | x |\n| `APP_F` | x |'), true)
  assert.equal(factDense('| Begriff | Bedeutung |\n| --- | --- |\n| Teillieferung | Ein Teil der Ware kommt später. |\n| Lieferstopp | Keine Lieferung mehr. |'), false)
  assert.equal(checkVariant('Erst prüfen, dann freigeben.').system, CHECK_PROMPT_PLAIN)
  assert.ok(!CHECK_PROMPT_PLAIN.includes('statements:') && CHECK_PROMPT.includes('statements:'))
})
