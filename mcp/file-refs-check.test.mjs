// The initial check with links and file names: an upload sends its paths, a dead link in a list of links (a section
// the model never sees) becomes a proposal, and Jev is not asked about it. LLM and Jev are mocked.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync, strToU8 } from '../frontend/server-deps.mjs'

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-file-refs-')))
process.env.NEURALDOC_STATE_DIR = path.join(root, 'state')
process.env.TYPESAFE_API_KEY = 'test-only-never-sent'
process.env.NEURALDOC_DRAFT_PROVIDER = 'local'
process.env.NEURALDOC_LLM_MODEL = 'mock-model'
delete process.env.NEURALDOC_MODE
const projects = await import('./projects.mjs')
const { createJevClient } = await import('./semantic-mapping.mjs')
after(() => fs.rmSync(root, { recursive: true, force: true }))

const README = [
  '# Shop', '',
  'Der Shop berechnet Rabatte und exportiert Berichte für die Buchhaltung jeden Abend.', '',
  '## Weitere Dokumente', '',
  '- [CONTRIBUTING.md](CONTRIBUTING.md): Mitarbeit',
  '- [MAPPING_REPORT.md](MAPPING_REPORT.md): Bericht',
  '- [Logo](docs/logo.png): Bildmarke',
  '',
].join('\n')
const files = { 'src/shop.ts': 'export const shop = () => 1\n', 'README.md': README, 'CONTRIBUTING.md': '# Mitarbeit\n\nBitte Tests schreiben.\n' }
// The browser sends every path of the folder, also files it does not upload (the logo).
const tree = { paths: [...Object.keys(files), 'docs/logo.png'], gitignore: {} }
const upload = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify({ repoName: 'shop', repoTree: tree })), ...Object.fromEntries(Object.entries(files).map(([f, t]) => [`repo/${f}`, strToU8(t)])) }))

const ok = { status: 'ok', findings: [], question: '', summary: 'Stimmt.' }
const llm = async (_url, request) => {
  const body = JSON.parse(request.body), list = body.messages[0].content.startsWith('You check whether one document')
  const value = list ? { summary: '', entries: [] } : ok
  return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
}
const noJev = (options) => createJevClient({ ...options, fetchImpl: async () => assert.fail('Jev is never asked about a file the repository does not have') })

test('a dead link in a list of links becomes a proposal that removes the entry, without Jev', async () => {
  await projects.addProject(upload)
  assert.deepEqual(projects.activeProject().trees.repo.paths.sort(), tree.paths.sort())
  const payload = await projects.checkProject({ fetchImpl: llm, createClient: noJev })
  const p = projects.activeProject()
  assert.equal(payload.dataset.proposals.length, 1)
  const proposal = payload.dataset.proposals[0], g = p.generated[proposal.id]
  assert.equal(g.generation.status, 'draft')
  assert.deepEqual(g.generation.findings.map((f) => [f.kind, f.absent[0], f.files]), [['removed', 'MAPPING_REPORT.md', true]])
  assert.ok(!g.text.includes('MAPPING_REPORT') && g.text.includes('CONTRIBUTING.md') && g.text.includes('docs/logo.png'))
})
