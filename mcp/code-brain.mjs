// Code brain: which code each documentation section describes. Project-neutral: no language, domain or dataset rules.
import { isTest } from './retrieval.mjs'

export { headingsOf, markdownHeadings } from './doc-text.mjs'

/* ---------- Code elements ---------- */

// Every pattern works on any language: declarations by keyword (class, def, fun, func, fn, const …), typed
// declarations (Java, C#, Kotlin), members and keys (`name: …`, `name = …`), exposed strings (environment variables,
// flags, routes, dotted configuration keys) and keys of structured files by their path.
const KEYWORDS = new Set('if else for while do switch case return new throw throws await yield import export from package using namespace super this self when match try catch finally assert typeof instanceof sizeof delete void in is as not and or elif except raise with lambda pass break continue goto defer go select range struct interface type class enum'.split(' '))
const TYPE_DECL = /\b(?:class|interface|enum|struct|trait|object|record|type|typealias|protocol|module|namespace|annotation|union|impl|mixin|extension)\s+([A-Za-z_$][\w$]*)/g
const FUNC_DECL = /\b(?:def|fun|func|function|fn|sub|procedure|macro)\s*\*?\s+(?:\([^)]*\)\s*)?(?:<[^>]*>\s*)?(?:[A-Za-z_$][\w$]*\.)?([A-Za-z_$][\w$]*)/g
const VAR_DECL = /\b(?:const|let|var|val|final)\s+(?:[\w$<>\[\],.?]+\s+)?([A-Za-z_$][\w$]*)\s*[=:;,)]/g
const TYPED = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:export|public|private|protected|internal|static|final|abstract|override|open|suspend|synchronized|readonly|async|default|virtual|sealed|inline|lateinit|declare|const|volatile|transient|native|partial|unsafe|extern|pub(?:\([^)]*\))?)\s+)*(?:[A-Za-z_$][\w$.]*(?:<[^>()]*>)?(?:\[\])*\??\s+)+([A-Za-z_$][\w$]*)\s*(\(|=(?!=)|;)/
const MEMBER = /^\s*(?:readonly\s+|static\s+|public\s+|private\s+|protected\s+)*['"]?([A-Za-z_$][\w$-]*)['"]?\??\s*(?::(?!:)|=(?![=>]))/
// A field with its type after the name and nothing else on the line (Go structs, SQL columns): `MaxAge int`, `AllowOrigins []string `json:"…"``.
const FIELD = /^\s+([A-Za-z_]\w*)\s+(?:\[\]|\*|map\[[^\]]*\])*[A-Za-z_][\w.]*(?:\([\d, ]+\))?(?:\s+`[^`]*`)?\s*,?\s*$/
const EXPOSED = /^(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|--?[a-z][\w-]+|\/[\w\-.{}:<>/]*[a-z][\w\-.{}:<>/]*|[a-z][\w-]*(?:\.[a-z][\w-]*){2,}|[a-z][a-z0-9]*(?:[-_][a-z][a-z0-9]*)+)$/
const COMMENT_LINE = /^\s*(\/\/|#(?!include|define|\[)|\*|\/\*|--(?!-)|;|%|'|rem\s)/i
const STRUCTURED = /\.(ya?ml|json|toml|properties|ini|cfg|conf|env(\.[a-z]+)?)$|(^|\/)\.env\.[a-z]+$/i

export const splitWords = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/** Keys of a YAML, JSON, TOML, properties or .env file: each leaf by its own name and by its dotted path. */
function structuredKeys(text) {
  const out = [], stack = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line.trim() || /^\s*(#|\/\/|;)/.test(line)) continue
    const m = line.match(/^(\s*)(?:-\s+)?["']?([A-Za-z_$][\w$.\-]*)["']?\s*[:=]/)
    if (!m) continue
    const indent = m[1].length
    while (stack.length && stack.at(-1).indent >= indent) stack.pop()
    const full = [...stack.map((s) => s.key), m[2]].join('.')
    out.push(m[2], full)
    if (!/[:=]\s*\S/.test(line.slice(m[0].length - 1)) || /[:=]\s*[{[]\s*$/.test(line)) stack.push({ indent, key: m[2] })
  }
  return out
}

/** Names a file defines (declarations, members, keys, exposed strings) with a kind and the line of each. */
export function definitions(file) {
  const defs = [], add = (name, kind, line) => { if (name && name.length >= 2 && !KEYWORDS.has(name)) defs.push({ name, kind, line }) }
  if (STRUCTURED.test(file.path)) {
    for (const k of structuredKeys(file.text)) add(k, 'key', 0)
    return defs
  }
  const lines = file.text.split('\n')
  let block = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (block) { if (/\*\/|"""|'''/.test(line)) block = false; continue }
    if (/^\s*(\/\*|"""|''')/.test(line) && !/\*\/|("""|''').*\1/.test(line.trim().slice(3))) { block = true; continue }
    if (COMMENT_LINE.test(line) || line.length > 300) continue
    const before = defs.length
    for (const m of line.matchAll(TYPE_DECL)) add(m[1], 'type', i)
    for (const m of line.matchAll(FUNC_DECL)) add(m[1], 'function', i)
    for (const m of line.matchAll(VAR_DECL)) add(m[1], 'value', i)
    // The typed form (Java, C#) only where no keyword declared something: `def send(` is not a type `def`.
    const typed = defs.length === before && line.match(TYPED)
    // A statement keyword in front is a call, not a declaration: `raise TypeError(`, `return new Foo(`, `case X:`.
    if (typed && !KEYWORDS.has(line.trim().split(/\s/)[0]) && !/^\s*(raise|print|echo|del|assert|elif|except|yield|await|throw|go|defer)\b/.test(line)) add(typed[1], typed[2] === '(' ? 'function' : 'value', i)
    const member = line.match(MEMBER) ?? (defs.length === before && line.match(FIELD))
    if (member && !typed) add(member[1], 'member', i)
    // Parameters of a declaration: documented options are often plain parameters (timeout=…, debug: boolean).
    // The list after the declared name, not a Go receiver before it.
    const fn = defs.slice(before).find((d) => d.kind === 'function')?.name
    const params = fn && /\b(def|fun|func|function|fn)\b/.test(line) && line.slice(line.indexOf(fn) + fn.length).match(/^\s*(?:<[^>]*>)?\s*\(([^()]*)\)/)?.[1]
    if (params) for (const p of params.split(',')) { const n = p.trim().replace(/^(?:\*{1,2}|\.\.\.|val\s+|var\s+)/, '').match(/^([A-Za-z_$][\w$]*)/)?.[1]; if (n && n !== 'self' && n !== 'cls') add(n, 'param', i) }
    for (const m of line.matchAll(/(["'`])([^"'`\n]{2,100})\1/g)) if (EXPOSED.test(m[2])) add(m[2], 'string', i)
  }
  return defs
}

/** The package or namespace a file declares (Java, Kotlin, Go, C#, Scala, PHP), if any. */
const packageOf = (text) => text.match(/^\s*(?:package|namespace)\s+([A-Za-z_][\w.\\]*)/m)?.[1]?.replace(/\\/g, '.') ?? null

/**
 * Module names that resolve to folders: package.json "name", go.mod "module", Gradle and Maven project names, Python
 * packages (folders with __init__.py) and declared packages. A mentioned import ("@trpc/server", "okhttp3.tls",
 * "github.com/gofiber/fiber/v3/middleware/cors") resolves to the files below that folder.
 */
function moduleNames(files) {
  const out = new Map()
  const put = (name, dir) => { if (!name) return; const list = out.get(name) ?? new Set(); list.add(dir); out.set(name, list) }
  for (const f of files) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
    const base = f.path.split('/').pop()
    if (base === 'package.json') { try { put(JSON.parse(f.text).name, dir) } catch {} }
    if (base === 'go.mod') put(f.text.match(/^module\s+(\S+)/m)?.[1], dir)
    if (base === 'pom.xml') put(f.text.replace(/<parent>[\s\S]*?<\/parent>/, '').match(/<artifactId>([^<]+)<\/artifactId>/)?.[1], dir)
    if (/^settings\.gradle(\.kts)?$/.test(base)) for (const m of f.text.matchAll(/include\s*\(?([^)\n]+)\)?/g)) for (const p of m[1].matchAll(/["']:?([\w\-:]+)["']/g)) put(p[1].split(':').pop(), [dir, ...p[1].split(':').filter(Boolean)].filter(Boolean).join('/'))
    if (base === '__init__.py') put(dir.split('/').pop(), dir)
    const pkg = /\.(java|kt|kts|scala|go|cs|php|groovy)$/.test(base) && packageOf(f.text)
    if (pkg) put(pkg, dir)
  }
  return out
}

/* ---------- Mentions in a section ---------- */

const CODE_COMMON = new Set('true false null nil none undefined self this new return import export from const let var function async await class extends interface type enum public private protected static void int string number boolean bool object array list dict map set any unknown default require module exports if else for while do switch case break continue try catch finally throw throws raise def lambda yield pass with as in is not and or of to the get post put patch delete head options npm npx yarn pnpm pip go git docker make bash sh cd ls cp mv rm echo cat sudo install run test build start dev main src lib dist bin app err ctx req res println printf print console log error value values key name data item items file path url json yaml xml html'.split(' '))

/**
 * What a section names: identifiers with their qualifiers (`cors.New` → New in cors), imports and module names,
 * file paths, links to repository files. Code spans and code blocks weigh more than prose; in code blocks comments
 * and string contents are left out, except import specifiers.
 */
export function mentions(text) {
  const names = new Map(), modules = new Set(), paths = new Set()
  const add = (name, weight, qualifiers = [], where = 'prose') => {
    if (!name || name.length < 2 || CODE_COMMON.has(name) || /^\d/.test(name)) return
    const e = names.get(name) ?? { name, weight: 0, qualifiers: new Set(), where: new Set() }
    e.weight = Math.max(e.weight, weight); e.where.add(where)
    for (const q of qualifiers) if (!CODE_COMMON.has(q)) e.qualifiers.add(q)
    names.set(name, e)
  }
  const chains = (code, weight, where) => {
    for (const m of code.matchAll(/--?[a-z][\w-]*|[A-Za-z_$][\w$]*(?:(?:\.|::|->|\\)[A-Za-z_$][\w$]*)*/g)) {
      const t = m[0]
      if (t.startsWith('-')) { if (t.length > 3) add(t, weight, [], where); continue }
      const parts = t.split(/\.|::|->|\\/)
      parts.forEach((p, i) => add(p, i === parts.length - 1 ? weight : weight * 0.6, parts.slice(0, i), where))
      if (parts.length >= 2) modules.add(parts.slice(0, -1).join('.'))
    }
  }
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  for (const m of body.matchAll(/(?:```|~~~)[^\n]*\n([\s\S]*?)(?:```|~~~)|^(?: {4}|\t)(?![-*+] |\d+\. )(.+)$/gm)) {
    const code = m[1] ?? m[2]
    for (const i of code.matchAll(/(?:from|import|require\(|use|using|include)\s*\(?\s*["'`]?(@?[\w./\-:\\]+)["'`]?/g)) modules.add(i[1].replace(/['"`;]/g, ''))
    for (const i of code.matchAll(/^\s*["']([\w.\-]+\/[\w./\-]+)["']\s*$/gm)) modules.add(i[1])
    const bare = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)(\/\/|#)[^\n]*/g, ' ').replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, (s) => EXPOSED.test(s.slice(1, -1)) ? ` ${s.slice(1, -1)} ` : ' ')
    chains(bare, 1, 'block')
  }
  const prose = body.replace(/(?:```|~~~)[\s\S]*?(?:```|~~~)/g, ' ')
  // Code spans, Sphinx roles and mkdocstrings references (`::: httpx.Client`; `:::note` is an admonition).
  for (const m of prose.matchAll(/`{1,2}([^`\n]+)`{1,2}|:(?:class|func|meth|attr|mod|obj|data|exc|py:\w+):`~?([^`<]+)(?:<[^>]*>)?`|^:::\s+([A-Za-z_]\w*\.[\w.]+)/gm)) {
    const code = m[1] ?? m[2] ?? m[3]
    if (/^[@\w.\-]+\/[\w./\-]+$/.test(code)) { modules.add(code); paths.add(code) }
    chains(code, 1.5, 'span')
  }
  for (const m of prose.replace(/`[^`\n]+`/g, ' ').matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b[a-z]+(?:[A-Z][a-z0-9]*)+\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|(?<![\w-])--[a-z][\w-]+/g)) add(m[0], 1)
  for (const m of body.matchAll(/\]\(([^)\s]+)\)|https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:blob|tree)\/[^/\s]+\/([^\s)#"'>]+)/g)) {
    const target = (m[2] ?? m[1]).replace(/#.*$/, '')
    if (!/^(https?:|mailto:|#)/.test(target)) paths.add(target.replace(/^(\.\.?\/)+/, ''))
    else if (m[2]) paths.add(m[2])
  }
  for (const m of prose.matchAll(/(?<![\w/.-])((?:[\w.-]+\/)+[\w.-]+\.[a-z]{1,5})\b/g)) paths.add(m[1])
  return { names: [...names.values()].map((e) => ({ ...e, qualifiers: [...e.qualifiers], where: [...e.where] })), modules: [...modules], paths: [...paths] }
}

/* ---------- The index and the signals ---------- */

const STOP = new Set('der die das und oder ein eine einer eines einem einen ist sind wird werden wurde im in am an auf aus bei mit nach von vor zu zum zur für über unter nicht nur auch wie was wer wo wann den dem des als sich es sie er wir ihr ich du so dann wenn ob da kann können muss soll the a an of to and or is are be been was were it its this that these those for with on at by from as if then than not no can will would should may might you your we our they their them he she his her which who what when where how all any each some such into out up down over under also only just very more most other'.split(' '))
const stem = (w) => w.length > 4 ? w.replace(/(ingen|ungen|ung|ing|ed|es|en|er|ly|e|n|s)$/u, '') : w
export const words = (s) => (s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem)
const IDENT = /--?[a-z][\w-]*|[A-Za-z_$][\w$]*/g
const KIND_WEIGHT = { type: 1, function: 1, value: 1, key: 0.9, string: 0.9, member: 0.7, param: 0.5 }
const dirOf = (p) => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
const extOf = (p) => p.match(/\.[^./]+$/)?.[0] ?? ''

/** BM25 with an inverted index: rank(query) → Map(item index → score). */
function bm25Index(texts, tokenize) {
  const post = new Map(), lens = []
  texts.forEach((t, i) => {
    const tf = new Map()
    for (const w of tokenize(t)) tf.set(w, (tf.get(w) ?? 0) + 1)
    lens.push([...tf.values()].reduce((a, b) => a + b, 0))
    for (const [w, n] of tf) { const l = post.get(w) ?? []; l.push([i, n]); post.set(w, l) }
  })
  const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, texts.length), N = texts.length
  return (query) => {
    const scores = new Map()
    for (const w of new Set(tokenize(query))) {
      const l = post.get(w)
      if (!l) continue
      const idf = Math.log(1 + (N - l.length + 0.5) / (l.length + 0.5))
      for (const [i, f] of l) scores.set(i, (scores.get(i) ?? 0) + idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * lens[i] / avg)))
    }
    return scores
  }
}

/**
 * Everything the signals need from the code, built once per snapshot: definitions per name, which files contain each
 * identifier, module names, path words, a BM25 index over 60-line excerpts. `files`: [{ path, text }].
 */
export function createBrain(files, { docPaths = [] } = {}) {
  const N = files.length
  const defs = new Map(), defsLower = new Map(), tokenDf = new Map(), fileTokens = [], fileDefs = []
  files.forEach((f, i) => {
    const own = definitions(f)
    fileDefs.push(own)
    for (const d of own) {
      for (const [map, key] of [[defs, d.name], [defsLower, d.name.toLowerCase()]]) { const l = map.get(key) ?? []; l.push({ file: i, kind: d.kind, line: d.line }); map.set(key, l) }
    }
    const toks = new Set(f.text.match(IDENT) ?? [])
    fileTokens.push(toks)
    for (const t of toks) tokenDf.set(t, (tokenDf.get(t) ?? 0) + 1)
  })
  const idf = (t) => Math.log(1 + N / Math.max(1, tokenDf.get(t) ?? 1))
  const pathWords = files.map((f) => new Set(f.path.replace(/\.[^./]+$/, '').split('/').flatMap((seg) => [seg.toLowerCase(), ...splitWords(seg)])))
  const pathDf = new Map()
  for (const s of pathWords) for (const w of s) pathDf.set(w, (pathDf.get(w) ?? 0) + 1)
  // Words of documentation paths that most documents share (docs, content, guide, en …) carry no information.
  const docWordDf = new Map()
  for (const p of new Set(docPaths)) for (const w of new Set(p.replace(/\.[^./]+$/, '').split('/').flatMap(splitWords))) docWordDf.set(w, (docWordDf.get(w) ?? 0) + 1)
  const docPathCount = new Set(docPaths).size
  const modules = moduleNames(files)
  const byDir = new Map()
  files.forEach((f, i) => { const d = dirOf(f.path); const l = byDir.get(d) ?? []; l.push(i); byDir.set(d, l) })
  const under = (dir) => files.map((f, i) => [f, i]).filter(([f]) => !dir || f.path.startsWith(dir + '/')).map(([, i]) => i)
  const chunks = []
  files.forEach((f, i) => { const lines = f.text.split('\n'); for (let s = 0; s < lines.length; s += 60) chunks.push({ file: i, start: s, text: `${f.path}\n${lines.slice(s, s + 65).join('\n').slice(0, 4000)}` }) })
  const lexical = bm25Index(chunks.map((c) => c.text), words)
  const basenames = new Map()
  files.forEach((f, i) => { const b = f.path.split('/').pop(); basenames.set(b, basenames.has(b) ? -1 : i) })
  const brain = { files, N, fileDefs, defs, defsLower, tokenDf, fileTokens, idf, pathWords, pathDf, docWordDf, docPathCount, modules, byDir, under, chunks, lexical, basenames }
  brain.isTest = files.map((f) => isTest(f.path))
  return brain
}

/**
 * What each test file tests: the product files that define the rare names the test uses, plus shared path words
 * (test_proxies.py, http-error.ts). Tests use the vocabulary of the documentation and lead to the code behind it.
 */
function testTargets(brain) {
  if (brain.targets) return brain.targets
  brain.targets = new Map()
  brain.files.forEach((f, t) => {
    if (!brain.isTest[t]) return
    const score = new Map()
    for (const tok of brain.fileTokens[t]) {
      const defs = (brain.defs.get(tok) ?? []).filter((d) => !brain.isTest[d.file])
      const files = new Set(defs.map((d) => d.file))
      if (!files.size || files.size > 3 || tok.length < 3) continue
      for (const p of files) score.set(p, (score.get(p) ?? 0) + brain.idf(tok) / Math.sqrt(files.size))
    }
    const own = [...brain.pathWords[t]].filter((w) => w.length >= 4 && !/^tests?$|spec/.test(w))
    for (const [p] of score) if (own.some((w) => brain.pathWords[p].has(w))) score.set(p, score.get(p) * 1.5)
    const top = [...score].sort((a, b) => b[1] - a[1]).slice(0, 5)
    if (top.length) brain.targets.set(t, top.map(([p, s]) => [p, s / top[0][1]]))
  })
  return brain.targets
}

const typeLike = (brain, i, q) => (brain.defs.get(q) ?? []).some((d) => d.file === i && d.kind === 'type')
const qualifies = (brain, i, q) => {
  const w = splitWords(q).join('')
  return w.length >= 2 && ([...brain.pathWords[i]].some((p) => p.replace(/[-_]/g, '') === w) || typeLike(brain, i, q))
}

/** The folders a module name resolves to: exact module names, or the longest module name the specifier starts with. */
function resolveModule(brain, spec) {
  const clean = spec.replace(/^[./]+/, '').replace(/\.(js|ts|mjs|py|go)$/, '')
  if (brain.modules.has(clean)) return [...brain.modules.get(clean)]
  const seps = clean.includes('/') ? '/' : '.'
  const parts = clean.split(/[/.]/)
  for (let k = parts.length - 1; k >= 1; k--) {
    const head = parts.slice(0, k).join(seps), rest = parts.slice(k).join('/')
    for (const name of [head, parts.slice(0, k).join('.'), parts.slice(0, k).join('/')]) {
      if (!brain.modules.has(name)) continue
      const dirs = [...brain.modules.get(name)].map((d) => [d, rest].filter(Boolean).join('/')).filter((d) => brain.byDir.has(d) || brain.files.some((f) => f.path.startsWith(d + '/')))
      if (dirs.length) return dirs
      return [...brain.modules.get(name)]
    }
  }
  // A path written in the documentation (pkg/foo, src/bar) that is a folder of the repository.
  const asDir = clean.replace(/\./g, '/')
  const dirs = [...brain.byDir.keys()].filter((d) => d === clean || d.endsWith('/' + clean) || d === asDir || d.endsWith('/' + asDir))
  return dirs.slice(0, 3)
}

/**
 * The signals of one section: Map(file index → value) per signal, with evidence for the definition matches.
 * def    the section names something this file defines (rarer names count more; `cors.New` prefers New in cors)
 * use    the section names something this file only uses
 * module an import or module name in the section resolves to this file's folder
 * path   the section names or links this file (or its folder)
 * docpath words of the document's path and the section heading match this file's path
 * lex    BM25 of the section text against the file's best excerpt
 */
export function sectionSignals(brain, section) {
  const { names, modules, paths } = mentions(section.text)
  const sig = { def: new Map(), use: new Map(), module: new Map(), path: new Map(), docpath: new Map(), lex: new Map() }, evidence = new Map()
  const bump = (map, i, v) => map.set(i, (map.get(i) ?? 0) + v)
  for (const m of names) {
    let hits = brain.defs.get(m.name), factor = 1
    if (!hits?.length) { hits = brain.defsLower.get(m.name.toLowerCase()); factor = 0.5 }
    const idf = brain.idf(m.name)
    const defFiles = new Map()
    for (const h of hits ?? []) { const k = KIND_WEIGHT[h.kind] ?? 0.5; if (k > (defFiles.get(h.file)?.k ?? 0)) defFiles.set(h.file, { k, line: h.line }) }
    const spread = Math.sqrt(Math.max(1, defFiles.size))
    for (const [i, { k, line }] of defFiles) {
      const q = m.qualifiers.some((q) => qualifies(brain, i, q)) ? 2 : 1
      bump(sig.def, i, m.weight * idf * k * q * factor / spread)
      const ev = evidence.get(i) ?? []; if (ev.length < 6) ev.push(`${m.name}:${line + 1}`); evidence.set(i, ev)
    }
    if (brain.tokenDf.get(m.name) && brain.tokenDf.get(m.name) <= Math.max(5, brain.N * 0.2)) {
      const users = brain.files.map((_, i) => i).filter((i) => !defFiles.has(i) && brain.fileTokens[i].has(m.name))
      for (const i of users) bump(sig.use, i, m.weight * idf / Math.sqrt(users.length))
    }
  }
  for (const spec of modules) {
    for (const dir of resolveModule(brain, spec)) {
      const own = brain.byDir.get(dir) ?? [], all = brain.under(dir)
      for (const i of own) bump(sig.module, i, 1 / Math.sqrt(own.length))
      for (const i of all) if (!own.includes(i)) bump(sig.module, i, 0.3 / Math.sqrt(all.length))
    }
  }
  for (const p of paths) {
    const clean = p.replace(/^\/+/, '').replace(/\/+$/, '')
    const exact = brain.files.findIndex((f) => f.path === clean || f.path.endsWith('/' + clean))
    if (exact >= 0) { bump(sig.path, exact, 1); continue }
    const b = brain.basenames.get(clean.split('/').pop())
    if (b !== undefined && b >= 0 && clean.includes('.')) { bump(sig.path, b, 0.7); continue }
    const inside = brain.files.map((f, i) => [f, i]).filter(([f]) => f.path.startsWith(clean + '/') || f.path.includes('/' + clean + '/'))
    for (const [, i] of inside) bump(sig.path, i, 0.5 / Math.sqrt(inside.length))
  }
  const docWords = new Set([...section.path.replace(/\.[^./]+$/, '').split('/').flatMap(splitWords), ...splitWords(section.heading ?? '')].filter((w) => w.length >= 3 && (brain.docWordDf.get(w) ?? 0) <= Math.max(2, brain.docPathCount * 0.3)))
  if (docWords.size) brain.files.forEach((_, i) => {
    let s = 0
    for (const w of docWords) for (const p of brain.pathWords[i]) if (p === w || p.length >= 5 && w.length >= 5 && (p.startsWith(w) || w.startsWith(p))) { s += Math.log(1 + brain.N / (brain.pathDf.get(p) ?? 1)); break }
    if (s) sig.docpath.set(i, s)
  })
  for (const [c, s] of brain.lexical(`${section.heading ?? ''}\n${section.text.slice(0, 6000)}`)) { const i = brain.chunks[c].file; if (s > (sig.lex.get(i) ?? 0)) sig.lex.set(i, s) }
  // Tests that match the section hand their match on to the product files they test.
  sig.viatest = new Map()
  const targets = testTargets(brain), testScore = new Map()
  for (const name of ['def', 'use', 'lex']) {
    const map = sig[name], top = Math.max(1e-9, ...[...map].filter(([i]) => brain.isTest[i]).map(([, v]) => v))
    for (const [i, v] of map) if (brain.isTest[i]) testScore.set(i, (testScore.get(i) ?? 0) + v / top)
  }
  for (const [t, s] of testScore) for (const [p, w] of targets.get(t) ?? []) bump(sig.viatest, p, s * w)
  return { sig, evidence, mentioned: { names: names.length, modules: modules.length, paths: paths.length } }
}

export const DEFAULT_WEIGHTS = { def: 1, use: 0.2, module: 0.5, path: 1, docpath: 0.4, lex: 0.5 }

/** Signals fused into one ranking: each signal scaled to its best file, then weighted. [{ file, score, parts }]. */
export function fuse(signals, weights = DEFAULT_WEIGHTS) {
  const total = new Map(), parts = new Map()
  for (const [name, map] of Object.entries(signals.sig)) {
    const w = weights[name] ?? 0
    if (!w || !map.size) continue
    const top = Math.max(...map.values())
    for (const [i, v] of map) { const x = w * v / top; total.set(i, (total.get(i) ?? 0) + x); const p = parts.get(i) ?? {}; p[name] = x; parts.set(i, p) }
  }
  return [...total].sort((a, b) => b[1] - a[1]).map(([file, score]) => ({ file, score, parts: parts.get(file) }))
}

/* ---------- Learned fusion ---------- */

export const LINK_SIGNALS = ['def', 'use', 'module', 'path', 'docpath', 'lex', 'viatest']
const featureNames = (extra = []) => [...[...LINK_SIGNALS, ...extra].flatMap((s) => [s, `${s}@rank`]), 'doc']
export const LINK_FEATURES = featureNames()
// Fitted on the dev repositories of mcp/eval/brain (listwise logistic regression on the maintainers' own
// documentation-and-code commits); the test repositories were never used for fitting. See mcp/eval/brain/README.md.
export const LINK_WEIGHTS = [0.25, 0.32, 0.93, 0.6, 0.49, -0.03, 0.42, 0.49, 0.83, 0.76, 2.51, 0.92, 0.64, 0.49, 1.76]

const signalsFor = (brain, section) => {
  brain.signalCache ??= new Map()
  if (!brain.signalCache.has(section.id)) brain.signalCache.set(section.id, sectionSignals(brain, section))
  return brain.signalCache.get(section.id)
}
/** Files the whole document is about: the mean of its sections' simple fused scores (each section's top 20). */
function docPrior(brain, section, siblings) {
  brain.priorCache ??= new Map()
  const key = section.path ?? section.source
  if (!brain.priorCache.has(key)) {
    const sum = new Map()
    for (const s of siblings) for (const r of fuse(signalsFor(brain, s), DEFAULT_WEIGHTS).slice(0, 20)) sum.set(r.file, (sum.get(r.file) ?? 0) + r.score / siblings.length)
    brain.priorCache.set(key, sum)
  }
  return brain.priorCache.get(key)
}

/**
 * Candidate files of a section with their features: per signal its value scaled to the section's best file and its
 * reciprocal rank, plus the document prior. Candidates are every signal's top 30. `extra` adds signals (Map(file →
 * value)) after the built-in ones, in the order given. [{ file, x }]
 */
export function linkFeatures(brain, section, siblings = [section], { extra = {} } = {}) {
  const sig = { ...signalsFor(brain, section).sig, ...extra }, names = [...LINK_SIGNALS, ...Object.keys(extra)]
  const pool = new Set(), stats = {}
  for (const s of names) {
    const sorted = [...(sig[s] ?? new Map())].sort((a, b) => b[1] - a[1])
    stats[s] = { top: sorted[0]?.[1] || 1, rank: new Map(sorted.map(([f], i) => [f, i])) }
    for (const [f] of sorted.slice(0, 30)) pool.add(f)
  }
  const prior = docPrior(brain, section, siblings), ptop = Math.max(1e-9, ...prior.values())
  return [...pool].map((f) => ({ file: f, x: [...names.flatMap((s) => { const v = sig[s]?.get(f); return v === undefined ? [0, 0] : [v / stats[s].top, 1 / (1 + stats[s].rank.get(f))] }), (prior.get(f) ?? 0) / ptop] }))
}

/**
 * A section's files, best first, with the share of the probability mass each gets (softmax over the candidates) and
 * what each signal contributed. [{ file, score, p, parts: { signal: contribution } }]
 */
export function rankFiles(brain, section, siblings, { weights = LINK_WEIGHTS, extra } = {}) {
  const names = [...LINK_SIGNALS, ...Object.keys(extra ?? {}), 'doc']
  const scored = linkFeatures(brain, section, siblings, { extra }).map((c) => {
    const parts = {}
    names.forEach((n, k) => { const v = n === 'doc' ? c.x.at(-1) * weights.at(-1) : c.x[2 * k] * weights[2 * k] + c.x[2 * k + 1] * weights[2 * k + 1]; if (v > 0) parts[n] = v })
    return { file: c.file, score: c.x.reduce((s, v, i) => s + v * weights[i], 0), parts }
  })
  if (!scored.length) return []
  const max = Math.max(...scored.map((c) => c.score)), z = scored.reduce((s, c) => s + Math.exp(c.score - max), 0)
  return scored.map((c) => ({ ...c, p: Math.exp(c.score - max) / z })).sort((a, b) => b.score - a.score)
}

/* ---------- The brain of a project ---------- */

// Measured on the test repositories (mcp/eval/brain/README.md): links with a share of at least 0.1 are 1.6 files per
// section, 85 % of them judged as describing or taking part in what the section says.
export const LINK_THRESHOLD = 0.1
const WEAK_THRESHOLD = 0.03
// The documentation site's own code and configuration build the website, they are not what the documentation describes.
const SITE = /(^|\/)(mkdocs[^/]*\.ya?ml|docusaurus\.config\.[a-z]+|sidebars?\.(js|ts|json)|_sidebar\.md|antora\.ya?ml)$|(^|\/)(www|website|site)\/|(^|\/)(docs?|documentation)\/.*\.(jsx?|tsx?|mjs|cjs|vue|css|scss|ya?ml|json|toml)$/i
const SIGNAL_LABELS = { def: 'definiert genannte Namen', use: 'verwendet genannte Namen', module: 'Paket oder Import aus dem Abschnitt', path: 'im Abschnitt genannt', docpath: 'Pfad passt zum Dokument', lex: 'gleiche Begriffe', viatest: 'Tests mit den Begriffen prüfen diese Datei', doc: 'passt zum ganzen Dokument' }

/**
 * Which code each documentation section describes, and the clean-up the documentation needs. Deterministic and free:
 * no model calls. `files`: [{ path, text }], `docFiles`: sections [{ id, source, path, heading, text, checkable }].
 * links: sectionId → [{ path, p, why, names }] (share ≥ LINK_THRESHOLD, product code only, at most 8);
 * weak: further candidates for change impact; files: path → section ids; tests: sectionId → test files;
 * cleanup: undocumented interface names, names the documentation mentions that no code has, sections without code.
 */
export function buildCodeBrain({ files, docFiles }, { threshold = LINK_THRESHOLD, maxLinks = 8 } = {}) {
  const started = Date.now()
  const brain = createBrain(files, { docPaths: docFiles.map((d) => d.path) })
  const bySource = new Map()
  for (const d of docFiles) { const l = bySource.get(d.source ?? d.path) ?? []; l.push(d); bySource.set(d.source ?? d.path, l) }
  const links = {}, weak = {}, tests = {}, byFile = {}
  for (const section of docFiles) {
    if (section.checkable === false) continue
    const ranked = rankFiles(brain, section, bySource.get(section.source ?? section.path))
    const evidence = signalsFor(brain, section).evidence
    const entry = (r) => ({
      path: brain.files[r.file].path, p: Math.round(r.p * 100) / 100,
      why: Object.entries(r.parts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => SIGNAL_LABELS[k]),
      names: (evidence.get(r.file) ?? []).slice(0, 5),
    })
    const product = ranked.filter((r) => !brain.isTest[r.file] && !SITE.test(brain.files[r.file].path))
    const kept = product.filter((r) => r.p >= threshold).slice(0, maxLinks)
    if (kept.length) links[section.id] = kept.map(entry)
    const rest = product.filter((r) => r.p >= WEAK_THRESHOLD && r.p < threshold).slice(0, 4)
    if (rest.length) weak[section.id] = rest.map(entry)
    const checks = ranked.filter((r) => brain.isTest[r.file] && r.p >= WEAK_THRESHOLD).slice(0, 3).map((r) => brain.files[r.file].path)
    if (checks.length) tests[section.id] = checks
    for (const r of kept) (byFile[brain.files[r.file].path] ??= []).push(section.id)
  }
  const checkable = docFiles.filter((d) => d.checkable !== false)
  const cleanup = {
    undocumented: undocumented(brain, docVocabulary(docFiles), { limit: 100 }).map(({ name, kind, path, line, fanIn }) => ({ name, kind, path, line, fanIn })),
    dead: deadMentions(brain, checkable).slice(0, 100),
    unlinked: checkable.filter((d) => !links[d.id]).map((d) => d.id),
  }
  return {
    version: 1, method: 'code-brain-v1', threshold, createdAt: new Date().toISOString(),
    links, weak, tests, files: byFile, cleanup,
    stats: { sections: checkable.length, linked: Object.keys(links).length, links: Object.values(links).reduce((s, l) => s + l.length, 0), codeFiles: files.length, linkedFiles: Object.keys(byFile).length, ms: Date.now() - started },
  }
}

/* ---------- Clean-up: what the documentation lacks and what it names that is gone ---------- */

// Code that is not the product's interface: examples, demos, benchmarks, build scripts, documentation-site code.
const NOT_SURFACE = /(^|\/)(examples?|samples?|demos?|benchmarks?|scripts?|tools?|hack|internal|testdata|fixtures?|docs?|www|website|site|e2e|playground|\.github)\//i
const SURFACE_KINDS = { string: 3, key: 2, type: 1.5, function: 1.2, member: 1, value: 1, param: 0.6 }

/** Every name the documentation contains as a token (exactly and lowercased), and its full text for keys and flags. */
export function docVocabulary(sections) {
  const exact = new Set(), lower = new Set()
  for (const s of sections) for (const t of s.text.match(/--?[a-z][\w-]*|[A-Za-z_$][\w$]*/g) ?? []) { exact.add(t); lower.add(t.toLowerCase()) }
  return { exact, lower, text: sections.map((s) => s.text).join('\n') }
}

/**
 * Names of the product's interface that no document mentions, most important first: exposed strings (environment
 * variables, flags, routes, configuration keys), configuration keys, types and functions that other files use.
 * Private names (leading underscore, `private`/`internal`, lowercase Go identifiers) and test, example and build
 * code are left out. [{ name, kind, path, line, fanIn, score }]
 */
export function undocumented(brain, vocab, { limit = 500, prior = true } = {}) {
  const candidates = []
  // Per file and kind: how many of its names the documentation already covers. A file whose options are documented
  // but two is where the gap is; 2,000 translation keys of which none is documented are not documentation's job.
  const groups = new Map()
  brain.files.forEach((f, i) => {
    if (brain.isTest[i] || NOT_SURFACE.test(f.path)) return
    const lines = f.text.split('\n'), go = /\.go$/.test(f.path)
    for (const d of brain.fileDefs[i]) {
      const n = d.name
      if (n.length < 4 || /^_|^[0-9]/.test(n) || CODE_COMMON.has(n) || !/[A-Z_\-.]|[a-z][A-Z]/.test(n) && d.kind !== 'string') continue
      if (go && d.kind !== 'string' && d.kind !== 'key' && /^[a-z]/.test(n)) continue
      if (/\b(private|internal|fileprivate|protected)\b/.test(lines[d.line] ?? '')) continue
      const documented = vocab.exact.has(n) || vocab.lower.has(n.toLowerCase()) || (d.kind === 'string' || d.kind === 'key') && vocab.text.includes(n)
      const g = `${i}:${d.kind}`, c = groups.get(g) ?? { total: 0, documented: 0 }
      c.total++; if (documented) c.documented++
      groups.set(g, c)
      if (!documented) candidates.push({ name: n, kind: d.kind, path: f.path, line: d.line + 1, group: g })
    }
  })
  const best = new Map()
  for (const c of candidates) {
    const fanIn = Math.max(0, (brain.tokenDf.get(c.name) ?? 1) - 1), g = groups.get(c.group)
    const coverage = (g.documented + 0.2) / (g.total + 2)
    const score = (prior ? coverage * 10 : 1) * (SURFACE_KINDS[c.kind] ?? 0.5) * Math.log(2 + fanIn)
    if (score > (best.get(c.name)?.score ?? 0)) best.set(c.name, { name: c.name, kind: c.kind, path: c.path, line: c.line, fanIn, coverage: +coverage.toFixed(2), score })
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * Names the documentation writes like code (code spans, camelCase, snake_case, CONSTANT_CASE, flags) that no code file
 * contains at all: renamed or removed options, functions and settings. [{ name, sections: [id], weight }]
 */
export function deadMentions(brain, sections) {
  const out = new Map(), lowerTokens = new Set([...brain.tokenDf.keys()].map((t) => t.toLowerCase()))
  const allText = brain.files.map((f) => f.text).join('\n')
  for (const s of sections) {
    for (const m of mentions(s.text).names) {
      const n = m.name
      if (n.length < 4) continue
      // Code spans and names written like code in prose speak about the product. In code blocks only names reached
      // through something the code has (httpx.urllib3_transport); free names there are example variables, and
      // flags in shell blocks belong to other tools as often as to the product.
      const span = m.where.includes('span') && (/[a-z][A-Z]|_|^--?[a-z]|^[A-Z][a-z]+[A-Z]/.test(n) || m.qualifiers.length)
      const prose = m.where.includes('prose') && /[a-z][A-Z]|[a-z]_[a-z]|^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(n)
      const block = m.where.includes('block') && m.qualifiers.some((q) => brain.tokenDf.has(q) && !CODE_COMMON.has(q))
      if (!span && !prose && !block) continue
      if (brain.tokenDf.has(n) || lowerTokens.has(n.toLowerCase())) continue
      if (/[-.]/.test(n) && allText.includes(n)) continue
      const e = out.get(n) ?? { name: n, sections: [], weight: 0 }
      e.sections.push(s.id); e.weight = Math.max(e.weight, m.weight)
      out.set(n, e)
    }
  }
  return [...out.values()].sort((a, b) => b.weight - a.weight || b.sections.length - a.sections.length)
}
