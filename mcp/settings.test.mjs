import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-settings-'))
process.env.NEURALDOC_STATE_DIR = root
process.env.OPENAI_API_KEY = 'env-openai'
delete process.env.TYPESAFE_API_KEY; delete process.env.JEV_API_KEY
const { installToken, profile, publicSettings, reviewer, runtimeEnv, saveSettings } = await import('./settings.mjs')
const { setupStatus } = await import('./setup.mjs')
after(() => fs.rmSync(root, { recursive: true }))

test('keys from the interface override the environment, are never returned and can be removed', () => {
  assert.equal(setupStatus().jev.configured, false)
  const saved = saveSettings({ TYPESAFE_API_KEY: ' ui-jev-1234 ', NEURALDOC_DRAFT_PROVIDER: 'openai', OPENAI_API_KEY: 'ui-openai-9876' })
  assert.deepEqual(saved.secrets.TYPESAFE_API_KEY, { set: true, source: 'ui', hint: '…1234' })
  assert.ok(!JSON.stringify(saved).includes('ui-jev') && !JSON.stringify(saved).includes('ui-openai'))
  assert.equal(runtimeEnv().TYPESAFE_API_KEY, 'ui-jev-1234')
  assert.equal(runtimeEnv().OPENAI_API_KEY, 'ui-openai-9876')
  assert.equal(setupStatus().jev.configured, true)
  assert.equal(setupStatus().drafting.configured, true)
  saveSettings({ OPENAI_API_KEY: null })
  assert.equal(runtimeEnv().OPENAI_API_KEY, 'env-openai')
  assert.deepEqual(publicSettings().secrets.OPENAI_API_KEY, { set: true, source: 'env' })
  assert.equal(runtimeEnv().TYPESAFE_API_KEY, 'ui-jev-1234')
})
test('profile names the reviewer; the MCP token is random per installation and stable', () => {
  assert.equal(reviewer(), 'Lokaler Nutzer')
  saveSettings({ NEURALDOC_USER_NAME: 'Erika Muster', NEURALDOC_USER_COMPANY: 'Beispiel GmbH' })
  assert.deepEqual(profile(), { name: 'Erika Muster', company: 'Beispiel GmbH', role: '' })
  assert.equal(reviewer(), 'Erika Muster')
  const token = installToken()
  assert.match(token, /^nd_[\w-]{24}$/)
  assert.equal(installToken(), token)
})
test('unknown fields and multi-line values are refused', () => {
  assert.throws(() => saveSettings({ PATH: '/tmp' }), /Unbekanntes Feld/)
  assert.throws(() => saveSettings({ OPENAI_API_KEY: 'a\nb' }), /Ungültiger Wert/)
})
