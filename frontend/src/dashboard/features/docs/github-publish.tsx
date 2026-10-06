/**
 * Approved sections as GitHub pull requests: the state neuraldoc keeps on GitHub for the active project,
 * the repositories the documents belong to, and what could not go into a pull request.
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { GitBranch, GitMerge, GitPullRequest, GitPullRequestClosed, LoaderCircle, Pencil, RefreshCw, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { plural } from './model'
import { post, useGitHubStatus, useGitHubSync, type GitHubStatus, type PullRequest, type Target } from './github-status'

const STATE = {
  open: { label: 'Offen', icon: GitPullRequest, tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300' },
  merged: { label: 'Gemergt', icon: GitMerge, tone: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300' },
  closed: { label: 'Geschlossen', icon: GitPullRequestClosed, tone: 'text-muted-foreground' },
  edited: { label: 'Von Hand geändert', icon: Pencil, tone: 'border-late/30 bg-late-soft text-late-fg' },
  'up-to-date': { label: 'Schon im Repository', icon: GitMerge, tone: 'text-muted-foreground' },
  conflict: { label: 'Konflikt', icon: TriangleAlert, tone: 'border-late/30 bg-late-soft text-late-fg' },
  pending: { label: 'Noch nicht erstellt', icon: GitBranch, tone: 'text-muted-foreground' },
} as const

/** Which GitHub repository the documents of one origin go to; editable for uploaded folders or another repository. */
function TargetRow({ origin, target, host }: { origin: 'repo' | 'docs'; target?: Target; host: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [repo, setRepo] = useState(target ? `${target.owner}/${target.repo}` : '')
  const [base, setBase] = useState(target?.base ?? '')
  const save = useMutation({
    mutationFn: () => post<GitHubStatus>('/api/mcp/github/target', { origin, repo: repo.trim(), base: base.trim() }),
    onSuccess: (data) => { queryClient.setQueryData(['github'], data); setEditing(false) },
    onError: (e) => toast.error(e.message),
  })
  const label = origin === 'repo' ? 'Repository' : 'Dokumentation'
  if (editing) return <form className='grid gap-2 rounded-lg border p-3' onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
    <span className='text-xs font-medium'>{label}</span>
    <Input aria-label={`GitHub-Repository für ${label}`} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder={`organisation/repository oder https://${host}/…`} />
    <Input aria-label='Basis-Branch' value={base} onChange={(e) => setBase(e.target.value)} placeholder='Basis-Branch (leer: Standard-Branch)' />
    <span className='flex gap-2'>
      <Button size='sm' type='submit' disabled={save.isPending}>Speichern</Button>
      <Button size='sm' type='button' variant='ghost' onClick={() => setEditing(false)}>Abbrechen</Button>
    </span>
  </form>
  return <div className='flex items-center gap-2 text-sm'>
    <GitBranch className='size-4 shrink-0 text-muted-foreground' />
    <span className='min-w-0 flex-1 truncate'>
      <span className='text-muted-foreground'>{label}: </span>
      {target ? <>{target.owner}/{target.repo}{target.base ? <span className='text-muted-foreground'> → {target.base}</span> : null}</> : <span className='text-muted-foreground'>kein GitHub-Repository</span>}
    </span>
    <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' onClick={() => setEditing(true)}>{target ? 'Ändern' : 'Festlegen'}</Button>
  </div>
}

function PullRequestRow({ pr, sync }: { pr: PullRequest; sync: ReturnType<typeof useGitHubSync> }) {
  const s = STATE[pr.state] ?? STATE.pending
  const Icon = s.icon
  return <div className='grid gap-1.5 rounded-xl border p-3'>
    <span className='flex flex-wrap items-center gap-2'>
      <Badge variant='outline' className={cn('font-normal', s.tone)}><Icon className='mr-1 size-3' />{s.label}</Badge>
      {pr.url ? <a href={pr.url} target='_blank' rel='noreferrer' className='text-sm font-medium hover:underline'>{pr.repo}{pr.number ? ` #${pr.number}` : ''}</a> : <span className='text-sm font-medium'>{pr.repo}</span>}
    </span>
    <span className='text-xs text-muted-foreground'>
      {pr.proposals.length > 0 && `${plural(pr.proposals.length, 'Abschnitt', 'Abschnitte')} · `}Branch <code>{pr.branch}</code>{pr.base ? <> → <code>{pr.base}</code></> : null}
    </span>
    {pr.conflicts.map((c) => <span key={c.proposal} className='text-xs text-late-fg'>{c.path} › {c.title}: {c.reason}</span>)}
    {pr.note && <span className='text-xs text-muted-foreground'>{pr.note}</span>}
    {pr.error && <span role='alert' className='text-xs text-destructive'>{pr.error}</span>}
    {(pr.state === 'edited' || pr.state === 'closed') && pr.proposals.length > 0 && (
      <Button size='sm' variant='outline' className='w-fit' disabled={sync.isPending} onClick={() => sync.mutate({ force: true, key: pr.key })}>
        <RefreshCw />{pr.state === 'edited' ? 'Branch neu aufbauen' : 'Erneut öffnen'}
      </Button>
    )}
  </div>
}

/** On the overview of an own project: where the approvals go on GitHub. */
export function PublishCard() {
  const status = useGitHubStatus()
  const sync = useGitHubSync()
  const s = status.data
  if (status.isError || !s) return null
  const busy = sync.isPending || s.sync.running || s.sync.queued
  const waiting = s.pending.filter((g) => !g.inPullRequest).reduce((n, g) => n + g.proposals.length, 0)
  const visible = s.pullRequests.filter((p) => p.state !== 'closed' || p.proposals.length > 0).slice(0, 4)
  return <Card className='h-fit'>
    <CardHeader>
      <CardTitle className='flex items-center gap-2'><GitPullRequest className='size-4' />Pull-Requests auf GitHub</CardTitle>
      <CardDescription>
        {!s.configured ? 'Freigaben bleiben bisher in neuraldoc.' : s.mode === 'auto' ? 'Jede Freigabe landet automatisch in einem Pull-Request.' : s.mode === 'manual' ? 'Pull-Requests entstehen, wenn du abgleichst.' : 'Pull-Requests sind ausgeschaltet.'}
      </CardDescription>
    </CardHeader>
    <CardContent className='grid gap-3'>
      {!s.configured ? <>
        <p className='text-sm text-muted-foreground'>Verbinde GitHub, dann öffnet neuraldoc für übernommene Änderungen einen Pull-Request, wie Dependabot oder Renovate. Der Basis-Branch wird nie direkt geändert.</p>
        <Button asChild size='sm' className='w-fit'><Link to='/einstellungen'>GitHub verbinden</Link></Button>
      </> : <>
        <div className='grid gap-1'>
          <TargetRow key={`repo-${s.targets.repo?.owner}/${s.targets.repo?.repo}`} origin='repo' target={s.targets.repo} host={s.host} />
          {'docs' in s.targets && <TargetRow key={`docs-${s.targets.docs?.owner}`} origin='docs' target={s.targets.docs} host={s.host} />}
        </div>
        {visible.map((pr) => <PullRequestRow key={pr.key} pr={pr} sync={sync} />)}
        {waiting > 0 && <p className='text-sm'>{plural(waiting, 'Freigabe wartet', 'Freigaben warten')} auf den Abgleich.</p>}
        {s.skipped.length > 0 && <div className='grid gap-1'>
          <span className='text-xs font-medium'>Nicht per Pull-Request</span>
          {s.skipped.slice(0, 6).map((x) => <span key={x.proposal} className='text-xs text-muted-foreground'>{x.path} › {x.title}: {x.reason}</span>)}
        </div>}
        {s.sync.error && !visible.some((p) => p.error) && <p role='alert' className='text-xs text-destructive'>{s.sync.error}</p>}
        {s.mode !== 'off' && (
          <Button size='sm' variant={waiting ? 'default' : 'outline'} className='w-fit' disabled={busy} onClick={() => sync.mutate({})}>
            {busy ? <LoaderCircle className='animate-spin' /> : <RefreshCw />}{busy ? 'Gleicht ab …' : 'Jetzt abgleichen'}
          </Button>
        )}
      </>}
    </CardContent>
  </Card>
}
