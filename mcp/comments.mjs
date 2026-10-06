// Comments inside the code as documentation: which lines are comments, which blocks make claims about the code next to
// them, and which of those claims the code contradicts. Project-neutral: comment syntax by file type, no parsers.

/** Comment syntax per file type: line markers, block delimiters, docstrings. */
export function syntaxOf(path) {
  const name = path.split('/').pop().toLowerCase(), ext = name.includes('.') ? name.split('.').pop() : name
  if (/^(py|pyi)$/.test(ext)) return { line: ['#'], docstring: true }
  if (/^(rb|sh|bash|zsh|yaml|yml|toml|ini|cfg|conf|properties|r|pl|ps1|tf)$/.test(ext) || /^(makefile|dockerfile|containerfile|procfile|justfile)$/.test(name) || /^\.env\./.test(name)) return { line: ['#'] }
  if (/^(sql|lua|hs)$/.test(ext)) return { line: ['--'], block: ['/*', '*/'] }
  if (/^(pas|dpr)$/.test(ext)) return { line: ['//'], block: ['{', '}'] }
  if (/^(js|jsx|mjs|cjs|ts|tsx|mts|cts|java|kt|kts|go|rs|cs|c|cc|cpp|h|hpp|swift|scala|php|dart|groovy|gradle|vue|svelte|css|scss|proto|graphql|gql|prisma)$/.test(ext)) return { line: ['//'], block: ['/*', '*/'] }
  return null
}

/** Index of a line comment marker outside string literals, or -1. */
export function lineMarker(line, markers) {
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    // "://" is a URL, "\//" the end of a regular expression literal.
    for (const m of markers) if (line.startsWith(m, i) && !(m === '//' && (line[i - 1] === ':' || line[i - 1] === '\\'))) return i
  }
  return -1
}

/**
 * For every line of a file: 'code', 'comment' (the whole line is comment), 'trailing' (code followed by a comment)
 * or 'blank'. Docstrings count as comment lines.
 */
export function commentMask(text, path) {
  const syntax = syntaxOf(path), lines = text.split('\n')
  if (!syntax) return lines.map((l) => (l.trim() ? 'code' : 'blank'))
  const out = []
  let inBlock = false, inDoc = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], trimmed = line.trim()
    if (!trimmed) { out.push(inBlock || inDoc ? 'comment' : 'blank'); continue }
    if (inDoc) { out.push('comment'); if (trimmed.includes(inDoc)) inDoc = null; continue }
    if (inBlock) { out.push('comment'); if (trimmed.includes(syntax.block[1])) inBlock = false; continue }
    if (syntax.docstring) {
      const open = trimmed.match(/^[rRbBuU]{0,2}("""|''')/)?.[1]
      // A docstring is a triple-quoted string that stands alone: right after def/class or at the top of a module.
      if (open && (i === 0 || /:\s*$/.test(lines.slice(0, i).reverse().find((l) => l.trim())?.trim() ?? '') || out.every((k) => k !== 'code'))) {
        out.push('comment')
        if (trimmed.slice(trimmed.indexOf(open) + 3).indexOf(open) < 0) inDoc = open
        continue
      }
    }
    if (syntax.block && trimmed.startsWith(syntax.block[0]) && !(syntax.block[0] === '{' && !/^\{[^$]/.test(trimmed))) {
      out.push('comment')
      if (trimmed.indexOf(syntax.block[1], syntax.block[0].length) < 0) inBlock = true
      continue
    }
    const at = lineMarker(line, syntax.line)
    if (at === 0 || at > 0 && !line.slice(0, at).trim()) { out.push('comment'); continue }
    out.push(at > 0 ? 'trailing' : 'code')
  }
  return out
}

const DIRECTIVE = /^\s*(?:\/\/|#|--|\/\*+|\*)?\s*(?:eslint|prettier|@ts-|ts-|istanbul|c8 |noqa|type:|pylint|mypy|pyright|nolint|go:|#\s*region|#\s*endregion|region|endregion|@flow|jshint|biome-ignore|deno-lint|tslint|NOSONAR|pragma|noinspection|fmt:|isort:|-\*-|coding[:=]|!\/)/i
const LICENSE = /\b(licen[cs]e|copyright|spdx|all rights reserved)\b/i
/** Words a reader can read, without comment markers and tags. */
const words = (text) => text.replace(/^\s*(?:\/\/+|#+|--|\/\*+|\*\/|\*|"""|''')/gm, ' ').match(/[\p{L}\p{N}_]+/gu) ?? []
/** A comment that is commented-out code rather than prose. */
const looksLikeCode = (text) => { const t = text.replace(/^\s*(?:\/\/+|#+|--)\s?/gm, ''); return (t.match(/[;{}()=<>]/g) ?? []).length / Math.max(1, t.length) > 0.06 && words(t).length < 12 }

/**
 * Comment blocks of a file with what they describe: consecutive comment lines (or a trailing comment) and the code
 * that follows (subject). Directives, licence headers, separators and commented-out code are left out.
 * Lines are 1-based and inclusive.
 */
export function commentBlocks(text, path) {
  const mask = commentMask(text, path), lines = text.split('\n'), blocks = []
  for (let i = 0; i < lines.length; i++) {
    if (mask[i] === 'trailing') {
      const syntax = syntaxOf(path), at = lineMarker(lines[i], syntax.line), comment = lines[i].slice(at)
      // Two words are enough at the end of a line ("# 1 day", "// in ms").
      if (words(comment).length >= 2 && !DIRECTIVE.test(comment)) blocks.push({ start: i + 1, end: i + 1, kind: 'trailing', text: lines[i], subject: [i + 1, i + 1] })
      continue
    }
    if (mask[i] !== 'comment') continue
    let j = i
    while (j + 1 < lines.length && mask[j + 1] === 'comment') j++
    const body = lines.slice(i, j + 1).join('\n')
    // The subject: the code after the comment up to the next comment or blank line after its first statement, at most 40 lines.
    let k = j + 1
    while (k < lines.length && mask[k] === 'blank') k++
    let end = k
    while (end + 1 < lines.length && end - k < 40 && mask[end + 1] !== 'comment' && !(mask[end + 1] === 'blank' && indent(lines[end + 2] ?? '') <= indent(lines[k] ?? ''))) end++
    const first = blocks.length === 0 && i < 3
    // A Python docstring describes the def or class line above it and the body after it.
    const docstring = /^\s*[rRbBuU]{0,2}("""|''')/.test(lines[i])
    const owner = docstring ? lines.slice(Math.max(0, i - 3), i).map((l, n) => [l, i - Math.min(3, i) + n]).reverse().find(([l]) => /^\s*(async\s+def|def|class)\s/.test(l))?.[1] : undefined
    const subject = k < lines.length ? [(owner ?? k) + 1, end + 1] : owner !== undefined ? [owner + 1, j + 1] : null
    if (!(first && LICENSE.test(body)) && !lines.slice(i, j + 1).every((l) => DIRECTIVE.test(l) || !/[\p{L}]{2}/u.test(l)) && !looksLikeCode(body) && words(body).length >= 3)
      blocks.push({ start: i + 1, end: j + 1, kind: docstring || /^\s*\/\*\*/.test(lines[i]) ? 'doc' : 'line', text: body, subject })
    i = j
  }
  return blocks
}
const indent = (line) => line.match(/^\s*/)[0].length
