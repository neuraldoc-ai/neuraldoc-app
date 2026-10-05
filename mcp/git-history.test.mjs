// Git history of an imported repository: a real repository built here, read like a fresh clone.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { commitKind, groupFeatures, parseMerge, readHistory, splitPatch, ticketOf } from './git-history.mjs'
import { withFeatures, proposalPaths, releaseOf } from './project-features.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-git-test-'))
after(() => fs.rmSync(root, { recursive: true, force: true }))
const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
const git = (...args) => execFileSync('git', ['-C', root, ...args], { env, encoding: 'utf8' })
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text) }
let date = Date.parse('2026-09-01T10:00:00Z')
const commit = (message) => { date += 3600_000; git('add', '-A'); execFileSync('git', ['-C', root, 'commit', '-q', '-m', message], { env: { ...env, GIT_AUTHOR_DATE: new Date(date).toISOString(), GIT_COMMITTER_DATE: new Date(date).toISOString() } }) }

test('ticket keys, merge messages and patches', () => {
  assert.equal(ticketOf('feature/MOB-4812-teillieferung'), 'MOB-4812')
  assert.equal(ticketOf('MOB4812 Tooltip'), 'MOB-4812')
  assert.equal(ticketOf('Avis-Vorlauf 48h -> 24h'), null)
  assert.deepEqual(parseMerge("Merge branch 'feature/MOB-1-rabatt' into 'release/2.0'", '\n\nMOB-1 Rabatt staffeln\n\nCloses MOB-1\n\nSee merge request shop/app!42\n'), { branch: 'feature/MOB-1-rabatt', target: 'release/2.0', mr: '!42', title: 'MOB-1 Rabatt staffeln', description: 'Closes MOB-1' })
  assert.deepEqual(parseMerge('Merge pull request #7 from acme/feature-export', '\n\nExport mit Datum\n'), { branch: 'feature-export', target: null, mr: '#7', title: 'Export mit Datum', description: '' })
  const [file] = splitPatch('diff --git a/src/a.ts b/src/b.ts\nsimilarity index 90%\nrename from src/a.ts\nrename to src/b.ts\n--- a/src/a.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-old\n+new\n')
  assert.deepEqual({ ...file, diff: undefined }, { old_path: 'src/a.ts', new_path: 'src/b.ts', diff: undefined, new_file: false, deleted_file: false, renamed_file: true, binary: false, too_large: false })
  assert.equal(file.diff, '@@ -1 +1 @@\n-old\n+new\n')
})

test('kinds of change follow the files a commit touches', () => {
  assert.equal(commitKind('Doku', ['README.md']), null, 'no code: not a feature')
  assert.equal(commitKind('Tests', ['src/test/RabattTest.java']), 'test')
  assert.equal(commitKind('Fix: NPE im Export', ['src/export.ts']), 'fix')
  assert.equal(commitKind('„Sperre“ heißt jetzt „Stopp“', ['web/Dialog.tsx']), 'label')
  assert.equal(commitKind('Neue Spalte', ['db/migration/V2__spalte.sql']), 'datenbank')
  assert.equal(commitKind('Grenze 24h', ['config/parameter/tour.yaml']), 'parameter')
  assert.equal(commitKind('Dialog', ['web/src/Dialog.tsx']), 'feld')
  assert.equal(commitKind('Rabatt', ['src/pricing.ts']), 'prozess')
})

test('history since the last tag: merges become features with their branch commits', async () => {
  git('init', '-q', '-b', 'release/2.0')
  write('src/pricing.ts', 'export const rate = 0.1\n'); write('README.md', '# Shop\n'); commit('Release 1.0')
  git('tag', 'v1.0')
  write('src/version.txt', '2.0-SNAPSHOT\n'); write('README.md', '# Shop 2\n'); commit('docs: README')
  git('checkout', '-q', '-b', 'feature/MOB-1-rabatt')
  write('src/pricing.ts', 'export const rate = (t: number) => (t >= 1000 ? 0.15 : 0.1)\n'); commit('MOB-1 Rabatt ab 1000 EUR')
  write('test/pricing.test.ts', 'test\n'); commit('MOB-1 Tests')
  git('checkout', '-q', 'release/2.0')
  write('config/tour.yaml', 'avis: 24\n'); commit('Avis-Vorlauf 48h -> 24h')
  date += 3600_000
  execFileSync('git', ['-C', root, 'merge', '-q', '--no-ff', 'feature/MOB-1-rabatt', '-m', "Merge branch 'feature/MOB-1-rabatt' into 'release/2.0'", '-m', 'MOB-1 Rabatt staffeln', '-m', 'See merge request shop/app!42'], { env: { ...env, GIT_AUTHOR_DATE: new Date(date).toISOString(), GIT_COMMITTER_DATE: new Date(date).toISOString() } })

  const h = await readHistory(root)
  assert.equal(h.ref, 'release/2.0')
  assert.equal(h.tag, 'v1.0')
  assert.equal(h.commits.length, 5, 'everything after the tag, the tag commit itself is the previous release')
  assert.deepEqual(h.features.map((f) => [f.id, f.title, f.ticket, f.mr, f.commits.map((c) => c.kind)]), [
    ['mob-1', 'Rabatt staffeln', 'MOB-1', '!42', ['test', 'prozess']],
    [h.features[1].id, 'Avis-Vorlauf 48h -> 24h', null, null, ['parameter']],
  ], 'the README commit changes no code and is no feature')
  assert.deepEqual(h.features[0].files.sort(), ['src/pricing.ts', 'test/pricing.test.ts'])
  const mr = h.mergeRequests[0]
  assert.equal(mr.reference, '!42')
  assert.equal(mr.commits.length, 2)
  const merge = h.commits.find((c) => c.parent_ids.length === 2)
  assert.deepEqual(h.diffs[merge.id].map((f) => f.new_path).sort(), ['src/pricing.ts', 'test/pricing.test.ts'], 'a merge shows what its branch brought in')
  assert.match(h.diffs[h.features[0].commits[1].id][0].diff, /\+export const rate = \(t: number\)/)
  assert.equal(await readHistory(path.join(root, 'src')), null, 'no .git: an uploaded folder has no history')
})

test('features become the changes the pages show; proposals follow the code they contradict', () => {
  const history = {
    ref: 'release/2.0', tag: 'v1.0', head: { committed_date: '2026-09-02T10:00:00+02:00' },
    commits: [{ id: 'a'.repeat(40), title: 'MOB-1 Rabatt ab 1000 EUR', author_name: 'Test', committed_date: '2026-09-01T10:00:00+02:00' }, { id: 'b'.repeat(40), title: 'Avis 24h', author_name: 'Test', committed_date: '2026-09-02T10:00:00+02:00' }],
    features: [
      { id: 'mob-1', ticket: 'MOB-1', mr: '!42', title: 'Rabatt staffeln', summary: 'Closes MOB-1', merged: '2026-09-01T10:00:00+02:00', files: ['src/pricing.ts'], commits: [{ id: 'a'.repeat(40), kind: 'prozess', files: ['src/pricing.ts'] }] },
      { id: 'commit-bbbbbbb', ticket: null, mr: null, title: 'Avis 24h', summary: '', merged: '2026-09-02T10:00:00+02:00', files: ['config/tour.yaml'], commits: [{ id: 'b'.repeat(40), kind: 'parameter', files: ['config/tour.yaml'] }] },
    ],
  }
  const p = {
    history, moduleDefs: [{ id: 'module-0', name: 'src', path: 'src' }, { id: 'module-1', name: 'config', path: 'config' }],
    dataset: { modules: { 'module-0': 'src', 'module-1': 'config' } },
    mapping: { records: [{ doc: 'doc-1', contradicts: ['file:src/pricing.ts#L1'] }, { doc: 'doc-2', contradicts: ['file:src/report.ts#L1'] }] },
  }
  const dataset = { release: { id: '2026-10-05' }, bundles: [{ id: 'erstpruefung', title: 'Erstprüfung', commits: [], aspects: [] }], proposals: [{ id: 'p1', bundle: 'erstpruefung', doc: 'doc-1', commits: [] }, { id: 'p2', bundle: 'erstpruefung', doc: 'doc-2', commits: [] }] }
  assert.deepEqual(proposalPaths(p, dataset.proposals[0]), ['src/pricing.ts'])
  assert.deepEqual(releaseOf(history), { id: '2.0', freeze: '2026-09-02', ship: '2026-09-02' })
  const out = withFeatures(p, dataset)
  assert.deepEqual(out.bundles.map((b) => [b.id, b.title, b.ticket, b.mr]), [['mob-1', 'Rabatt staffeln', 'MOB-1', '!42'], ['commit-bbbbbbb', 'Avis 24h', 'bbbbbbb', 'bbbbbbb'], ['erstpruefung', 'Weitere Abweichungen', 'Erstprüfung', 'vor v1.0']])
  assert.deepEqual(out.proposals.map((x) => [x.id, x.bundle, x.commits]), [['p1', 'mob-1', ['aaaaaaa']], ['p2', 'erstpruefung', []]])
  assert.equal(out.bundles[0].summary, '', 'closing lines are no summary')
  assert.equal(out.bundles[0].noDocsReason, undefined)
  assert.match(out.bundles[1].noDocsReason, /keine Abweichung/)
  assert.deepEqual(out.bundles[1].aspects, [{ kind: 'parameter', module: 'module-1', text: 'Avis 24h', commits: ['bbbbbbb'] }])
  assert.equal(withFeatures({ ...p, history: null }, dataset), dataset, 'without history: the initial check stays the one change')
  assert.deepEqual(groupFeatures([], {}), { mergeRequests: [], features: [] })
})
