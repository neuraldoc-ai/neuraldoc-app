// Reproducible static index of the fictional dataset. No execution of product code.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCode, resolveJava, resolveTypeScript, parseSQL, sqlObjects } from './code-analysis.mjs'
import { applySemanticMapping } from './semantic-mapping.mjs'
import { dataPath, datasetRelative } from './dataset.mjs'
import { bundles, docs, docTypes, proposals } from '../frontend/src/dashboard/features/docs/data.ts'
import { resolveCommitSource } from '../frontend/src/dashboard/features/docs/commit-source.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (p) => fs.readFileSync(dataPath(p), 'utf8')
const changes = JSON.parse(read('dashboard.json')).changes
const commits = JSON.parse(read('gitlab/commits.json'))
const nodes = new Map(), edges = new Map()
const add = (n) => nodes.set(n.id, { ...nodes.get(n.id), ...n })
const link = (source, target, kind, evidence, certainty = 'belegt') => {
  if (source === target && kind !== 'calls') return
  const id = `${source}->${target}:${kind}`
  edges.set(id, { id, source, target, kind, evidence, certainty })
}
const lines = (text, index) => text.slice(0, index).split('\n').length
const proof = (source, text, line) => ({ source, text: text.trim().slice(0, 1800), ...(line ? { line } : {}) })
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
const moduleDefs = {
  auftrag: ['Auftrag & Lieferung', 'Verkauf'], tour: ['Tourenplanung', 'Disposition & Montage'],
  faktura: ['Fakturierung', 'Buchhaltung'], fibu: ['Fibu-Export', 'Buchhaltung'],
  kasse: ['Kasse & Gutscheine', 'Kasse'], druck: ['Belege & Druck', 'Verkauf'],
  admin: ['Administration', 'IT & Betrieb'], plattform: ['Plattform & Datenbank', 'IT & Betrieb'],
  fahrer: ['Fahrer-App', 'Fahrer & Auslieferung'], stamm: ['Fahrzeuge & Stammdaten', 'Disposition & Montage'],
}
const moduleOf = (p) => /\/(auftrag|kaufvertrag)\//.test('/' + p) ? 'auftrag' : Object.keys(moduleDefs).find((m) => m !== 'plattform' && ('/' + p).includes(`/${m}/`))
for (const [id, [label, dept]] of Object.entries(moduleDefs)) {
  add({ id: `m:${id}`, type: 'module', label, sub: 'Produktmodul', description: 'Zuordnung aus Paket- und Verzeichnispfaden des Beispiels.' })
  add({ id: `a:${dept}`, type: 'department', label: dept, sub: 'Fachbereich · abgeleitet', description: 'Fachliche Zuordnung im Beispiel; keine nachgewiesene Teamverantwortung oder Organisationsstruktur.' })
  link(`m:${id}`, `a:${dept}`, 'affects', proof('Fachliche Zuordnung im Beispiel', `${label} betrifft ${dept}.`), 'abgeleitet')
}
add({ id: 'db:mobiq', type: 'database', label: 'MOBIQ · PostgreSQL', sub: JSON.parse(read('postgres/overview.json')).version, description: 'Schema aus dem SQL-Snapshot und den gelieferten Migrationen. Kein Zugriff auf eine laufende Datenbank.' })

// PostgreSQL's own grammar: declarations, columns and foreign keys, not keyword matches.
const parserReport = { files: [], unresolvedCalls: [], sql: [] }
const sqlFiles = walk(dataPath('postgres/initdb')).filter((p) => !/daten/.test(path.basename(p)))
const references = []
const offset = (text, byte) => Buffer.from(text).subarray(0, Math.max(0, byte || 0)).toString('utf8').length
for (const abs of sqlFiles) {
  const source = datasetRelative(abs)
  const text = fs.readFileSync(abs, 'utf8')
  let ast
  try { ast = await parseSQL(text); parserReport.sql.push({ source, status: 'parsed', statements: ast.stmts.length }) }
  catch { parserReport.sql.push({ source, status: 'error' }); continue }
  for (const statement of ast.stmts) {
    const at = offset(text, statement.stmt_location), until = statement.stmt_len ? offset(text, (statement.stmt_location || 0) + statement.stmt_len) : text.length
    const evidence = { ...proof(source, text.slice(at, until), lines(text, at)), method: 'PostgreSQL AST' }
    const create = statement.stmt.CreateStmt, view = statement.stmt.ViewStmt, alter = statement.stmt.AlterTableStmt
    const table = create?.relation.relname || view?.view.relname || alter?.relation.relname
    if (create || view) {
      add({ id: 'db:' + table, type: view ? 'view' : 'table', label: table, sub: view ? 'SQL-View' : 'SQL-Tabelle', evidence: [evidence] })
      link('db:' + table, 'db:mobiq', 'stored', evidence)
    }
    for (const wrapper of sqlObjects(statement, (o) => !!o.ColumnDef)) {
      const c = wrapper.ColumnDef, pos = offset(text, c.location), line = text.slice(pos).split('\n')[0]
      const ev = { ...proof(source, line, lines(text, pos)), method: 'PostgreSQL AST: ColumnDef' }
      add({ id: 'col:' + table + '.' + c.colname, type: 'column', label: table + '.' + c.colname, sub: line.slice(c.colname.length).trim().replace(/,\s*$/, ''), evidence: [ev] })
      link('col:' + table + '.' + c.colname, 'db:' + table, 'column', ev)
      for (const constraint of c.constraints || []) if (constraint.Constraint?.contype === 'CONSTR_FOREIGN') references.push({ table, names: [c.colname], constraint: constraint.Constraint, evidence: ev })
    }
    for (const constraint of create?.constraints || []) if (constraint.Constraint?.contype === 'CONSTR_FOREIGN') references.push({ table, names: constraint.Constraint.fk_attrs.map((x) => x.String.sval), constraint: constraint.Constraint, evidence })
    for (const elt of create?.tableElts || []) if (elt.Constraint?.contype === 'CONSTR_FOREIGN') references.push({ table, names: elt.Constraint.fk_attrs.map((x) => x.String.sval), constraint: elt.Constraint, evidence })
    for (const cmd of alter?.cmds || []) if (cmd.AlterTableCmd?.def?.Constraint?.contype === 'CONSTR_FOREIGN') { const c = cmd.AlterTableCmd.def.Constraint; references.push({ table, names: c.fk_attrs.map((x) => x.String.sval), constraint: c, evidence }) }
    if (view) for (const ref of sqlObjects(view.query, (o) => !!o.RangeVar)) link('db:' + table, 'db:' + ref.RangeVar.relname, 'reads', evidence)
    if (create?.partbound) for (const parent of create.inhRelations || []) link('db:' + table, 'db:' + parent.RangeVar.relname, 'partition', evidence)
    // PL/pgSQL's dynamic template is explicit, but concrete runtime partitions are unknown.
    if (statement.stmt.DoStmt && text.includes('kassenbeleg_%s PARTITION OF kassenbeleg')) {
      add({ id: 'db:kassenbeleg_[Jahr]', type: 'table', label: 'kassenbeleg_[Jahr]', sub: 'Partitionen · SQL-Vorlage', description: 'Die Migration erzeugt Jahrespartitionen in einer Schleife. Die konkreten Laufzeitobjekte wurden nicht abgefragt.', evidence: [evidence] })
      link('db:kassenbeleg_[Jahr]', 'db:kassenbeleg', 'partition', evidence, 'abgeleitet')
      link('db:kassenbeleg_[Jahr]', 'db:mobiq', 'stored', evidence, 'abgeleitet')
    }
  }
}
for (const r of references) {
  const target = r.constraint.pktable.relname, fields = r.constraint.pk_attrs || []
  link('db:' + r.table, 'db:' + target, 'foreignKey', r.evidence)
  r.names.forEach((name, i) => {
    link('col:' + r.table + '.' + name, 'db:' + target, 'foreignKey', r.evidence)
    if (fields[i]) link('col:' + r.table + '.' + name, 'col:' + target + '.' + fields[i].String.sval, 'foreignKey', r.evidence)
  })
}

const repoFiles = walk(dataPath('repo')).filter((p) => /\.(java|tsx|ts|kt|pas|sql|yaml|xml|html|rc|json|jmx|csv)$/.test(p))
const files = [], symbols = [], analyses = []
for (const abs of repoFiles) {
  const file = path.relative(dataPath('repo'), abs).replaceAll('\\', '/')
  const text = fs.readFileSync(abs, 'utf8'), mod = moduleOf(file)
  const id = `file:${file}`
  add({ id, type: 'file', label: path.basename(file), sub: file, path: file, description: 'Finaler Stand des gelieferten Release-Snapshots.', evidence: [proof(`repo/${file}`, text, 1)] })
  if (mod) link(id, `m:${mod}`, 'module', { ...proof(`repo/${file}`, file), method: 'Konfigurierte Paket-/Verzeichnisregel; fachliche Zuordnung' }, 'abgeleitet')
  files.push({ file, text, id, mod })
  const analysis = await parseCode(file, text)
  if (analysis) {
    analyses.push(analysis)
    parserReport.files.push({ file, language: analysis.language, status: analysis.errors.length ? 'partial' : 'parsed', errors: analysis.errors })
    // Do not use recovered trees as proof of declarations or calls.
    if (!analysis.errors.length) for (const s of analysis.functions) {
      add({ id: s.id, type: 'function', label: (s.name.includes('.') ? s.name : s.className + '.' + s.name) + '()', sub: file + ':' + s.line, path: file, evidence: [s.evidence] })
      link(id, s.id, 'defines', s.evidence)
      symbols.push(s)
    }
  }
  if (file.endsWith('.yaml')) {
    for (const m of text.matchAll(/^([A-Z][A-Z_0-9]+):\s*$/gm)) {
      const block = text.slice(m.index).split(/\n(?=[A-Z][A-Z_0-9]+:)/)[0]
      const standard = block.match(/standard:\s*(.+)/)?.[1] || 'nicht angegeben'
      add({ id: `param:${m[1]}`, type: 'parameter', label: m[1], sub: `Standard: ${standard}`, evidence: [proof(`repo/${file}`, block, lines(text, m.index))] })
      link(id, `param:${m[1]}`, 'defines', proof(`repo/${file}`, block, lines(text, m.index)))
    }
  }
}
// Parameter references are literal AST nodes. Comments do not establish a use.
for (const a of analyses.filter((a) => !a.errors.length)) {
  for (const literal of a.literals) if (nodes.has('param:' + literal.value)) {
    link('file:' + a.file, 'param:' + literal.value, 'uses', literal.evidence)
    const owner = a.functions.filter((s) => s.start <= literal.start && s.end >= literal.start).sort((x, y) => x.end - x.start - (y.end - y.start))[0]
    if (owner) link(owner.id, 'param:' + literal.value, 'uses', literal.evidence)
  }
}
for (const result of [resolveJava(analyses), resolveTypeScript(dataPath('repo'), analyses)]) {
  for (const e of result.edges) link(e.source, e.target, e.kind, e.evidence, e.certainty)
  parserReport.unresolvedCalls.push(...result.unresolved)
}
for (const a of analyses.filter((a) => ['kotlin', 'pascal'].includes(a.language))) for (const c of a.calls) parserReport.unresolvedCalls.push({ file: a.file, line: c.evidence.line, name: c.name, reason: 'Kein Compiler-Typkontext für diese Sprache im Snapshot' })
for (const f of files.filter((f) => f.file.endsWith('.sql'))) {
  try {
    const ast = await parseSQL(f.text)
    parserReport.sql.push({ source: 'repo/' + f.file, status: 'parsed', statements: ast.stmts.length })
    for (const statement of ast.stmts) {
      const at = offset(f.text, statement.stmt_location), until = statement.stmt_len ? offset(f.text, (statement.stmt_location || 0) + statement.stmt_len) : f.text.length
      const ev = { ...proof('repo/' + f.file, f.text.slice(at, until), lines(f.text, at)), method: 'PostgreSQL AST: RangeVar' }
      const schema = !!(statement.stmt.CreateStmt || statement.stmt.AlterTableStmt || statement.stmt.IndexStmt || statement.stmt.ViewStmt || statement.stmt.RenameStmt)
      for (const ref of sqlObjects(statement, (o) => !!o.RangeVar)) if (nodes.has('db:' + ref.RangeVar.relname)) link(f.id, 'db:' + ref.RangeVar.relname, schema ? 'schema' : 'reads', ev)
    }
  } catch { parserReport.sql.push({ source: 'repo/' + f.file, status: 'error' }) }
}
// Name similarity to a table is a hypothesis; no ORM mapping is fabricated.
for (const a of analyses) for (const table of [...nodes.values()].filter((n) => n.type === 'table')) {
  const entity = table.label.split('_').filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1)).join('')
  if (a.classes.some((c) => c.name === entity)) link('file:' + a.file, table.id, 'domain', a.packageEvidence || proof('repo/' + a.file, files.find((f) => f.file === a.file).text), 'abgeleitet')
}
for (const c of changes) {
  add({ id: `f:${c.id}`, type: 'feature', label: c.title, sub: `${c.ticket || 'ohne Ticket'} · ${c.commits.length} Quell-Commits`, date: c.merged, feature: `f:${c.id}`, description: `Änderung aus Release ${JSON.parse(read('dashboard.json')).release}.` })
  const touchedModules = new Map()
  for (const m of c.commits) {
    const original = commits.find((x) => x.id.startsWith(m.sha))
    const diffs = original ? JSON.parse(read(`gitlab/commits/${original.id}/diff.json`)) : []
    const cid = `c:${m.sha}`
    if (original) add({ id: cid, type: 'commit', label: original.title, sub: `${original.short_id} · ${original.author_name}`, date: original.committed_date, feature: `f:${c.id}`, evidence: [proof(`gitlab/commits/${original.id}/diff.json`, diffs.map((d) => `${d.new_path}\n${d.diff}`).join('\n\n'))], description: `+${original.stats.additions} / −${original.stats.deletions} Zeilen. ${original.message}` })
    add({ id: `person:${m.author}`, type: 'person', label: m.author, sub: 'Commit-Autor · GitLab' })
    link(cid, `person:${m.author}`, 'author', proof('gitlab/commits.json', `${m.sha} · ${m.author}`))
    for (const d of diffs) {
      const fileId = `file:${d.new_path}`
      if (!nodes.has(fileId)) add({ id: fileId, type: 'file', label: path.basename(d.new_path), sub: d.new_path, path: d.new_path, description: d.deleted_file ? 'Im Commit gelöscht; kein finaler Dateistand.' : 'Nur im Commit-Diff vorhanden.' })
      link(cid, fileId, 'changes', proof(`gitlab/commits/${original.id}/diff.json`, d.diff))
      for (const s of symbols.filter((s) => s.file === d.new_path)) {
        const mention = d.diff.split('\n').find((line) => new RegExp(`\\b${s.name}\\s*\\(`).test(line))
        if (mention) link(cid, s.id, 'mentions', proof(`gitlab/commits/${original.id}/diff.json`, mention))
      }
      const mod = moduleOf(d.new_path)
      if (mod) touchedModules.set(mod, d.new_path)
    }
  }
  for (const [mod, file] of touchedModules) link(`f:${c.id}`, `m:${mod}`, 'touches', proof(`dashboard.json · ${c.id}`, file), 'abgeleitet')
}
const jira = JSON.parse(read('jira/search_jql.json')).issues
for (const i of jira) {
  add({ id: `t:${i.key}`, type: 'ticket', label: `${i.key} · ${i.fields.summary}`, sub: `${i.fields.issuetype.name} · ${i.fields.status.name}`, status: i.fields.status.name, evidence: [proof('jira/search_jql.json', `${i.key}: ${i.fields.summary}\nStatus: ${i.fields.status.name}`)] })
}
for (const i of jira) {
  if (i.fields.parent) link(`t:${i.key}`, `t:${i.fields.parent.key}`, 'epic', proof('jira/search_jql.json', `${i.key} → ${i.fields.parent.key}`))
  for (const l of i.fields.issuelinks || []) {
    const other = l.outwardIssue || l.inwardIssue
    if (other) link(`t:${i.key}`, `t:${other.key}`, 'link', proof('jira/search_jql.json', `${i.key} ${l.type.name}: ${other.key}`))
  }
}
for (const c of changes) {
  if (c.ticket) link(`t:${c.ticket}`, `f:${c.id}`, 'ticket', proof('dashboard.json', `${c.ticket}: ${c.title}`))
  for (const m of c.commits) {
    link(`c:${m.sha}`, `f:${c.id}`, 'commit', proof('dashboard.json', `${m.sha}: ${c.title}`))
    for (const k of m.title.matchAll(/MOB-\d{4}/g)) if (nodes.has(`t:${k[0]}`)) link(`c:${m.sha}`, `t:${k[0]}`, 'ticket', proof('gitlab/commits.json', m.title))
  }
}
for (const d of docs) {
  const docContent = d.blocks.map((b) => 'text' in b ? b.text : b.kind === 'table' ? [b.head.join(' | '), ...b.rows.map((r) => r.join(' | '))].join('\n') : b.caption).join('\n')
  add({ id: `doc:${d.id}`, type: 'doc', label: d.title, sub: docTypes[d.type].label, docType: d.type, docId: d.id, description: `Zielgruppe: ${docTypes[d.type].audience}`, evidence: [{ source: 'Dashboard-Dokumente · data.ts', text: docContent }], planned: !!d.planned })
  for (const b of bundles.filter((b) => proposals.some((p) => p.bundle === b.id && p.doc === d.id))) {
    const ps = proposals.filter((p) => p.bundle === b.id && p.doc === d.id)
    link(`f:${b.id}`, `doc:${d.id}`, 'documents', proof('Dashboard-Vorschläge · data.ts', ps.map((p) => `${p.title}: ${p.why}`).join('\n')), 'zugeordnet')
  }
  const references = new Map()
  for (const p of proposals.filter((p) => p.doc === d.id)) for (const hash of p.commits) {
    const c = resolveCommitSource(hash, commits)
    if (!c) continue
    const cid = [...nodes.values()].find((n) => n.type === 'commit' && c.id.startsWith(n.id.slice(2)))?.id
    if (!cid) continue
    references.set(cid, [...(references.get(cid) || []), `${p.title}: ${p.why}`])
  }
  for (const [cid, contexts] of references) link(cid, `doc:${d.id}`, 'supports', proof('Dashboard-Vorschläge · data.ts', [...new Set(contexts)].join('\n')), 'zugeordnet')
  const audience = docTypes[d.type].audience
  for (const [keyword, dept] of [['Verkauf', 'Verkauf'], ['Disposition', 'Disposition & Montage'], ['Kasse', 'Kasse'], ['Buchhaltung', 'Buchhaltung']]) {
    if (audience.includes(keyword)) link(`doc:${d.id}`, `a:${dept}`, 'audience', proof('Dokument-Zielgruppe · data.ts', audience), 'zugeordnet')
  }
}
const graph = { nodes: [...nodes.values()], edges: [...edges.values()].filter((e) => nodes.has(e.source) && nodes.has(e.target)), metadata: { snapshot: 'Release 26.4', sources: ['gitlab/commits.json', 'gitlab/commits/*/diff.json', 'repo/', 'postgres/initdb/', 'jira/search_jql.json', 'Dashboard-Dokumente und Vorschläge'], method: 'Tree-sitter (Java, Kotlin, TypeScript/TSX, Pascal), TypeScript-Symbolauflösung und PostgreSQL AST. Java-Aufrufe mit Paket, Import, Empfängertyp und eindeutigem Namen/Argumentanzahl. Fachmodule aus konfigurierten Pfadregeln; Jev für semantische Restzuordnungen. Keine Laufzeitanalyse.', analysis: parserReport } }
await applySemanticMapping(graph, root)
const output = path.join(root, 'frontend/src/dashboard/features/docs/brain/source-graph.json')
fs.writeFileSync(output, JSON.stringify(graph, null, 2) + '\n')
console.log(JSON.stringify({ nodes: graph.nodes.length, edges: graph.edges.length, types: Object.fromEntries([...new Set(graph.nodes.map((n) => n.type))].map((t) => [t, graph.nodes.filter((n) => n.type === t).length])) }))
