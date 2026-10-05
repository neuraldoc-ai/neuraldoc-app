import test from 'node:test'
import assert from 'node:assert/strict'
import { documentText } from './doc-text.mjs'
import { classify } from '../frontend/src/dashboard/features/docs/import-rules.mjs'

test('Confluence pages in storage format are documentation, with the page title from the export comment', async () => {
  assert.equal(classify('confluence/storage/1-hb-home.xml', 'docs'), 'doc')
  assert.equal(classify('config/pom.xml', 'repo'), 'code', 'XML in a repository stays code')
  const page = '<!-- MOBIQHB / MOBIQ Anwenderhandbuch (Version 12) -->\n<ac:structured-macro ac:name="info"><ac:parameter ac:name="title">Version</ac:parameter><ac:rich-text-body><p>Gilt für 26.3.</p></ac:rich-text-body></ac:structured-macro>\n<h2>Kaufvertrag</h2>\n<p>Ein Vertrag &amp; eine Lieferung.</p>'
  const text = await documentText('storage/1-hb-home.xml', Buffer.from(page))
  assert.match(text, /^# MOBIQ Anwenderhandbuch\n/)
  assert.match(text, /## Kaufvertrag/)
  assert.match(text, /Ein Vertrag & eine Lieferung\./)
  assert.doesNotMatch(text, /ac:|Version\n/)
})
