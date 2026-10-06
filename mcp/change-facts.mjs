// Facts about values in the code, without a model: which value the code gives a name (a fallback, a default, a key,
// a flag with its argument), what the commits since the last release changed (a value, a name), and where the code
// itself disagrees. Language-neutral: literals next to names, no parsers.
//   - A section that still states the old value or the old name of something a commit changed gets that change as a
//     hint for the section check (the model verifies it against the new code line).
//   - A section that states a value for a setting the code sets to different values in different places gets a
//     question: guessing which place counts is how outdated defaults slip through.
import { classify } from '../frontend/src/dashboard/features/docs/import-rules.mjs'
import { isTest } from './retrieval.mjs'

// A quoted flag ('--depth') is a name, not a value.
const LITERAL = String.raw`-?\d[\d_]*(?:\.\d+)?|-?\.\d+|'(?!-)[^'\n]{0,80}'|"(?!-)[^"\n]{0,80}"|\btrue\b|\bfalse\b|\bTrue\b|\bFalse\b`
// name, then a fallback or key or argument separator, an optional call around the value, then the literal:
// `NAME || .5`, `NAME ?? 3`, `rows: 500`, `NAME=0.25`, `'--depth', '300'`, `get('NAME', 10)`, `limit = Number(20)`.
const PAIR = new RegExp(String.raw`(['"\x60]?)(--?[A-Za-z][\w-]*|[A-Za-z_$][\w$]*)\1\]?\s*(?:\|\||\?\?|:|=(?!=)|,|\bor\b)\s*(?:[A-Za-z_$][\w$.]*\()?\s*(${LITERAL})`, 'g')

/** The value as the documentation would state it: numbers without separators and leading zero, strings without quotes. */
export function normalizeValue(value) {
  const v = String(value).trim().replace(/^(['"`])(.*)\1$/, '$2')
  const n = v.replace(/[_,]/g, '')
  return /^-?(\d+(\.\d+)?|\.\d+)$/.test(n) ? String(Number(n)) : v
}

/** Name–value pairs of one line of code. */
export function literalPairs(line) {
  if (line.length > 400) return []
  return [...line.matchAll(PAIR)].filter((m) => {
    // After a comma only a flag's argument or a getter's default counts ('--depth', '300' · get('NAME', 10)), and a
    // list of names (['NAME_A', 'NAME_B']) has no values.
    const comma = /^[^,]*,/.test(m[0].slice(m[1].length + m[2].length + m[1].length))
    return !comma || (m[1] && !/^['"`]?[A-Z][A-Z0-9_]*['"`]?$/.test(m[3]))
  }).map((m) => ({ name: m[2], value: normalizeValue(m[3]) })).filter((p) => p.value !== '' && !/^(if|for|while|return|case|let|const|var|and|or|not|in)$/.test(p.name))
}

const ids = (line) => new Set(line.match(/--?[A-Za-z][\w-]*|[A-Za-z_$][\w$]*/g) ?? [])
const codeLike = (n) => n.length >= 4 && (/_|[a-z][A-Z]|^-/.test(n) || /^[A-Z][A-Z0-9]+$/.test(n))
const product = (path) => classify(path, 'repo') === 'code' && !isTest(path)

/** Removed and added lines of each hunk of a unified diff. */
function hunks(diff) {
  const out = []
  let current = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) { current = { removed: [], added: [] }; out.push(current); continue }
    if (!current) continue
    if (line.startsWith('-') && !line.startsWith('---')) current.removed.push(line.slice(1))
    else if (line.startsWith('+') && !line.startsWith('+++')) current.added.push(line.slice(1))
  }
  return out
}

/**
 * What the commits since the last release changed: values of names ({ kind: 'value', name, from, to }) and renamed
 * names ({ kind: 'rename', from, to }), each with the file and the commit. Oldest commit first, so that a value changed
 * twice keeps its first old and its last new value.
 */
export function codeChanges(history, diffs) {
  const changes = new Map()
  for (const c of [...(history?.commits ?? [])].reverse()) {
    for (const f of diffs?.[c.id] ?? []) {
      if (!product(f.new_path) || !f.diff) continue
      for (const h of hunks(f.diff)) {
        for (const removed of h.removed) {
          // The added line that is most like the removed one: the same line, edited.
          const a = ids(removed)
          const best = h.added.map((added) => { const b = ids(added); const shared = [...a].filter((x) => b.has(x)).length; return { added, score: shared / Math.max(1, new Set([...a, ...b]).size) } }).sort((x, y) => y.score - x.score)[0]
          if (!best || best.score < 0.5) continue
          const commit = { id: c.id.slice(0, 7), title: c.title }
          const before = literalPairs(removed), after = literalPairs(best.added)
          // A name that occurs twice in a line ('-c', 'a', '-c', 'b') is compared occurrence by occurrence.
          const nth = (list, p) => list.filter((q) => q.name === p.name).indexOf(p)
          for (const p of before) {
            const now = after.filter((q) => q.name === p.name)[nth(before, p)]
            if (!now || now.value === p.value) continue
            const key = `value:${p.name}:${f.new_path}`, old = changes.get(key)
            changes.set(key, { kind: 'value', name: p.name, from: old?.from ?? p.value, to: now.value, path: f.new_path, commit })
          }
          // One name replaced by another in an otherwise unchanged line.
          const b = ids(best.added), gone = [...a].filter((x) => !b.has(x)), came = [...b].filter((x) => !a.has(x))
          if (gone.length === 1 && came.length === 1 && codeLike(gone[0]) && codeLike(came[0])) {
            const key = `rename:${gone[0]}`, old = [...changes.values()].find((x) => x.kind === 'rename' && x.to === gone[0])
            changes.set(key, { kind: 'rename', from: old?.from ?? gone[0], to: came[0], path: f.new_path, commit })
            if (old) changes.delete(`rename:${old.from}`)
          }
        }
      }
    }
  }
  return [...changes.values()].filter((x) => x.from !== x.to)
}

const words = (s) => (s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase().match(/[a-z]{3,}/g) ?? []).map((w) => w.replace(/s$/, ''))
const NUMBER = /(?<![\w.\-/#:])(\d{1,3}(?:[,.']\d{3})+|\d+(?:\.\d+)?|\.\d+)(?![\w/:]|\.\d)/g
/** The values a line of documentation states: its numbers (1,000 · 0.25 · .5) and its code spans and quoted words. */
const statedValues = (line) => new Set([...[...line.matchAll(NUMBER)].map((m) => normalizeValue(m[1].replace(/'/g, ''))), ...[...line.matchAll(/[`"']([^`"'\n]{1,80})[`"']/g)].map((m) => normalizeValue(m[1]))])
/** A line that talks about a name: the name itself, or all of its words (codeFiles → "code files"). */
const mentions = (line, name) => {
  if (new RegExp(`(^|[^\\w$-])${name.replace(/[$]/g, '\\$')}($|[^\\w$-])`).test(line)) return true
  const parts = words(name), here = new Set(words(line))
  return parts.length > 0 && parts.every((w) => here.has(w))
}

/**
 * The changes a section still states in their old form: a line that mentions the name and states the old value (but
 * not the new one), or a line with the old name of a renamed one.
 */
export function sectionChanges(text, changes) {
  const lines = text.split('\n'), out = []
  for (const c of changes) {
    const at = lines.findIndex((line) => c.kind === 'rename'
      ? new RegExp(`(^|[^\\w$-])${c.from.replace(/[$]/g, '\\$')}($|[^\\w$-])`).test(line)
      : mentions(line, c.name) && statedValues(line).has(c.from) && !statedValues(line).has(c.to))
    if (at >= 0) out.push({ ...c, line: at + 1 })
  }
  return out
}

/**
 * Settings the section states a value for while the code sets them to different values in different places
 * (examples and tests left out): { name, stated, values: [{ value, where: ['path:line', …] }] }.
 * Only constants and flags: an option name such as `limit` rightly has different values in different functions.
 */
export function valueConflicts(text, names, valuesOf) {
  const lines = text.split('\n'), out = []
  for (const name of names.filter((n) => /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^--[a-z][\w-]+$/.test(n))) {
    const line = lines.find((l) => mentions(l, name))
    if (!line) continue
    const byValue = new Map()
    for (const v of valuesOf(name).filter((x) => product(x.path) && !/(^|\/)\.env\.|\.(example|sample|template|dist)$/i.test(x.path))) byValue.set(v.value, [...(byValue.get(v.value) ?? []), `${v.path}:${v.line}`])
    const stated = [...statedValues(line)].find((v) => byValue.has(v))
    if (byValue.size >= 2 && stated !== undefined) out.push({ name, stated, values: [...byValue].map(([value, where]) => ({ value, where })) })
  }
  return out
}

/** The question for a conflict, for the reviewer. */
export const conflictQuestion = (c) => `Im Code stehen für ${c.name} verschiedene Werte: ${c.values.map((v) => `${v.value} (${v.where.slice(0, 2).join(', ')})`).join(', ')}. Die Doku nennt ${c.stated}. Welcher Wert gilt?`

/** The question for a change since the last release that the section still states in its old form, for the reviewer. */
export const changeQuestion = (c) => c.kind === 'rename'
  ? `Commit ${c.commit.id} („${c.commit.title}“) hat ${c.from} seit dem letzten Release in ${c.to} umbenannt (${c.path}). Die Doku nennt noch ${c.from}. Gilt jetzt ${c.to}?`
  : `Commit ${c.commit.id} („${c.commit.title}“) hat ${c.name} seit dem letzten Release von ${c.from} auf ${c.to} geändert (${c.path}). Die Doku nennt noch ${c.from}. Gilt jetzt ${c.to}?`
