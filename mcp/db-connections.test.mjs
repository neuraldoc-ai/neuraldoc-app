// Own PostgreSQL connections: validation, secrets, the HTTP surface and, with a test server, read-only queries.
// Set NEURALDOC_TEST_PG_URL (postgres://user:pass@host:port/db, a throwaway database) to run the live part.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-db-test-')))
process.env.NEURALDOC_STATE_DIR = root
delete process.env.NEURALDOC_MODE
const db = await import('./db-connections.mjs')
const { middleware } = await import('./handler.mjs')
after(() => fs.rmSync(root, { recursive: true, force: true }))

test('connection URLs and form input are validated; the password never comes back', () => {
  assert.deepEqual(db.parseUrl('postgresql://leser:p%40ss@db.example.com:6543/shop?sslmode=require'), { host: 'db.example.com', port: '6543', database: 'shop', user: 'leser', password: 'p@ss', ssl: 'require' })
  assert.equal(db.parseUrl('postgres://u@localhost/app').ssl, 'prefer')
  assert.throws(() => db.parseUrl('mysql://u@h/db'), /postgres:\/\//)
  assert.throws(() => db.parseUrl('kein url'), /ungültig/)
  assert.throws(() => db.saveConnection({ host: 'h', port: 70000, database: 'd', user: 'u' }), /Port/)
  assert.throws(() => db.saveConnection({ host: 'h; rm -rf /', database: 'd', user: 'u' }), /Host ist ungültig/)
  assert.throws(() => db.saveConnection({ host: 'h', database: 'd', user: 'u', ssl: 'maybe' }), /SSL/)
  assert.throws(() => db.saveConnection({ host: 'h', user: 'u' }), /Datenbank fehlt/)

  const saved = db.saveConnection({ url: 'postgres://leser:geheim@db.example.com/shop?sslmode=verify-full', name: 'Produktion' })
  assert.deepEqual({ ...saved, id: undefined, updatedAt: undefined }, { id: undefined, name: 'Produktion', host: 'db.example.com', port: 5432, database: 'shop', user: 'leser', ssl: 'verify-full', schema: 'public', updatedAt: undefined, passwordSet: true })
  assert.equal(JSON.stringify(db.listConnections()).includes('geheim'), false)
  assert.equal(fs.statSync(path.join(root, 'connections.json')).mode & 0o777, 0o600)
  // An empty password keeps the stored one; a new one replaces it.
  db.saveConnection({ id: saved.id, host: 'db.example.com', database: 'shop', user: 'leser', password: '', ssl: 'require', schema: 'verkauf' })
  const stored = () => JSON.parse(fs.readFileSync(path.join(root, 'connections.json'), 'utf8'))[0]
  assert.deepEqual([stored().password, stored().ssl, stored().schema], ['geheim', 'require', 'verkauf'])
  assert.throws(() => db.saveConnection({ id: 'gibt-es-nicht', host: 'h', database: 'd', user: 'u' }), /gibt es nicht mehr/)
  assert.deepEqual(db.deleteConnection(saved.id), [])
})

test('HTTP: listing is open, every change and query needs this app as origin', async () => {
  const server = http.createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (url, body, origin = base) => fetch(base + url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    assert.deepEqual(await (await fetch(`${base}/api/mcp/db/connections`)).json(), { connections: [] })
    assert.equal((await post('/api/mcp/db/connections', { host: 'h', database: 'd', user: 'u' }, 'http://evil.example')).status, 403)
    assert.equal((await post('/api/mcp/db/query', { id: 'x', sql: 'select 1' }, 'http://evil.example')).status, 403)
    const created = await (await post('/api/mcp/db/connections', { host: '127.0.0.1', port: 1, database: 'd', user: 'u', password: 'p', ssl: 'disable' })).json()
    assert.equal(created.passwordSet, true)
    const refused = await post('/api/mcp/db/test', { id: created.id })
    assert.equal(refused.status, 400)
    assert.match((await refused.json()).error, /nimmt keine Verbindung an/)
    assert.equal((await post('/api/mcp/db/query', { id: created.id, sql: '' })).status, 400)
    assert.deepEqual((await (await post('/api/mcp/db/connections/delete', { id: created.id })).json()).connections, [])
  } finally { server.close() }
})

const live = process.env.NEURALDOC_TEST_PG_URL
test('a live server: test, read-only queries, one statement at a time', { skip: !live && 'NEURALDOC_TEST_PG_URL not set' }, async () => {
  const c = db.saveConnection({ url: live, name: 'Test' })
  const tested = await db.testConnection({ id: c.id })
  assert.match(tested.version, /^PostgreSQL \d+/)
  const result = await db.queryConnection(c.id, 'SELECT 1 AS eins, now()::date AS heute, NULL AS leer')
  assert.deepEqual(result.fields.map((f) => f.name), ['eins', 'heute', 'leer'])
  assert.equal(result.rows[0].eins, 1)
  await assert.rejects(db.queryConnection(c.id, 'CREATE TABLE neuraldoc_should_not_exist (id int)'), /nur lesend/)
  await assert.rejects(db.queryConnection(c.id, 'COMMIT; CREATE TABLE neuraldoc_should_not_exist (id int)'), /nur eine Abfrage/)
  assert.equal((await db.queryConnection(c.id, "SELECT to_regclass('neuraldoc_should_not_exist') AS t")).rows[0].t, null)
  const many = await db.queryConnection(c.id, 'SELECT generate_series(1, 1500) AS n')
  assert.deepEqual([many.rows.length, many.truncated], [1000, true])
  await assert.rejects(db.testConnection({ url: live.replace(/:[^:@/]*@/, ':falsch@') }), /Passwort/)
  db.deleteConnection(c.id)
})
