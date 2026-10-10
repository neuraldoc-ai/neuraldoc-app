// Plain text from uploaded documents, and sections small enough for Jev and the drafting model.
// Office files are ZIP archives of XML; PDF goes through pdf.js (unpdf).
import { unzipSync, strFromU8 } from '../frontend/server-deps.mjs'
import { LIMITS } from '../frontend/src/dashboard/features/docs/import-rules.mjs'
import { NAMED_ENTITIES } from './html-entities.mjs'

const BINARY = /\.(pdf|docx|xlsx|pptx)$/i
export const isBinaryDoc = (file) => BINARY.test(file)

// &amp; last, so "&amp;auml;" stays the text "&auml;".
const entities = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&([a-z][a-z\d]*);/gi, (m, name) => name === 'amp' ? m : NAMED_ENTITIES[name] ?? m).replace(/&amp;/g, '&')
const runs = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))].map((m) => entities(m[1])).join('')
/** Rows of cells as a Markdown table: the first row is the header, short rows are padded, | inside a cell is escaped. */
export function markdownTable(rows) {
  const clean = rows.map((r) => r.map((c) => String(c).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'))).filter((r) => r.some(Boolean))
  if (!clean.length) return ''
  const width = Math.max(...clean.map((r) => r.length))
  const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
  return [line(clean[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...clean.slice(1).map(line)].join('\n')
}

/** HTML tables (also Confluence storage) as Markdown tables; cell paragraphs and line breaks become spaces. */
const htmlTables = (html) => html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => {
  const rows = (table.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).map((row) => (row.match(/<t[hd]\b[\s\S]*?<\/t[hd]>/gi) || []).map((cell) => entities(cell.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' '))))
  return `\n\n${markdownTable(rows)}\n\n`
})

/** List items as one line each, without the blank line a paragraph inside <li> leaves behind. */
const listItems = (text) => text.replace(/^- [ \t]+/gm, '- ').replace(/^(- .*)\n\n(?=- )/gm, '$1\n').replace(/^(- .*)\n\n(?=- )/gm, '$1\n')

const tidy = (text) => text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

function docx(files) {
  const xml = strFromU8(files['word/document.xml'] || new Uint8Array())
  const out = []
  for (const block of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    if (block.startsWith('<w:tbl>')) {
      out.push('', markdownTable((block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((row) => (row.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || []).map((cell) => runs(cell, 'w:t')))), '')
      continue
    }
    const text = runs(block, 'w:t')
    if (!text.trim()) { out.push(''); continue }
    const level = block.match(/<w:pStyle w:val="(?:Heading|berschrift|Titel|Title)(\d?)"/i)
    out.push(level ? `${'#'.repeat(Math.min(Number(level[1]) || 1, 4))} ${text}` : text)
  }
  return out.join('\n')
}

function pptx(files) {
  const slides = Object.keys(files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  return slides.map((f, i) => `## Folie ${i + 1}\n\n${(strFromU8(files[f]).match(/<a:p>[\s\S]*?<\/a:p>/g) || []).map((p) => runs(p, 'a:t')).filter((t) => t.trim()).join('\n')}`).join('\n\n')
}

function xlsx(files) {
  const shared = (strFromU8(files['xl/sharedStrings.xml'] || new Uint8Array()).match(/<si>[\s\S]*?<\/si>/g) || []).map((si) => runs(si, 't'))
  const workbook = strFromU8(files['xl/workbook.xml'] || new Uint8Array()), rels = strFromU8(files['xl/_rels/workbook.xml.rels'] || new Uint8Array())
  const target = (id) => rels.match(new RegExp(`<Relationship[^>]*Id="${id}"[^>]*Target="([^"]+)"`))?.[1] || rels.match(new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${id}"`))?.[1]
  const out = []
  for (const sheet of workbook.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const file = target(sheet[2]), xml = file && strFromU8(files[`xl/${file.replace(/^\/?xl\//, '')}`] || new Uint8Array())
    if (!xml) continue
    out.push(`## ${entities(sheet[1])}`, '')
    const rows = []
    for (const row of (xml.match(/<row[ >][\s\S]*?<\/row>/g) || []).slice(0, 2000)) {
      // Excel leaves out empty cells: each cell goes to the column of its reference (r="E5"), not to the next free one.
      const cells = []
      for (const c of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        const type = c.match(/ t="(\w+)"/)?.[1], value = c.match(/<v>([^<]*)<\/v>/)?.[1] ?? ''
        const column = c.match(/ r="([A-Z]{1,3})\d+"/)?.[1]
        cells[column ? [...column].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : cells.length] = type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? runs(c, 't') : entities(value)
      }
      rows.push(Array.from(cells, (v) => v ?? ''))
    }
    out.push(markdownTable(rows), '')
  }
  return out.join('\n')
}

/** Readable text of one document; throws a German message for unreadable files. */
export async function documentText(file, bytes) {
  try {
    if (/\.pdf$/i.test(file)) {
      const { extractText, getDocumentProxy } = await import('../frontend/server-deps.mjs')
      const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false })
      return tidy(text.map((page, i) => `## Seite ${i + 1}\n\n${page}`).join('\n\n'))
    }
    if (/\.(docx|xlsx|pptx)$/i.test(file)) {
      const files = unzipSync(new Uint8Array(bytes), { filter: (f) => /^(word\/document|ppt\/slides\/slide\d+|xl\/(sharedStrings|workbook|worksheets\/[^/]+)|xl\/_rels\/workbook\.xml)\.?(xml|rels)?$/.test(f.name) && f.originalSize < 50_000_000 })
      return tidy(/\.docx$/i.test(file) ? docx(files) : /\.pptx$/i.test(file) ? pptx(files) : xlsx(files))
    }
    // Text formats stay exact, so the export can put approved sections back into the original file.
    const text = Buffer.from(bytes).toString('utf8').replace(/^﻿/, '')
    // Confluence storage format: XHTML with ac:/ri: macros. An export comment "<!-- SPACE / Title (Version n) -->" names the page.
    if (/\.xml$/i.test(file)) {
      const title = text.match(/^\s*<!--[^>]*?\/\s*([^>]+?)\s*(?:\(Version \d+\))?\s*-->/)?.[1]
      return (title ? `# ${title}\n\n` : '') + await documentText(file.replace(/\.xml$/i, '.html'), Buffer.from(text.replace(/^\s*<!--[\s\S]*?-->/, '').replace(/<ac:parameter\b[^>]*>[\s\S]*?<\/ac:parameter>/gi, '')))
    }
    if (/\.html?$/i.test(file)) return listItems(tidy(entities(htmlTables(text).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<h([1-4])[^>]*>/gi, (_, n) => `\n${'#'.repeat(Number(n))} `).replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/(p|h\d|li|tr|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' '))))
    return text
  } catch (error) {
    throw new Error(`${file}: Dokument konnte nicht gelesen werden (${error.message.slice(0, 120)}).`)
  }
}

/** Offsets of the line starts outside fenced code blocks, with the heading level of each line (0 = no heading). */
function lineStarts(text) {
  const out = []
  let fence = null
  for (let at = 0; at < text.length;) {
    const end = text.indexOf('\n', at), line = text.slice(at, end < 0 ? text.length : end)
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1]
    if (fence) { if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null; out.push({ at, level: 0, fenced: true }) }
    else {
      if (marker) fence = marker
      out.push({ at, level: marker ? 0 : (line.match(/^(#{1,4})\s+\S/)?.[1].length ?? 0), fenced: !!marker, blank: !line.trim() })
    }
    if (end < 0) break
    at = end + 1
  }
  return out
}

/**
 * Splits text into exact, consecutive sections: one per heading (levels 1–4), tiny ones merged into the next,
 * long ones cut at blank lines outside code blocks. Joining the sections gives back the text.
 */
export function sections(text, { max = LIMITS.sectionChars, min = 400 } = {}) {
  const lines = lineStarts(text)
  const cuts = [0, ...lines.filter((l) => l.level && l.at > 0).map((l) => l.at), text.length]
  const parts = []
  for (let i = 0; i < cuts.length - 1; i++) if (cuts[i + 1] > cuts[i]) parts.push([cuts[i], cuts[i + 1]])
  // A heading with a line or two of text reads best together with what follows.
  const merged = []
  for (const part of parts) {
    const last = merged.at(-1)
    if (last && last[1] - last[0] < min) last[1] = part[1]
    else merged.push([...part])
  }
  const result = []
  for (const [from, to] of merged) {
    let start = from
    while (to - start > max) {
      const inside = (at) => at > start + max / 4 && at <= start + max
      // Never cut a code block in two: a long one may make its section up to three times as long.
      const blank = lines.filter((l) => l.blank && !l.fenced && inside(l.at)).map((l) => l.at).at(-1)
        ?? lines.find((l) => l.blank && !l.fenced && l.at > start + max && l.at < Math.min(to, start + 3 * max))?.at
      if (blank === undefined && to - start <= 3 * max) break
      const anyLine = lines.filter((l) => inside(l.at)).map((l) => l.at).at(-1)
      const cut = blank ?? anyLine ?? start + max
      result.push(text.slice(start, cut)); start = cut
    }
    if (to > start) result.push(text.slice(start, to))
  }
  return result
}

/** Front matter title, first Markdown or HTML h1, else null. */
export function documentTitle(text) {
  const front = text.match(/^---\n([\s\S]*?)\n---/)?.[1]?.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]
  const h1 = text.match(/^#\s+(.+)$/m)?.[1] ?? text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]*>/g, ' ')
  const title = front ?? h1 ? plainHeading(front ?? h1) : null
  return title ? title.slice(0, 120) : null
}

/** First heading of a section, without Markdown. */
export const sectionHeading = (text) => { const h = text.match(/^#{1,4}\s+(.+)$/m)?.[1]; return h ? plainHeading(h.replace(/\s+#+$/, '')).slice(0, 100) : null }
/** A heading without Markdown: code ticks, tags and emphasis go, underscores inside names stay. */
function plainHeading(h) {
  return h.replace(/<[^>]+>/g, ' ').replace(/`/g, '').replace(/\*\*|(?<!\w)__|__(?!\w)/g, '').replace(/(?<!\w)[*_](?=\S)|(?<=\S)[*_](?!\w)/g, '').replace(/\s+/g, ' ').trim()
}

/** Words a reader would read: no Markdown links targets, images, HTML tags, badges or code. */
export function proseWords(text) {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ')
  return prose.match(/\p{L}{2,}/gu) ?? []
}
