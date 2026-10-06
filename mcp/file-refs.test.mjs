// Links and file names that point to files the repository does not have.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileFindings, fileTree } from './file-refs.mjs'
import { applyLineEdits } from './check.mjs'

const trees = {
  repo: fileTree({
    paths: ['README.md', 'LICENSE', 'CONTRIBUTING.md', 'docs/guide.md', 'docs/images/flow.png', 'docs/setup/install.md', 'src/app.ts', 'config/app.yaml', '.gitignore'],
    gitlinks: ['datasets/sample'],
    gitignore: { '': 'dist/\n.env.local\n' },
    deleted: ['SECURITY.md', 'docs/old-guide.md'],
    renamed: { 'docs/install.md': 'docs/setup/install.md' },
  }),
  docs: null,
}
const readme = { path: 'repository/README.md', origin: 'repo', format: 'md' }
const guide = { path: 'repository/docs/guide.md', origin: 'repo', format: 'md' }
const check = (text, source = readme) => {
  const result = fileFindings({ text }, source, trees)
  return { ...result, text: result.findings.length ? applyLineEdits(text, result.findings.flatMap((f) => f.edits)) : text }
}

test('a list entry linking to a deleted file is removed; existing files, folders, submodules and URLs stay', () => {
  const text = [
    '## More', '',
    '- [ARCHITECTURE.md](ARCHITECTURE.md): how it is built',
    '- [CONTRIBUTING.md](CONTRIBUTING.md): how to help',
    '- [Guide](docs/guide.md#start), [Docs](docs/), [Sample](datasets/sample/README.md)',
    '- [Website](https://example.com/MISSING.md) and [mail](mailto:a@example.com) and [top](#more)',
  ].join('\n')
  const result = check(text)
  assert.deepEqual(result.findings.map((f) => f.absent[0]), ['ARCHITECTURE.md'])
  assert.equal(result.findings[0].kind, 'removed')
  assert.equal(result.findings[0].files, true)
  assert.ok(!result.text.includes('ARCHITECTURE') && result.text.includes('CONTRIBUTING.md'))
})

test('a link inside a sentence keeps its text; a moved file gets its new path, relative to the document', () => {
  const sentence = check('Details stehen im [Bericht](REPORT.md), der jede Woche entsteht.')
  assert.equal(sentence.text, 'Details stehen im Bericht, der jede Woche entsteht.')
  const moved = check('Siehe [Installation](install.md).', guide)
  assert.equal(moved.text, 'Siehe [Installation](setup/install.md).')
  assert.match(moved.findings[0].explanation, /docs\/setup\/install\.md/)
  const image = check('![Ablauf](docs/images/old.png)\n\nText.')
  assert.equal(image.findings[0].edits[0].op, 'delete')
})

test('file names in code spans: gone documents and paths count, generated, local and runtime files do not', () => {
  const text = [
    'See `SECURITY.md` for reporting.',
    '- `docs/old-guide.md`: the old guide',
    '| `config/legacy.yaml` | settings |',
    'Build output goes to `dist/app/index.html`, keys to `frontend/.env.local`, state to `settings.json`.',
    'The app reads `config/app.yaml` and `app.ts` and `setup/install.md`.',
    'Benchmarks use `readme.md` of chalk and `chalk/source/index.js`.',
    '```bash',
    'cat docs/missing.md `docs/missing.md`',
    '```',
  ].join('\n')
  const result = check(text)
  assert.deepEqual(result.findings.map((f) => f.absent[0]), ['docs/old-guide.md', 'config/legacy.yaml'])
  assert.equal(result.questions.length, 1, 'SECURITY.md in a sentence has no clear fix: a question')
  assert.match(result.questions[0], /SECURITY\.md/)
  assert.ok(!result.text.includes('old-guide') && !result.text.includes('legacy'))
})

test('a renamed file gets its new place from the history', () => {
  assert.equal(check('- `docs/install.md`: Installation').text, '- `docs/setup/install.md`: Installation')
})

test('only text documents are checked, and only when the import kept the repository paths', () => {
  assert.deepEqual(fileFindings({ text: '[x](gone.md)' }, { ...readme, format: 'xml' }, trees).findings, [])
  assert.deepEqual(fileFindings({ text: '[x](gone.md)' }, readme, { repo: null, docs: null }).findings, [])
})
