import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { parseCode, resolveJava, resolveTypeScript, parseSQL, sqlObjects } from './code-analysis.mjs'

export const digest = (value) => crypto.createHash('sha256').update(value).digest('hex')
const skip = (name) => /(^|\/)(\.git|node_modules|vendor|dist|build|coverage|\.env[^/]*)(\/|$)|(^|\/)([^/]*(secret|credential|private.?key)[^/]*|id_rsa|id_ed25519)(\.|$)|\.(pem|key|p12|pfx)$/i.test(name)
const CODE = /\.(java|kt|ts|tsx|pas|sql|js|jsx|py|go|rs|cs|yaml|yml|json)$/i
// Part of the project id: a changed importer builds a fresh project instead of reusing a stale graph.
const IMPORTER_VERSION = 2
const DOC = /\.(md|mdx|txt|rst|html)$/i
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
function revision(root, value) {
  if (typeof value !== 'string' || !/^[\w./~^@{}-]{1,180}$/.test(value) || value.startsWith('-')) throw new Error('Ungültiger Git-Stand.')
  try { return git(root, ['rev-parse', '--verify', `${value}^{commit}`]).trim() } catch { throw new Error(`Git-Stand ${value} nicht gefunden.`) }
}
function folder(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${label}: absoluten lokalen Pfad angeben.`)
  const root = fs.realpathSync.native(value)
  if (!fs.statSync(root).isDirectory()) throw new Error(`${label} ist kein Ordner.`)
  return root
}
function documents(root) {
  const result = []
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, item.name), relative = path.relative(root, absolute).replaceAll('\\', '/')
      if (item.isSymbolicLink() || skip(relative)) continue
      if (item.isDirectory()) walk(absolute)
      else if (DOC.test(relative)) {
        if (result.length >= 40) throw new Error('Maximal 40 Dokumente pro Projekt. Bitte einen kleineren Doku-Ordner wählen.')
        if (fs.statSync(absolute).size > 40000) throw new Error(`${relative}: Dokument über 40 KB. Für die Demo bitte kleinere Dokumente verwenden.`)
        let text = fs.readFileSync(absolute, 'utf8')
        if (/\.html$/i.test(relative)) text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<\/(p|h\d|li)>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
        if (!text.trim()) continue
        if (text.length > 8000) throw new Error(`${relative}: maximal 8.000 Zeichen je Dokument. Bitte in kleinere Dokumente teilen.`)
        result.push({ path: relative, text, id: `doc-${digest(relative).slice(0, 12)}`, title: text.match(/^#\s+(.+)$/m)?.[1] || path.basename(relative, path.extname(relative)) })
      }
    }
  }
  walk(root)
  if (!result.length) throw new Error('Keine Markdown-, Text-, RST- oder HTML-Dokumente gefunden.')
  return result
}

export async function importProject(input, { projectsDir }) {
  const repository = folder(input.repository, 'Repository'), documentation = folder(input.documentation, 'Dokumentation')
  try { if (path.relative(fs.realpathSync.native(git(repository, ['rev-parse', '--show-toplevel']).trim()), repository) !== '') throw new Error('root') } catch { throw new Error('Bitte den Stammordner eines lokalen Git-Repositories angeben.') }
  const head = revision(repository, input.head || 'HEAD')
  let base
  try { base = revision(repository, input.base || `${head}~1`) } catch (error) { if (input.base) throw error; throw new Error('Kein vorheriger Commit vorhanden. Bitte zwei gültige Git-Stände für den Vergleich angeben.') }
  const name = (input.name || path.basename(repository)).trim().slice(0, 100)
  if (!name) throw new Error('Projektname fehlt.')
  const docFiles = documents(documentation)
  const entries = git(repository, ['ls-tree', '-r', '-z', head]).split('\0').filter(Boolean).map((line) => { const tab = line.indexOf('\t'); return { header: line.slice(0, tab), file: line.slice(tab + 1) } })
  const files = [], warnings = []
  for (const entry of entries) {
    if (!entry.header.startsWith('100') || skip(entry.file) || !CODE.test(entry.file)) continue
    if (files.length >= 250) throw new Error('Maximal 250 Code-Dateien pro Projekt. Für größere Projekte zunächst einen kleineren Repository-Ausschnitt verwenden.')
    const text = git(repository, ['show', `${head}:${entry.file}`])
    if (Buffer.byteLength(text) > 100000) { warnings.push(`${entry.file}: über 100 KB, nicht analysiert.`); continue }
    files.push({ path: entry.file, text, id: `file:${entry.file}` })
  }
  if (!files.length) throw new Error('Keine unterstützten Code-Dateien im gewählten Git-Stand gefunden.')
  const changed = new Set(git(repository, ['diff', '--name-only', '-z', base, head]).split('\0').filter(Boolean))
  const deleted = git(repository, ['diff', '--diff-filter=D', '--name-only', '-z', base, head]).split('\0').filter((file) => file && CODE.test(file) && !skip(file))
  for (const file of files.filter((f) => changed.has(f.path))) file.diff = git(repository, ['diff', '--no-ext-diff', '--no-textconv', '--unified=3', base, head, '--', file.path])
  for (const file of deleted) {
    const text = git(repository, ['show', `${base}:${file}`])
    if (Buffer.byteLength(text) <= 100000) files.push({ path: file, text, id: `file:${file}`, deleted: true, diff: git(repository, ['diff', '--no-ext-diff', '--no-textconv', '--unified=3', base, head, '--', file]) })
  }
  if (!files.some((f) => f.diff)) warnings.push('Keine unterstützten Code-Änderungen zwischen den gewählten Ständen. Graph wird aufgebaut; keine Änderungsentwürfe möglich.')
  const configured = input.modules ?? []
  if (!Array.isArray(configured) || configured.length > 30 || configured.some((m) => typeof m.name !== 'string' || !m.name.trim() || typeof m.path !== 'string' || typeof m.description !== 'string' || m.description.length > 2000 || m.path.includes('..'))) throw new Error('Komponenten benötigen Name, relativen Pfad und Beschreibung; maximal 30 Komponenten.')
  const moduleDefs = configured.length ? configured.map((m, i) => ({ id: `module-${i}`, name: m.name.slice(0, 100), path: m.path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, ''), description: m.description || m.name })) : [...new Set(files.map((f) => f.path.includes('/') ? f.path.split('/')[0] : 'Repository'))].slice(0, 30).map((name, i) => ({ id: `module-${i}`, name, path: name === 'Repository' ? '' : name, description: `Technischer Ordner ${name}; fachliche Verantwortung noch nicht konfiguriert.` }))
  const id = digest(JSON.stringify({ importer: IMPORTER_VERSION, repository, documentation, base, head, docs: docFiles.map((d) => [d.path, digest(d.text)]), moduleDefs })).slice(0, 20)
  const stateDir = path.join(projectsDir, id), snapshot = path.join(stateDir, 'snapshot')
  fs.mkdirSync(snapshot, { recursive: true })
  // TypeScript resolution runs against a private snapshot, never a user's working tree.
  for (const file of files.filter((f) => !f.deleted)) {
    const absolute = path.resolve(snapshot, file.path)
    if (!absolute.startsWith(snapshot + path.sep)) throw new Error('Unsicherer Dateipfad im Git-Snapshot.')
    fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, file.text)
  }
  const nodes = [], edges = [], analyses = [], parserReport = { files: [], sql: [], unresolvedCalls: [] }
  const evidence = (file) => ({ source: `${file.path} @ ${(file.deleted ? base : head).slice(0, 8)}`, text: file.text.slice(0, 1800), line: 1 })
  const link = (source, target, kind, proof, certainty = 'belegt') => edges.push({ id: `${source}->${target}:${kind}`, source, target, kind, certainty, evidence: proof })
  for (const m of moduleDefs) nodes.push({ id: `m:${m.id}`, type: 'module', label: m.name, sub: 'Komponente', description: m.description })
  for (const file of files) {
    nodes.push({ id: file.id, type: 'file', label: path.basename(file.path), sub: file.path, path: file.path, description: file.deleted ? 'Im Vergleichsstand gelöscht.' : 'Importierter Git-Snapshot.', evidence: [evidence(file)] })
    const module = [...moduleDefs].sort((a, b) => b.path.length - a.path.length).find((m) => !m.path || file.path === m.path || file.path.startsWith(m.path + '/'))
    file.module = module?.id
    if (module) link(file.id, `m:${module.id}`, 'module', { source: 'Komponenten-Konfiguration', text: `${file.path} → ${module.name}; Verzeichnisregel`, method: 'Konfigurierte Pfadregel' }, 'abgeleitet')
    if (file.deleted) continue
    const analysis = await parseCode(file.path, file.text)
    if (analysis) {
      analyses.push(analysis); parserReport.files.push({ file: file.path, language: analysis.language, status: analysis.errors.length ? 'partial' : 'parsed', errors: analysis.errors })
      if (!analysis.errors.length) for (const symbol of analysis.functions) {
        nodes.push({ id: symbol.id, type: 'function', label: `${symbol.name}()`, sub: `${file.path}:${symbol.line}`, path: file.path, evidence: [symbol.evidence] })
        link(file.id, symbol.id, 'defines', symbol.evidence)
      }
    } else if (/\.sql$/i.test(file.path)) {
      try {
        const ast = await parseSQL(file.text); parserReport.sql.push({ source: file.path, status: 'parsed' })
        for (const statement of ast.stmts) {
          const declared = statement.stmt.CreateStmt?.relation || statement.stmt.ViewStmt?.view
          if (declared && !nodes.some((n) => n.id === `table:${declared.relname}`)) nodes.push({ id: `table:${declared.relname}`, type: statement.stmt.ViewStmt ? 'view' : 'table', label: declared.relname, sub: 'SQL', evidence: [evidence(file)] })
          for (const ref of sqlObjects(statement, (o) => !!o.RangeVar)) if (nodes.some((n) => n.id === `table:${ref.RangeVar.relname}`)) link(file.id, `table:${ref.RangeVar.relname}`, declared ? 'schema' : 'reads', evidence(file))
        }
      } catch { parserReport.sql.push({ source: file.path, status: 'error' }) }
    } else warnings.push(`${file.path}: als Quelle importiert; für diese Sprache kein AST-Parser konfiguriert.`)
  }
  for (const resolved of [resolveJava(analyses), resolveTypeScript(snapshot, analyses)]) {
    for (const edge of resolved.edges) link(edge.source, edge.target, edge.kind, edge.evidence, edge.certainty)
    parserReport.unresolvedCalls.push(...resolved.unresolved)
  }
  for (const a of analyses.filter((a) => ['kotlin', 'pascal'].includes(a.language))) for (const call of a.calls) parserReport.unresolvedCalls.push({ file: a.file, line: call.evidence.line, name: call.name, reason: 'Kein Compiler-Typkontext für diese Sprache' })
  const now = new Date().toISOString(), date = now.slice(0, 10), bundleId = `change-${head.slice(0, 12)}`
  const commits = git(repository, ['log', '--format=%H%x00%aI%x00%an%x00%s', `${base}..${head}`, '--max-count=100']).trim().split('\n').filter(Boolean).map((line) => { const [hash, date, author, message] = line.split('\0'); return { hash, date: date.slice(0, 10), author, message, kind: 'schnittstelle', files: git(repository, ['diff-tree', '--no-commit-id', '--name-only', '-r', hash]).trim().split('\n').filter((f) => f && !skip(f)) } })
  nodes.push({ id: `f:${bundleId}`, type: 'feature', label: `${base.slice(0, 8)} → ${head.slice(0, 8)}`, sub: `${commits.length} Commits`, description: 'Importierter Git-Vergleich.' })
  const commitDiffs = {}
  let diffBytes = 0
  for (const commit of commits) {
    commitDiffs[commit.hash] = []
    nodes.push({ id: `c:${commit.hash}`, type: 'commit', label: commit.message, sub: `${commit.hash.slice(0, 8)} · ${commit.author}`, date: commit.date })
    link(`c:${commit.hash}`, `f:${bundleId}`, 'commit', { source: 'Git-Historie', text: commit.message })
    for (const file of commit.files.filter((f) => CODE.test(f))) {
      const diff = git(repository, ['show', '--format=', '--no-ext-diff', '--no-textconv', commit.hash, '--', file])
      if (diffBytes + Buffer.byteLength(diff) > 8000000) { warnings.push('Commit-Diffs über 8 MB: weitere Diffs wurden nicht importiert.'); break }
      diffBytes += Buffer.byteLength(diff)
      commitDiffs[commit.hash].push({ new_path: file, old_path: file, diff, new_file: diff.includes('new file mode'), deleted_file: diff.includes('deleted file mode'), renamed_file: false })
      if (nodes.some((n) => n.id === `file:${file}`)) link(`c:${commit.hash}`, `file:${file}`, 'changes', { source: `${file} @ ${commit.hash.slice(0, 8)}`, text: diff.slice(0, 1800) })
    }
  }
  for (const file of files.filter((f) => f.diff)) link(`f:${bundleId}`, file.id, 'changes', { source: `${base.slice(0, 8)}..${head.slice(0, 8)}:${file.path}`, text: file.diff.slice(0, 1800) })
  for (const doc of docFiles) nodes.push({ id: `doc:${doc.id}`, type: 'doc', label: doc.title, sub: doc.path, doc: doc.id, evidence: [{ source: doc.path, text: doc.text.slice(0, 1800) }] })
  const dataset = { company: { name, short: 'Lokales Projekt', product: name, claim: 'Importiertes Projekt' }, currentUser: { name: 'Lokaler Nutzer', role: 'Prüfung & Freigabe', initials: 'DU' }, release: { id: head.slice(0, 8), freeze: date, ship: date }, modules: Object.fromEntries(moduleDefs.map((m) => [m.id, m.name])), people: { local: { name: 'Lokaler Nutzer', role: 'Prüfung & Freigabe' } }, docs: docFiles.map((d) => ({ id: d.id, title: d.title, type: 'technik', modules: [], owner: 'local', version: head.slice(0, 8), updated: date, pages: 1, blocks: [{ kind: 'p', text: d.text }] })), bundles: [{ id: bundleId, title: `Änderungen in ${name}`, ticket: 'Lokaler Git-Vergleich', mr: `${base.slice(0, 8)}..${head.slice(0, 8)}`, merged: date, path: [name], classifiedVia: ['Git-Vergleich', 'Statische Analyse'], summary: 'Jev prüft die Dokumente gegen die importierten Code-Änderungen.', aspects: moduleDefs.map((m) => ({ kind: 'schnittstelle', module: m.id, text: m.description, commits: commits.map((c) => c.hash) })), commits }], proposals: [], backtest: [] }
  const graph = { nodes, edges, metadata: { snapshot: head, sources: ['Git', 'Lokale Dokumente'], method: 'Tree-sitter, TypeScript-Symbolauflösung und PostgreSQL AST; statische Analyse.', analysis: parserReport, semantic: { status: 'missing' } } }
  return { id, name, repository, documentation, base, head, createdAt: now, files, docFiles, moduleDefs, warnings, dataset, graph, commitDiffs, mapping: null, generated: {}, decisions: {}, events: [] }
}
