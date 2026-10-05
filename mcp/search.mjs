// BM25 search over any items. Shared by own projects and the MOBIQ showcase; reads no dataset.

const STOP = new Set(
  'der die das und oder ein eine einer eines einem einen ist sind wird werden wurde im in am an auf aus bei mit nach von vor zu zum zur für über unter nicht nur auch wie was wer wo wann warum welche welcher welches den dem des als sich es sie er wir ihr ich du so dann wenn ob da kann können muss soll gibt jetzt noch prüfen prüft geprüft bitte ab the a of to and'.split(' '),
)
const stem = (w) => w.replace(/(ungen|ung|en|er|es|e|n|s)$/u, '')
export const tokens = (s) =>
  (s.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 ? stem(w) : w))

/** A BM25 index over `items`; `textOf` gives each item's searchable text, `tokenize` splits it into terms. */
export function bm25(items, textOf, tokenize = tokens) {
  const tf = items.map((it) => {
    const m = new Map()
    for (const t of tokenize(textOf(it))) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  })
  const lens = tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0))
  const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, items.length)
  const df = new Map()
  for (const m of tf) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const N = items.length
  return (query, limit = 5) => {
    const q = [...new Set(tokenize(query))]
    return items
      .map((item, i) => {
        let score = 0
        for (const t of q) {
          const f = tf[i].get(t)
          if (!f) continue
          const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5))
          score += idf * ((f * 2.4) / (f + 1.4 * (0.25 + (0.75 * lens[i]) / avg)))
        }
        return { item, score }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}
