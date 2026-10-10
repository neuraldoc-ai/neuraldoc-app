// Approved Markdown back into a Confluence page in storage format (XHTML with ac:/ri: macros), as it lies in a
// documentation repository. The import turned the page into Markdown (doc-text.mjs); a pull request has to change
// the XML. Every changed line is reduced to the words that changed ("5 Tage" → "3 Tage": "5" → "3") and replaced
// inside the one text node it comes from; markup, macros and attachments stay byte for byte. What cannot be placed
// that way (a new table row, a deleted paragraph, a change across formatting) is reported, never guessed.
import { NAMED_ENTITIES } from './html-entities.mjs'

const NAMED = NAMED_ENTITIES
const decode = (entity) => {
  const m = entity.match(/^&(?:#x([0-9a-f]+)|#(\d+)|(\w+));$/i)
  if (!m) return entity
  return m[1] ? String.fromCodePoint(parseInt(m[1], 16)) : m[2] ? String.fromCodePoint(Number(m[2])) : NAMED[m[3]] ?? entity
}
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The page's text as one string with whitespace collapsed (tags count as whitespace, as in the import), and for each
 * character the raw range and the text node it comes from.
 */
export function textSpace(xml) {
  const chars = []
  let node = 0, i = 0
  const boundary = () => { node++; chars.push({ c: ' ', node: -1 }) }
  while (i < xml.length) {
    if (xml.startsWith('<!--', i)) { const end = xml.indexOf('-->', i); i = end < 0 ? xml.length : end + 3; boundary(); continue }
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i), stop = end < 0 ? xml.length : end
      boundary()
      for (let k = i + 9; k < stop; k++) chars.push({ c: xml[k], start: k, end: k + 1, node, cdata: true })
      i = stop + 3; boundary(); continue
    }
    if (xml[i] === '<') {
      // Macro parameters are settings, not text (the import drops them too).
      if (/^<ac:parameter\b/i.test(xml.slice(i, i + 14))) { const end = xml.indexOf('</ac:parameter>', i); i = end < 0 ? xml.length : end + 15; boundary(); continue }
      const end = xml.indexOf('>', i); i = end < 0 ? xml.length : end + 1; boundary(); continue
    }
    if (xml[i] === '&') {
      const m = xml.slice(i, i + 12).match(/^&(?:#x[0-9a-f]+|#\d+|\w+);/i)
      if (m) { chars.push({ c: decode(m[0]), start: i, end: i + m[0].length, node }); i += m[0].length; continue }
    }
    chars.push({ c: xml[i], start: i, end: i + 1, node }); i++
  }
  let text = ''
  const at = []
  for (const ch of chars) {
    const space = /\s/.test(ch.c)
    if (space && (!text || text.endsWith(' '))) continue
    text += space ? ' ' : ch.c
    at.push(space && ch.node === -1 ? null : ch)
  }
  return { text, at }
}

/** A Markdown line of the import as the plain words it stands for: no heading or list marker, table cells as words. */
export function plain(line) {
  let s = line.trim()
  if (/^\|(\s*:?-{3,}:?\s*\|)+$/.test(s)) return ''
  if (/^\|.*\|$/.test(s)) s = s.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim()).join(' ')
  return s.replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').replace(/\s+/g, ' ').trim()
}

/** Line diff (longest common subsequence) as hunks of removed and added lines. */
export function lineHunks(before, after) {
  const a = before.split('\n'), b = after.split('\n'), n = a.length, m = b.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const hunks = []
  let i = 0, j = 0, hunk = null
  const flush = () => { if (hunk) hunks.push(hunk); hunk = null }
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { flush(); i++; j++ }
    else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) { (hunk ??= { removed: [], added: [] }).added.push(b[j++]) }
    else { (hunk ??= { removed: [], added: [] }).removed.push(a[i++]) }
  }
  flush()
  return hunks
}

/** The words that differ between two lines: common start and end are cut at word boundaries. */
export function changedWords(before, after) {
  let p = 0
  while (p < before.length && p < after.length && before[p] === after[p]) p++
  while (p > 0 && !(/\s/.test(before[p - 1]))) p--
  let s = 0
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++
  while (s > 0 && !(/\s/.test(before[before.length - s]))) s--
  return { offset: p, old: before.slice(p, before.length - s), new: after.slice(p, after.length - s) }
}

/**
 * Puts approved sections (Markdown of the import) into the storage XML. Returns the new XML and, per item, whether
 * it went in completely, partly (with the parts left out) or not at all.
 */
export function applyStorage(raw, items) {
  const replacements = [], results = []
  const space = textSpace(raw)
  // The import puts the page title from the export comment first as "# Title" (doc-text.mjs); it is not page text.
  const title = raw.match(/^\s*<!--[^>]*?\/\s*([^>]+?)\s*(?:\(Version \d+\))?\s*-->/)?.[1]
  for (const item of items) {
    const left = [], done = []
    // Short lines ("Kaufvertrag") occur on many places of a page: search from where the section begins.
    const anchor = item.find.split('\n').map(plain).find((l) => l.length >= 12 && space.text.indexOf(l) >= 0 && space.text.indexOf(l) === space.text.lastIndexOf(l))
    let cursor = anchor ? space.text.indexOf(anchor) : 0
    for (const hunk of lineHunks(item.find.replace(/\r\n/g, '\n'), item.content.replace(/\r\n/g, '\n'))) {
      const pairs = Math.min(hunk.removed.length, hunk.added.length)
      for (let k = 0; k < pairs; k++) {
        const before = plain(hunk.removed[k]), after = plain(hunk.added[k])
        if (before === after) continue
        if (title && /^#\s/.test(hunk.removed[k]) && before === title) { left.push({ old: before, new: after, why: 'Seitentitel, in Confluence ändern' }); continue }
        const placed = place(space, before, after, cursor)
        if (placed.error) { left.push({ old: before, new: after, why: placed.error }); continue }
        if (placed.already) { done.push(after); continue }
        replacements.push(placed.replacement); done.push(after); cursor = placed.next
      }
      for (const line of hunk.added.slice(pairs)) if (plain(line)) left.push({ new: plain(line), why: 'neue Zeile' })
      for (const line of hunk.removed.slice(pairs)) if (plain(line)) left.push({ old: plain(line), why: 'gestrichene Zeile' })
    }
    results.push({ item, state: !left.length ? 'applied' : done.length ? 'partial' : 'conflict', left })
  }
  // Each replacement lies inside one text node; overlapping ones (two sections changing the same words) keep the first.
  replacements.sort((a, b) => b.start - a.start)
  let xml = raw, last = Infinity
  for (const r of replacements) { if (r.end > last) continue; xml = xml.slice(0, r.start) + r.text + xml.slice(r.end); last = r.start }
  return { text: xml, results }
}

function place(space, before, after, cursor) {
  if (!before) return { error: 'neue Zeile' }
  let at = space.text.indexOf(before, cursor)
  // Before the cursor only if the line is unique on the page.
  if (at < 0 && space.text.indexOf(before) === space.text.lastIndexOf(before)) at = space.text.indexOf(before)
  if (at < 0) {
    return space.text.includes(after) ? { already: true } : { error: 'Text steht so nicht mehr auf der Seite' }
  }
  const words = changedWords(before, after), from = at + words.offset, to = from + words.old.length
  const chars = space.at.slice(from, to)
  // Insertion without removed words: next to the character before it, in the same text node.
  const anchor = chars.length ? chars : [space.at[from - 1] ?? space.at[from]]
  if (anchor.some((c) => !c) || new Set(anchor.map((c) => c.node)).size !== 1) return { error: 'Änderung über Formatierung hinweg' }
  const cdata = anchor[0].cdata, text = cdata ? words.new : escape(words.new)
  if (cdata && words.new.includes(']]>')) return { error: 'Änderung im Codeblock nicht einsetzbar' }
  const replacement = chars.length ? { start: chars[0].start, end: chars.at(-1).end, text } : { start: anchor[0].end, end: anchor[0].end, text }
  return { replacement, next: at + before.length }
}
