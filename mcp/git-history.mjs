// Git history of an imported repository: commits since the last release, their diffs and the features they form.
// Read once at import from the cloned folder; the folder is deleted afterwards, so everything the UI shows later
// (history, merge requests, diffs) is stored here. Grouping is deterministic: no model call.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { classify } from '../frontend/src/dashboard/features/docs/import-rules.mjs'

const run = promisify(execFile)
const LIMITS = { commits: 400, filesPerCommit: 200, fileDiffChars: 60_000, commitDiffChars: 400_000, features: 30 }
const SEP = '\x1f', END = '\x1e'

const git = async (dir, args) => (await run('git', ['-C', dir, '-c', 'core.quotepath=off', ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true })).stdout

/** Ticket keys such as MOB-4812 (Jira style) or MOB4812 in a branch name or message. */
export const ticketOf = (text) => (text.match(/\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/) ?? text.match(/\b([A-Z]{2,10})(\d{1,6})\b/))?.slice(1).join('-') ?? null

/** Merge commit subjects of GitLab, GitHub and plain git. */
export function parseMerge(subject, body) {
  const gitlab = subject.match(/^Merge branch '([^']+)'(?: into '([^']+)')?/)
  const github = subject.match(/^Merge pull request #(\d+) from (\S+)/)
  const branch = gitlab?.[1] ?? github?.[2]?.replace(/^[^/]+\//, '') ?? null
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
  const mrRef = body.match(/See merge request \S*?(![0-9]+)/)?.[1] ?? (github ? `#${github[1]}` : null)
  const title = lines.find((l) => !/^(See merge request|Closes|Fixes|Resolves|Refs|Co-authored-by|Signed-off-by)\b/i.test(l)) ?? null
  const description = lines.filter((l) => l !== title && !/^(See merge request|Co-authored-by|Signed-off-by)\b/i.test(l)).join('\n')
  return { branch, target: gitlab?.[2] ?? null, mr: mrRef, title, description }
}

/** Splits `git show --patch` output into the GitLab diff shape the UI already renders. */
export function splitPatch(patch) {
  const files = []
  for (const part of patch.split(/^diff --git /m).slice(1)) {
    const header = part.slice(0, part.indexOf('\n'))
    const m = header.match(/^a\/(.+?) b\/(.+)$/)
    if (!m) continue
    const hunks = part.indexOf('\n@@')
    const meta = hunks < 0 ? part : part.slice(0, hunks)
    let diff = hunks < 0 ? '' : part.slice(hunks + 1)
    if (diff.length > LIMITS.fileDiffChars) diff = diff.slice(0, diff.lastIndexOf('\n', LIMITS.fileDiffChars)) + '\n'
    const rename = meta.match(/^rename from (.+)\nrename to (.+)$/m)
    files.push({
      old_path: rename?.[1] ?? m[1], new_path: rename?.[2] ?? m[2], diff,
      new_file: /^new file mode/m.test(meta), deleted_file: /^deleted file mode/m.test(meta), renamed_file: !!rename,
      binary: /^Binary files/m.test(meta), too_large: diff.length >= LIMITS.fileDiffChars,
    })
  }
  return files
}

const isTest = (p) => /(^|\/)(tests?|__tests__|spec|e2e)(\/|$)|[._-](test|spec)\.[a-z]+$|Test\.[a-z]+$/i.test(p)
const isConfig = (p) => /(^|\/)(config|conf|settings)\/|\.(ya?ml|properties|toml|ini|env\.example)$|(^|\/)application[^/]*\.(json|ya?ml)$/i.test(p)
const isSchema = (p) => /\.sql$|(^|\/)(migrations?|db\/migrate|flyway|liquibase)\//i.test(p)
const isUi = (p) => /\.(tsx|jsx|vue|svelte|html|pas|dfm|xaml|css|scss)$|(^|\/)(i18n|locales?|messages)[^/]*\//i.test(p)

/** What a commit touches, in the vocabulary of the doc types (vocabulary.ts). */
export function commitKind(subject, files) {
  const code = files.filter((f) => classify(f, 'repo') === 'code')
  if (!code.length) return null
  if (code.every(isTest)) return 'test'
  if (/heißt jetzt|umbenann|\brenam/i.test(subject)) return 'label'
  if (/^(fix|hotfix|bugfix)\b|\bfix(es|ed)?\b|\bbehoben\b|\bnpe\b/i.test(subject)) return 'fix'
  if (code.some(isSchema)) return 'datenbank'
  if (code.every((f) => isConfig(f) || isTest(f))) return 'parameter'
  if (code.some(isUi)) return 'feld'
  return 'prozess'
}

/**
 * Reads commits since the newest tag (the last release); without a tag the last 90 days.
 * Returns null for a folder without Git (an uploaded folder).
 */
export async function readHistory(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) return null
  const shallow = new Set(fs.existsSync(path.join(dir, '.git', 'shallow')) ? fs.readFileSync(path.join(dir, '.git', 'shallow'), 'utf8').split('\n').filter(Boolean) : [])
  const ref = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD')).trim()
  const tag = (await git(dir, ['describe', '--tags', '--abbrev=0', 'HEAD']).catch(() => '')).trim() || null
  const range = tag ? [`${tag}..HEAD`] : ['HEAD', '--since=90.days.ago']
  const raw = await git(dir, ['log', `--max-count=${LIMITS.commits}`, '--date-order', `--format=%H${SEP}%P${SEP}%an${SEP}%ae${SEP}%aI${SEP}%cI${SEP}%s${SEP}%b${END}`, ...range]).catch(() => '')
  let commits = raw.split(END).map((r) => r.replace(/^\n/, '')).filter(Boolean).map((r) => {
    const [id, parents, author_name, author_email, authored_date, committed_date, title, body] = r.split(SEP)
    return { id, short_id: id.slice(0, 11), parent_ids: parents ? parents.split(' ') : [], author_name, author_email, authored_date, committed_date, created_at: committed_date, title, message: body.trim() ? `${title}\n\n${body.trim()}\n` : title }
  })
  // A shallow clone's oldest commit shows the whole tree as new: it is a boundary, not a change.
  commits = commits.filter((c) => !shallow.has(c.id))
  if (!commits.length) return { ref, tag, head: null, commits: [], diffs: {}, mergeRequests: [], features: [] }
  const diffs = {}
  for (const c of commits) {
    // Merges: what the branch brought in, as GitLab shows it (first-parent diff).
    const args = c.parent_ids.length > 1 ? ['show', '--format=', '--patch', '--find-renames', '--no-color', '--no-ext-diff', '--no-textconv', '-m', '--first-parent', c.id] : ['show', '--format=', '--patch', '--find-renames', '--no-color', '--no-ext-diff', '--no-textconv', c.id]
    let files = splitPatch(await git(dir, args).catch(() => ''))
    let total = 0
    files = files.slice(0, LIMITS.filesPerCommit).map((f) => { total += f.diff.length; return total > LIMITS.commitDiffChars ? { ...f, diff: '', too_large: true } : f })
    diffs[c.id] = files
    const additions = files.reduce((n, f) => n + (f.diff.match(/^\+(?!\+\+)/gm)?.length ?? 0), 0), deletions = files.reduce((n, f) => n + (f.diff.match(/^-(?!--)/gm)?.length ?? 0), 0)
    c.stats = { additions, deletions, total: additions + deletions }
  }
  const { mergeRequests, features } = groupFeatures(commits, diffs)
  return { ref, tag, head: commits[0], commits, diffs, mergeRequests, features }
}

/**
 * Features: every merge on the main line with the commits its branch brought in; direct commits on the main line
 * are grouped by ticket key, the rest stand alone. Features that change no code (docs, version bumps of
 * non-code files) are left out.
 */
export function groupFeatures(commits, diffs) {
  const byId = new Map(commits.map((c) => [c.id, c]))
  const reachable = (start, stop = new Set()) => {
    const seen = new Set(), todo = [start]
    while (todo.length) { const id = todo.pop(); if (!id || seen.has(id) || stop.has(id) || !byId.has(id)) continue; seen.add(id); todo.push(...byId.get(id).parent_ids) }
    return seen
  }
  const mainLine = []
  for (let c = commits[0]; c; c = byId.get(c.parent_ids[0])) mainLine.push(c)
  const mergeRequests = [], groups = []
  for (const c of mainLine) {
    if (c.parent_ids.length > 1) {
      const base = reachable(c.parent_ids[0])
      const own = [...reachable(c.parent_ids[1], base)].map((id) => byId.get(id)).filter((x) => x.parent_ids.length === 1)
      const m = parseMerge(c.title, c.message.slice(c.title.length))
      const ticket = ticketOf(m.branch ?? '') ?? ticketOf(m.title ?? '') ?? own.map((x) => ticketOf(x.title)).find(Boolean) ?? null
      const iid = m.mr?.replace(/^[!#]/, '') ?? c.short_id.slice(0, 7)
      mergeRequests.push({ iid, reference: m.mr ?? c.short_id.slice(0, 7), title: m.title ?? m.branch ?? c.title, description: m.description, state: 'merged', source_branch: m.branch, target_branch: m.target, merged_at: c.committed_date, created_at: own.at(-1)?.committed_date ?? c.committed_date, author: { name: own[0]?.author_name ?? c.author_name }, merge_user: { name: c.author_name }, merged_by: { name: c.author_name }, merge_commit_sha: c.id, commits: own.map((x) => x.id), labels: [] })
      groups.push({ key: `mr:${iid}`, ticket, mr: m.mr, title: m.title ?? humanize(m.branch) ?? c.title, summary: m.description, merged: c.committed_date, commits: own.length ? own : [c] })
    } else {
      const ticket = ticketOf(c.title)
      const same = ticket && groups.find((g) => !g.key.startsWith('mr:') && g.ticket === ticket)
      if (same) same.commits.push(c)
      else groups.push({ key: ticket ? `ticket:${ticket}` : `commit:${c.short_id.slice(0, 7)}`, ticket, mr: null, title: c.title, summary: '', merged: c.committed_date, commits: [c] })
    }
  }
  const features = []
  for (const g of groups) {
    const files = [...new Set(g.commits.flatMap((c) => (diffs[c.id] ?? []).flatMap((f) => [f.new_path, f.old_path])))]
    const rename = /heißt jetzt|umbenann|\brenam/i.test(g.title)
    // A rename feature's follow-up commits (translations, screens) are part of the rename.
    const kinds = g.commits.map((c) => commitKind(c.title, (diffs[c.id] ?? []).map((f) => f.new_path))).map((k) => rename && (k === 'feld' || k === 'prozess') ? 'label' : k)
    if (!kinds.some(Boolean)) continue
    const title = stripTicket(g.title, g.ticket)
    features.push({ id: slug(g.ticket ?? g.key), key: g.key, ticket: g.ticket, mr: g.mr, title, summary: g.summary, merged: g.merged, files, commits: g.commits.map((c, i) => ({ id: c.id, kind: kinds[i] ?? 'intern', files: (diffs[c.id] ?? []).map((d) => d.new_path) })) })
    if (features.length >= LIMITS.features) break
  }
  // Ids must be unique even when two merges carry the same ticket.
  const seen = new Map()
  for (const f of features) { const n = seen.get(f.id) ?? 0; seen.set(f.id, n + 1); if (n) f.id = `${f.id}-${n + 1}` }
  return { mergeRequests, features }
}

const slug = (text) => text.toLowerCase().replace(/^(mr|ticket|commit):/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'feature'
const humanize = (branch) => branch ? branch.replace(/^(feature|feat|hotfix|bugfix|fix|chore)\//i, '').replace(/^[A-Z][A-Z0-9]+-?\d+[-_]?/i, '').replace(/[-_]+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()) || branch : null
const stripTicket = (title, ticket) => {
  const t = ticket ? title.replace(new RegExp(`^\\[?${ticket.replace('-', '-?')}\\]?[:\\s-]*`, 'i'), '').trim() : title
  return t || title
}
