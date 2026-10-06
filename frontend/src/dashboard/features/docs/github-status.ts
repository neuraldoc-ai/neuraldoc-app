// GitHub status of the active project, shared by the overview and the settings.
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDecisions } from './store'

export type Target = { owner: string; repo: string; base: string | null; from: 'import' | 'manual' } | null
export type PullRequest = {
  key: string; repo: string; branch: string; base?: string; number: number | null; url: string | null
  /** The change (bundle) the pull request belongs to, when there is one pull request per change. */
  change: string | null; changeTitle: string | null
  state: 'open' | 'merged' | 'closed' | 'edited' | 'up-to-date' | 'conflict' | 'pending'
  proposals: string[]; conflicts: { proposal: string; path: string; title: string; reason: string }[]
  error: string | null; note?: string; updatedAt: string; mergedAt?: string | null
}
export type GitHubStatus = {
  configured: boolean; auth: 'app' | 'token' | null; mode: 'auto' | 'manual' | 'off'; group: 'repository' | 'document'; host: string
  app: { id: string; slug: string | null; installUrl: string | null } | null
  targets: { repo?: Target; docs?: Target }
  pending: { key: string; change: string | null; repo: string; branch: string; proposals: string[]; inPullRequest: boolean }[]
  skipped: { proposal: string; path: string; title: string; reason: string }[]
  pullRequests: PullRequest[]
  published: Record<string, { number: number | null; url: string | null; repo: string; mergedAt: string }>
  sync: { running: boolean; queued: boolean; lastRun: string | null; error: string | null }
}

export async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || `Der Server meldet HTTP ${response.status}.`)
  return body
}
export const post = <T,>(url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<T>(r))

/** Shared by the changes and the settings; asks more often while a sync is queued or running. */
export function useGitHubStatus(enabled = true) {
  const queryClient = useQueryClient()
  // An approval or withdrawal starts a sync on the server: ask again right away, then while it runs.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useDecisions.subscribe((state, before) => {
      if (state.decisions === before.decisions) return
      clearTimeout(timer)
      timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['github'] }), 400)
    })
    return () => { clearTimeout(timer); unsubscribe() }
  }, [queryClient])
  return useQuery({
    queryKey: ['github'],
    queryFn: () => fetch('/api/mcp/github/status', { cache: 'no-store' }).then((r) => json<GitHubStatus>(r)),
    refetchInterval: (q) => (q.state.data?.sync.running || q.state.data?.sync.queued ? 2000 : 30_000),
    enabled,
    retry: false,
  })
}

export function useGitHubSync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { force?: boolean; key?: string } = {}) => post<GitHubStatus>('/api/mcp/github/sync', body),
    onSuccess: (data) => {
      queryClient.setQueryData(['github'], data)
      void queryClient.invalidateQueries({ queryKey: ['mcp', 'change'] })
      const failed = data.pullRequests.find((p) => p.error)
      if (failed) toast.error(failed.error)
      else toast.success('Mit GitHub abgeglichen')
    },
    onError: (e) => toast.error(e.message),
  })
}


/** What GitHub holds for one change: its pull requests, approvals still on their way, and what cannot go there. */
export function changeOnGitHub(status: GitHubStatus, changeId: string, proposalIds: string[]) {
  const mine = (ids: string[]) => ids.some((id) => proposalIds.includes(id))
  const pullRequests = status.pullRequests.filter((r) => (r.change === changeId || mine(r.proposals)) && (r.state !== 'closed' || r.proposals.length > 0))
  const pending = status.pending.filter((g) => (g.change === changeId || mine(g.proposals)) && !g.inPullRequest)
  const merged = Object.entries(status.published).filter(([id]) => proposalIds.includes(id))
  const skipped = status.skipped.filter((x) => proposalIds.includes(x.proposal))
  return { pullRequests, pending, merged, skipped }
}
