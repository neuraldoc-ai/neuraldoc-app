// Turns an upload (one ZIP from the browser) and optional Git URLs into temporary folders for the importer.
// The browser sends: repo/<files>, docs/<files> and manifest.json { repoUrl, docsUrl, repoName, docsName, projectName }.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { unzipSync, strFromU8 } from '../frontend/server-deps.mjs'
import { LIMITS, repoUrl } from '../frontend/src/dashboard/features/docs/import-rules.mjs'
import { DraftError } from './drafting.mjs'
import { log } from './log.mjs'
import { cloneToken } from './github.mjs'

const run = promisify(execFile)

function extract(zip, dir) {
  let total = 0
  const entries = unzipSync(new Uint8Array(zip), {
    filter: (file) => {
      total += file.originalSize
      if (total > LIMITS.uploadBytes * 3) throw new DraftError('Der Upload ist entpackt zu groß.', 413)
      return !file.name.endsWith('/') && file.originalSize <= LIMITS.fileBytes
    },
  })
  let manifest = {}
  for (const [name, bytes] of Object.entries(entries)) {
    if (name === 'manifest.json') { try { manifest = JSON.parse(strFromU8(bytes)) } catch { throw new DraftError('Upload ist beschädigt (manifest.json).') }; continue }
    const normal = path.posix.normalize(name)
    // An upload never brings Git metadata: a .git folder's config could make the history reader run commands.
    if (!/^(repo|docs)\//.test(normal) || normal.includes('..') || name.includes('\\') || path.posix.isAbsolute(name) || /(^|\/)\.git(\/|$)/i.test(normal)) continue
    const target = path.resolve(dir, normal)
    if (!target.startsWith(dir + path.sep)) continue
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes)
  }
  return manifest
}

async function clone(value, dir, label) {
  const parsed = repoUrl(value)
  if (!parsed) throw new DraftError(`${label}: bitte eine https-URL wie https://github.com/organisation/repository angeben.`)
  // The GitHub App's installation token or the personal token; only ever sent to the configured GitHub host.
  const token = await cloneToken(parsed.url)
  const auth = token ? ['-c', `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`] : []
  const started = Date.now()
  log.info('import', `${label}: klone Repository`, { url: parsed.url })
  try {
    await run('git', [...auth, '-c', 'protocol.file.allow=never', '-c', 'protocol.ext.allow=never', 'clone', '--depth', '300', '--single-branch', '--', parsed.url, dir], { timeout: 180000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' } })
  } catch (error) {
    const detail = String(error.stderr || error.message).replace(/Authorization: \S+ \S+/g, 'Authorization: ***').trim().split('\n').pop()
    log.warn('import', `${label}: git clone fehlgeschlagen`, { url: parsed.url, detail })
    if (error.killed) throw new DraftError(`${label}: Das Klonen hat länger als 3 Minuten gedauert und wurde abgebrochen.`, 504)
    if (/not found|could not read Username|Authentication failed|403|401/i.test(detail)) throw new DraftError(`${label}: Repository nicht gefunden oder privat. Für private GitHub-Repositories einen GitHub-Token unter Einstellungen hinterlegen.`, 400)
    throw new DraftError(`${label}: Klonen fehlgeschlagen (${detail.slice(0, 160)}).`, 502)
  }
  log.info('import', `${label}: geklont`, { url: parsed.url, ms: Date.now() - started })
  return { name: parsed.name, url: parsed.url.replace(/\.git$/, ''), tree: await trackedTree(dir) }
}

/**
 * Every tracked path of a clone, the submodules (their content is not cloned, but exists) and the .gitignore rules:
 * links and file names in the documents are checked against them.
 */
async function trackedTree(dir) {
  const { stdout } = await run('git', ['-C', dir, 'ls-files', '-s', '-z'], { maxBuffer: 64 * 1024 * 1024, windowsHide: true })
  const paths = [], gitlinks = [], gitignore = {}
  for (const entry of stdout.split('\0').filter(Boolean)) {
    const [meta, file] = entry.split('\t')
    if (meta.startsWith('160000')) gitlinks.push(file); else paths.push(file)
  }
  for (const file of paths.filter((f) => f.split('/').pop() === '.gitignore').slice(0, 200)) {
    try { gitignore[file.split('/').slice(0, -1).join('/')] = fs.readFileSync(path.join(dir, file), 'utf8').slice(0, 100_000) } catch { /* unreadable: no rules */ }
  }
  // Deleted and renamed files of the history (as deep as the clone): "gibt es nicht mehr" rests on them, a rename gives the new place.
  const deleted = new Set(), renamed = {}
  try {
    const { stdout: log } = await run('git', ['-C', dir, 'log', '--format=', '--name-status', '--diff-filter=DR', '-M', '-z'], { maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: 60000 })
    const tokens = log.split('\0').map((t) => t.replace(/^\n+/, ''))
    for (let i = 0; i < tokens.length;) {
      const status = tokens[i]
      if (status.startsWith('R')) { renamed[tokens[i + 1]] ??= tokens[i + 2]; i += 3 } else if (status === 'D') { deleted.add(tokens[i + 1]); i += 2 } else i++
    }
  } catch { /* no history: nothing counts as deleted */ }
  const current = new Set(paths)
  return { paths: paths.slice(0, 50_000), gitlinks, gitignore, deleted: [...deleted].filter((f) => !current.has(f)).slice(0, 20_000), renamed: Object.fromEntries(Object.entries(renamed).filter(([from, to]) => !current.has(from) && current.has(to)).slice(0, 20_000)) }
}

/** What the browser sent about an uploaded folder: its paths and .gitignore rules (not trusted beyond strings). */
function uploadedTree(value) {
  if (!value || !Array.isArray(value.paths)) return null
  const clean = (p) => typeof p === 'string' && p.length < 1000 && !p.includes('\0')
  return { paths: value.paths.filter(clean).slice(0, 50_000), gitlinks: [], gitignore: Object.fromEntries(Object.entries(value.gitignore ?? {}).filter(([k, v]) => clean(k) && typeof v === 'string').slice(0, 200).map(([k, v]) => [k, v.slice(0, 100_000)])) }
}

/** Runs `use` with { name, repo, docs } folders and removes everything afterwards. */
export async function withUpload(zip, workDir, use) {
  const dir = path.join(workDir, `.upload-${randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  try {
    const manifest = zip?.length ? extract(zip, dir) : {}
    const repoDir = path.join(dir, 'repo'), docsDir = path.join(dir, 'docs')
    const has = (folder) => fs.existsSync(folder) && fs.readdirSync(folder).length > 0
    let repo = null, docs = null
    if (manifest.repoUrl) { if (has(repoDir)) fs.rmSync(repoDir, { recursive: true }); const cloned = await clone(manifest.repoUrl, repoDir, 'Repository'); repo = { dir: repoDir, label: cloned.name, url: cloned.url, tree: cloned.tree, source: 'url' } }
    else if (has(repoDir)) repo = { dir: repoDir, label: String(manifest.repoName || 'Repository').slice(0, 100), tree: uploadedTree(manifest.repoTree), source: 'upload' }
    if (manifest.docsUrl) { if (has(docsDir)) fs.rmSync(docsDir, { recursive: true }); const cloned = await clone(manifest.docsUrl, docsDir, 'Dokumentation'); docs = { dir: docsDir, label: cloned.name, url: cloned.url, tree: cloned.tree, source: 'url' } }
    else if (has(docsDir)) docs = { dir: docsDir, label: String(manifest.docsName || 'Dokumentation').slice(0, 100), tree: uploadedTree(manifest.docsTree), source: 'upload' }
    if (!repo) throw new DraftError('Repository fehlt: Ordner oder ZIP hochladen oder eine GitHub-URL angeben.')
    return await use({ name: String(manifest.projectName || repo.label).slice(0, 100), repo, docs })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
