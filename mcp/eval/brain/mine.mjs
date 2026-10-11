// Ground truth for the code brain from the maintainers' own history, not from anyone who knows the answer: a commit
// that changes a documentation section together with a few product files links that section to those files. Only
// sections and files that still exist in the snapshot count. The mapping never sees the history.
//
//   node mcp/eval/brain/mine.mjs [--repo ky,zx] [--years 4]
import fs from 'node:fs'
import path from 'node:path'
import { classify } from '../../../frontend/src/dashboard/features/docs/import-rules.mjs'
import { isTest } from '../../retrieval.mjs'
import { proseWords } from '../../doc-text.mjs'
import { headingsOf } from '../../code-brain.mjs'
import { REPOS } from './repos.mjs'
import { git, blobs, snapshot } from './snapshot.mjs'

export const brainDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../state/eval/brain')
fs.mkdirSync(brainDir, { recursive: true })
const arg = (n, d) => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d

// Build and tool files, CI and the documentation site's own code say nothing about what a section describes.
const MANIFEST = /(^|\/)(mkdocs[^/]*\.ya?ml|sidebars?\.(js|ts|json)|_sidebar\.md|nav[^/]*\.ya?ml|docusaurus[^/]*|package\.json|tsconfig[^/]*\.json|jsconfig\.json|go\.(mod|sum|work)|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradle\.properties|libs\.versions\.toml|pyproject\.toml|setup\.(py|cfg)|Cargo\.toml|Makefile|Dockerfile|mkdocs\.ya?ml|antora\.ya?ml|[^/]*\.config\.(js|ts|mjs|cjs|mts)|\.eslintrc[^/]*|eslint\.config\.[a-z]+|\.prettierrc[^/]*|renovate\.json5?|netlify\.toml|vercel\.json|tox\.ini|noxfile\.py|requirements[^/]*\.txt|\.pre-commit[^/]*|\.editorconfig|\.gitattributes|\.golangci\.ya?ml|biome\.json|turbo\.json|lerna\.json|pnpm-workspace\.yaml|\.?codecov\.ya?ml)$|(^|\/)(\.github|\.circleci|\.devcontainer|\.husky|\.changeset|gradle\/wrapper)\//i
// A docs/ folder may hold product code (cobra's doc generators); only web and config files there belong to the site.
const DOC_SITE = /(^|\/)(www|website|site|antora)\/|(^|\/)(docs?|documentation)\/.*\.(jsx?|tsx?|mjs|cjs|vue|css|scss|ya?ml|json|toml|py)$/i
const NOISE = /^(chore|build|ci|release|bump|deps|style|revert)\b|^Revert\b|\b(typos?|lint(ing)?|prettier|reformat|formatting|bump|release v?\d|merge branch|update dependenc)/i
export const productFile = (p) => classify(p, 'repo') === 'code' && !isTest(p) && !MANIFEST.test(p) && !DOC_SITE.test(p)
const norm = (t) => t.toLowerCase().replace(/[`*_:.()?!'"]/g, '').replace(/\s+/g, ' ').trim()

/** Post-image line numbers (0-based) a commit changed per file, with the added text. */
function changedLines(diff) {
  const out = new Map()
  let file = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); out.set(file, { lines: new Set(), added: [] }); continue }
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (h && file) { const start = Number(h[1]), n = h[2] === undefined ? 1 : Number(h[2]); for (let i = 0; i < Math.max(1, n); i++) out.get(file).lines.add(Math.max(0, start - 1 + i)); continue }
    if (file && line.startsWith('+') && !line.startsWith('+++')) out.get(file).added.push(line.slice(1))
    if (file && line.startsWith('-') && !line.startsWith('---')) out.get(file).added.push(line.slice(1))
  }
  return out
}

export async function mine(r, { years = 4 } = {}) {
  const snap = snapshot(r.name, r.ref)
  const codePaths = new Set(snap.files.map((f) => f.path))
  // Snapshot headings: doc path → normalized title → section id.
  const where = new Map()
  for (const [doc, text] of snap.docText) {
    const map = new Map(), starts = []
    let at = 0
    for (const l of text.split('\n')) { starts.push(at); at += l.length + 1 }
    for (const h of headingsOf(text, 'x.md')) {
      const offset = starts[h.line], section = snap.docFiles.find((s) => s.path === doc && offset >= s.start && offset < s.end)
      if (section && !map.has(norm(h.title))) map.set(norm(h.title), section.id)
    }
    // Text before the first heading belongs to the first section.
    map.set('', snap.docFiles.find((s) => s.path === doc)?.id)
    where.set(doc, map)
  }
  const until = Number(git(r.name, 'log', '-1', '--format=%ct', r.ref).trim())
  const log = git(r.name, 'log', r.ref, '--no-merges', `--since=${until - years * 365 * 86400}`, '--format=%x00%H%x09%s', '--name-only')
  const commits = log.split('\0').filter(Boolean).map((block) => {
    const [head, ...rest] = block.split('\n'), [sha, subject] = head.split('\t')
    return { sha, subject, files: rest.filter(Boolean) }
  })
  const links = new Map(), stats = { commits: commits.length, both: 0, used: 0, sectionsGone: 0, filesGone: 0 }
  for (const c of commits) {
    const docs = c.files.filter((f) => classify(f, 'repo') === 'doc' && where.has(f))
    const code = c.files.filter(productFile)
    if (!docs.length || !code.length) continue
    stats.both++
    if (code.length > 5 || NOISE.test(c.subject)) continue
    const alive = code.filter((f) => codePaths.has(f))
    if (!alive.length) { stats.filesGone++; continue }
    let diff
    try { diff = changedLines(git(r.name, 'diff', '-U0', '--no-color', '--no-ext-diff', `${c.sha}^`, c.sha, '--', ...docs)) } catch { continue }
    const post = blobs(r.name, docs.map((d) => `${c.sha}:${d}`))
    const touched = []
    docs.forEach((d, i) => {
      const changed = diff.get(d), text = post.get(`${c.sha}:${d}`)
      if (!changed || text === undefined || proseWords(changed.added.join(' ')).length < 3) return
      const hs = headingsOf(text, d)
      const titles = new Set([...changed.lines].map((l) => { const h = hs.filter((x) => x.line <= l).at(-1); return h ? norm(h.title) : '' }))
      for (const t of titles) touched.push({ doc: d, title: t, section: where.get(d).get(t) })
    })
    if (!touched.length || touched.length > 4) continue
    stats.used++
    for (const t of touched) {
      if (!t.section) { stats.sectionsGone++; continue }
      const entry = links.get(t.section) ?? { section: t.section, doc: t.doc, heading: t.title, files: {}, commits: [] }
      for (const f of alive) entry.files[f] = (entry.files[f] ?? 0) + 1 / alive.length
      entry.commits.push({ sha: c.sha.slice(0, 10), subject: c.subject.slice(0, 100), files: alive, sections: touched.length })
      // Strict: a commit that changed at most two sections and three product files says unambiguously what goes together.
      if (touched.length <= 2 && alive.length <= 3) { entry.strict ??= {}; for (const f of alive) entry.strict[f] = (entry.strict[f] ?? 0) + 1 }
      links.set(t.section, entry)
    }
  }
  const gt = { repo: r.name, ref: r.ref, years, stats: { ...stats, sections: links.size, pairs: [...links.values()].reduce((s, l) => s + Object.keys(l.files).length, 0), docSections: snap.docFiles.length, codeFiles: snap.files.length }, links: [...links.values()] }
  fs.writeFileSync(path.join(brainDir, `${r.name}.gt.json`), JSON.stringify(gt, null, 1))
  return gt
}

if (import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop())) {
  const only = arg('--repo')?.split(',')
  for (const r of REPOS.filter((r) => !only || only.includes(r.name))) {
    const t = Date.now(), gt = await mine(r, { years: Number(arg('--years', 4)) })
    console.log(`${r.name.padEnd(20)} ${r.split.padEnd(4)} ${JSON.stringify(gt.stats)} ${((Date.now() - t) / 1000).toFixed(0)}s`)
  }
}
