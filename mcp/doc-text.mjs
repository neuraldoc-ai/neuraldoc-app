// Plain text from uploaded documents, and sections small enough for Jev and the drafting model.
// Office files are ZIP archives of XML; PDF goes through pdf.js (unpdf).
import { unzipSync, strFromU8 } from '../frontend/server-deps.mjs'
import { LIMITS } from '../frontend/src/dashboard/features/docs/import-rules.mjs'

const BINARY = /\.(pdf|docx|xlsx|pptx)$/i
export const isBinaryDoc = (file) => BINARY.test(file)

const entities = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const runs = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))].map((m) => entities(m[1])).join('')
const tidy = (text) => text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

function docx(files) {
  const xml = strFromU8(files['word/document.xml'] || new Uint8Array())
  const out = []
  for (const block of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    if (block.startsWith('<w:tbl>')) {
      for (const row of block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []) out.push((row.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || []).map((cell) => runs(cell, 'w:t').trim()).join(' | '))
      out.push('')
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
    for (const row of (xml.match(/<row[ >][\s\S]*?<\/row>/g) || []).slice(0, 2000)) {
      const cells = (row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).map((c) => {
        const type = c.match(/ t="(\w+)"/)?.[1], value = c.match(/<v>([^<]*)<\/v>/)?.[1] ?? ''
        return type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? runs(c, 't') : entities(value)
      })
      if (cells.some((c) => c.trim())) out.push(cells.join(' | '))
    }
    out.push('')
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
    if (/\.html?$/i.test(file)) return tidy(entities(text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<h([1-4])[^>]*>/gi, (_, n) => `\n${'#'.repeat(Number(n))} `).replace(/<\/(p|h\d|li|tr|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')))
    return text
  } catch (error) {
    throw new Error(`${file}: Dokument konnte nicht gelesen werden (${error.message.slice(0, 120)}).`)
  }
}

/** Splits text into exact, consecutive slices of at most `max` characters, preferring headings, then paragraphs. */
export function sections(text, max = LIMITS.sectionChars) {
  const result = []
  let start = 0
  while (start < text.length) {
    if (text.length - start <= max) { result.push(text.slice(start)); break }
    const window = text.slice(start, start + max)
    const headings = [...window.matchAll(/\n(?=#{1,4} )/g)].map((m) => m.index + 1).filter((i) => i > max / 4)
    const paragraphs = [...window.matchAll(/\n\n/g)].map((m) => m.index + 2).filter((i) => i > max / 4)
    const lines = [...window.matchAll(/\n/g)].map((m) => m.index + 1).filter((i) => i > max / 4)
    const cut = headings.at(-1) ?? paragraphs.at(-1) ?? lines.at(-1) ?? max
    result.push(text.slice(start, start + cut)); start += cut
  }
  return result
}
