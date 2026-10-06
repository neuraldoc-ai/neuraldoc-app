// Approved sections as GitHub pull requests, against an in-memory GitHub (no request leaves the process).
import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-github-'))
process.env.NEURALDOC_STATE_DIR = root
for (const k of Object.keys(process.env)) if (k.startsWith('NEURALDOC_GITHUB_') || k === 'NEURALDOC_GIT_TOKEN') delete process.env[k]
const { applyItems, appJwt, appManifest, githubConfig, githubStatus, parseRepo, planPullRequests, proposalLinks, MARKER, resetGitHub, setProjectTarget, syncGitHub, completeAppManifest, cloneToken } = await import('./github.mjs')
const { saveSettings, resetSettings } = await import('./settings.mjs')
after(() => fs.rmSync(root, { recursive: true, force: true }))

/** A small GitHub: one repository with refs, commits, trees as path → content, and pull requests. */
function fakeGitHub({ files = {}, login = 'erika' } = {}) {
  const sha = (value) => crypto.createHash('sha1').update(JSON.stringify(value) + Math.random()).digest('hex')
  const trees = new Map(), commits = new Map(), refs = new Map(), pulls = [], calls = []
  const tree0 = sha('tree'); trees.set(tree0, { ...files })
  const c0 = sha('c0'); commits.set(c0, { sha: c0, tree: { sha: tree0 }, message: 'init', parents: [] })
  refs.set('main', c0)
  const gh = {
    calls, refs, commits, trees, pulls,
    head: (branch) => trees.get(commits.get(refs.get(branch)).tree.sha),
    /** A person pushes to the branch, or merges into main. */
    commit(branch, change, message = 'fix typo') {
      const parent = commits.get(refs.get(branch)), t = sha('t'); trees.set(t, { ...trees.get(parent.tree.sha), ...change })
      const c = sha('c'); commits.set(c, { sha: c, tree: { sha: t }, message, parents: [parent.sha] }); refs.set(branch, c)
    },
    merge(number) { const pr = pulls.find((p) => p.number === number); gh.commit('main', gh.head(pr.head.ref), 'Merge'); Object.assign(pr, { state: 'closed', merged_at: '2026-10-06T10:00:00Z' }) },
  }
  gh.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET', u = new URL(url), p = decodeURIComponent(u.pathname), body = init.body ? JSON.parse(init.body) : null
    calls.push(`${method} ${p}`)
    const json = (status, value) => new Response(value === undefined ? '' : JSON.stringify(value), { status })
    if (init.headers?.Authorization !== 'Bearer test-token') return json(401, { message: 'Bad credentials' })
    let m
    if (p === '/user') return json(200, { login })
    if (p === '/repos/acme/shop' && method === 'GET') return json(200, { full_name: 'acme/shop', default_branch: 'main', permissions: { push: true } })
    if ((m = p.match(/^\/repos\/acme\/shop\/git\/ref\/heads\/(.+)$/))) return refs.has(m[1]) ? json(200, { object: { sha: refs.get(m[1]) } }) : json(404, { message: 'Not Found' })
    if ((m = p.match(/^\/repos\/acme\/shop\/git\/refs\/heads\/(.+)$/))) {
      if (method === 'DELETE') { refs.delete(m[1]); return json(204) }
      refs.set(m[1], body.sha); return json(200, { object: { sha: body.sha } })
    }
    if (p === '/repos/acme/shop/git/refs') { if (refs.has(body.ref.slice(11))) return json(422, { message: 'Reference already exists' }); refs.set(body.ref.slice(11), body.sha); return json(201, {}) }
    if ((m = p.match(/^\/repos\/acme\/shop\/git\/commits\/(\w+)$/))) return commits.has(m[1]) ? json(200, commits.get(m[1])) : json(404, {})
    if (p === '/repos/acme/shop/git/commits') { const c = sha('c'); commits.set(c, { sha: c, tree: { sha: body.tree }, message: body.message, parents: body.parents, author: body.author }); return json(201, commits.get(c)) }
    if (p === '/repos/acme/shop/git/trees') { const t = sha('t'); trees.set(t, { ...trees.get(body.base_tree), ...Object.fromEntries(body.tree.map((e) => [e.path, e.content])) }); return json(201, { sha: t }) }
    if ((m = p.match(/^\/repos\/acme\/shop\/contents\/(.+)$/))) {
      const content = trees.get(commits.get(refs.get(u.searchParams.get('ref'))).tree.sha)[m[1]]
      return content === undefined ? json(404, { message: 'Not Found' }) : json(200, { type: 'file', size: content.length, sha: 'x', content: Buffer.from(content).toString('base64') })
    }
    if (p === '/repos/acme/shop/pulls' && method === 'GET') return json(200, pulls.filter((x) => `acme:${x.head.ref}` === u.searchParams.get('head')).reverse())
    if (p === '/repos/acme/shop/pulls' && method === 'POST') { const pr = { number: pulls.length + 1, state: 'open', merged_at: null, html_url: `https://github.com/acme/shop/pull/${pulls.length + 1}`, head: { ref: body.head }, base: { ref: body.base }, title: body.title, body: body.body, draft: body.draft, user: { login }, labels: [] }; pulls.push(pr); return json(201, pr) }
    if ((m = p.match(/^\/repos\/acme\/shop\/pulls\/(\d+)$/))) {
      const pr = pulls.find((x) => x.number === Number(m[1]))
      if (method === 'PATCH') Object.assign(pr, body)
      return json(200, pr)
    }
    if ((m = p.match(/^\/repos\/acme\/shop\/issues\/(\d+)\/labels$/))) { pulls.find((x) => x.number === Number(m[1])).labels = body.labels; return json(200, []) }
    if (/\/issues\/\d+\/comments$|\/requested_reviewers$/.test(p)) return json(201, {})
    return json(404, { message: `no route ${method} ${p}` })
  }
  return gh
}

const README = '# Shop\n\n## Rabatt\n\nDer Rabatt beträgt 10 Prozent.\n\n## Export\n\nDer Export nutzt das Datum der Bestellung.\n'
/** A project as projects.mjs stores it, with two corrected README sections and one PDF section. */
function project(decisions = {}) {
  const sections = [
    { id: 'doc-a', source: 'src-readme', title: 'Shop › Rabatt', text: '## Rabatt\n\nDer Rabatt beträgt 10 Prozent.\n' },
    { id: 'doc-b', source: 'src-readme', title: 'Shop › Export', text: '## Export\n\nDer Export nutzt das Datum der Bestellung.\n' },
    { id: 'doc-c', source: 'src-pdf', title: 'Handbuch › Seite 1', text: 'Rabatt 10 Prozent' },
  ]
  return {
    id: 'a'.repeat(20), name: 'Shop', sources: { repo: { label: 'shop', source: 'url', url: 'https://github.com/acme/shop' }, docs: null },
    docSources: [{ id: 'src-readme', path: 'repository/README.md', origin: 'repo', format: 'md', binary: false }, { id: 'src-pdf', path: 'repository/docs/handbuch.pdf', origin: 'repo', format: 'pdf', binary: true }],
    docFiles: sections,
    dataset: { proposals: sections.map((s) => ({ id: `p-${s.id}`, section: s.id, doc: s.source, title: s.title })) },
    generated: {
      'p-doc-a': { text: '## Rabatt\n\nDer Rabatt beträgt 15 Prozent ab 1.000 EUR.\n', why: 'Staffel geändert', generation: { status: 'draft', findings: [{ kind: 'contradicts', explanation: 'Der Code gibt 15 % ab 1.000 EUR.', evidence: [{ source: 'src/pricing.ts:1-3' }] }] } },
      'p-doc-b': { text: '## Export\n\nDer Export nutzt das Erstellungsdatum des Berichts.\n', why: 'Feld umbenannt', generation: { status: 'draft', findings: [] } },
      'p-doc-c': { text: 'Rabatt 15 Prozent', why: '', generation: { status: 'draft', findings: [] } },
    },
    decisions,
  }
}
const approved = (...ids) => Object.fromEntries(ids.map((id) => [`p-${id}`, { state: 'uebernommen', at: '2026-10-06T09:00:00Z', by: 'Erika Muster' }]))

beforeEach(() => { resetGitHub(); resetSettings() })

test('without a connection nothing is planned against GitHub; a token or an app configures it', () => {
  assert.equal(githubConfig().auth, null)
  saveSettings({ NEURALDOC_GIT_TOKEN: 'test-token' })
  assert.equal(githubConfig().auth, 'token')
  assert.equal(githubConfig().mode, 'auto')
  assert.deepEqual(githubConfig().labels, ['documentation', 'neuraldoc'])
  assert.deepEqual(parseRepo('https://github.com/acme/shop.git'), { owner: 'acme', repo: 'shop' })
  assert.deepEqual(parseRepo('acme/shop'), { owner: 'acme', repo: 'shop' })
  assert.equal(parseRepo('https://gitlab.com/acme/shop'), null)
})

test('only approved text sections go into a pull request; PDF and missing repositories are listed with a reason', () => {
  saveSettings({ NEURALDOC_GIT_TOKEN: 'test-token' })
  const plan = planPullRequests(project(approved('doc-a', 'doc-c')))
  assert.equal(plan.groups.length, 1)
  assert.equal(plan.groups[0].branch, 'neuraldoc/docs')
  assert.deepEqual(plan.groups[0].items.map((i) => i.path), ['README.md'])
  assert.match(plan.skipped[0].reason, /PDF-Dateien/)
  const uploaded = { ...project(approved('doc-a')), sources: { repo: { label: 'shop', source: 'upload' }, docs: null } }
  assert.match(planPullRequests(uploaded).skipped[0].reason, /kein GitHub-Repository/)
  setProjectTarget(uploaded, { origin: 'repo', repo: 'acme/shop' })
  assert.equal(planPullRequests(uploaded).groups[0].repo, 'shop')
  saveSettings({ NEURALDOC_GITHUB_PR_GROUP: 'document' })
  assert.equal(planPullRequests(project(approved('doc-a'))).groups[0].branch, 'neuraldoc/docs-readme')
})

test('sections are put into the file as it is now, keeping CRLF; a section changed there is a conflict', () => {
  const items = [{ find: 'A\nB\n', content: 'A\nC\n' }, { find: 'gone\n', content: 'new\n' }]
  const result = applyItems('# T\r\n\r\nA\r\nB\r\n', items)
  assert.equal(result.text, '# T\r\n\r\nA\r\nC\r\n')
  assert.equal(result.applied.length, 1)
  assert.match(result.conflicts[0].reason, /inzwischen geändert/)
  assert.equal(applyItems('A\nC\n', [items[0]]).applied[0].already, true)
})

test('approvals open one pull request by neuraldoc; withdrawals rebuild it; the last one closes it', async () => {
  saveSettings({ NEURALDOC_GIT_TOKEN: 'test-token', NEURALDOC_GITHUB_REVIEWERS: 'max' })
  const gh = fakeGitHub({ files: { 'README.md': README } })
  let p = project(approved('doc-a', 'doc-b', 'doc-c'))
  const status = await syncGitHub(() => p, { fetchImpl: gh.fetch })
  assert.equal(gh.pulls.length, 1)
  const pr = gh.pulls[0]
  assert.equal(pr.head.ref, 'neuraldoc/docs')
  assert.equal(pr.base.ref, 'main')
  assert.deepEqual(pr.labels, ['documentation', 'neuraldoc'])
  assert.match(pr.title, /^docs\(README\.md\)/)
  assert.match(pr.body, /Erika Muster/)
  assert.match(pr.body, /src\/pricing\.ts:1-3/)
  assert.match(pr.body, /handbuch\.pdf.*PDF-Dateien/)
  assert.equal(gh.head('neuraldoc/docs')['README.md'], '# Shop\n\n## Rabatt\n\nDer Rabatt beträgt 15 Prozent ab 1.000 EUR.\n\n## Export\n\nDer Export nutzt das Erstellungsdatum des Berichts.\n')
  assert.equal(gh.head('main')['README.md'], README, 'the base branch is never written')
  const commit = gh.commits.get(gh.refs.get('neuraldoc/docs'))
  assert.ok(commit.message.includes(MARKER))
  assert.equal(commit.author.name, 'neuraldoc')
  assert.equal(status.pullRequests[0].state, 'open')
  assert.deepEqual(status.pullRequests[0].proposals, ['p-doc-a', 'p-doc-b'])
  assert.equal(proposalLinks(p)['p-doc-a'].number, 1)

  // Unchanged approvals: no new commit.
  const before = gh.refs.get('neuraldoc/docs')
  await syncGitHub(() => p, { fetchImpl: gh.fetch })
  assert.equal(gh.refs.get('neuraldoc/docs'), before)

  // One approval withdrawn: the branch is rebuilt without it, the same pull request stays.
  p = project(approved('doc-a'))
  await syncGitHub(() => p, { fetchImpl: gh.fetch })
  assert.equal(gh.pulls.length, 1)
  assert.match(gh.head('neuraldoc/docs')['README.md'], /Datum der Bestellung/)
  assert.match(gh.pulls[0].title, /^docs\(README\.md\)/)

  // Nothing approved any more: neuraldoc closes its pull request and deletes its branch.
  p = project({})
  const closed = await syncGitHub(() => p, { fetchImpl: gh.fetch })
  assert.equal(gh.pulls[0].state, 'closed')
  assert.ok(!gh.refs.has('neuraldoc/docs'))
  assert.equal(closed.pullRequests[0].state, 'closed')
})

test('commits of a person on the branch stop neuraldoc until it is told to rebuild it', async () => {
  saveSettings({ NEURALDOC_GIT_TOKEN: 'test-token' })
  const gh = fakeGitHub({ files: { 'README.md': README } })
  let p = project(approved('doc-a'))
  await syncGitHub(() => p, { fetchImpl: gh.fetch })
  gh.commit('neuraldoc/docs', { 'README.md': 'by hand' })
  p = project(approved('doc-a', 'doc-b'))
  const status = await syncGitHub(() => p, { fetchImpl: gh.fetch })
  assert.equal(status.pullRequests[0].state, 'edited')
  assert.equal(gh.head('neuraldoc/docs')['README.md'], 'by hand')
  await syncGitHub(() => p, { fetchImpl: gh.fetch, force: true })
  assert.match(gh.head('neuraldoc/docs')['README.md'], /Erstellungsdatum/)
})

test('a merged pull request publishes its sections; the next approval opens a new one', async () => {
  saveSettings({ NEURALDOC_GIT_TOKEN: 'test-token' })
  const gh = fakeGitHub({ files: { 'README.md': README } })
  let p = project(approved('doc-a'))
  await syncGitHub(() => p, { fetchImpl: gh.fetch })
  gh.merge(1)
  p = project(approved('doc-a', 'doc-b'))
  const status = await syncGitHub(() => p, { fetchImpl: gh.fetch })
  assert.equal(status.published['p-doc-a'].number, 1)
  assert.equal(gh.pulls.length, 2)
  assert.deepEqual(status.pullRequests.find((r) => r.state === 'open').proposals, ['p-doc-b'])
  assert.equal(proposalLinks(p)['p-doc-a'].state, 'merged')
  assert.match(gh.head('neuraldoc/docs')['README.md'], /15 Prozent.*\n[\s\S]*Erstellungsdatum/)
})

test('a pull request closed on GitHub stays closed while the approvals are the same', async () => {
  saveSettings({ NEURALDOC_GIT_TOKEN: 'test-token' })
  const gh = fakeGitHub({ files: { 'README.md': README } })
  const p = project(approved('doc-a'))
  await syncGitHub(() => p, { fetchImpl: gh.fetch })
  gh.pulls[0].state = 'closed'
  const status = await syncGitHub(() => p, { fetchImpl: gh.fetch })
  assert.equal(status.pullRequests[0].state, 'closed')
  assert.equal(gh.pulls.length, 1)
  assert.equal(gh.pulls[0].state, 'closed')
})

test('a wrong token is reported per pull request, not thrown', async () => {
  saveSettings({ NEURALDOC_GIT_TOKEN: 'wrong' })
  const gh = fakeGitHub({ files: { 'README.md': README } })
  const status = await syncGitHub(() => project(approved('doc-a')), { fetchImpl: gh.fetch })
  assert.match(status.pullRequests[0].error, /Anmeldung/)
  assert.equal((await githubStatus(project(approved('doc-a')))).pending[0].inPullRequest, false)
})

test('GitHub App: JWT, manifest with only the needed permissions, conversion stores id and key', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
  const [h, b, s] = appJwt(42, privateKey, 1000).split('.')
  assert.deepEqual(JSON.parse(Buffer.from(b, 'base64url')), { iat: 940, exp: 1540, iss: '42' })
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${b}`), publicKey, Buffer.from(s, 'base64url')))
  const form = appManifest({ origin: 'http://localhost:8080', name: 'neuraldoc-acme', org: 'acme' })
  assert.match(form.action, /^https:\/\/github\.com\/organizations\/acme\/settings\/apps\/new\?state=\w+$/)
  const manifest = JSON.parse(form.manifest)
  assert.deepEqual(manifest.default_permissions, { contents: 'write', pull_requests: 'write', metadata: 'read' })
  assert.equal(manifest.redirect_url, 'http://localhost:8080/api/mcp/github/app/callback')
  const state = form.action.split('state=')[1]
  await assert.rejects(completeAppManifest({ code: 'abc', state: 'forged' }), /abgelaufen/)
  const app = await completeAppManifest({ code: 'abc', state }, { fetchImpl: async (url) => { assert.equal(url, 'https://api.github.com/app-manifests/abc/conversions'); return new Response(JSON.stringify({ id: 42, slug: 'neuraldoc-acme', pem: privateKey }), { status: 201 }) } })
  assert.equal(app.installUrl, 'https://github.com/apps/neuraldoc-acme/installations/new')
  assert.equal(githubConfig().auth, 'app')
  assert.equal(githubConfig().key, privateKey.trim())
  await assert.rejects(completeAppManifest({ code: 'abc', state }), /abgelaufen/, 'a state works once')
})

test('the clone token is only given for the configured GitHub host', async () => {
  saveSettings({ NEURALDOC_GIT_TOKEN: 'test-token' })
  assert.equal(await cloneToken('https://github.com/acme/shop.git'), 'test-token')
  assert.equal(await cloneToken('https://gitlab.com/acme/shop.git'), null)
})

test('a Confluence page in the documentation repository gets its changed words in the XML, not Markdown', async () => {
  saveSettings({ NEURALDOC_GIT_TOKEN: 'test-token' })
  const xml = '<!-- MOBIQFB / Parameter (Version 2) -->\n<table><tbody><tr><td><p>LIEF_VORLAUF_TAGE</p></td><td><p>5 Tage</p></td></tr></tbody></table>\n'
  const gh = fakeGitHub({ files: { 'confluence/storage/p.xml': xml } })
  const section = { id: 'doc-x', source: 'src-xml', title: 'Parameter', text: '# Parameter\n\n| LIEF_VORLAUF_TAGE | 5 Tage |' }
  const p = {
    id: 'b'.repeat(20), name: 'MOBIQ', sources: { repo: { label: 'code', source: 'upload' }, docs: { label: 'docs', source: 'url', url: 'https://github.com/acme/shop' } },
    docSources: [{ id: 'src-xml', path: 'dokumentation/confluence/storage/p.xml', origin: 'docs', format: 'xml', binary: true }],
    docFiles: [section], dataset: { proposals: [{ id: 'p-x', section: 'doc-x', doc: 'src-xml', title: 'Parameter' }] },
    generated: { 'p-x': { text: '# Parameter\n\n| LIEF_VORLAUF_TAGE | 3 Tage |', why: 'Standard im Code: 3', generation: { status: 'draft', findings: [] } } },
    decisions: { 'p-x': { state: 'uebernommen', at: '2026-10-06T09:00:00Z', by: 'Erika Muster' } },
  }
  const status = await syncGitHub(() => p, { fetchImpl: gh.fetch })
  assert.equal(status.pullRequests[0].state, 'open')
  assert.equal(gh.head('neuraldoc/docs')['confluence/storage/p.xml'], xml.replace('5 Tage', '3 Tage'))
  assert.match(gh.pulls[0].title, /confluence\/storage\/p\.xml/)
})
