// Links and file names in the documents that point to files the repository does not have (any more). No model:
// the import keeps every path of the repository and the documentation (also files it does not read), the submodules
// and the .gitignore rules. A finding is certain or it is not made: only text formats, nothing in code blocks, no
// URLs, no generated or local files (.gitignore, dist/, .env.local), no paths outside the repository.
import path from 'node:path'
import { gitignore } from '../frontend/src/dashboard/features/docs/import-rules.mjs'

// Files a document names in a code span: documents, configuration and source files with a real extension.
const FILE = /^(?:[\w@.+-]+\/)*[\w@+-][\w@.+-]*\.(md|mdx|markdown|txt|rst|adoc|ya?ml|json|toml|ini|properties|xml|csv|sql|java|kt|kts|tsx?|jsx?|mjs|cjs|py|go|rs|cs|pas|dpr|rb|php|swift|scala|sh|ps1|gradle|proto|graphql|html?|css|scss|svg|png|jpe?g|gif|pdf|docx|xlsx|pptx)$/i
// Output and local folders: a document may name what a build or a run creates there.
const OUTPUT = /(^|\/)(dist|build|out|target|node_modules|coverage|tmp|temp|cache|state|data|logs?|\.[^/]+)\//i
const TEXT_FORMATS = /^(md|mdx|markdown|txt|rst|adoc|asciidoc)$/i

/** The paths of one origin (repo, docs) as a lookup: files, folders, submodules, ignored paths, file names. */
export function fileTree(tree) {
  if (!tree?.paths) return null
  const files = new Set(tree.paths), dirs = new Set(), byName = new Map()
  for (const file of tree.paths) {
    const parts = file.split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
    const name = parts.at(-1)
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(file)
  }
  const ignore = gitignore(tree.gitignore ?? {}), gitlinks = tree.gitlinks ?? [], top = new Set(tree.paths.filter((f) => f.includes('/')).map((f) => f.split('/')[0]))
  const deleted = new Set(tree.deleted ?? []), renamed = tree.renamed ?? {}
  const deletedNames = new Set([...deleted, ...Object.keys(renamed)].map((f) => f.split('/').pop()))
  return {
    /** The file was deleted or renamed in the history (clones only). */
    gone: (p) => deleted.has(p) || p in renamed || [...deleted, ...Object.keys(renamed)].some((f) => f.endsWith(`/${p}`)),
    goneName: (name) => deletedNames.has(name) && !byName.has(name),
    renamedTo: (p) => renamed[p] ?? Object.entries(renamed).find(([from]) => from.endsWith(`/${p}`))?.[1] ?? null,
    /** The first folder of a path is one of this repository's top folders. */
    ownFolder: (p) => p.includes('/') && top.has(p.split('/')[0]),
    has: (p) => files.has(p) || dirs.has(p) || gitlinks.some((g) => p === g || p.startsWith(`${g}/`)) || ignore(p),
    endsWith: (p) => tree.paths.some((f) => f === p || f.endsWith(`/${p}`)),
    named: (name) => byName.get(name) ?? [],
  }
}

const relative = (fromDir, to) => { const r = path.posix.relative(fromDir || '.', to); return r || path.posix.basename(to) }
const listItem = (line) => /^\s*(?:[-*+]|\d+\.)\s+/.test(line)

/**
 * Findings for one section: kind removed, the gone path as absent, and an edit when the fix is clear (a moved file:
 * the new path; a list entry that only points to the file: delete it; a link in a sentence: keep its text). A file
 * name in a sentence without a clear fix becomes a question.
 */
export function fileFindings(section, source, trees) {
  if (!TEXT_FORMATS.test(source.format)) return { findings: [], questions: [] }
  const own = trees[source.origin === 'docs' ? 'docs' : 'repo'], other = trees[source.origin === 'docs' ? 'repo' : 'docs']
  if (!own) return { findings: [], questions: [] }
  const docPath = source.path.replace(/^(repository|dokumentation)\//, ''), docDir = path.posix.dirname(docPath) === '.' ? '' : path.posix.dirname(docPath)
  const findings = [], questions = [], seen = new Set()
  let fence = null
  section.text.split('\n').forEach((line, index) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1]
    if (fence) { if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null; return }
    if (marker) { fence = marker; return }
    const n = index + 1
    // Links and images: [text](target), ![alt](target), reference definitions [x]: target.
    for (const m of [...line.matchAll(/(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g), ...line.matchAll(/^\s*\[[^\]\n]+\]:\s*<?(\S+?)>?\s*$/g)]) {
      const reference = m.length === 2, target = reference ? m[1] : m[3]
      if (/^[a-z][a-z\d+.-]*:|^\/\/|^#|^\{|^</i.test(target)) continue
      let clean
      try { clean = decodeURI(target.replace(/[#?].*$/, '')) } catch { continue }
      if (!clean) continue
      const resolved = clean.startsWith('/') ? path.posix.normalize(clean.slice(1)) : path.posix.normalize(path.posix.join(docDir, clean))
      if (resolved.startsWith('..') || own.has(resolved.replace(/\/$/, '')) || seen.has(`${n}:${m[0]}`)) continue
      seen.add(`${n}:${m[0]}`)
      const name = path.posix.basename(resolved), renamed = own.renamedTo(resolved), moved = renamed ? [renamed] : own.named(name)
      const fixed = moved.length === 1 ? line.replace(m[0], m[0].replace(target, relative(docDir, moved[0]) + (target.match(/[#?].*$/)?.[0] ?? ''))) : null
      const edit = fixed ? { op: 'replace', start: n, end: n, text: fixed }
        : reference || (listItem(line) && line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').startsWith(m[0])) ? { op: 'delete', start: n, end: n, text: '' }
          : (() => { const text = line.replace(m[0], m[1] ? '' : m[2]).replace(/\s{2,}/g, ' ').trimEnd(); return text.trim() ? { op: 'replace', start: n, end: n, text } : { op: 'delete', start: n, end: n, text: '' } })()
      findings.push({
        kind: 'removed', doc_quote: m[0], absent: [clean],
        explanation: moved.length === 1 ? `Der Link zeigt auf ${clean}. Die Datei liegt jetzt unter ${moved[0]}.` : `Der Link zeigt auf ${clean}. Diese Datei gibt es im Repository nicht (mehr).`,
        evidence: moved.length === 1 ? [{ id: `file:${moved[0]}`, quote: moved[0], source: moved[0], file: moved[0] }] : [],
        edits: [edit], sure: true, files: true,
      })
    }
    // File names in code spans: `docs/setup.md`, `config/app.yaml`, `SECURITY.md`.
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const name = m[1].trim().replace(/^\.\//, '')
      if (!FILE.test(name) || OUTPUT.test(name) || name.split('/').pop().startsWith('.') || /^\.\.\//.test(m[1])) continue
      const resolved = path.posix.normalize(path.posix.join(docDir, name))
      if (own.has(name) || own.has(resolved) || own.endsWith(name) || other?.has(name) || other?.endsWith(name)) continue
      // Only when it is clearly a file of this repository: the history deleted or renamed it, or (a path) it lies in one
      // of the repository's own top folders. A bare name may belong to another project (`readme.md` of a library).
      if (!(name.includes('/') ? own.gone(name) || own.gone(resolved) || own.ownFolder(name) : own.goneName(name))) continue
      // Named in a link on the same line: already reported there.
      if (seen.has(`${n}:name:${name}`) || findings.some((f) => f.absent.some((a) => a.endsWith(name)) && f.edits[0].start === n)) continue
      seen.add(`${n}:name:${name}`)
      const renamedTo = own.renamedTo(name) ?? own.renamedTo(resolved)
      const moved = renamedTo ? [renamedTo] : [...own.named(path.posix.basename(name)), ...(other?.named(path.posix.basename(name)) ?? [])]
      const rowStart = /^\s*\|/.test(line) && line.replace(/^\s*\|\s*/, '').startsWith(m[0])
      const edit = moved.length === 1 ? { op: 'replace', start: n, end: n, text: line.replace(m[0], `\`${moved[0]}\``) }
        : (listItem(line) && line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').startsWith(m[0])) || rowStart ? { op: 'delete', start: n, end: n, text: '' } : null
      const explanation = moved.length === 1 ? `${name} gibt es so nicht mehr. Die Datei liegt jetzt unter ${moved[0]}.` : `Die Datei ${name} gibt es im Repository nicht (mehr).`
      if (!edit) { questions.push(`${explanation} Soll die Stelle angepasst oder gestrichen werden?`); continue }
      findings.push({ kind: 'removed', doc_quote: m[0], absent: [name], explanation, evidence: moved.length === 1 ? [{ id: `file:${moved[0]}`, quote: moved[0], source: moved[0], file: moved[0] }] : [], edits: [edit], sure: true, files: true })
    }
  })
  // Two findings on one line: the first one's edit wins, the other is dropped (the next check finds it again).
  const lines = new Set(), kept = []
  for (const f of findings) { if (lines.has(f.edits[0].start)) continue; lines.add(f.edits[0].start); kept.push(f) }
  return { findings: kept, questions }
}
