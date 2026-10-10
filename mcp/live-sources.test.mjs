import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.NEURALDOC_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-live-'))
Object.assign(process.env, { NEURALDOC_CONFLUENCE_URL: 'https://firma.atlassian.net/wiki/', NEURALDOC_CONFLUENCE_EMAIL: 'a@b.de', NEURALDOC_CONFLUENCE_TOKEN: 'tok' })
const { fetchConfluence, syncConfluence, confluenceLinks, planConfluence, driveFolderId, isWritten } = await import('./live-sources.mjs')
const { documentText } = await import('./doc-text.mjs')

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

test('import: pages of a space as storage XML, labels in the file name, pagination followed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-conf-')), seen = []
  const fetchImpl = async (url, init) => {
    seen.push(url); assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('a@b.de:tok').toString('base64'))
    const u = url.replace('https://firma.atlassian.net/wiki', '')
    if (u.startsWith('/api/v2/spaces?keys=HB')) return json({ results: [{ id: '7', key: 'HB', name: 'Handbuch' }] })
    if (u.startsWith('/api/v2/spaces/7/pages') && !u.includes('cursor')) return json({ results: [{ id: '11', title: 'Gutscheine', version: { number: 4 }, body: { storage: { value: '<p>Nur vollständig.</p>' } } }], _links: { next: '/wiki/api/v2/spaces/7/pages?cursor=x' } })
    if (u.includes('cursor=x')) return json({ results: [{ id: '12', title: 'FAQ Kasse', version: { number: 1 }, body: { storage: { value: '<p>Nein.</p>' } } }] })
    if (u.startsWith('/api/v2/pages/11/labels')) return json({ results: [{ name: 'anwenderhandbuch' }, { name: 'kasse' }] })
    if (u.startsWith('/api/v2/pages/12/labels')) return json({ results: [] })
    return json({ message: 'unexpected ' + u }, 404)
  }
  const live = await fetchConfluence(dir, ['hb'], { fetchImpl })
  assert.deepEqual(Object.keys(live.pages), ['confluence/HB/11-anwenderhandbuch-kasse-gutscheine.xml', 'confluence/HB/12-faq-kasse.xml'])
  assert.equal(live.site, 'https://firma.atlassian.net')
  const text = fs.readFileSync(path.join(dir, 'confluence', 'HB', '11-anwenderhandbuch-kasse-gutscheine.xml'), 'utf8')
  assert.equal(text, '<!-- HB / Gutscheine (Version 4) -->\n<p>Nur vollständig.</p>')
  assert.match(await documentText('x.xml', Buffer.from(text)), /^# Gutscheine\n\nNur vollständig\./)
  await assert.rejects(fetchConfluence(dir, ['NOPE'], { fetchImpl: async () => json({ results: [] }) }), /nicht gefunden.*NOPE/)
})

test('write-back: changed words into the live page as a new version; a written section cannot be planned twice', async () => {
  const file = 'confluence/HB/11-anwenderhandbuch-gutscheine.xml', raw = '<!-- HB / 6 Gutscheine (Version 4) -->\n<p>Ein Gutschein kann nur vollständig eingelöst werden.</p><ac:image><ri:attachment ri:filename="k.png" /></ac:image>'
  const find = await documentText(file, Buffer.from(raw))
  const p = {
    id: 'p1', name: 'MOBIQ', sources: { docs: { live: { confluence: { site: 'https://firma.atlassian.net', pages: { [file]: { id: '11', title: '6 Gutscheine', space: 'HB', version: 4 } } } } } },
    docSources: [{ id: 's1', path: `dokumentation/${file}`, origin: 'docs', format: 'xml' }],
    docFiles: [{ id: 'd1', source: 's1', title: '6 Gutscheine', text: find }],
    dataset: { proposals: [{ id: 'x1', section: 'd1' }] },
    generated: { x1: { text: find.replace('nur vollständig', 'auch teilweise') } },
    decisions: { x1: { state: 'uebernommen', by: 'Delschad', at: '2026-10-10T10:00:00Z' } },
  }
  let put = null
  const fetchImpl = async (url, init) => {
    if (init.method === 'GET') return json({ id: '11', title: '6 Gutscheine', version: { number: 4 }, body: { storage: { value: raw.split('\n').slice(1).join('\n') } } })
    put = JSON.parse(init.body); return json({ id: '11', version: { number: 5 } })
  }
  assert.equal(planConfluence(p).length, 1)
  assert.deepEqual(await syncConfluence(() => p, { fetchImpl }), { written: 1 })
  assert.equal(put.version.number, 5)
  assert.match(put.version.message, /^neuraldoc: 6 Gutscheine freigegeben von Delschad/)
  assert.equal(put.body.value, '<p>Ein Gutschein kann auch teilweise eingelöst werden.</p><ac:image><ri:attachment ri:filename="k.png" /></ac:image>')
  assert.ok(isWritten('p1', 'x1'))
  assert.equal(confluenceLinks(p).x1.url, 'https://firma.atlassian.net/wiki/spaces/HB/pages/11')
  assert.equal(planConfluence(p).length, 0)
})

test('named entities as Confluence writes them: the import reads umlauts, the write-back changes words between them', async () => {
  const file = 'confluence/HB/12-faq.xml', body = '<p>Nein. Ein Gutschein wird immer vollst&auml;ndig eingel&ouml;st, &bdquo;Rest&ldquo; &rarr; neuer Gutschein.</p>'
  const raw = `<!-- HB / FAQ Kasse (Version 2) -->\n${body}`, find = await documentText(file, Buffer.from(raw))
  assert.equal(find, '# FAQ Kasse\n\nNein. Ein Gutschein wird immer vollständig eingelöst, „Rest“ → neuer Gutschein.')
  const p = {
    id: 'p2', name: 'MOBIQ', sources: { docs: { live: { confluence: { site: 'https://firma.atlassian.net', pages: { [file]: { id: '12', title: 'FAQ Kasse', space: 'HB', version: 2 } } } } } },
    docSources: [{ id: 's1', path: `dokumentation/${file}`, origin: 'docs', format: 'xml' }],
    docFiles: [{ id: 'd1', source: 's1', title: 'FAQ Kasse', text: find }],
    dataset: { proposals: [{ id: 'x1', section: 'd1' }] },
    generated: { x1: { text: find.replace('Nein. Ein Gutschein wird immer vollständig eingelöst', 'Ja. Ein Gutschein kann auch teilweise eingelöst werden') } },
    decisions: { x1: { state: 'uebernommen', by: 'Delschad', at: '2026-10-10T10:00:00Z' } },
  }
  let put = null
  await syncConfluence(() => p, { fetchImpl: async (url, init) => init.method === 'GET' ? json({ id: '12', title: 'FAQ Kasse', version: { number: 2 }, body: { storage: { value: body } } }) : (put = JSON.parse(init.body), json({ version: { number: 3 } })) })
  // Replaced words are written as plain UTF-8, the untouched ones keep their entities.
  assert.equal(put.body.value, '<p>Ja. Ein Gutschein kann auch teilweise eingelöst werden, &bdquo;Rest&ldquo; &rarr; neuer Gutschein.</p>')
})

test('Drive folder ids come from links or plain ids', () => {
  assert.equal(driveFolderId('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn?usp=sharing'), '1AbCdEfGhIjKlMn')
  assert.equal(driveFolderId('1AbCdEfGhIjKlMn'), '1AbCdEfGhIjKlMn')
  assert.equal(driveFolderId('https://example.com'), null)
})
