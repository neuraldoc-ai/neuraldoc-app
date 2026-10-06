// Finds commits in a Git history that changed only comment lines and more than spelling: the version before such a
// commit holds a comment the maintainers judged wrong. Candidates for the comment benchmark; free, no model calls.
//   node mcp/eval/mine-comment-fixes.mjs <repo dir> [max commits]
import { execFileSync } from 'node:child_process'
import { commentMask, syntaxOf } from '../comments.mjs'

const [dir, max = '4000'] = process.argv.slice(2)
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 })
const words = (s) => s.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []
const near = (a, b) => { if (Math.abs(a.length - b.length) > 2) return false; let d = 0; for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) d++; return d <= 2 }
// Only spelling: every removed word has a near-identical added word.
const spelling = (removed, added) => { const r = words(removed), a = words(added); return r.filter((w) => !a.includes(w)).every((w) => a.some((x) => near(w, x))) && a.filter((w) => !r.includes(w)).every((w) => r.some((x) => near(w, x))) }

const commits = git('log', '--no-merges', `-${max}`, '--format=%H %P', '--numstat').split('\n')
const candidates = []
let current = null
const flush = () => { if (current && current.files.length && current.files.length <= 3 && current.lines <= 30) candidates.push(current) }
for (const line of commits) {
  const head = line.match(/^([0-9a-f]{40}) ([0-9a-f]{40})$/)
  if (head) { flush(); current = { sha: head[1], parent: head[2], files: [], lines: 0 }; continue }
  const stat = line.match(/^(\d+)\t(\d+)\t(.+)$/)
  if (stat && current) {
    if (!syntaxOf(stat[3]) || /(^|\/)(test|tests|__tests__|spec)\/|_test\.|\.test\.|\.spec\./.test(stat[3])) { current.files.push({ skip: true }); current.lines = 1e9; continue }
    current.files.push({ path: stat[3] }); current.lines += Number(stat[1]) + Number(stat[2])
  }
}
flush()
const found = []
for (const c of candidates) {
  let ok = true
  const changes = []
  for (const { path } of c.files) {
    let before, after
    try { before = git('show', `${c.parent}:${path}`); after = git('show', `${c.sha}:${path}`) } catch { ok = false; break }
    const diff = git('diff', '-U0', c.parent, c.sha, '--', path)
    const maskBefore = commentMask(before, path), maskAfter = commentMask(after, path)
    for (const hunk of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
      const [os, oc = '1', ns, nc = '1'] = hunk.slice(1).map((v, i) => v ?? (i % 2 ? '1' : undefined))
      const removed = Array.from({ length: Number(oc) }, (_, i) => Number(os) + i), added = Array.from({ length: Number(nc) }, (_, i) => Number(ns) + i)
      if (removed.some((l) => maskBefore[l - 1] !== 'comment') || added.some((l) => maskAfter[l - 1] !== 'comment')) { ok = false; break }
      const r = removed.map((l) => before.split('\n')[l - 1]).join('\n'), a = added.map((l) => after.split('\n')[l - 1]).join('\n')
      if (removed.length) changes.push({ path, lines: [removed[0], removed.at(-1)], removed: r, added: a })
    }
    if (!ok) break
  }
  if (!ok || !changes.length) continue
  if (changes.every((x) => spelling(x.removed, x.added))) continue
  found.push({ sha: c.sha.slice(0, 10), parent: c.parent.slice(0, 10), subject: git('log', '-1', '--format=%s', c.sha).trim(), changes })
}
console.log(JSON.stringify(found, null, 1))
console.error(`${candidates.length} small commits, ${found.length} change only comments beyond spelling`)
