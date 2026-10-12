// Keeps the active project in step with its sources. The code is the source of truth:
//   Code: a new commit on the default branch (GitHub push webhook, or a look every few minutes) reads the sources
//         again and checks only the sections that describe a changed file. Runs by itself.
//   Docs: Confluence, Drive and documentation repositories are only watched (versions, free). Checking what someone
//         wrote there against the code runs on request, for the whole project.
// Looking costs nothing; only the check of the touched sections calls a model (answers are cached).
import crypto from 'node:crypto'
import { activeProject, isBusy, pendingDocs, refreshable, refreshProject, rememberHead, showcaseOnly, startCheck } from './projects.mjs'
import { remoteHead } from './project-upload.mjs'
import { confluenceConfig, driveConfig, liveChanges } from './live-sources.mjs'
import { DraftError, draftingStatus } from './drafting.mjs'
import { runtimeEnv } from './settings.mjs'
import { log } from './log.mjs'

const minutes = () => { const m = Number(process.env.NEURALDOC_SYNC_MINUTES ?? 5); return Number.isFinite(m) && m >= 0 ? m : 5 }

/** For the dashboard: what was looked at last, what changed and what runs now. */
export const watchStatus = { running: null, lastLook: null, lastCode: null, docs: { changes: [], lookedAt: null }, error: null }

/** Whether the documentation's sources can be watched with the keys at hand. */
function docsWatchable(p) {
  const docs = p.sources?.docs
  if (!docs) return { ok: false, reason: 'Die Doku liegt im Repository.' }
  if (docs.source === 'url') return { ok: true }
  if (docs.source !== 'live') return { ok: false, reason: 'Hochgeladene Doku lässt sich nicht beobachten.' }
  if (docs.live.confluence && !confluenceConfig().configured) return { ok: false, reason: 'Confluence ist hier nicht verbunden.' }
  if (docs.live.drive && !driveConfig().configured) return { ok: false, reason: 'Google Drive ist hier nicht verbunden.' }
  return { ok: true }
}

export function syncState() {
  const p = activeProject()
  if (!p || showcaseOnly()) return { available: false }
  const docs = docsWatchable(p), pending = pendingDocs(p)
  return { available: refreshable(p), minutes: minutes(), repo: { label: p.sources.repo.label, url: p.sources.repo.url ?? null, head: p.sources.repo.head ?? null }, docsWatch: docs, pendingSections: pending.length, refreshedAt: p.refreshedAt ?? null, ...watchStatus, docs: { ...watchStatus.docs } }
}

/** One look at every source; a new commit on the default branch starts the code sync. */
export async function look() {
  const p = activeProject()
  if (!p || showcaseOnly() || !refreshable(p) || watchStatus.running || isBusy()) return syncState()
  try {
    const head = await remoteHead(p.sources.repo.url)
    if (!p.sources.repo.head) rememberHead('repo', head)
    else if (head && head !== p.sources.repo.head) { log.info('sync', 'Neuer Commit im Hauptbranch', { from: p.sources.repo.head.slice(0, 7), to: head.slice(0, 7) }); await syncCode() }
    // After a code sync the project has read the documentation too: look at what it has now.
    const now = activeProject()
    if (now && docsWatchable(now).ok) {
      const docs = now.sources.docs, changes = docs.source === 'live' ? await liveChanges(docs.live) : []
      if (docs.source === 'url') {
        const docsHead = await remoteHead(docs.url)
        if (!docs.head) rememberHead('docs', docsHead)
        else if (docsHead !== docs.head) changes.push({ source: docs.label, title: 'neue Commits im Doku-Repository', change: 'geändert' })
      }
      watchStatus.docs = { changes, lookedAt: new Date().toISOString() }
    }
    watchStatus.lastLook = new Date().toISOString(); watchStatus.error = null
  } catch (error) {
    watchStatus.error = error.message
    log.warn('sync', 'Quellen nicht erreichbar', { error: error.message })
  }
  return syncState()
}

// The check after a sync needs an LLM and Jev; without them the sources are still read and the change is shown.
const canCheck = () => { const env = runtimeEnv(); return draftingStatus(env).configured && !!(env.TYPESAFE_API_KEY || env.JEV_API_KEY)?.trim?.() }

/** Code changed: read the sources again, then check the sections that describe a changed file. */
export async function syncCode() {
  watchStatus.running = 'code'
  try {
    const from = activeProject()?.sources.repo.head ?? null
    const result = await refreshProject()
    const to = activeProject()?.sources.repo.head ?? null
    watchStatus.lastCode = { at: new Date().toISOString(), from, to, files: result.files.length, sections: result.sections.length, checked: false }
    if (result.sections.length && canCheck()) { startCheck({ only: result.sections, reason: `Commit ${to?.slice(0, 7) ?? ''}`.trim() }); watchStatus.lastCode.checked = true }
    watchStatus.docs = { changes: [], lookedAt: new Date().toISOString() }
    return result
  } finally { watchStatus.running = null }
}

/** On request: read the documentation again and check every section someone changed since its last check. */
export async function checkDocs() {
  if (watchStatus.running || isBusy()) throw new DraftError('Es läuft schon ein Abgleich oder eine Prüfung. Versuch es gleich noch einmal.', 409)
  watchStatus.running = 'docs'
  try {
    const result = await refreshProject()
    const sections = [...new Set([...result.docs, ...result.sections])]
    watchStatus.docs = { changes: [], lookedAt: new Date().toISOString() }
    if (sections.length) startCheck({ only: sections, reason: 'Doku geprüft' })
    log.info('sync', 'Doku-Prüfung angestoßen', { sections: sections.length })
    return { sections: sections.length }
  } finally { watchStatus.running = null }
}

/**
 * GitHub push webhook (optional, needs a public address and NEURALDOC_GITHUB_WEBHOOK_SECRET): a push to the default
 * branch of the project's repository starts a look right away. Returns the HTTP status for GitHub.
 */
export function githubWebhook(raw, headers) {
  const secret = process.env.NEURALDOC_GITHUB_WEBHOOK_SECRET?.trim()
  if (!secret) return 404
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'), given = String(headers['x-hub-signature-256'] || '')
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return 401
  if (headers['x-github-event'] === 'ping') return 200
  if (headers['x-github-event'] !== 'push') return 202
  let event
  try { event = JSON.parse(raw.toString('utf8')) } catch { return 400 }
  const p = activeProject(), url = (u) => String(u || '').toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
  if (!p || url(event.repository?.html_url) !== url(p.sources?.repo?.url) || event.ref !== `refs/heads/${event.repository?.default_branch}`) return 202
  log.info('sync', 'GitHub meldet einen Push auf den Hauptbranch', { to: String(event.after).slice(0, 7) })
  setTimeout(() => { look().catch(() => undefined) }, 1000).unref?.()
  return 202
}

let timer = null
/** Looks every NEURALDOC_SYNC_MINUTES minutes (default 5, 0 = off); the first look comes shortly after the start. */
export function startWatch() {
  if (timer || showcaseOnly() || !minutes()) return
  const every = minutes() * 60_000
  setTimeout(() => { look().catch(() => undefined) }, 20_000).unref?.()
  timer = setInterval(() => { look().catch(() => undefined) }, every)
  timer.unref?.()
  log.info('sync', `Quellen werden alle ${minutes()} Minuten abgeglichen`)
}
