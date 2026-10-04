// Which code excerpts belong to a documentation section. Project-neutral: no language, domain or dataset rules.
// BM25 over excerpts won against an identifier index and code-graph expansion on four benchmarks (mcp/eval/README.md).
import { bm25 } from './sources.mjs'

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

/** Excerpts ranked against a section's title and text. */
export function createRetriever(files) {
  const chunks = codeChunks(files), rank = bm25(chunks, (c) => `${c.path}\n${c.text}`)
  return { chunks, rank: (doc, limit = 48) => rank(`${doc.title}\n${doc.text}`, limit).map((r) => r.item) }
}

// Tests and build scripts show behaviour only indirectly and crowd out product code: at most one such excerpt per section.
export const isTest = (file) => /(^|\/)(tests?|test-d|__tests__|specs?|testdata|fixtures?|scripts|benchmarks?|\.github)\//i.test(file) || /(_test|\.test|\.spec|Tests?)\.[a-z]+$|(^|\/)test_[^/]+\.py$/.test(file)

/** The best k excerpts, at most `perFile` from one file and `tests` from test or script files. */
export function pick(ranked, k = 6, perFile = 2, tests = 1) {
  const out = [], count = new Map()
  for (const c of ranked) {
    if ((count.get(c.file) || 0) >= perFile || isTest(c.path) && out.filter((o) => isTest(o.path)).length >= tests) continue
    count.set(c.file, (count.get(c.file) || 0) + 1); out.push(c)
    if (out.length === k) break
  }
  return out
}
