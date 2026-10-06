// The comment benchmark: copies of real repositories with planted wrong comments (mcp/eval/benchmarks/comments.json).
// Ground truth is read only here, never by the product.
import fs from 'node:fs'
import path from 'node:path'
import { classify } from '../../frontend/src/dashboard/features/docs/import-rules.mjs'
import { syntaxOf } from '../comments.mjs'
import { isTest } from '../retrieval.mjs'
import { evalDir } from './benchmarks.mjs'

export const spec = JSON.parse(fs.readFileSync(new URL('./benchmarks/comments.json', import.meta.url), 'utf8'))
export const COMMENT_REPOS = Object.keys(spec.repos)

const walk = (dir, out = [], base = dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out, base); else out.push(path.relative(base, p).replaceAll('\\', '/'))
  }
  return out
}

/**
 * The files of one benchmark repository as the product would read them ({ id, path, text }), with the planted
 * mutations applied (planted = true) or as released. Also returns where each planted comment ends up.
 */
export function loadCommentBench(repo, { planted = true } = {}) {
  const { src, root, exclude } = spec.repos[repo]
  const base = path.join(evalDir, 'src', src)
  const skip = exclude ? new RegExp(exclude) : null
  const files = walk(base).filter((p) => (root === '.' || p.startsWith(root + '/')) && classify(p, 'repo') === 'code' && !isTest(p) && !(skip && skip.test(p)))
    .map((p) => ({ id: p, path: p, text: fs.readFileSync(path.join(base, p), 'utf8').replace(/\r\n/g, '\n') }))
  // Positions in the released text first; mutations are applied from the end of a file so that none moves another,
  // and the lines of each item account for the line count changes of the mutations above it.
  const located = spec.planted.filter((i) => i.repo === repo).map((item) => {
    const file = files.find((f) => f.path === item.file)
    if (!file) throw new Error(`${item.id}: ${item.file} fehlt`)
    let at = -1
    for (let n = 0; n < (item.nth ?? 1); n++) at = file.text.indexOf(item.find, at + 1)
    if (at < 0 || !item.nth && file.text.indexOf(item.find, at + 1) >= 0) throw new Error(`${item.id}: Stelle nicht eindeutig gefunden`)
    return { item, file, at, line: file.text.slice(0, at).split('\n').length, delta: item.replace.split('\n').length - item.find.split('\n').length }
  })
  const items = located.map(({ item, file, at, line }) => {
    const shift = planted ? located.filter((o) => o.file === file && o.at < at).reduce((n, o) => n + o.delta, 0) : 0
    return { ...item, lines: [line + shift, line + shift + (planted ? item.replace : item.find).split('\n').length - 1] }
  })
  if (planted) for (const { item, file, at } of [...located].sort((a, b) => b.at - a.at)) file.text = file.text.slice(0, at) + item.replace + file.text.slice(at + item.find.length)
  const real = spec.real.filter((i) => i.repo === repo).map((i) => {
    const file = files.find((f) => f.path === i.file), at = file.text.indexOf(i.anchor)
    if (at < 0) throw new Error(`${i.id}: Anker fehlt`)
    const line = file.text.slice(0, at).split('\n').length
    return { ...i, lines: [line, line] }
  })
  return { repo, files, items, real, commented: files.filter((f) => syntaxOf(f.path)) }
}

export const commentEvalDir = path.join(evalDir, 'comments')
