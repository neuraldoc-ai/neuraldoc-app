// Links from a finding's code evidence ("path:from-to") to that place in the hosted repository, at the commit the
// project read. GitHub and GitLab only; an uploaded folder has no address to link to.
import { projectState } from './project'

/** The lines of the quote inside the evidence range, so the link marks what the finding cites, not the whole excerpt. */
export function quoteLines(content: string | undefined, from: number, to: number, quote: string): [number, number] {
  if (!content) return [from, to]
  const lines = content.split(/\r?\n/), wanted = quote.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l !== '…')
  if (!wanted.length) return [from, to]
  for (let i = Math.max(0, from - 1); i < Math.min(lines.length, to); i++) {
    if (lines[i].trim() && lines[i].includes(wanted[0])) return [i + 1, Math.min(to, i + wanted.length)]
  }
  return [from, to]
}

/** The repository page for path and lines, or null when the project has no GitHub or GitLab address. */
export function codeUrl(path: string, from: number, to: number): string | null {
  const repo = projectState?.project?.sources.repo
  if (!repo?.url || !repo.head) return null
  const base = repo.url.replace(/\.git$/, '').replace(/\/+$/, '')
  const lines = to > from ? [from, to] : [from]
  if (/^https:\/\/github\.com\//.test(base)) return `${base}/blob/${repo.head}/${path}#${lines.map((n) => `L${n}`).join('-')}`
  if (/^https:\/\/gitlab\./.test(base)) return `${base}/-/blob/${repo.head}/${path}#L${lines.join('-')}`
  return null
}

/** "path:from-to" as written by the check. */
export function parseEvidence(source: string): { path: string; from: number; to: number } | null {
  const m = /^(.+):(\d+)-(\d+)$/.exec(source)
  return m ? { path: m[1], from: Number(m[2]), to: Number(m[3]) } : null
}
