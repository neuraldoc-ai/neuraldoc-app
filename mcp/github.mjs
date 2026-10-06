// Approved sections as GitHub pull requests, the way Dependabot or Renovate open them: neuraldoc owns a branch per
// repository (or per document), rebuilds it from the base branch with every approval or withdrawal and keeps one open
// pull request on it. Commits go through the Git Data API, so nothing is cloned and the base branch is never written.
// Auth: a GitHub App (pull requests by "<app>[bot]", created from a manifest in Einstellungen) or a personal token.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DraftError } from './drafting.mjs'
import { log, logError } from './log.mjs'
import { reviewer, runtimeEnv, saveSettings } from './settings.mjs'
import { applyStorage } from './confluence-storage.mjs'

const stateDir = () => process.env.NEURALDOC_STATE_DIR ? path.resolve(process.env.NEURALDOC_STATE_DIR) : fileURLToPath(new URL('./state/', import.meta.url))
const stateFile = () => path.join(stateDir(), 'github.json')
// records: "owner/repo#branch" → the pull request neuraldoc keeps there; published: project → proposal → merged PR; targets: project → repository overrides
const readState = () => { try { return { records: {}, published: {}, targets: {}, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) } } catch { return { records: {}, published: {}, targets: {} } } }
const writeState = (state) => { fs.mkdirSync(stateDir(), { recursive: true }); fs.writeFileSync(stateFile() + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(stateFile() + '.tmp', stateFile()) }
const updateState = (change) => { const state = readState(); const result = change(state); writeState(state); return result }
export const resetGitHub = () => fs.rmSync(stateFile(), { force: true })

/** The marker in every commit neuraldoc writes: a branch whose newest commit lacks it was changed by a person. */
export const MARKER = 'Generated-by: neuraldoc'
const MODES = ['auto', 'manual', 'off'], GROUPS = ['repository', 'document']

/** The integration as configured: auth, when pull requests are made and how they look. */
export function githubConfig(env = runtimeEnv()) {
  const appId = env.NEURALDOC_GITHUB_APP_ID?.trim(), key = env.NEURALDOC_GITHUB_APP_PRIVATE_KEY?.trim().replace(/\\n/g, '\n'), token = env.NEURALDOC_GIT_TOKEN?.trim()
  const api = (env.NEURALDOC_GITHUB_API_URL?.trim() || 'https://api.github.com').replace(/\/+$/, '')
  const list = (value) => String(value || '').split(',').map((x) => x.trim()).filter(Boolean)
  return {
    api, host: api === 'https://api.github.com' ? 'github.com' : new URL(api).host,
    auth: appId && key ? 'app' : token ? 'token' : null, appId, key, token, appSlug: env.NEURALDOC_GITHUB_APP_SLUG?.trim() || null,
    mode: MODES.includes(env.NEURALDOC_GITHUB_PR) ? env.NEURALDOC_GITHUB_PR : 'auto',
    group: GROUPS.includes(env.NEURALDOC_GITHUB_PR_GROUP) ? env.NEURALDOC_GITHUB_PR_GROUP : 'repository',
    prefix: (env.NEURALDOC_GITHUB_BRANCH_PREFIX?.trim() || 'neuraldoc/').replace(/^\/+/, ''),
    labels: list(env.NEURALDOC_GITHUB_LABELS ?? 'documentation,neuraldoc'),
    reviewers: list(env.NEURALDOC_GITHUB_REVIEWERS),
    draft: env.NEURALDOC_GITHUB_DRAFT_PR === 'true',
  }
}

/* ---------- API client ---------- */

const b64url = (value) => Buffer.from(value).toString('base64url')
/** A GitHub App's JWT (RS256, ten minutes at most; issued a minute early against clock drift). */
export function appJwt(appId, key, now = Math.floor(Date.now() / 1000)) {
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }))}`
  return `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url')}`
}

export class GitHubError extends DraftError {
  constructor(message, status, httpStatus) { super(message, status); this.httpStatus = httpStatus }
}

const installationTokens = new Map() // owner/repo → { token, expires }

/** A client for one repository: request() with the right token, errors as German messages. */
export function client(config, { owner, repo }, fetchImpl = fetch) {
  async function call(method, url, body, auth) {
    const response = await fetchImpl(url.startsWith('http') ? url : `${config.api}${url}`, {
      method, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'neuraldoc', ...(auth ? { Authorization: auth } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).catch((error) => { throw new GitHubError(`GitHub ist nicht erreichbar (${error.cause?.code || error.message}).`, 502) })
    const text = await response.text(), data = text ? (() => { try { return JSON.parse(text) } catch { return { message: text.slice(0, 200) } } })() : null
    if (!response.ok) {
      const detail = data?.message || `HTTP ${response.status}`
      const message = response.status === 401 ? 'GitHub lehnt die Anmeldung ab. Token oder App-Schlüssel prüfen.'
        : response.status === 403 && /rate limit/i.test(detail) ? 'GitHub-Ratenlimit erreicht. In ein paar Minuten erneut versuchen.'
          : response.status === 403 ? `Keine Berechtigung für ${owner}/${repo} (${detail}). Die App bzw. der Token braucht Schreibrechte auf Contents und Pull requests.`
            : response.status === 404 ? `${owner}/${repo}: nicht gefunden oder kein Zugriff (${method} ${url.replace(config.api, '')}).`
              : `GitHub meldet ${response.status}: ${detail}`
      throw new GitHubError(message, response.status >= 500 ? 502 : 400, response.status)
    }
    return data
  }
  async function authorization() {
    if (config.auth === 'token') return `Bearer ${config.token}`
    if (config.auth !== 'app') throw new GitHubError('GitHub ist nicht verbunden. Unter Einstellungen eine GitHub-App oder einen Token hinterlegen.', 503)
    return `Bearer ${await appToken()}`
  }
  /** The app's installation token for this repository, cached until five minutes before it expires. */
  async function appToken() {
    const cacheKey = `${config.appId}:${owner}/${repo}`.toLowerCase(), cached = installationTokens.get(cacheKey)
    if (cached && cached.expires > Date.now() + 5 * 60_000) return cached.token
    let jwt
    try { jwt = appJwt(config.appId, config.key) } catch { throw new GitHubError('Der private Schlüssel der GitHub-App ist ungültig (PEM erwartet).', 400) }
    let installation
    try { installation = await call('GET', `/repos/${owner}/${repo}/installation`, null, `Bearer ${jwt}`) } catch (error) {
      if (error.httpStatus === 404) throw new GitHubError(`Die GitHub-App ist für ${owner}/${repo} nicht installiert.${config.appSlug ? ` Installieren: https://${config.host}/apps/${config.appSlug}/installations/new` : ''}`, 400, 404)
      throw error
    }
    const access = await call('POST', `/app/installations/${installation.id}/access_tokens`, { repositories: [repo] }, `Bearer ${jwt}`)
    installationTokens.set(cacheKey, { token: access.token, expires: Date.parse(access.expires_at) })
    return access.token
  }
  return { request: async (method, url, body) => call(method, url, body, await authorization()), token: async () => (await authorization()).slice(7), owner, repo }
}

/** A token for cloning a private repository by URL, if one is configured (the app's installation token or the personal one). */
export async function cloneToken(url, { fetchImpl } = {}) {
  const config = githubConfig(), match = String(url).match(/^https:\/\/([^/]+)\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (!match || match[1].toLowerCase() !== config.host) return null
  if (config.auth !== 'app') return config.token || null
  try { return await client(config, { owner: match[2], repo: match[3] }, fetchImpl).token() } catch { return config.token || null }
}

/* ---------- Which repository a document belongs to ---------- */

/** owner/repo from "owner/repo" or a GitHub URL of the configured host. */
export function parseRepo(value, host = 'github.com') {
  const text = String(value || '').trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const url = text.match(/^https?:\/\/([^/]+)\/([\w.-]+)\/([\w.-]+)$/i)
  if (url) return url[1].toLowerCase() === host.toLowerCase() || url[1].toLowerCase() === 'www.github.com' && host === 'github.com' ? { owner: url[2], repo: url[3] } : null
  const short = text.match(/^([\w.-]+)\/([\w.-]+)$/)
  return short ? { owner: short[1], repo: short[2] } : null
}

/** The repository of each origin (repo, docs): set by hand for the project, or the URL it was cloned from. */
export function projectTargets(p, config = githubConfig(), state = readState()) {
  const manual = state.targets[p.id] ?? {}
  return Object.fromEntries(['repo', 'docs'].filter((origin) => p.sources?.[origin]).map((origin) => {
    const own = manual[origin], source = p.sources?.[origin]
    const fromImport = source?.url ? parseRepo(source.url, config.host) : null
    const target = own?.repo ? { ...parseRepo(own.repo, config.host), base: own.base || null, from: 'manual' } : fromImport ? { ...fromImport, base: own?.base || null, from: 'import' } : null
    return [origin, target]
  }))
}

export function setProjectTarget(p, { origin, repo, base }) {
  if (!['repo', 'docs'].includes(origin)) throw new Error('origin muss repo oder docs sein.')
  const config = githubConfig()
  if (repo && !parseRepo(repo, config.host)) throw new Error(`Bitte das Repository als organisation/repository oder als URL von ${config.host} angeben.`)
  if (base && !/^[\w./-]{1,200}$/.test(base)) throw new Error('Ungültiger Branch-Name.')
  updateState((state) => {
    const targets = state.targets[p.id] ??= {}
    if (!repo && !base) delete targets[origin]
    else targets[origin] = { repo: repo ? String(repo).trim() : targets[origin]?.repo ?? null, base: base ? String(base).trim() : null }
  })
  return projectTargets(p, config)
}

/* ---------- What goes into which pull request ---------- */

const repoPath = (source) => source.path.replace(/^(repository|dokumentation)\//, '')
const slug = (value) => value.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'doku'

/**
 * Approved sections that are not yet merged, grouped into the pull requests they belong to; what cannot go into one
 * (PDF and Office files, no repository) is listed with the reason.
 */
export function planPullRequests(p, config = githubConfig(), state = readState()) {
  const targets = projectTargets(p, config, state), published = state.published[p.id] ?? {}
  const groups = new Map(), skipped = []
  for (const proposal of p.dataset?.proposals ?? []) {
    const decision = p.decisions?.[proposal.id]
    if (decision?.state !== 'uebernommen' || published[proposal.id]) continue
    const section = p.docFiles.find((d) => d.id === (proposal.section ?? proposal.doc)), source = section && p.docSources.find((s) => s.id === section.source)
    if (!section || !source) continue
    const item = { proposal: proposal.id, title: section.title, path: repoPath(source), source: source.id, find: section.text, content: decision.edited?.text ?? p.generated[proposal.id]?.text, edited: !!decision.edited, by: decision.by, at: decision.at, why: p.generated[proposal.id]?.why ?? '', findings: p.generated[proposal.id]?.generation?.findings ?? [] }
    const target = targets[source.origin]
    // Confluence pages in storage format are XML in the repository: changed words go back into their text nodes.
    if (source.binary && source.format !== 'xml') { skipped.push({ ...item, reason: `${source.format.toUpperCase()}-Dateien lassen sich nicht per Pull-Request ändern. Bitte über „Freigaben exportieren“ übertragen.` }); continue }
    if (!target?.owner) { skipped.push({ ...item, reason: source.origin === 'docs' ? 'Für die Dokumentation ist kein GitHub-Repository hinterlegt.' : 'Für das Repository ist kein GitHub-Repository hinterlegt.' }); continue }
    if (typeof item.content !== 'string') continue
    const branch = config.group === 'document' ? `${config.prefix}docs-${slug(item.path)}` : `${config.prefix}docs`
    const key = `${target.owner}/${target.repo}#${branch}`.toLowerCase()
    if (!groups.has(key)) groups.set(key, { key, owner: target.owner, repo: target.repo, base: target.base, branch, items: [] })
    groups.get(key).items.push(item)
  }
  return { groups: [...groups.values()], skipped, targets }
}

/** Puts the approved sections into the file as it is on the base branch now; a section changed there meanwhile is a conflict. */
/** Puts the approved sections into a file as it is on the base branch; Confluence storage XML gets its changed words. */
export function applyFile(file, raw, items) {
  if (!/\.xml$/i.test(file)) return applyItems(raw, items)
  const { text, results } = applyStorage(raw, items)
  const why = (l) => `${l.old ? `„${l.old}“` : ''}${l.old && l.new ? ' → ' : ''}${l.new ? `„${l.new}“` : ''} (${l.why})`
  return {
    text,
    applied: results.filter((r) => r.state !== 'conflict').map((r) => ({ ...r.item, ...(r.state === 'partial' ? { partial: r.left.map(why) } : {}) })),
    conflicts: results.filter((r) => r.state === 'conflict').map((r) => ({ ...r.item, reason: `Auf der Confluence-Seite nicht einsetzbar: ${r.left.map(why).join('; ')}` })),
  }
}

export function applyItems(raw, items) {
  const bom = raw.startsWith('﻿'), crlf = raw.includes('\r\n'), lf = (s) => s.replace(/\r\n/g, '\n')
  let text = lf(bom ? raw.slice(1) : raw)
  const applied = [], conflicts = []
  for (const item of items) {
    const find = lf(item.find), content = lf(item.content), at = text.indexOf(find)
    if (at >= 0) { text = text.slice(0, at) + content + text.slice(at + find.length); applied.push(item) }
    else if (text.includes(content)) applied.push({ ...item, already: true })
    else conflicts.push({ ...item, reason: 'Der Abschnitt wurde im Repository inzwischen geändert. Bitte neu importieren und erneut prüfen.' })
  }
  return { text: (bom ? '﻿' : '') + (crlf ? text.replace(/\n/g, '\r\n') : text), applied, conflicts }
}

/* ---------- Texts of commit and pull request ---------- */

const KIND = { contradicts: 'stimmt nicht mehr', removed: 'gibt es nicht mehr', missing: 'fehlt' }
const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
const day = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : ''

export function pullRequestTitle(group, config) {
  const files = [...new Set(group.items.map((i) => i.path))]
  return config.group === 'document' || files.length === 1 ? `docs(${files[0]}): an den aktuellen Code angepasst` : `docs: Dokumentation an den aktuellen Code angepasst (${group.items.length} ${group.items.length === 1 ? 'Abschnitt' : 'Abschnitte'})`
}

export function commitMessage(group, applied, config, projectName) {
  const lines = applied.map((i) => `- ${i.path}: ${i.title}${i.edited ? ' (angepasst)' : ''}`)
  return [pullRequestTitle({ ...group, items: applied }, config), '', `Von neuraldoc geprüft und in „${projectName}“ freigegeben:`, ...lines, '', MARKER].join('\n')
}

export function pullRequestBody({ projectName, group, applied, conflicts, skipped }) {
  const rows = applied.map((i) => `| \`${cell(i.path)}\` | ${cell(i.title)}${i.edited ? ' *(angepasst)*' : ''} | ${cell(i.why)} | ${cell(i.by)}, ${day(i.at)} |`)
  const details = applied.filter((i) => i.findings.length).map((i) => [`#### ${i.path} › ${i.title}`, ...i.findings.map((f) => `- **${KIND[f.kind] ?? f.kind}:** ${f.explanation}${f.evidence?.length ? ` (Beleg: ${f.evidence.map((e) => `\`${e.source ?? e.file}\``).join(', ')})` : ''}`)].join('\n'))
  const open = [...applied.filter((i) => i.partial).map((i) => ({ ...i, reason: `Nur teilweise übernommen, bitte von Hand ergänzen: ${i.partial.join('; ')}` })), ...conflicts, ...skipped.filter((s) => s.path && group.items.every((i) => i.proposal !== s.proposal))]
  const body = [
    '## Doku-Änderungen aus neuraldoc',
    '',
    `neuraldoc hat die Dokumentation von **${projectName}** gegen den aktuellen Code geprüft. Diese ${applied.length === 1 ? 'Änderung wurde' : `${applied.length} Änderungen wurden`} in neuraldoc geprüft und freigegeben:`,
    '',
    '| Datei | Abschnitt | Warum | Freigegeben |',
    '|---|---|---|---|',
    ...rows,
    ...(details.length ? ['', '<details><summary>Befunde mit Codebeleg</summary>', '', ...details, '', '</details>'] : []),
    ...(open.length ? ['', '### Nicht in diesem Pull-Request', '', ...open.map((i) => `- \`${i.path}\` › ${i.title}: ${i.reason}`)] : []),
    '',
    '---',
    '',
    `<sub>Erstellt von neuraldoc. Der Branch \`${group.branch}\` wird bei jeder Freigabe oder Rücknahme in neuraldoc neu auf \`${group.base}\` aufgebaut. Wer selbst auf den Branch committet, übernimmt ihn: neuraldoc aktualisiert ihn danach nicht mehr.</sub>`,
  ].join('\n')
  return body.length > 60000 ? body.slice(0, 60000) + '\n\n…(gekürzt)' : body
}

/* ---------- Sync ---------- */

const enc = (file) => file.split('/').map(encodeURIComponent).join('/')
const fingerprint = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)

async function fileOnBase(gh, file, base) {
  try {
    const entry = await gh.request('GET', `/repos/${gh.owner}/${gh.repo}/contents/${enc(file)}?ref=${encodeURIComponent(base)}`)
    if (Array.isArray(entry) || entry.type !== 'file') return null
    if (entry.content || !entry.size) return Buffer.from(entry.content || '', 'base64').toString('utf8')
    const blob = await gh.request('GET', `/repos/${gh.owner}/${gh.repo}/git/blobs/${entry.sha}`) // over 1 MB
    return Buffer.from(blob.content, 'base64').toString('utf8')
  } catch (error) { if (error.httpStatus === 404) return null; throw error }
}

async function findPullRequest(gh, branch) {
  const list = await gh.request('GET', `/repos/${gh.owner}/${gh.repo}/pulls?state=all&head=${encodeURIComponent(`${gh.owner}:${branch}`)}&per_page=10&sort=created&direction=desc`)
  return list.find((pr) => pr.state === 'open') ?? list[0] ?? null
}
const prState = (pr) => pr.merged_at ? 'merged' : pr.state === 'open' ? 'open' : 'closed'

/** Brings one pull request in line with the approvals: rebuild the branch on the base, open or update the pull request. */
async function syncGroup({ gh, group, config, project, previous, skipped, force }) {
  const repoInfo = await gh.request('GET', `/repos/${gh.owner}/${gh.repo}`)
  const base = group.base || repoInfo.default_branch
  group = { ...group, base }
  const baseRef = await gh.request('GET', `/repos/${gh.owner}/${gh.repo}/git/ref/heads/${enc(base)}`)
  const baseSha = baseRef.object.sha
  // Every file as it is on the base branch now, with the approved sections put in.
  const files = [], applied = [], conflicts = []
  for (const file of [...new Set(group.items.map((i) => i.path))]) {
    const items = group.items.filter((i) => i.path === file), raw = await fileOnBase(gh, file, base)
    if (raw === null) { conflicts.push(...items.map((i) => ({ ...i, reason: `Die Datei gibt es auf ${base} nicht mehr.` }))); continue }
    const result = applyFile(file, raw, items)
    applied.push(...result.applied); conflicts.push(...result.conflicts)
    if (result.text !== raw) files.push({ path: file, content: result.text })
  }
  const digest = fingerprint({ baseSha, files, proposals: applied.map((i) => i.proposal) })
  const record = { key: group.key, project: project.id, already: applied.filter((i) => i.already).map((i) => i.proposal), owner: gh.owner, repo: gh.repo, branch: group.branch, base, proposals: applied.filter((i) => !i.already).map((i) => i.proposal), conflicts: [...applied.filter((i) => i.partial).map((i) => ({ proposal: i.proposal, path: i.path, title: i.title, reason: `Nur teilweise im Pull-Request: ${i.partial.join('; ')}` })), ...conflicts.map(({ proposal, path: file, title, reason }) => ({ proposal, path: file, title, reason }))], digest, updatedAt: new Date().toISOString(), error: null }
  let pr = await findPullRequest(gh, group.branch)
  // A merged pull request is finished: what it carried is published, anything new starts a fresh one.
  if (pr && prState(pr) === 'merged' && previous?.number === pr.number) pr = null
  if (pr && prState(pr) === 'closed' && previous?.number === pr.number && previous.digest === digest && !force)
    return { ...previous, state: 'closed', conflicts: record.conflicts, updatedAt: record.updatedAt, note: 'Der Pull-Request wurde auf GitHub geschlossen. neuraldoc öffnet ihn erst wieder, wenn sich die Freigaben ändern oder du es auslöst.' }
  if (!files.length) {
    if (pr?.state === 'open') await closePullRequest(gh, pr, group.branch, 'Alles, was dieser Pull-Request ändern sollte, steht schon auf dem Basis-Branch oder lässt sich nicht mehr einsetzen.')
    return { ...record, state: applied.length ? 'up-to-date' : 'conflict', number: pr?.number ?? null, url: pr?.html_url ?? null }
  }
  // The branch: created or rebuilt on the base, unless a person committed to it.
  let head = null
  try { head = await gh.request('GET', `/repos/${gh.owner}/${gh.repo}/git/ref/heads/${enc(group.branch)}`) } catch (error) { if (error.httpStatus !== 404) throw error }
  if (head && !force) {
    const commit = await gh.request('GET', `/repos/${gh.owner}/${gh.repo}/git/commits/${head.object.sha}`)
    if (!commit.message.includes(MARKER)) return { ...record, state: 'edited', number: pr?.number ?? null, url: pr?.html_url ?? null, headSha: head.object.sha, note: `Auf ${group.branch} gibt es Commits, die nicht von neuraldoc sind. neuraldoc überschreibt sie nicht; „Branch neu aufbauen“ verwirft sie.` }
    if (previous?.digest === digest && previous.headSha === head.object.sha && pr?.state === 'open') return { ...previous, state: 'open', number: pr.number, url: pr.html_url, updatedAt: record.updatedAt }
  }
  const baseCommit = await gh.request('GET', `/repos/${gh.owner}/${gh.repo}/git/commits/${baseSha}`)
  const tree = await gh.request('POST', `/repos/${gh.owner}/${gh.repo}/git/trees`, { base_tree: baseCommit.tree.sha, tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) })
  // With a personal token the commit carries neuraldoc as author; a GitHub App's commit is the app's own (and signed).
  const author = config.auth === 'token' ? { author: { name: 'neuraldoc', email: 'bot@neuraldoc.invalid', date: new Date().toISOString() } } : {}
  const commit = await gh.request('POST', `/repos/${gh.owner}/${gh.repo}/git/commits`, { message: commitMessage(group, applied.filter((i) => !i.already), config, project.name), tree: tree.sha, parents: [baseSha], ...author })
  if (head) await gh.request('PATCH', `/repos/${gh.owner}/${gh.repo}/git/refs/heads/${enc(group.branch)}`, { sha: commit.sha, force: true })
  else await gh.request('POST', `/repos/${gh.owner}/${gh.repo}/git/refs`, { ref: `refs/heads/${group.branch}`, sha: commit.sha })
  const title = pullRequestTitle({ ...group, items: applied.filter((i) => !i.already) }, config), body = pullRequestBody({ projectName: project.name, group, applied: applied.filter((i) => !i.already), conflicts, skipped })
  if (pr?.state === 'open') {
    pr = await gh.request('PATCH', `/repos/${gh.owner}/${gh.repo}/pulls/${pr.number}`, { title, body })
  } else if (pr && prState(pr) === 'closed' && pr.head?.ref === group.branch && previous?.number === pr.number) {
    pr = await gh.request('PATCH', `/repos/${gh.owner}/${gh.repo}/pulls/${pr.number}`, { title, body, state: 'open' }).catch(() => null)
  } else pr = null
  if (!pr) {
    pr = await gh.request('POST', `/repos/${gh.owner}/${gh.repo}/pulls`, { title, body, head: group.branch, base, draft: config.draft, maintainer_can_modify: true })
    if (config.labels.length) await gh.request('POST', `/repos/${gh.owner}/${gh.repo}/issues/${pr.number}/labels`, { labels: config.labels }).catch((error) => log.warn('github', 'Labels nicht gesetzt', { error: error.message }))
    const reviewers = config.reviewers.filter((r) => r.toLowerCase() !== pr.user?.login?.toLowerCase())
    if (reviewers.length) await gh.request('POST', `/repos/${gh.owner}/${gh.repo}/pulls/${pr.number}/requested_reviewers`, { reviewers }).catch((error) => log.warn('github', 'Reviewer nicht angefragt', { error: error.message }))
    log.info('github', 'Pull-Request erstellt', { repo: `${gh.owner}/${gh.repo}`, number: pr.number, sections: record.proposals.length })
  } else log.info('github', 'Pull-Request aktualisiert', { repo: `${gh.owner}/${gh.repo}`, number: pr.number, sections: record.proposals.length })
  return { ...record, state: 'open', number: pr.number, url: pr.html_url, headSha: commit.sha }
}

async function closePullRequest(gh, pr, branch, reason) {
  await gh.request('POST', `/repos/${gh.owner}/${gh.repo}/issues/${pr.number}/comments`, { body: `${reason} neuraldoc schließt diesen Pull-Request.` }).catch(() => null)
  await gh.request('PATCH', `/repos/${gh.owner}/${gh.repo}/pulls/${pr.number}`, { state: 'closed' })
  const head = await gh.request('GET', `/repos/${gh.owner}/${gh.repo}/git/ref/heads/${enc(branch)}`).catch(() => null)
  const commit = head && await gh.request('GET', `/repos/${gh.owner}/${gh.repo}/git/commits/${head.object.sha}`).catch(() => null)
  if (commit?.message.includes(MARKER)) await gh.request('DELETE', `/repos/${gh.owner}/${gh.repo}/git/refs/heads/${enc(branch)}`).catch(() => null)
  log.info('github', 'Pull-Request geschlossen', { repo: `${gh.owner}/${gh.repo}`, number: pr.number })
}

/** Reads the state of the project's pull requests on GitHub; a merged one publishes its sections. */
export async function refreshPullRequests(p, { fetchImpl, config = githubConfig() } = {}) {
  if (!config.auth) return
  const records = Object.values(readState().records).filter((r) => r.project === p.id && r.number && ['open', 'edited'].includes(r.state))
  for (const record of records) {
    try {
      const pr = await client(config, record, fetchImpl).request('GET', `/repos/${record.owner}/${record.repo}/pulls/${record.number}`)
      const state = prState(pr)
      if (state === record.state) continue
      updateState((s) => {
        s.records[record.key] = { ...s.records[record.key], state, mergedAt: pr.merged_at ?? null, updatedAt: new Date().toISOString() }
        if (state === 'merged') for (const id of record.proposals) (s.published[p.id] ??= {})[id] = { number: record.number, url: record.url, repo: `${record.owner}/${record.repo}`, mergedAt: pr.merged_at }
      })
      log.info('github', state === 'merged' ? 'Pull-Request gemergt' : 'Pull-Request geschlossen', { repo: `${record.owner}/${record.repo}`, number: record.number })
    } catch (error) { log.warn('github', 'Pull-Request-Status nicht lesbar', { repo: `${record.owner}/${record.repo}`, number: record.number, error: error.message }) }
  }
}

export const syncStatus = { running: false, queued: false, lastRun: null, error: null }
let chain = Promise.resolve()

/** Brings every pull request of the active project in line with its approvals. Runs one at a time. */
export function syncGitHub(getProject, options = {}) {
  const run = chain.then(() => syncNow(getProject(), options))
  chain = run.catch(() => undefined)
  return run
}

async function syncNow(p, { force = false, only, fetchImpl } = {}) {
  const config = githubConfig()
  if (!p) throw new DraftError('Zuerst ein eigenes Projekt importieren.', 400)
  if (!config.auth) throw new GitHubError('GitHub ist nicht verbunden. Unter Einstellungen eine GitHub-App oder einen Token hinterlegen.', 503)
  Object.assign(syncStatus, { running: true, error: null })
  try {
    await refreshPullRequests(p, { fetchImpl, config })
    const state = readState(), plan = planPullRequests(p, config, state)
    const keys = new Set(plan.groups.map((g) => g.key))
    // Pull requests of this project with nothing left to carry (every approval withdrawn): close them.
    for (const record of Object.values(state.records).filter((r) => r.project === p.id && r.state === 'open' && !keys.has(r.key) && (!only || r.key === only))) {
      try {
        const gh = client(config, record, fetchImpl), pr = await gh.request('GET', `/repos/${record.owner}/${record.repo}/pulls/${record.number}`)
        if (pr.state === 'open') await closePullRequest(gh, pr, record.branch, 'In neuraldoc ist keine Freigabe für diesen Pull-Request mehr offen.')
        updateState((s) => { s.records[record.key] = { ...record, state: 'closed', proposals: [], updatedAt: new Date().toISOString(), note: 'Von neuraldoc geschlossen: keine offene Freigabe mehr.' } })
      } catch (error) { updateState((s) => { s.records[record.key] = { ...record, error: error.message } }) }
    }
    for (const group of plan.groups.filter((g) => !only || g.key === only)) {
      const previous = readState().records[group.key]
      try {
        const record = await syncGroup({ gh: client(config, group, fetchImpl), group, config, project: p, previous, skipped: plan.skipped, force })
        updateState((s) => {
          s.records[group.key] = record
          // Sections the base branch already carries (merged by hand, or an earlier pull request) count as published.
          for (const id of record.already ?? []) (s.published[p.id] ??= {})[id] = { number: null, url: null, repo: `${group.owner}/${group.repo}`, mergedAt: record.updatedAt }
        })
      } catch (error) {
        logError('github', error, { repo: `${group.owner}/${group.repo}`, branch: group.branch })
        updateState((s) => { s.records[group.key] = { ...(previous ?? { key: group.key, project: p.id, owner: group.owner, repo: group.repo, branch: group.branch, proposals: [], state: 'pending' }), error: error.message, updatedAt: new Date().toISOString() } })
        syncStatus.error = error.message
      }
    }
    syncStatus.lastRun = new Date().toISOString()
    return githubStatus(p)
  } finally { syncStatus.running = false }
}

let timer = null
/** After an approval or withdrawal: sync a moment later, so a run of quick decisions makes one commit. */
export function scheduleSync(getProject, delay = 2500) {
  const config = githubConfig()
  if (!config.auth || config.mode !== 'auto') return false
  clearTimeout(timer)
  syncStatus.queued = true
  timer = setTimeout(() => { syncStatus.queued = false; syncGitHub(getProject).catch((error) => { syncStatus.error = error.message; log.warn('github', 'Abgleich fehlgeschlagen', { error: error.message }) }) }, delay)
  timer.unref?.()
  return true
}

let lastRefresh = 0
/** What the dashboard shows: connection, where each approval goes, the pull requests and what they carry. */
export async function githubStatus(p, { refresh = false, fetchImpl } = {}) {
  const config = githubConfig()
  if (p && refresh && config.auth && Date.now() - lastRefresh > 20_000) { lastRefresh = Date.now(); await refreshPullRequests(p, { fetchImpl, config }).catch(() => undefined) }
  const state = readState(), plan = p ? planPullRequests(p, config, state) : { groups: [], skipped: [], targets: {} }
  const records = p ? Object.values(state.records).filter((r) => r.project === p.id).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')) : []
  return {
    configured: !!config.auth, auth: config.auth, mode: config.mode, group: config.group, host: config.host,
    app: config.auth === 'app' ? { id: config.appId, slug: config.appSlug, installUrl: config.appSlug ? `https://${config.host}/apps/${config.appSlug}/installations/new` : null } : null,
    targets: plan.targets,
    pending: plan.groups.map((g) => ({ key: g.key, repo: `${g.owner}/${g.repo}`, branch: g.branch, proposals: g.items.map((i) => i.proposal), inPullRequest: !!records.find((r) => r.key === g.key && r.state === 'open' && g.items.every((i) => r.proposals.includes(i.proposal) || r.conflicts?.some((c) => c.proposal === i.proposal))) })),
    skipped: plan.skipped.map(({ proposal, path: file, title, reason }) => ({ proposal, path: file, title, reason })),
    pullRequests: records.map(({ key, owner, repo, branch, base, number, url, state, proposals, conflicts, error, note, updatedAt, mergedAt }) => ({ key, repo: `${owner}/${repo}`, branch, base, number, url, state, proposals, conflicts: conflicts ?? [], error, note, updatedAt, mergedAt })),
    published: p ? state.published[p.id] ?? {} : {},
    sync: { ...syncStatus },
  }
}

/** Where an approved section is on GitHub, for the rows of the dashboard. */
export function proposalLinks(p) {
  const state = readState(), links = {}
  for (const record of Object.values(state.records).filter((r) => r.project === p.id && r.number && r.state !== 'closed')) for (const id of record.proposals) links[id] = { number: record.number, url: record.url, state: record.state, repo: `${record.owner}/${record.repo}`, at: record.updatedAt }
  for (const [id, x] of Object.entries(state.published[p.id] ?? {})) links[id] = { number: x.number, url: x.url, state: 'merged', repo: x.repo, at: x.mergedAt }
  return links
}
export const isPublished = (projectId, proposalId) => !!readState().published[projectId]?.[proposalId]

/** Checks the connection: who neuraldoc is on GitHub and whether it may write to the project's repositories. */
export async function testGitHub(p, { fetchImpl } = {}) {
  const config = githubConfig()
  if (!config.auth) throw new GitHubError('GitHub ist nicht verbunden. Unter Einstellungen eine GitHub-App oder einen Token hinterlegen.', 503)
  const result = { auth: config.auth, account: null, repositories: [] }
  if (config.auth === 'token') {
    const call = client(config, { owner: '', repo: '' }, fetchImpl)
    result.account = (await call.request('GET', '/user')).login
  } else {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'neuraldoc', Authorization: `Bearer ${appJwt(config.appId, config.key)}` }
    const response = await (fetchImpl ?? fetch)(`${config.api}/app`, { headers }).catch(() => null)
    if (!response?.ok) throw new GitHubError(response?.status === 401 ? 'GitHub lehnt App-ID oder privaten Schlüssel ab.' : 'GitHub ist nicht erreichbar.', 400)
    result.account = `${(await response.json()).slug}[bot]`
    const installed = await (fetchImpl ?? fetch)(`${config.api}/app/installations`, { headers }).catch(() => null)
    if (installed?.ok) result.installations = (await installed.json()).map((i) => ({ account: i.account?.login, all: i.repository_selection === 'all' }))
    result.installUrl = config.appSlug ? `https://${config.host}/apps/${config.appSlug}/installations/new` : null
  }
  result.project = !!p
  const targets = p ? projectTargets(p, config) : {}
  for (const [origin, target] of Object.entries(targets)) {
    if (!target?.owner) continue
    try {
      const repo = await client(config, target, fetchImpl).request('GET', `/repos/${target.owner}/${target.repo}`)
      const canWrite = config.auth === 'app' ? true : !!repo.permissions?.push
      result.repositories.push({ origin, repo: repo.full_name, base: target.base || repo.default_branch, ok: canWrite, message: canWrite ? 'Schreibzugriff vorhanden' : 'Nur Lesezugriff: der Token braucht Contents und Pull requests mit Schreibrecht.' })
    } catch (error) { result.repositories.push({ origin, repo: `${target.owner}/${target.repo}`, ok: false, message: error.message }) }
  }
  return result
}

/* ---------- Creating the GitHub App from a manifest ---------- */

const pendingApps = new Map() // state → expiry

/** The form the browser posts to GitHub: an app with exactly the permissions neuraldoc needs, redirecting back here. */
export function appManifest({ origin, name, org }) {
  const config = githubConfig()
  if (config.host !== 'github.com') throw new DraftError('Eine App aus dem Manifest lässt sich nur auf github.com erstellen. Für GitHub Enterprise App-ID und Schlüssel selbst eintragen.', 400)
  if (org && !/^[\w.-]{1,100}$/.test(org)) throw new Error('Ungültiger Organisationsname.')
  const appName = String(name || '').trim() || `neuraldoc-${crypto.randomBytes(2).toString('hex')}`
  if (appName.length > 34) throw new Error('Der Name der App darf höchstens 34 Zeichen haben.')
  const state = crypto.randomBytes(16).toString('hex')
  for (const [key, expires] of pendingApps) if (expires < Date.now()) pendingApps.delete(key)
  pendingApps.set(state, Date.now() + 60 * 60_000)
  const manifest = {
    name: appName, url: 'https://github.com/neuraldoc-ai/neuraldoc-app', description: 'Öffnet Pull-Requests mit den in neuraldoc freigegebenen Doku-Änderungen.',
    redirect_url: `${origin}/api/mcp/github/app/callback`, public: false,
    default_permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' }, default_events: [],
  }
  return { action: `https://github.com/${org ? `organizations/${encodeURIComponent(org)}/settings/apps/new` : 'settings/apps/new'}?state=${state}`, manifest: JSON.stringify(manifest) }
}

/** GitHub sends the browser back with a code; it becomes the app's id, slug and private key. */
export async function completeAppManifest({ code, state }, { fetchImpl = fetch } = {}) {
  if (!state || !pendingApps.has(state) || pendingApps.get(state) < Date.now()) throw new DraftError('Die Anfrage zur App-Erstellung ist abgelaufen. Bitte in den Einstellungen neu starten.', 400)
  pendingApps.delete(state)
  if (!/^[\w-]{1,100}$/.test(String(code || ''))) throw new DraftError('GitHub hat keinen gültigen Code zurückgegeben.', 400)
  const response = await fetchImpl(`https://api.github.com/app-manifests/${code}/conversions`, { method: 'POST', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'neuraldoc' } })
  if (!response.ok) throw new DraftError(`GitHub hat die App nicht bestätigt (HTTP ${response.status}).`, 502)
  const app = await response.json()
  saveSettings({ NEURALDOC_GITHUB_APP_ID: String(app.id), NEURALDOC_GITHUB_APP_SLUG: app.slug, NEURALDOC_GITHUB_APP_PRIVATE_KEY: app.pem })
  log.info('github', 'GitHub-App erstellt', { slug: app.slug, id: app.id })
  return { slug: app.slug, installUrl: `https://github.com/apps/${app.slug}/installations/new` }
}
