// Which code excerpts belong to a documentation section. Project-neutral: no language, domain or dataset rules.
// Strategies are compared with mcp/eval/run.mjs; 'hybrid' is the default of the initial check.
import { bm25, tokens } from './sources.mjs'

/** Code in excerpts of about 60 lines: Jev and the drafting model see the relevant place, not the file head. */
export function codeChunks(files, size = 60) {
  const chunks = []
  for (const file of files) {
    const lines = file.text.split('\n')
    for (let start = 0; start < lines.length; start += size) {
      const text = lines.slice(start, start + size + 5).join('\n')
      if (text.trim()) chunks.push({ id: `${file.id}#L${start + 1}`, file: file.id, path: file.path, start: start + 1, end: Math.min(lines.length, start + size + 5), text: text.slice(0, 3500) })
    }
  }
  return chunks
}

// Identifiers in both directions: `verifyMode`, verify_mode and VERIFY_MODE all yield verify + mode.
const WORD = /[\p{L}_][\p{L}\p{N}_]*/gu
export function identTokens(text) {
  const out = []
  for (const [word] of text.matchAll(WORD)) {
    const lower = word.toLowerCase()
    if (lower.length > 2) out.push(lower)
    const parts = word.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2').split(/[\s_]+/)
    if (parts.length > 1) for (const p of parts) if (p.length > 2) out.push(p.toLowerCase())
  }
  return out
}
// Names a reader can only have taken from the product: code spans, CamelCase, snake_case, CONSTANTS, --flags, a.b paths, quoted labels.
export function entities(text) {
  const found = new Set()
  for (const [, span] of text.matchAll(/`([^`\n]{2,80})`/g)) found.add(span)
  for (const [, label] of text.matchAll(/[„“"]([^„“”"\n]{3,40})[”“"]/g)) found.add(label)
  for (const [word] of text.matchAll(/--?[a-z][\w-]{2,}|\b[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)+|\b\p{Ll}+\p{Lu}[\p{L}\p{N}]*|\b\p{Lu}\p{Ll}+\p{Lu}[\p{L}\p{N}]*|\b[\p{L}\p{N}]+_[\p{L}\p{N}_]+|\b\p{Lu}{3,}\b/gu)) found.add(word)
  return [...found]
}
const RESOURCE = /\.(json|ya?ml|properties|toml|ini|xml)$/i
// key: value / "key": "value" / key=value lines of resource files (i18n texts, parameters, settings).
const pairs = (text) => [...text.matchAll(/^\s*["']?([\w.-]{3,})["']?\s*[:=]\s*["']?([^"'\n]{2,200})/gm)].map(([, key, value]) => ({ key, value }))

/**
 * Ranks excerpts for one section. options.strategy:
 *   bm25    section text against excerpt text (baseline)
 *   hybrid  bm25 + identifier index (split identifiers, weighted entities) + resource keys → code using the key
 *   graph   hybrid + neighbours of the best files in the code graph (imports, calls, SQL)
 * options.terms adds search terms from elsewhere (e.g. a model's translation of the section's claims).
 */
export function createRetriever(files, graph, { strategy = 'hybrid' } = {}) {
  const chunks = codeChunks(files)
  const text = bm25(chunks, (c) => `${c.path}\n${c.text}`)
  if (strategy === 'bm25') return { chunks, rank: (doc, limit = 24) => text(`${doc.title}\n${doc.text}`, limit).map((r) => r.item) }
  const idents = chunks.map((c) => new Set(identTokens(`${c.path}\n${c.text}`)))
  const df = new Map()
  for (const set of idents) for (const t of set) df.set(t, (df.get(t) || 0) + 1)
  const idf = (t) => Math.log(1 + chunks.length / (df.get(t) || chunks.length))
  // Resource keys whose value a document may quote, and the excerpts outside resources that use those keys.
  const keys = []
  for (const c of chunks.filter((c) => RESOURCE.test(c.path))) for (const { key, value } of pairs(c.text)) keys.push({ key, leaf: key.split('.').pop(), value: new Set(tokens(value)), chunk: c })
  const users = (key) => chunks.filter((c) => !RESOURCE.test(c.path) && (c.text.includes(`'${key}'`) || c.text.includes(`"${key}"`) || c.text.includes(`\`${key}\``)))
  const neighbours = new Map()
  if (strategy === 'graph') {
    const fileOf = new Map(graph?.nodes?.filter((n) => n.path).map((n) => [n.id, `file:${n.path}`]) || [])
    const add = (a, b) => { if (a && b && a !== b) { if (!neighbours.has(a)) neighbours.set(a, new Set()); neighbours.get(a).add(b) } }
    const tables = new Map()
    for (const e of graph?.edges || []) {
      if (['imports', 'calls'].includes(e.kind)) { add(fileOf.get(e.source) || e.source, fileOf.get(e.target) || e.target); add(fileOf.get(e.target) || e.target, fileOf.get(e.source) || e.source) }
      if (['schema', 'reads'].includes(e.kind)) tables.set(e.target, [...(tables.get(e.target) || []), e.source])
    }
    for (const users of tables.values()) for (const a of users) for (const b of users) add(a, b)
  }
  const fuse = (lists) => {
    const score = new Map()
    for (const [weight, list] of lists) list.forEach((c, i) => score.set(c, (score.get(c) || 0) + weight / (60 + i)))
    return [...score].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }
  return {
    chunks,
    rank(doc, limit = 24, { terms = [] } = {}) {
      const query = `${doc.title}\n${doc.text}`
      const named = entities(doc.text), weight = new Map()
      for (const t of identTokens(query)) weight.set(t, (weight.get(t) || 0) + 1)
      for (const t of [...named.flatMap(identTokens), ...terms.flatMap(identTokens)]) weight.set(t, (weight.get(t) || 0) + 3)
      const byIdent = chunks.map((c, i) => {
        let s = 0
        for (const [t, w] of weight) if (idents[i].has(t)) s += idf(t) * Math.min(w, 6)
        return { c, s }
      }).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((r) => r.c)
      const docTokens = new Set(tokens(`${query}\n${named.join('\n')}`))
      const viaKey = []
      for (const k of keys) {
        const shared = [...k.value].filter((t) => docTokens.has(t))
        if (shared.length && shared.length >= Math.min(2, k.value.size)) for (const c of [k.chunk, ...users(k.key), ...(k.leaf !== k.key ? users(k.leaf) : [])]) if (!viaKey.includes(c)) viaKey.push(c)
      }
      const lists = [[1, text(query, limit).map((r) => r.item)], [1, byIdent], [0.7, viaKey.slice(0, limit)]]
      // Reference sections cover many topics under their own headings; each topic gets its own query.
      const blocks = doc.text.split(/\n(?=#{2,4} )/).filter((b) => b.trim().length > 80)
      if (blocks.length >= 3) for (const block of blocks.slice(0, 12)) lists.push([0.5, text(block, 6).map((r) => r.item)])
      if (terms.length) lists.push([1, text(terms.join('\n'), limit).map((r) => r.item)])
      let ranked = fuse(lists)
      if (strategy === 'graph' && ranked.length) {
        const top = [...new Set(ranked.slice(0, 6).map((c) => c.file))].slice(0, 3)
        const near = new Set(top.flatMap((f) => [...(neighbours.get(f) || [])]).filter((f) => !top.includes(f)))
        const extra = text(query, chunks.length).map((r) => r.item).filter((c) => near.has(c.file))
        ranked = fuse([[1, ranked], [0.5, extra.slice(0, limit)]])
      }
      return ranked.slice(0, limit)
    },
  }
}

// Tests show behaviour through examples; documentation describes the product. At most one test excerpt per section.
export const isTest = (file) => /(^|\/)(tests?|test-d|__tests__|specs?|testdata|fixtures?|scripts|benchmarks?|\.github)\//i.test(file) || /(_test|\.test|\.spec|Tests?)\.[a-z]+$|(^|\/)test_[^/]+\.py$/.test(file)

/** The best k excerpts, at most `perFile` from one file and `tests` from test files. */
export function pick(ranked, k = 6, perFile = 2, tests = 1) {
  const out = [], count = new Map()
  for (const c of ranked) {
    if ((count.get(c.file) || 0) >= perFile || isTest(c.path) && out.filter((o) => isTest(o.path)).length >= tests) continue
    count.set(c.file, (count.get(c.file) || 0) + 1); out.push(c)
    if (out.length === k) break
  }
  return out
}
