/** The imported repository in the IDE: files, history and merge requests from the local server, diffs on demand. */
import type { Raw } from '../shared'
import { useProjectSource } from '../../project-sources'
import Workbench, { type RepoSource } from './workbench'

const diffCache = new Map<string, Promise<Raw[]>>()
function diffsOf(id: string) {
  let pending = diffCache.get(id)
  if (!pending) {
    pending = fetch(`/api/mcp/project/commit?sha=${encodeURIComponent(id)}`).then(async (r) => (r.ok ? ((await r.json()) as { files: Raw[] }).files : []))
    diffCache.set(id, pending)
  }
  return pending
}

export default function ProjectWorkbench() {
  const query = useProjectSource()
  if (query.isError) return <p role='alert' className='rounded-xl border p-6 text-sm text-muted-foreground'>{query.error.message}</p>
  if (!query.data) return <div className='grid h-[min(780px,calc(100vh-7rem))] min-h-[500px] place-content-center rounded-xl border bg-card text-sm text-muted-foreground'>Repository wird geladen …</div>
  const { repository, commits, mergeRequests } = query.data
  const source: RepoSource = {
    repo: repository,
    commits,
    mrs: mergeRequests,
    diffsOf,
    commitsOfMr: (m) => commits.filter((c) => (m.commits as string[]).includes(c.id)),
    note: repository.tag ? `schreibgeschützt · Verlauf seit ${repository.tag}` : 'schreibgeschützt',
  }
  return <Workbench source={source} />
}
