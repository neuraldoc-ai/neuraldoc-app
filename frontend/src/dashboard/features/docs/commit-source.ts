import { commitOf } from './logic.ts'

export type SourceCommit = {
  id: string
  short_id: string
  title: string
  message: string
  author_name: string
  committed_date: string
  stats: { additions: number; deletions: number }
}

// These demo summaries differ from the original GitLab commit titles.
const sourceIds: Record<string, string> = {
  '0d4e8f3': 'bce67ee918b392058d8c0fcc3db772596e699bd4',
  '4a7e912': '6977c6cd54f01797f41b0a24e407517d2a402d6d',
  'f0b8d31': '8b55cef67c9ab04bbe198c49d32d9af4665fc1dd',
}

/** Resolve the demo's evidence IDs to their original GitLab commits, without fuzzy matching. */
export function resolveCommitSource(hash: string, sources: readonly SourceCommit[]) {
  const id = sourceIds[hash] ?? hash
  const exact = sources.find((c) => c.id === id)
  if (exact) return exact
  const demo = commitOf(hash)
  const matches = sources.filter((c) => demo
    ? c.title === demo.message && c.committed_date.startsWith(demo.date)
    : c.id.startsWith(hash))
  return matches.length === 1 ? matches[0] : undefined
}
