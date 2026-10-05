import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseCode, resolveJava, resolveTypeScript, parseSQL, sqlObjects } from './code-analysis.mjs'
import { classify, ignored, LIMITS } from '../frontend/src/dashboard/features/docs/import-rules.mjs'
import { documentText, isBinaryDoc, sections } from './doc-text.mjs'
import { log } from './log.mjs'

export const digest = (value) => crypto.createHash('sha256').update(value).digest('hex')
// Part of the project id: a changed importer builds a fresh project instead of reusing a stale graph.
const IMPORTER_VERSION = 3
export const BUNDLE_ID = 'erstpruefung'

/** Every regular file below root as a POSIX path; symlinks and ignored folders are never followed. */
function walk(root, visit, dir = root) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(dir, item.name), relative = path.relative(root, absolute).replaceAll('\\', '/')
    if (item.isSymbolicLink() || ignored(relative)) continue
    if (item.isDirectory()) walk(root, visit, absolute)
    else if (item.isFile()) visit(relative, absolute)
  }
}

const DOC_TYPES = [
  [/\.(xlsx|csv)$|param|konfig|config|einstellung|settings/, 'parameter'],
  [/install|setup|deploy|betrieb|getting.?started|quickstart/, 'installation'],
  [/archit|design|adr\//, 'architektur'],
  [/dialog|maske|screen|oberfl/, 'dialog'],
  [/handbuch|manual|anleitung|benutzer|user|guide|faq|schulung|training|tutorial/, 'nutzer'],
]
const docType = (file) => DOC_TYPES.find(([pattern]) => pattern.test(file.toLowerCase()))?.[1] || 'technik'
const fileTitle = (file) => path.basename(file, path.extname(file)).replace(/_+/g, ' ').trim()
const heading = (text) => text.match(/^#{1,3}\s+(.+)$/m)?.[1].trim().slice(0, 120)
// PDF pages, slides and sheets get generated headings ("Seite 1"); their title is the file name.
const titleOf = (text, file, format) => (!/^(pdf|pptx|xlsx|csv)$/.test(format) && heading(text)) || fileTitle(file)

/**
 * Imports a code snapshot and documents from server-owned folders (an extracted upload or a fresh clone).
 * input: { name, repo: { dir, label, source }, docs?: { dir, label, source } }
 */
export async function importProject(input, { projectsDir }) {
  const started = Date.now(), warnings = [], files = [], docSources = []
  const name = String(input.name || input.repo?.label || '').trim().slice(0, 100) || 'Projekt'
  const collect = async (origin, root) => {
    const pending = []
    walk(root, (relative, absolute) => {
      const kind = classify(relative, origin === 'docs' ? 'docs' : 'repo'), size = fs.statSync(absolute).size
      if (kind === 'code') {
        if (size > LIMITS.codeBytes) { warnings.push(`${relative}: über 100 KB, als Code nicht analysiert.`); return }
        if (files.length >= LIMITS.codeFiles) throw new Error(`Mehr als ${LIMITS.codeFiles} Code-Dateien. Bitte einen kleineren Teil des Repositories hochladen.`)
        files.push({ path: relative, text: fs.readFileSync(absolute, 'utf8'), id: `file:${relative}` })
      } else if (kind === 'doc') {
        if (size > LIMITS.fileBytes) { warnings.push(`${relative}: über 30 MB, nicht gelesen.`); return }
        pending.push({ relative, absolute })
      }
    })
    for (const { relative, absolute } of pending) {
      const bytes = fs.readFileSync(absolute), shown = `${origin === 'docs' ? 'dokumentation' : 'repository'}/${relative}`
      let text
      try { text = await documentText(relative, bytes) } catch (error) { warnings.push(error.message); continue }
      if (!text.trim()) { warnings.push(`${relative}: kein lesbarer Text (z. B. gescanntes PDF ohne Texterkennung).`); continue }
      docSources.push({ id: `src-${digest(shown).slice(0, 12)}`, path: shown, origin, format: path.extname(relative).slice(1).toLowerCase() || 'txt', binary: isBinaryDoc(relative) || /\.(html?|xml)$/i.test(relative), sha256: digest(bytes), text })
    }
  }
  if (!input.repo?.dir) throw new Error('Repository fehlt.')
  await collect('repo', input.repo.dir)
  if (input.docs?.dir) await collect('docs', input.docs.dir)
  if (!files.length) throw new Error('Keine Code-Dateien gefunden. Bitte den Ordner des Repositories (mit den Quelltexten) hochladen.')
  if (!docSources.length) throw new Error(input.docs?.dir ? 'Keine lesbaren Dokumente gefunden. Unterstützt: Markdown, Text, HTML, PDF, Word, Excel, PowerPoint und CSV.' : 'Im Repository gibt es keine Dokumentation (README, docs/, PDFs). Bitte die Doku zusätzlich hochladen.')

  // Long documents become consecutive sections; each one is checked and drafted on its own.
  const docFiles = []
  for (const source of docSources) {
    const parts = sections(source.text).filter((part) => part.trim())
    const title = titleOf(source.text, source.path, source.format)
    parts.forEach((text, i) => docFiles.push({ id: `doc-${digest(`${source.id}:${i}`).slice(0, 12)}`, source: source.id, path: source.path, origin: source.origin, format: source.format, part: i + 1, parts: parts.length, title: parts.length > 1 ? `${title} · ${heading(text)?.slice(0, 80) || `Teil ${i + 1}`}` : title, type: docType(source.path), text }))
  }
  if (docFiles.length > LIMITS.sections) throw new Error(`Die Dokumente ergeben ${docFiles.length} Abschnitte, erlaubt sind ${LIMITS.sections}. Bitte weniger oder kürzere Dokumente hochladen.`)

  const moduleDefs = [...new Set(files.map((f) => f.path.includes('/') ? f.path.split('/')[0] : 'Repository'))].slice(0, 30).map((folder, i) => ({ id: `module-${i}`, name: folder, path: folder === 'Repository' ? '' : folder, description: `Ordner ${folder} im Repository.` }))
  const id = digest(JSON.stringify({ importer: IMPORTER_VERSION, name, code: files.map((f) => [f.path, digest(f.text)]), docs: docSources.map((d) => [d.path, d.sha256]) })).slice(0, 20)
  const snapshot = path.join(projectsDir, id, 'snapshot')
  fs.rmSync(snapshot, { recursive: true, force: true }); fs.mkdirSync(snapshot, { recursive: true })
  // TypeScript resolution runs against a private copy, never against the upload folder.
  for (const file of files) {
    const absolute = path.resolve(snapshot, file.path)
    if (!absolute.startsWith(snapshot + path.sep)) throw new Error('Unsicherer Dateipfad im Repository.')
    fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, file.text)
  }

  const nodes = [], edges = [], analyses = [], parserReport = { files: [], sql: [], unresolvedCalls: [] }
  const evidence = (file) => ({ source: file.path, text: file.text.slice(0, 1800), line: 1 })
  const link = (source, target, kind, proof, certainty = 'belegt') => edges.push({ id: `${source}->${target}:${kind}`, source, target, kind, certainty, evidence: proof })
  for (const m of moduleDefs) nodes.push({ id: `m:${m.id}`, type: 'module', label: m.name, sub: 'Ordner', description: m.description })
  for (const file of files) {
    nodes.push({ id: file.id, type: 'file', label: path.basename(file.path), sub: file.path, path: file.path, description: 'Aktueller Stand des Repositories.', evidence: [evidence(file)] })
    const module = [...moduleDefs].sort((a, b) => b.path.length - a.path.length).find((m) => !m.path || file.path === m.path || file.path.startsWith(m.path + '/'))
    file.module = module?.id
    if (module) link(file.id, `m:${module.id}`, 'module', { source: 'Ordnerstruktur', text: `${file.path} → ${module.name}`, method: 'Pfadregel' }, 'abgeleitet')
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
    }
  }
  for (const resolved of [resolveJava(analyses), resolveTypeScript(snapshot, analyses)]) {
    for (const edge of resolved.edges) link(edge.source, edge.target, edge.kind, edge.evidence, edge.certainty)
    parserReport.unresolvedCalls.push(...resolved.unresolved)
  }
  for (const a of analyses.filter((a) => ['kotlin', 'pascal'].includes(a.language))) for (const call of a.calls) parserReport.unresolvedCalls.push({ file: a.file, line: call.evidence.line, name: call.name, reason: 'Kein Compiler-Typkontext für diese Sprache' })
  const unparsed = files.filter((f) => !analyses.some((a) => a.file === f.path) && !/\.sql$/i.test(f.path)).length
  if (unparsed) warnings.push(`${unparsed} Dateien ohne Strukturanalyse (z. B. Konfiguration oder Sprachen ohne Parser); sie werden trotzdem mit der Doku verglichen.`)

  const now = new Date().toISOString(), date = now.slice(0, 10)
  nodes.push({ id: `f:${BUNDLE_ID}`, type: 'feature', label: 'Erstprüfung', sub: `${docFiles.length} Doku-Abschnitte`, description: 'Alle Dokumente gegen den aktuellen Code.' })
  for (const doc of docFiles) nodes.push({ id: `doc:${doc.id}`, type: 'doc', label: doc.title, sub: doc.path, doc: doc.id, evidence: [{ source: doc.path, text: doc.text.slice(0, 1800) }] })
  const dataset = {
    company: { name, short: 'Eigenes Projekt', product: name, claim: 'Importiertes Projekt' },
    currentUser: { name: 'Lokaler Nutzer', role: 'Prüfung & Freigabe', initials: 'DU' },
    release: { id: date, freeze: date, ship: date },
    modules: Object.fromEntries(moduleDefs.map((m) => [m.id, m.name])),
    people: { local: { name: 'Lokaler Nutzer', role: 'Prüfung & Freigabe' } },
    docs: docFiles.map((d) => ({ id: d.id, title: d.title, type: d.type, modules: [], owner: 'local', version: d.format.toUpperCase(), updated: date, pages: 1, blocks: [{ kind: 'p', text: d.text }] })),
    bundles: [{ id: BUNDLE_ID, title: 'Erstprüfung: Doku gegen aktuellen Code', ticket: 'Erstprüfung', mr: `${files.length} Code-Dateien`, merged: date, path: [name], classifiedVia: ['Statische Analyse', 'Jev'], summary: 'Jeder Doku-Abschnitt wird mit den passenden Stellen im aktuellen Code verglichen, als wäre das letzte Release gerade fertig. Jede Abweichung wird zu einem Vorschlag.', aspects: moduleDefs.map((m) => ({ kind: 'schnittstelle', module: m.id, text: m.description, commits: [] })), commits: [] }],
    proposals: [], backtest: [],
  }
  const graph = { nodes, edges, metadata: { snapshot: date, sources: ['Repository', 'Dokumente'], method: 'Tree-sitter, TypeScript-Symbolauflösung und PostgreSQL AST; statische Analyse.', analysis: parserReport, semantic: { status: 'missing' } } }
  log.info('import', 'Projekt analysiert', { name, code: files.length, documents: docSources.length, sections: docFiles.length, warnings: warnings.length, ms: Date.now() - started })
  return { id, name, sources: { repo: { label: input.repo.label, source: input.repo.source }, docs: input.docs?.dir ? { label: input.docs.label, source: input.docs.source } : null }, createdAt: now, files, docSources, docFiles, moduleDefs, warnings, dataset, graph, mapping: null, generated: {}, decisions: {}, events: [] }
}
