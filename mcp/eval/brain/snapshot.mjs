// A repository at one ref, read straight from Git: code files and documents as the importer would classify them,
// documents split into sections. Nothing is checked out; blobs are read with one `git cat-file --batch`.
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { classify } from '../../../frontend/src/dashboard/features/docs/import-rules.mjs'
import { sections } from '../../doc-text.mjs'
import { headingsOf, markdownHeadings } from '../../code-brain.mjs'

export const srcDir = fileURLToPath(new URL('../../state/eval/src/', import.meta.url))
export const git = (repo, ...args) => execFileSync('git', args, { cwd: path.join(srcDir, repo), encoding: 'utf8', maxBuffer: 1 << 30 })

/** Contents of many blobs at once (oids or `rev:path` names): name → text; missing ones are left out. */
export function blobs(repo, names) {
  const out = new Map()
  if (!names.length) return out
  const raw = execFileSync('git', ['cat-file', '--batch'], { cwd: path.join(srcDir, repo), input: names.join('\n') + '\n', maxBuffer: 1 << 30 })
  let at = 0
  for (const name of names) {
    const nl = raw.indexOf(10, at), header = raw.subarray(at, nl).toString().split(' ')
    if (header.at(-1) === 'missing' || header[1] === 'missing') { at = nl + 1; continue }
    const n = Number(header[2])
    out.set(name, raw.subarray(nl + 1, nl + 1 + n).toString('utf8'))
    at = nl + 1 + n + 1
  }
  return out
}

/** Files of a tree: [{ path, oid, size }]. */
export const tree = (repo, ref) => git(repo, 'ls-tree', '-r', '-l', ref).split('\n').filter(Boolean).map((l) => {
  const [meta, file] = l.split('\t'), [, type, oid, size] = meta.split(/\s+/)
  return type === 'blob' ? { path: file, oid, size: Number(size) } : null
}).filter(Boolean)

/**
 * The snapshot the mapping sees: code files and documents (README, docs/…, Markdown, reStructuredText, AsciiDoc),
 * documents split into sections with the product's splitter. Headings of other formats are written as Markdown
 * headings first, so that one splitter serves all formats.
 */
export function snapshot(repo, ref, { maxCodeBytes = 100_000 } = {}) {
  const entries = tree(repo, ref)
  const code = entries.filter((e) => classify(e.path, 'repo') === 'code' && e.size <= maxCodeBytes)
  const docs = entries.filter((e) => classify(e.path, 'repo') === 'doc' && /\.(md|mdx|markdown|rst|adoc|asciidoc|txt)$/i.test(e.path) && e.size <= 2_000_000)
  const text = blobs(repo, [...code, ...docs].map((e) => e.oid))
  const files = code.map((e) => ({ id: `file:${e.path}`, path: e.path, text: text.get(e.oid) ?? '' }))
  const docFiles = []
  for (const d of docs) {
    const raw = text.get(d.oid) ?? '', md = markdownHeadings(raw, d.path)
    let offset = 0
    sections(md).forEach((part, i) => {
      if (part.trim()) docFiles.push({ id: `${d.path}#${i + 1}`, path: d.path, part: i + 1, text: part, start: offset, end: offset + part.length, heading: headingsOf(part, 'x.md')[0]?.title ?? null })
      offset += part.length
    })
  }
  return { repo, ref, files, docFiles, docText: new Map(docs.map((d) => [d.path, markdownHeadings(text.get(d.oid) ?? '', d.path)])) }
}
