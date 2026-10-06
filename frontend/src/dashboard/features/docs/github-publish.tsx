/**
 * Approved sections as GitHub pull requests, shown where the work happens: one pull request per change.
 * The change page has a status bar under its numbers, the list of changes a chip per row, the Daten page the
 * repositories the pull requests go to.
 */
import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ChevronDown, ExternalLink, GitBranch, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, LoaderCircle, Pencil, RefreshCw, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { plural, type LiveBundle } from './model'
import { changeOnGitHub, post, useGitHubStatus, useGitHubSync, type GitHubStatus, type PullRequest, type Target } from './github-status'

const green = 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'
const violet = 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300'
const amber = 'border-late/30 bg-late-soft text-late-fg'
const muted = 'border-border bg-muted/50 text-muted-foreground'

/** One look per state, shared by the bar and the chips. */
const LOOK: Record<PullRequest['state'], { label: string; chip: string; icon: typeof GitPullRequest; tone: string }> = {
  open: { label: 'Offen', chip: 'offen', icon: GitPullRequest, tone: green },
  merged: { label: 'Gemergt', chip: 'gemergt', icon: GitMerge, tone: violet },
  closed: { label: 'Auf GitHub geschlossen', chip: 'geschlossen', icon: GitPullRequestClosed, tone: muted },
  edited: { label: 'Von Hand geändert', chip: 'prüfen', icon: Pencil, tone: amber },
  'up-to-date': { label: 'Schon im Repository', chip: 'im Repository', icon: GitMerge, tone: muted },
  conflict: { label: 'Nicht einsetzbar', chip: 'prüfen', icon: TriangleAlert, tone: amber },
  pending: { label: 'Noch nicht erstellt', chip: 'wartet', icon: GitBranch, tone: muted },
}
const clock = (iso?: string | null) => iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

/* ---------- Change page: the status bar ---------- */

function Tile({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border', tone)}>{children}</span>
}

/** A line of the bar: icon, what it is, details, one action. */
function Line({ tile, title, detail, action, children }: { tile: ReactNode; title: ReactNode; detail?: ReactNode; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className='grid gap-2 px-5 py-4'>
      <div className='flex flex-wrap items-center gap-3'>
        {tile}
        <div className='grid min-w-0 flex-1 gap-0.5'>
          <span className='text-sm font-medium'>{title}</span>
          {detail && <span className='text-xs text-muted-foreground'>{detail}</span>}
        </div>
        {action && <div className='flex shrink-0 flex-wrap items-center gap-2'>{action}</div>}
      </div>
      {children}
    </div>
  )
}

/** Sections that are not (completely) in the pull request, folded away so the bar stays calm. */
function Notes({ items }: { items: { key: string; text: ReactNode }[] }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div className='ms-[3.25rem] grid gap-1.5'>
      <button type='button' className='flex w-fit items-center gap-1 text-xs text-late-fg hover:underline' onClick={() => setOpen(!open)} aria-expanded={open}>
        <TriangleAlert className='size-3.5' /> {plural(items.length, 'Hinweis', 'Hinweise')}: nicht alles steht im Pull-Request
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <ul className='grid gap-1 text-xs text-muted-foreground'>{items.map((n) => <li key={n.key}>{n.text}</li>)}</ul>}
    </div>
  )
}

function PullRequestLine({ pr, sync, missing, working, mode }: { pr: PullRequest; sync: ReturnType<typeof useGitHubSync>; missing: number; working: boolean; mode: GitHubStatus['mode'] }) {
  const look = LOOK[pr.state] ?? LOOK.pending, Icon = look.icon
  const busy = sync.isPending && sync.variables?.key === pr.key
  // Newly approved sections of this change that the pull request does not carry yet: updating it is the next step.
  const update = missing > 0 && (pr.state === 'open' || pr.state === 'edited')
  const action = <>
    {update && !working && pr.state === 'open' && <Button size='sm' onClick={() => sync.mutate({ key: pr.key })}><RefreshCw /> Aktualisieren</Button>}
    {pr.url && <Button asChild size='sm' variant={pr.state === 'open' && !update ? 'default' : 'outline'}><a href={pr.url} target='_blank' rel='noreferrer'><ExternalLink /> Auf GitHub ansehen</a></Button>}
    {(pr.state === 'edited' || pr.state === 'closed') && pr.proposals.length > 0 && (
      <Button size='sm' variant='outline' disabled={busy} onClick={() => sync.mutate({ force: true, key: pr.key })} title={pr.state === 'edited' ? 'Verwirft die Commits, die nicht von neuraldoc sind' : undefined}>
        {busy ? <LoaderCircle className='animate-spin' /> : <RefreshCw />}{pr.state === 'edited' ? 'Branch neu aufbauen' : 'Erneut öffnen'}
      </Button>
    )}
  </>
  return (
    <Line
      tile={<Tile tone={look.tone}><Icon className='size-5' /></Tile>}
      title={<>Pull-Request{pr.number ? ` #${pr.number}` : ''} <span className='font-normal text-muted-foreground'>·</span> <span className={cn(pr.state === 'open' && 'text-emerald-700 dark:text-emerald-300', pr.state === 'merged' && 'text-violet-700 dark:text-violet-300', (pr.state === 'edited' || pr.state === 'conflict') && 'text-late-fg')}>{look.label}</span></>}
      detail={<>{pr.repo} · <code className='text-[11px]'>{pr.branch}</code>{pr.base ? <> → <code className='text-[11px]'>{pr.base}</code></> : null}{pr.proposals.length > 0 && ` · ${plural(pr.proposals.length, 'Abschnitt', 'Abschnitte')}`}{pr.updatedAt && ` · ${pr.state === 'merged' ? 'gemergt' : 'Stand'} ${clock(pr.mergedAt ?? pr.updatedAt)}`}</>}
      action={action}
    >
      {update && (
        <p className='ms-[3.25rem] flex items-center gap-1.5 text-xs'>
          {working ? <LoaderCircle className='size-3.5 animate-spin' /> : <GitPullRequestDraft className='size-3.5 text-muted-foreground' />}
          {working ? 'Wird aktualisiert …' : `${plural(missing, 'neu übernommener Abschnitt fehlt', 'neu übernommene Abschnitte fehlen')} noch im Pull-Request${mode === 'auto' ? ' und kommt gleich dazu.' : '.'}`}
        </p>
      )}
      {pr.error && <p role='alert' className='ms-[3.25rem] text-xs text-destructive'>{pr.error}</p>}
      {pr.note && <p className='ms-[3.25rem] text-xs text-muted-foreground'>{pr.note}</p>}
      <Notes items={pr.conflicts.map((c) => ({ key: `${c.proposal}-${c.reason}`, text: <><span className='text-foreground'>{c.title}</span>: {c.reason}</> }))} />
    </Line>
  )
}

/** Under the numbers of a change: where its approved sections are on GitHub, and the one thing to do next. */
export function ChangePullRequests({ b }: { b: LiveBundle }) {
  const status = useGitHubStatus()
  const sync = useGitHubSync()
  const s = status.data
  if (!s || !b.proposals.length) return null
  const approved = b.proposals.filter((p) => p.state === 'uebernommen' || p.state === 'angepasst')
  const mine = changeOnGitHub(s, b.id, b.proposals.map((p) => p.id))
  const working = s.sync.running || s.sync.queued || sync.isPending
  // Approvals a pull request of this change does not carry yet: shown in its line; the rest need a new pull request.
  const carried = (id: string) => mine.pullRequests.some((r) => r.proposals.includes(id) || r.conflicts.some((c) => c.proposal === id))
  const live = (key: string) => mine.pullRequests.find((r) => r.key === key && (r.state === 'open' || r.state === 'edited'))
  const missingIn = (pr: PullRequest) => (mine.pending.find((g) => g.key === pr.key)?.proposals ?? []).filter((id) => !carried(id)).length
  const fresh = mine.pending.filter((g) => !live(g.key))
  const waiting = fresh.reduce((n, g) => n + g.proposals.filter((id) => !carried(id)).length, 0)
  const skipped = mine.skipped.map((x) => ({ key: x.proposal, text: <><span className='text-foreground'>{x.title}</span>: {x.reason}</> }))
  let lines: ReactNode
  if (!s.configured) {
    lines = <Line tile={<Tile tone={muted}><GitPullRequest className='size-5' /></Tile>} title='Noch kein Pull-Request' detail='Verbinde GitHub, dann landen die übernommenen Abschnitte dieser Änderung als Pull-Request im Repository. Der Basis-Branch wird nie direkt geändert.' action={<Button asChild size='sm' variant='outline'><Link to='/einstellungen'>GitHub verbinden</Link></Button>} />
  } else if (s.mode === 'off') {
    lines = <Line tile={<Tile tone={muted}><GitPullRequest className='size-5' /></Tile>} title='Pull-Requests sind ausgeschaltet' detail='Übernommenes bleibt in neuraldoc und im Export.' action={<Button asChild size='sm' variant='ghost'><Link to='/einstellungen'>Einstellungen</Link></Button>} />
  } else {
    const waitingLine = waiting > 0 && (
      <Line
        tile={<Tile tone={muted}>{working ? <LoaderCircle className='size-5 animate-spin' /> : <GitPullRequestDraft className='size-5' />}</Tile>}
        title={working ? 'Pull-Request wird erstellt …' : s.mode === 'manual' ? `${plural(waiting, 'Abschnitt', 'Abschnitte')} bereit für den Pull-Request` : `${plural(waiting, 'Abschnitt wartet', 'Abschnitte warten')} auf GitHub`}
        detail={working ? 'neuraldoc baut den Branch auf dem aktuellen Stand und öffnet den Pull-Request.' : fresh.map((g) => `${g.repo} · ${g.branch}`).join(', ')}
        action={!working && <Button size='sm' onClick={() => sync.mutate(fresh.length === 1 ? { key: fresh[0].key } : {})}><GitPullRequest /> Pull-Request erstellen</Button>}
      />
    )
    lines = <>
      {mine.pullRequests.map((pr) => <PullRequestLine key={pr.key} pr={pr} sync={sync} missing={missingIn(pr)} working={working} mode={s.mode} />)}
      {waitingLine}
      {!mine.pullRequests.length && !mine.pending.length && (
        <Line
          tile={<Tile tone={muted}><GitPullRequest className='size-5' /></Tile>}
          title={approved.length && !skipped.length ? 'Schon im Repository' : 'Noch kein Pull-Request'}
          detail={approved.length && !skipped.length ? 'Die übernommenen Abschnitte stehen bereits auf dem Basis-Branch.' : s.mode === 'auto' ? 'Sobald du Vorschläge übernimmst, öffnet neuraldoc automatisch einen Pull-Request für diese Änderung.' : 'Sobald du Vorschläge übernimmst, kannst du hier einen Pull-Request für diese Änderung erstellen.'}
        />
      )}
    </>
  }
  return (
    <Card className='gap-0 py-0'>
      <CardContent className='divide-y px-0'>
        {lines}
        {skipped.length > 0 && <div className='px-5 py-3'><Notes items={skipped} /></div>}
      </CardContent>
    </Card>
  )
}

/* ---------- List of changes: one chip per row ---------- */

/** The state of a change's pull requests in a word; links to GitHub. */
export function PullRequestChips({ status, b }: { status?: GitHubStatus; b: LiveBundle }) {
  if (!status?.configured || !b.proposals.length) return <span className='text-muted-foreground'>–</span>
  const mine = changeOnGitHub(status, b.id, b.proposals.map((p) => p.id))
  const working = status.sync.running || status.sync.queued
  if (!mine.pullRequests.length && !mine.pending.length) return <span className='text-muted-foreground'>–</span>
  return (
    <span className='flex flex-col items-start gap-1'>
      {mine.pullRequests.map((pr) => {
        const look = LOOK[pr.state] ?? LOOK.pending, Icon = look.icon
        const chip = <Badge variant='outline' className={cn('gap-1 font-normal whitespace-nowrap', look.tone)}><Icon className='size-3' />{pr.number ? `#${pr.number} ` : ''}{look.chip}</Badge>
        return pr.url ? <a key={pr.key} href={pr.url} target='_blank' rel='noreferrer' onClick={(e) => e.stopPropagation()} title={`${pr.repo} · ${look.label}`}>{chip}</a> : <span key={pr.key}>{chip}</span>
      })}
      {mine.pending.length > 0 && (
        <Badge variant='outline' className={cn('gap-1 font-normal whitespace-nowrap', muted)}>
          {working ? <LoaderCircle className='size-3 animate-spin' /> : <GitPullRequestDraft className='size-3' />}{working ? 'wird erstellt' : status.mode === 'manual' ? 'bereit' : 'wartet'}
        </Badge>
      )}
    </span>
  )
}

/* ---------- Daten page: where the pull requests go ---------- */

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
  const label = origin === 'repo' ? 'Code' : 'Doku'
  if (editing) return (
    <form className='grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-center' onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      <Input aria-label={`GitHub-Repository für ${label}`} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder={`organisation/repository oder https://${host}/…`} />
      <Input aria-label='Basis-Branch' value={base} onChange={(e) => setBase(e.target.value)} placeholder='Basis-Branch (Standard)' />
      <span className='flex gap-2'>
        <Button size='sm' type='submit' disabled={save.isPending}>Speichern</Button>
        <Button size='sm' type='button' variant='ghost' onClick={() => setEditing(false)}>Abbrechen</Button>
      </span>
    </form>
  )
  return (
    <div className='flex items-center gap-2 text-sm'>
      <span className='w-12 shrink-0 text-xs text-muted-foreground'>{label}</span>
      <span className='min-w-0 flex-1 truncate'>
        {target ? <>{target.owner}/{target.repo}{target.base ? <span className='text-muted-foreground'> → {target.base}</span> : null}</> : <span className='text-muted-foreground'>kein GitHub-Repository: Pull-Requests nicht möglich</span>}
      </span>
      <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' onClick={() => setEditing(true)}>{target ? 'Ändern' : 'Festlegen'}</Button>
    </div>
  )
}

/** On the Daten page: the GitHub repositories the pull requests of this project go to. */
export function PullRequestTargets() {
  const status = useGitHubStatus()
  const s = status.data
  if (!s?.configured) return null
  return (
    <Card className='py-0'>
      <CardContent className='grid gap-2 px-5 py-4'>
        <span className='flex items-center gap-2 text-sm font-medium'><GitPullRequest className='size-4' /> Pull-Requests gehen nach</span>
        <TargetRow key={`repo-${s.targets.repo?.owner}/${s.targets.repo?.repo}`} origin='repo' target={s.targets.repo} host={s.host} />
        {'docs' in s.targets && <TargetRow key={`docs-${s.targets.docs?.owner}/${s.targets.docs?.repo}`} origin='docs' target={s.targets.docs} host={s.host} />}
      </CardContent>
    </Card>
  )
}
