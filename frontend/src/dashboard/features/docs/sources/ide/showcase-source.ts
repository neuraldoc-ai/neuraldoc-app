/** The MOBIQ GitLab sample as a RepoSource: repository at release/26.4, commits, diffs and merge requests. */
import repoRaw from '@dataset/gitlab/repository.json'
import commitsRaw from '@dataset/gitlab/commits.json'
import diffsRaw from '@dataset/gitlab/diffs.json'
import mrsRaw from '@dataset/gitlab/merge_requests.json'
import type { Raw } from '../shared'
import type { RepoSource } from './workbench'

const commits = commitsRaw as Raw[]
const diffs = diffsRaw as Record<string, Raw[]>

/** A commit belongs to a merge request if the MR's own commit list contains it. */
const mrCommitIds: Record<number, Set<string>> = Object.fromEntries(
  Object.entries(import.meta.glob('../../../../../../../datasets/mobiq/data/gitlab/merge_requests/*/commits.json', { eager: true, import: 'default' })).map(([p, list]) => [
    Number(p.match(/merge_requests\/(\d+)\//)![1]),
    new Set((list as Raw[]).map((c) => c.id)),
  ])
)

export const showcaseSource: RepoSource = {
  repo: repoRaw as RepoSource['repo'],
  commits,
  mrs: mrsRaw as Raw[],
  diffsOf: (id) => diffs[id] ?? [],
  commitsOfMr: (m) => commits.filter((c) => c.parent_ids.length === 1 && mrCommitIds[m.iid]?.has(c.id)),
}
