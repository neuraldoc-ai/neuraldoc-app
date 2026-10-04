// Parse locally. Never execute dataset code. Resolution is restricted to declarations
// present in the snapshot; unknown and overloaded targets stay unresolved.
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { Parser, Language } = require('web-tree-sitter')
const ts = require('typescript')
const { parse: parsePg } = require('pgsql-parser')
const languages = new Map()
const descendants = (node, type) => {
  const result = []
  const visit = (n) => { if (type(n)) result.push(n); for (const c of n.namedChildren) visit(c) }
  visit(node); return result
}
const field = (n, key) => n.childForFieldName(key)
const nearest = (n, types) => { for (let p = n.parent; p; p = p.parent) if (types.includes(p.type)) return p }
const cleanType = (s = '') => s.replace(/<[^]*>/g, '').replace(/[?\[\]\s]/g, '')
const statement = (n) => nearest(n, ['expression_statement', 'return_statement', 'local_variable_declaration', 'assignment']) || n
const asEvidence = (file, n, method = 'Tree-sitter') => ({ source: `repo/${file}`, text: n.text.trim().slice(0, 1800), line: n.startPosition.row + 1, method })
const syntaxTypes = ['method_declaration', 'constructor_declaration', 'function_declaration', 'method_definition', 'defProc']

export async function parseCode(file, text) {
  const ext = path.extname(file), language = ({ '.java': 'java', '.kt': 'kotlin', '.pas': 'pascal', '.tsx': 'tsx', '.ts': 'typescript' })[ext]
  if (!language) return null
  await Parser.init()
  if (!languages.has(language)) languages.set(language, await Language.load(require.resolve(`@lumis-sh/wasm-${language}/tree-sitter-${language}.wasm`)))
  const parser = new Parser(); parser.setLanguage(languages.get(language))
  const tree = parser.parse(text), root = tree.rootNode
  const errors = descendants(root, (n) => n.type === 'ERROR' || n.isMissing).map((n) => ({ line: n.startPosition.row + 1, text: n.text.slice(0, 120) }))
  const packageNode = descendants(root, (n) => ['package_declaration', 'package_header', 'unit'].includes(n.type))[0]
  const packageName = packageNode?.text.replace(/^(package|unit)\s+/i, '').replace(/;$/, '').trim() || ''
  const classes = descendants(root, (n) => ['class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration'].includes(n.type)).map((n) => ({
    name: (field(n, 'name') || n.namedChildren.find((c) => c.type === 'type_identifier'))?.text,
    start: n.startIndex, end: n.endIndex,
  })).filter((c) => c.name)
  const imports = descendants(root, (n) => ['import_declaration', 'import_header', 'import_statement', 'moduleName'].includes(n.type))
    .filter((n) => n.type !== 'moduleName' || nearest(n, ['declUses']))
    .map((n) => ({ name: n.type === 'import_statement' ? field(n, 'source')?.text.slice(1, -1) : n.text.replace(/^import\s+(?:static\s+)?/, '').replace(/;$/, '').trim(), evidence: asEvidence(file, n) }))
  const functions = descendants(root, (n) => syntaxTypes.includes(n.type) || n.type === 'variable_declarator' && ['arrow_function', 'function_expression'].includes(field(n, 'value')?.type)).map((n) => {
    const header = field(n, 'header') || n
    const nameNode = field(header, 'name') || header.namedChildren.find((c) => c.type === 'simple_identifier')
    if (!nameNode) return null
    const owner = classes.filter((c) => c.start < n.startIndex && c.end >= n.endIndex).sort((a, b) => a.end - a.start - (b.end - b.start))[0]?.name || path.basename(file, ext)
    const params = field(header, 'parameters') || field(header, 'args') || header.namedChildren.find((c) => c.type === 'function_value_parameters')
    return { id: `fn:${file}:${nameNode.text}:${n.startPosition.row + 1}`, name: nameNode.text, className: owner, file,
      line: n.startPosition.row + 1, start: n.startIndex, end: n.endIndex, body: n.text,
      arity: params?.namedChildren.filter((c) => !['comment', 'block_comment'].includes(c.type)).length ?? 0,
      evidence: asEvidence(file, n), node: n }
  }).filter(Boolean)
  const bindings = descendants(root, (n) => ['field_declaration', 'local_variable_declaration', 'formal_parameter', 'spread_parameter', 'parameter', 'class_parameter', 'declField', 'declArg'].includes(n.type)).flatMap((n) => {
    const typ = field(n, 'type') || n.namedChildren.find((c) => c.type === 'user_type')
    const names = field(n, 'name') ? [field(n, 'name')] : n.type === 'parameter' || n.type === 'class_parameter' ? n.namedChildren.filter((c) => c.type === 'simple_identifier') : descendants(n, (x) => x.type === 'variable_declarator').map((x) => field(x, 'name'))
    const scope = nearest(n, ['block', 'class_body', 'method_declaration', 'constructor_declaration', 'function_declaration', 'declClass', 'defProc']) || root
    return names.filter(Boolean).map((name) => ({ name: name.text, type: cleanType(typ?.text), start: scope.startIndex, end: scope.endIndex, declaration: n.startIndex, field: n.type === 'field_declaration' || n.type === 'declField' || n.type === 'class_parameter' }))
  })
  const calls = descendants(root, (n) => ['method_invocation', 'method_reference', 'call_expression', 'exprCall'].includes(n.type)).map((n) => {
    let name = field(n, 'name')?.text, receiver = field(n, 'object')?.text
    if (n.type === 'method_reference') { receiver = n.namedChildren[0]?.text; name = n.namedChildren.at(-1)?.text }
    if (n.type === 'call_expression' || n.type === 'exprCall') {
      const callee = field(n, 'function') || field(n, 'entity') || n.namedChildren[0]
      const parts = callee.text.split('.'); name = parts.pop(); receiver = parts.join('.') || undefined
    }
    const args = field(n, 'arguments') || field(n, 'args') || descendants(n, (x) => x.type === 'value_arguments')[0]
    const owner = functions.filter((s) => s.start <= n.startIndex && s.end >= n.endIndex).sort((a, b) => a.end - a.start - (b.end - b.start))[0]
    return { name, receiver, arity: n.type === 'method_reference' ? null : args?.namedChildren.length ?? 0, owner: owner?.id, start: n.startIndex, evidence: asEvidence(file, statement(n)) }
  })
  // Only actual literals can refer to configuration keys, not comments or declarations.
  const literals = descendants(root, (n) => ['string_literal', 'string', 'literalString'].includes(n.type)).map((n) => ({ value: n.text.slice(1, -1), start: n.startIndex, evidence: asEvidence(file, statement(n)) }))
  const result = { file, language, packageName, classes, imports, functions: functions.map(({ node, ...s }) => s), bindings, calls, literals, errors,
    packageEvidence: packageNode ? asEvidence(file, packageNode) : undefined }
  tree.delete(); parser.delete(); return result
}

export function resolveJava(analyses) {
  const java = analyses.filter((a) => a.language === 'java'), edges = [], unresolved = []
  const types = java.flatMap((a) => a.classes.map((c) => ({ ...c, analysis: a, qualified: `${a.packageName}.${c.name}` })))
  const resolveType = (a, name) => {
    name = cleanType(name)
    const imported = a.imports.find((i) => i.name.endsWith(`.${name}`) && !i.name.includes(' '))
    const qualified = imported?.name || (name.includes('.') ? name : `${a.packageName}.${name}`)
    return types.filter((t) => t.qualified === qualified)
  }
  for (const a of java) {
    if (a.errors.length) continue
    for (const i of a.imports) for (const t of types.filter((t) => t.qualified === i.name && t.analysis.file !== a.file)) edges.push({ source: `file:${a.file}`, target: `file:${t.analysis.file}`, kind: 'imports', evidence: { ...i.evidence, method: 'Java: vollständig qualifizierter Import' }, certainty: 'belegt' })
    for (const call of a.calls.filter((c) => c.owner)) {
      const owner = a.functions.find((s) => s.id === call.owner)
      const b = a.bindings.filter((b) => b.name === call.receiver && b.start <= call.start && b.end >= call.start && (b.field || b.declaration < call.start)).sort((x, y) => (x.end - x.start) - (y.end - y.start))[0]
      const typeName = !call.receiver || call.receiver === 'this' ? owner.className : b?.type || call.receiver
      const targets = resolveType(a, typeName).flatMap((t) => t.analysis.errors.length ? [] : t.analysis.functions.filter((s) => s.className === t.name && s.name === call.name && (call.arity === null || s.arity === call.arity)))
      if (targets.length === 1) edges.push({ source: call.owner, target: targets[0].id, kind: 'calls', evidence: { ...call.evidence, method: 'Java: Paket/Import + deklarierter Empfängertyp + eindeutiger Name/Argumentanzahl; statischer Aufruf' }, certainty: 'belegt' })
      else unresolved.push({ file: a.file, line: call.evidence.line, name: call.name, receiver: call.receiver, reason: targets.length ? 'Überladung nicht eindeutig' : 'Zieltyp oder Deklaration fehlt' })
    }
  }
  return { edges, unresolved }
}

export function resolveTypeScript(repoRoot, analyses) {
  const files = analyses.filter((a) => ['typescript', 'tsx'].includes(a.language))
  const program = ts.createProgram(files.map((a) => path.join(repoRoot, a.file)), { noEmit: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true })
  const checker = program.getTypeChecker(), edges = [], unresolved = []
  const fileMap = new Map(files.map((a) => [path.resolve(repoRoot, a.file).replaceAll('\\', '/'), a]))
  const symbol = (node) => { let s = checker.getSymbolAtLocation(node); if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s); return s }
  for (const a of files) {
    const source = program.getSourceFile(path.join(repoRoot, a.file))
    if (!source || source.parseDiagnostics.length) continue
    const visit = (n) => {
      const position = n.getStart(source), line = source.getLineAndCharacterOfPosition(position).line + 1
      const evidence = { source: `repo/${a.file}`, text: n.getText(source).slice(0, 1800), line, method: 'TypeScript Compiler: Symbolauflösung im Snapshot' }
      if (ts.isImportDeclaration(n)) {
        for (const d of symbol(n.moduleSpecifier)?.declarations || []) {
          const target = fileMap.get(d.getSourceFile().fileName.replaceAll('\\', '/'))
          if (target) edges.push({ source: `file:${a.file}`, target: `file:${target.file}`, kind: 'imports', evidence, certainty: 'belegt' })
        }
      }
      if (ts.isCallExpression(n)) {
        const caller = a.functions.filter((s) => s.start <= position && s.end >= n.end).sort((x, y) => x.end - x.start - (y.end - y.start))[0]
        const declarations = symbol(ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression)?.declarations || []
        const targets = declarations.flatMap((d) => {
          const target = fileMap.get(d.getSourceFile().fileName.replaceAll('\\', '/'))
          // TS includes export modifiers in a declaration's range; Tree-sitter
          // represents the export as its parent. Match the shared ending boundary.
          return target?.functions.filter((s) => s.start >= d.getStart() && s.end === d.end) || []
        })
        if (caller && targets.length === 1) edges.push({ source: caller.id, target: targets[0].id, kind: 'calls', evidence, certainty: 'belegt' })
        else if (caller) unresolved.push({ file: a.file, line, name: n.expression.getText(source), reason: 'Kein eindeutiges Symbol im Snapshot' })
      }
      ts.forEachChild(n, visit)
    }; visit(source)
  }
  return { edges, unresolved }
}

export async function parseSQL(text) {
  return parsePg(text)
}
export function sqlObjects(ast, predicate) {
  const result = []
  const visit = (o) => { if (!o || typeof o !== 'object') return; if (predicate(o)) result.push(o); for (const v of Object.values(o)) if (typeof v === 'object') visit(v) }
  visit(ast); return result
}
