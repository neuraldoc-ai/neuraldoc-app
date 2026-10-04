// Benchmarks for the initial check. Each one yields the upload a browser would send (repo/…, docs/…) and the
// expected changes with the code files they depend on. Ground truth is read only here, never by the product.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { classify, ignored } from '../../frontend/src/dashboard/features/docs/import-rules.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
export const evalDir = path.join(root, 'mcp', 'state', 'eval')
export const BENCHMARKS = ['mobiq', 'httpx', 'zx', 'cobra']
const { zipSync, strToU8 } = await import('../../frontend/server-deps.mjs')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })
const walk = (dir, visit, base = dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === '.git') continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, visit, base); else visit(path.relative(base, p).replaceAll('\\', '/'), p) } }
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')}$`)

/** Expected changes: { id, doc (key), anchor, level, kind, what, files[] }; docs: key → 'must' | 'should'. */
function mobiq() {
  const data = path.join(root, 'datasets', 'mobiq', 'data')
  const entries = { 'manifest.json': strToU8(JSON.stringify({ repoName: 'mobiq-code', docsName: 'mobiq-doku' })) }
  walk(path.join(root, 'datasets', 'mobiq-code'), (rel, abs) => { entries[`repo/${rel}`] = fs.readFileSync(abs) })
  walk(path.join(root, 'datasets', 'mobiq-docs', 'dokumente', 'files'), (rel, abs) => { entries[`docs/dateien/${rel}`] = fs.readFileSync(abs) })
  const storage = path.join(root, 'datasets', 'mobiq-docs', 'confluence', 'storage')
  for (const file of fs.readdirSync(storage)) {
    const xml = fs.readFileSync(path.join(storage, file), 'utf8'), title = xml.match(/<!--\s*\w+ \/ (.+?) \(Version/)?.[1] || file
    entries[`docs/confluence/${file.replace(/\.xml$/, '.html')}`] = strToU8(`<h1>${title}</h1>\n${xml.replace(/<!--[\s\S]*?-->/g, '')}`)
  }
  const truth = JSON.parse(fs.readFileSync(path.join(data, 'ground-truth.json'), 'utf8'))
  const diffs = JSON.parse(fs.readFileSync(path.join(data, 'gitlab', 'diffs.json'), 'utf8'))
  const items = truth.changes.flatMap((c) => {
    const files = [...new Set(c.commits.flatMap((k) => (diffs[k.sha] || []).map((d) => d.new_path)))]
    return c.expected.filter((e) => e.source !== 'neu').map((e, i) => ({ id: `${c.id}-${i + 1}`, doc: e.source === 'confluence' ? e.pageId : e.title, title: e.title, anchor: e.section?.replace(/^(nach|vor)\s+/i, ''), level: e.level, kind: e.kind, what: e.what, files }))
  })
  return { name: 'mobiq', language: 'Java/Kotlin/TS/Pascal/SQL, German docs', upload: Buffer.from(zipSync(entries)), items, keyOf: (docPath) => docPath.match(/confluence\/(\d+)-/)?.[1] || path.basename(docPath) }
}

function oss(name) {
  const spec = JSON.parse(fs.readFileSync(fileURLToPath(new URL(`./benchmarks/${name}.json`, import.meta.url)), 'utf8'))
  const src = path.join(evalDir, 'src'), clone = path.join(src, name)
  if (!fs.existsSync(clone)) { fs.mkdirSync(src, { recursive: true }); git(src, 'clone', '--quiet', '--filter=blob:none', spec.repo, name) }
  const tree = (ref) => {
    const dir = path.join(src, `${name}@${ref.ref}`)
    if (!fs.existsSync(dir)) git(clone, '-c', 'core.autocrlf=false', 'worktree', 'add', '--detach', dir, ref.commit)
    return dir
  }
  const entries = { 'manifest.json': strToU8(JSON.stringify({ repoName: `${name}-${spec.code.ref}`, docsName: `${name}-docs-${spec.docs.ref}` })) }
  // The repository at the new version, without its own (new) documentation; the old documentation as separate upload.
  walk(tree(spec.code), (rel, abs) => { if (!ignored(rel) && classify(rel, 'repo') === 'code') entries[`repo/${rel}`] = fs.readFileSync(abs) })
  const include = spec.docs.include.map(glob), exclude = spec.docs.exclude.map(glob)
  walk(tree(spec.docs), (rel, abs) => { if (include.some((r) => r.test(rel)) && !exclude.some((r) => r.test(rel))) entries[`docs/${rel}`] = fs.readFileSync(abs) })
  return { name, language: spec.language, upload: Buffer.from(zipSync(entries)), items: spec.items.map((i) => ({ ...i, title: i.doc })), keyOf: (docPath) => docPath.replace(/^dokumentation\//, '') }
}

export const loadBenchmark = (name) => name === 'mobiq' ? mobiq() : oss(name)

/** Section of an item: the one containing its anchor, else every section of its document. */
export function sectionsOf(item, docFiles, keyOf) {
  const sections = docFiles.filter((d) => d.origin === 'docs' && keyOf(d.path) === item.doc)
  if (sections.length <= 1 || !item.anchor) return sections
  const exact = sections.filter((d) => d.text.includes(item.anchor))
  if (exact.length) return exact.slice(0, 1)
  const number = item.anchor.match(/^\d+(\.\d+)*/)?.[0]
  const byNumber = number ? sections.filter((d) => new RegExp(`(^|\\n)#+\\s*${number.replace(/\./g, '\\.')}\\b`).test(d.text)) : []
  return byNumber.length ? byNumber.slice(0, 1) : sections
}
