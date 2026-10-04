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
  '0d4e8f3': '4073737ff604d69589eeddf024efc77a4ac7ea77',
  '4a7e912': 'ccbc28e3799931c623c8ebaf310a90a9ba61f1a5',
  'f0b8d31': '3938d39a05bc35f55fefd352ad17372c4b5dea2e',
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
