// Approved Markdown back into Confluence storage XML: only the changed words, inside their text node.
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyStorage, changedWords, lineHunks, plain } from './confluence-storage.mjs'
import { documentText } from './doc-text.mjs'

const PAGE = `<!-- MOBIQFB / Parameter Auftrag und Lieferung (Version 4) -->
<p>Je Mandant unter <strong>Administration</strong> &gt; Parameter überschreibbar.</p>
<ac:structured-macro ac:name="info"><ac:parameter ac:name="title">Hinweis</ac:parameter><ac:rich-text-body><p>Gilt ab 26.3.</p></ac:rich-text-body></ac:structured-macro>
<table data-layout="default"><tbody>
<tr><th><p><strong>Parameter</strong></p></th><th><p><strong>Standard</strong></p></th></tr>
<tr><td><p>LIEF_VORLAUF_TAGE</p></td><td><p>5 Tage</p></td></tr>
<tr><td><p>ANZ_MIN_PROZ</p></td><td><p>30 Prozent</p></td></tr>
</tbody></table>
<p>Vorlauf &amp; Avis gelten je Filiale.</p>`

test('the Markdown of the import maps back to plain words; hunks and changed words are minimal', () => {
  assert.equal(plain('| `ANZ_MIN_PROZ` | 30 Prozent |'), '`ANZ_MIN_PROZ` 30 Prozent')
  assert.equal(plain('| --- | --- |'), '')
  assert.equal(plain('## Parameter'), 'Parameter')
  assert.deepEqual(lineHunks('a\nb\nc', 'a\nB\nc\nd'), [{ removed: ['b'], added: ['B'] }, { removed: [], added: ['d'] }])
  assert.deepEqual(changedWords('LIEF 5 Tage', 'LIEF 3 Tage'), { offset: 5, old: '5', new: '3' })
})

test('changed values go into their table cells; markup, macros and entities stay as they were', async () => {
  const before = await documentText('p.xml', Buffer.from(PAGE))
  const after = before.replace('| LIEF_VORLAUF_TAGE | 5 Tage |', '| LIEF_VORLAUF_TAGE | 3 Tage |').replace('| ANZ_MIN_PROZ | 30 Prozent |', '| ANZ_MIN_PROZ | 20 Prozent |').replace('Vorlauf & Avis gelten je Filiale.', 'Vorlauf & Avis gelten je Mandant.')
  const { text, results } = applyStorage(PAGE, [{ find: before, content: after }])
  assert.equal(results[0].state, 'applied')
  assert.equal(text, PAGE.replace('<p>5 Tage</p>', '<p>3 Tage</p>').replace('<p>30 Prozent</p>', '<p>20 Prozent</p>').replace('je Filiale.', 'je Mandant.'))
  assert.equal(await documentText('p.xml', Buffer.from(text)), after)
})

test('new lines, deletions and the page title are reported instead of guessed', async () => {
  const before = await documentText('p.xml', Buffer.from(PAGE))
  const after = before.replace('| ANZ_MIN_PROZ | 30 Prozent |', '| ANZ_MIN_PROZ | 20 Prozent |\n| TEILLIEF_ERLAUBT | nein |').replace('# Parameter Auftrag und Lieferung', '# Parameter Auftrag')
  const { text, results } = applyStorage(PAGE, [{ find: before, content: after }])
  assert.equal(results[0].state, 'partial')
  assert.deepEqual(results[0].left.map((l) => l.why).sort(), ['Seitentitel, in Confluence ändern', 'neue Zeile'])
  assert.ok(text.includes('<p>20 Prozent</p>') && !text.includes('TEILLIEF'))
  const gone = applyStorage(PAGE, [{ find: 'Ein Satz, der auf der Seite nicht steht.', content: 'Ein anderer Satz, der auf der Seite nicht steht.' }])
  assert.equal(gone.results[0].state, 'conflict')
  assert.equal(gone.text, PAGE)
})

test('a short line is changed where its section is, not where the word first occurs', () => {
  const xml = '<p>Der Kaufvertrag ist zentral.</p><h2>Ablauf im Detail</h2><p>Kaufvertrag</p>'
  const { text } = applyStorage(xml, [{ find: 'Ablauf im Detail\n\nKaufvertrag', content: 'Ablauf im Detail\n\nAuftrag' }])
  assert.equal(text, '<p>Der Kaufvertrag ist zentral.</p><h2>Ablauf im Detail</h2><p>Auftrag</p>')
})
