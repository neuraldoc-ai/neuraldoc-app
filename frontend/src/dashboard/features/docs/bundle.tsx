/**
 * One change, built to be read at a glance: a signal row (what kind of change, how much is open,
 * how many documents, open questions), the change itself as a picture (old → new name, or the
 * process before/after), which doc types are hit as colored tiles, then the proposals and commits.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Ban,
  Briefcase,
  Check,
  CheckCheck,
  CircleHelp,
  Code2,
  FileQuestion,
  FileText,
  GitPullRequestArrow,
  Hand,
  Info,
  MessageSquare,
  PenLine,
  Plus,
  Rows3,
  Sparkles,
  Type,
  Undo2,
  Upload,
  Wrench,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { bundles, changeKinds, changeTypes, confidences, datasetMode, docTypeOrder, docTypes, modules, natures, sizes, type Confidence, type DocTypeId, type Nature } from './data'
import { OwnChange, OwnDocs } from './own-change'
import { projectState } from './project'
import { StartReview } from './start-review'
import { docLabel, docOf, fmtDate, fmtDay, list, ownLead, plural, routing, useBundles, type LiveBundle, type LiveProposal, type Route } from './model'
import { locationOf } from './logic'
import { blueSoft, typeIcon } from './overview-icons'
import { useDecisions } from './store'
import { Frame, Hash, Panel, Path, Process } from './ui'

const greenSoft = 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'
const lateSoft = 'border-late/30 bg-late-soft text-late-fg'

/* ---------- What the MCP server knows about this change: who started the check, who approves, what was written back ---------- */

type Approver = { id: string; name: string; role: string; self: boolean }
type Target = { system: string; title: string; url: string }
type ChangeStatus = {
  checks: { at: string; client: string }[]
  mrComment: { mr: string; at: string } | null
  approvers: Record<DocTypeId, Approver>
  writeBack: boolean
  writebacks: { proposal: string; target: Target; version: number; at: string }[]
  targets: Record<string, Target | null>
}

function useChangeStatus(id: string) {
  return useQuery({
    queryKey: ['mcp', 'change', id],
    queryFn: async (): Promise<ChangeStatus> => {
      const r = await fetch(`/api/mcp/changes/${id}`)
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    },
    refetchInterval: 2500,
    retry: false,
  }).data
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

function FromAgent({ b, status }: { b: LiveBundle; status?: ChangeStatus }) {
  const check = status?.checks[0]
  if (!check || !b.proposals.length) return null
  const systems = [...new Set(Object.values(status.targets).filter(Boolean).map((t) => t!.system))]
  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3', blueSoft)}>
      <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white'>
        <GitPullRequestArrow className='size-4' />
      </span>
      <span className='grid min-w-0 flex-1 gap-0.5 text-sm'>
        <span className='font-medium'>
          Geprüft auf Anfrage von {check.client} um {clock(check.at)}
        </span>
        <span className='text-xs opacity-80'>
          {status.mrComment ? `Link im Merge-Request ${status.mrComment.mr} kommentiert. ` : ''}
          {status.writeBack ? `Jede übernommene Stelle schreibt neuraldoc nach ${list(systems)} zurück.` : 'Zurückschreiben ist ausgeschaltet.'}
        </span>
      </span>
    </div>
  )
}

export function BundlePage({ id }: { id: string }) {
  const b = useBundles().find((x) => x.id === id)
  const status = useChangeStatus(id)
  const decideMany = useDecisions((s) => s.decideMany)
  if (!b) return <Frame title='Nicht gefunden'>Diese Änderung gibt es nicht.</Frame>

  const open = b.proposals.filter((p) => p.state === 'offen')
  const first = b.docs.map((d) => open.find((p) => p.doc === d)).find(Boolean)
  const own = datasetMode === 'working' ? projectState.project : null
  // An imported project's changes come from its Git history; without history (an uploaded folder), or for the
  // findings no commit explains, the change is the initial check itself: no commits, tickets or merge requests.
  const initial = own && !b.commits.length ? own : null
  // A change from the Git history of an own project: described in plain words, with the project's own documents.
  const history = !!own && b.commits.length > 0
  const withoutDraft = open.filter((p) => !p.generation && p.op !== 'note' && !p.task)
  return (
    <Frame
      title={b.title}
      crumbs={own && bundles.length === 1 ? [{ label: b.title }] : [{ label: 'Änderungen', to: '/aenderungen' }, { label: b.title }]}
      lead={initial ? `${plural(initial.files.length, 'Code-Datei', 'Code-Dateien')} · ${plural(new Set(initial.documents.map((d) => d.path)).size, 'Dokument', 'Dokumente')} · geprüft am ${fmtDate(b.merged)}` : history ? ownLead(b) : `${b.ticket} · ${b.mr} · gemergt ${fmtDate(b.merged)}`}
      actions={
        b.nature === 'umbenennung' && open.length > 0 ? (
          <Button size='sm' onClick={() => decideMany(open.map((p) => p.id), 'uebernommen', `${b.title}: alle ${open.length} Stellen übernommen`)}>
            <CheckCheck /> Alle {open.length} Stellen übernehmen
          </Button>
        ) : open.length > 0 ? (
          <>
            {own && withoutDraft.length > 0 && <StartReview proposals={b.proposals} first={first} />}
            {first && <Button asChild size='sm' variant={own && withoutDraft.length ? 'outline' : 'default'}><Link to='/dokumente/$id' params={{ id: first.doc }} search={{ p: first.id }}>Vorschläge prüfen</Link></Button>}
          </>
        ) : null
      }
    >
      {!own && <FromAgent b={b} status={status} />}
      {initial ? <CheckSignals b={b} subjects={initial.mapping?.subjects ?? 0} /> : <Signals b={b} />}
      <div className={cn('grid gap-4 lg:grid-cols-3 [&>*]:min-w-0', initial && 'items-start')}>
        {initial ? <Checked className='lg:col-span-2' /> : history ? <OwnChange b={b} className='lg:col-span-2' /> : <Change b={b} className='lg:col-span-2' />}
        {history ? <OwnDocs b={b} checked={!!own?.mapping} /> : <Readers routes={routing(b)} />}
      </div>
      {initial ? (
        <Proposals b={b} />
      ) : (
        <div className='grid gap-4 lg:grid-cols-3 [&>*]:min-w-0'>
          <Proposals b={b} status={status} className='lg:col-span-2' />
          <Commits b={b} />
        </div>
      )}
    </Frame>
  )
}

/* ---------- Own project: what the initial check found and did ---------- */

function CheckSignals({ b, subjects }: { b: LiveBundle; subjects: number }) {
  const total = b.proposals.length
  const findings = b.proposals.reduce((n, p) => n + (p.generation?.findings?.length ?? 0), 0)
  const sure = b.proposals.reduce((n, p) => n + (p.generation?.findings?.filter((f) => f.sure).length ?? 0), 0)
  const questions = b.proposals.filter((p) => p.state === 'offen' && (p.generation?.status === 'needs_context' || p.question)).length
  const done = total - b.open
  return (
    <Card className='py-0'>
      <CardContent className='grid divide-y px-0 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x'>
        <Signal icon={FileText} tile='bg-brand-600 text-white' label='Abweichungen' value={plural(total, 'Abschnitt', 'Abschnitte')} hint={subjects ? `von ${subjects} geprüften` : 'aus der Erstprüfung'} />
        <div className='flex items-center gap-3 px-5 py-4'>
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', b.open ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300')}>
            {b.open || !total ? <PenLine className='size-5' /> : <Check className='size-5' />}
          </span>
          <div className='grid flex-1 gap-1.5'>
            <span className='text-xs text-muted-foreground'>Entschieden</span>
            <span className='text-lg leading-none font-medium tabular-nums'>{done} von {total}</span>
            {total > 0 && <Progress value={(done / total) * 100} className='h-1.5' indicatorClassName={done === total ? 'bg-emerald-500' : 'bg-brand-500'} />}
          </div>
        </div>
        <Signal icon={Sparkles} tile='bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' label='Änderungen' value={plural(findings, 'Änderung', 'Änderungen')} hint={findings ? `${sure} von Jev bestätigt, jede mit Codebeleg` : 'keine'} />
        <Signal
          icon={questions ? CircleHelp : Check}
          tile={questions ? 'bg-late-soft text-late-fg' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}
          label='Rückfragen'
          value={questions ? `${questions} offen` : 'Keine'}
          hint={questions ? 'Code allein reicht nicht' : 'bisher keine'}
        />
      </CardContent>
    </Card>
  )
}

function Checked({ className }: { className?: string }) {
  const p = projectState.project!
  const m = p.mapping
  const source = (s: { label: string; source: 'upload' | 'url' } | null) => s && `${s.label} · ${s.source === 'url' ? 'von GitHub' : 'hochgeladen'}`
  const stats = m
    ? [
        { n: m.subjects, label: 'Abschnitte geprüft' },
        { n: m.consistent, label: 'passen zum Code' },
        { n: m.mismatches, label: 'weichen ab' },
        ...(m.skipped ? [{ n: m.skipped, label: 'ohne prüfbaren Inhalt' }] : []),
      ]
    : []
  return (
    <Panel className={className} title='Was geprüft wurde'>
      <div className={cn('grid gap-2 sm:grid-cols-3', stats.length > 3 && 'sm:grid-cols-4')}>
        {stats.map((s) => (
          <div key={s.label} className='grid gap-0.5 rounded-xl border p-3'>
            <span className='text-2xl leading-none font-medium tabular-nums'>{s.n}</span>
            <span className='text-xs text-muted-foreground'>{s.label}</span>
          </div>
        ))}
      </div>
      <div className='grid gap-2 sm:grid-cols-2'>
        {[{ icon: Code2, label: 'Code', value: source(p.sources.repo) }, { icon: FileText, label: 'Doku', value: source(p.sources.docs) ?? 'aus dem Repository' }].map((s) => (
          <div key={s.label} className='flex items-center gap-3 rounded-xl border p-3'>
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border', blueSoft)}>
              <s.icon className='size-4' />
            </span>
            <span className='grid min-w-0 gap-0.5'>
              <span className='text-xs text-muted-foreground'>{s.label}</span>
              <span className='truncate text-sm'>{s.value}</span>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ---------- Signal row ---------- */

const natureLook: Record<Nature, { icon: typeof Briefcase; tile: string; hint: string }> = {
  fachlich: { icon: Briefcase, tile: 'bg-brand-600 text-white', hint: 'Der Ablauf ändert sich' },
  technisch: { icon: Code2, tile: 'bg-slate-700 text-white dark:bg-slate-500', hint: 'Nur für die Technik' },
  umbenennung: { icon: Type, tile: 'bg-brand-400 text-white', hint: 'Nur ein neuer Name' },
  intern: { icon: Wrench, tile: 'bg-muted text-muted-foreground', hint: 'Für Leser unsichtbar' },
}

function Signals({ b }: { b: LiveBundle }) {
  const look = natureLook[b.nature], type = b.type ? changeTypes[b.type] : null
  const own = datasetMode === 'working'
  const total = b.proposals.length
  const done = total - b.open
  const questions = b.proposals.filter((p) => p.state === 'offen' && (p.question || p.confidence === 'pruefen')).length
  return (
    <Card className='py-0'>
      <CardContent className='grid divide-y px-0 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x'>
        <Signal icon={look.icon} tile={look.tile} label='Art' value={type?.label ?? natures[b.nature]} hint={type?.hint ?? look.hint} />
        <div className='flex items-center gap-3 px-5 py-4'>
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', b.open ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300')}>
            {b.open || !total ? <PenLine className='size-5' /> : <Check className='size-5' />}
          </span>
          <div className='grid flex-1 gap-1.5'>
            <span className='text-xs text-muted-foreground'>Vorschläge</span>
            <span className='text-lg leading-none font-medium tabular-nums'>{total ? (b.open ? `${b.open} offen` : 'Alle erledigt') : 'Keine'}</span>
            {total > 0 && <Progress value={(done / total) * 100} className='h-1.5' indicatorClassName={done === total ? 'bg-emerald-500' : 'bg-brand-500'} />}
          </div>
        </div>
        <Signal icon={FileText} tile='bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' label='Dokumente' value={b.docs.length ? plural(b.docs.length, 'Dokument', 'Dokumente') : 'Keins'} hint={(own ? b.docs.map((d) => docLabel(docOf(d))) : b.types.map((t) => docTypes[t].label)).join(', ') || 'nichts zu ändern'} />
        <Signal
          icon={questions ? CircleHelp : Check}
          tile={questions ? 'bg-late-soft text-late-fg' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}
          label='Rückfragen'
          value={questions ? `${questions} offen` : 'Keine'}
          hint={questions ? 'Code allein reicht nicht' : 'Alles aus dem Code klar'}
        />
      </CardContent>
    </Card>
  )
}

function Signal({ icon: Icon, tile, label, value, hint }: { icon: typeof Briefcase; tile: string; label: string; value: string; hint: string }) {
  return (
    <div className='flex min-w-0 items-center gap-3 px-5 py-4'>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tile)}>
        <Icon className='size-5' />
      </span>
      <div className='grid min-w-0 gap-0.5'>
        <span className='text-xs text-muted-foreground'>{label}</span>
        <span className='text-lg leading-tight font-medium'>{value}</span>
        <span className='truncate text-xs text-muted-foreground'>{hint}</span>
      </div>
    </div>
  )
}

/* ---------- The change as a picture ---------- */

/** For a rename: the old and the new word, read from a proposal titled „alt → neu“. */
function renamePair(b: LiveBundle) {
  const [from, to] = b.proposals.find((x) => x.title.includes('→'))?.title.split('→').map((s) => s.trim()) ?? []
  return from && to ? { from, to } : null
}

function Change({ b, className }: { b: LiveBundle; className?: string }) {
  const pair = b.nature === 'umbenennung' ? renamePair(b) : null
  return (
    <Panel
      className={className}
      title='Was sich ändert'
      aside={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size='icon' variant='ghost' className='size-7 text-muted-foreground' aria-label='Woher die Einordnung kommt'>
              <Info />
            </Button>
          </TooltipTrigger>
          <TooltipContent className='max-w-xs'>Eingeordnet über: {b.classifiedVia.join(' · ')}</TooltipContent>
        </Tooltip>
      }
    >
      <div className='grid gap-2'>
        <Path path={b.path} className='text-base tracking-tight' />
        {b.alsoAffects && (
          <span className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
            auch
            {b.alsoAffects.map((a) => (
              <Badge key={a} variant='outline' className={cn('font-normal', blueSoft)}>
                {a}
              </Badge>
            ))}
          </span>
        )}
      </div>
      {pair ? (
        <div className='flex flex-wrap items-center justify-center gap-4 rounded-xl border bg-muted/30 px-6 py-8'>
          <span className='rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xl text-red-700 line-through decoration-2 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'>{pair.from}</span>
          <ArrowRight className='size-6 text-muted-foreground' />
          <span className={cn('rounded-lg border px-4 py-2 text-xl font-medium', greenSoft)}>{pair.to}</span>
        </div>
      ) : b.before && b.after ? (
        <Process before={b.before} after={b.after} />
      ) : (
        <div className='grid gap-2 sm:grid-cols-2'>
          {b.aspects.map((a, i) => {
            const look = natureLook[changeKinds[a.kind].nature]
            return (
              <div key={i} className='flex items-start gap-3 rounded-xl border p-3'>
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', look.tile)}>
                  <look.icon className='size-4' />
                </span>
                <span className='grid min-w-0 gap-0.5'>
                  <span className='text-xs text-muted-foreground'>
                    {changeKinds[a.kind].label} · {modules[a.module]}
                  </span>
                  <span className='text-sm'>{a.text}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
      <p className='text-sm text-muted-foreground'>{b.summary}</p>
    </Panel>
  )
}

/* ---------- Which doc types are hit ---------- */

const routeLook: Record<Route['status'], { icon: typeof Check; cls: string; short: string }> = {
  vorschlaege: { icon: PenLine, cls: blueSoft, short: 'anpassen' },
  passt: { icon: Check, cls: greenSoft, short: 'stimmt noch' },
  nicht: { icon: Ban, cls: 'border-dashed text-muted-foreground', short: 'nicht betroffen' },
  fehlt: { icon: FileQuestion, cls: lateSoft, short: 'kein Dokument' },
}

function Readers({ routes }: { routes: Route[] }) {
  return (
    <Panel title='Welche Doku'>
      <div className='grid grid-cols-2 gap-2'>
        {routes.map((r) => {
          const look = routeLook[r.status]
          const Icon = typeIcon[r.type]
          const tile = (
            <div className={cn('grid gap-1.5 rounded-xl border p-3 transition-colors', look.cls, r.status === 'vorschlaege' && 'hover:border-brand-400')}>
              <span className='flex items-center justify-between'>
                <Icon className='size-4' />
                {r.status === 'vorschlaege' ? (
                  <span className='flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-medium text-white tabular-nums'>{r.proposals.length}</span>
                ) : (
                  <look.icon className='size-3.5 opacity-70' />
                )}
              </span>
              <span className={cn('text-sm leading-tight font-medium', r.status === 'nicht' && 'font-normal')}>{docTypes[r.type].label}</span>
              <span className='text-[11px] opacity-80'>{look.short}</span>
            </div>
          )
          return (
            <Tooltip key={r.type}>
              <TooltipTrigger asChild>{r.status === 'vorschlaege' ? <a href={`#typ-${r.type}`}>{tile}</a> : tile}</TooltipTrigger>
              <TooltipContent className='max-w-xs'>{r.reason}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </Panel>
  )
}

/* ---------- Proposals by doc type ---------- */

function Proposals({ b, status, className }: { b: LiveBundle; status?: ChangeStatus; className?: string }) {
  if (!b.proposals.length)
    return (
      <Panel title='Vorschläge' className={className}>
        <Empty className={cn('border', greenSoft)}>
          <EmptyHeader>
            <Check className='size-6' />
            <EmptyTitle>Keine Doku betroffen</EmptyTitle>
            <EmptyDescription>{b.noDocsReason ?? 'Geprüft, nichts zu ändern.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Panel>
    )
  // The showcase groups by doc type; an own project by its documents (README.md, docs/setup.md).
  const groups = datasetMode === 'working'
    ? b.docs.map((d) => ({ key: d, anchor: `doc-${d}`, label: docLabel(docOf(d)), Icon: FileText, ps: b.proposals.filter((p) => p.doc === d), type: null }))
    : docTypeOrder.filter((t) => b.types.includes(t)).map((t) => ({ key: t, anchor: `typ-${t}`, label: docTypes[t].label, Icon: typeIcon[t], ps: b.proposals.filter((p) => docOf(p.doc).type === t), type: t }))
  return (
    <Panel title='Vorschläge' className={className}>
      {groups.map(({ key, anchor, label, Icon, ps, type: t }) => {
        return (
          <section key={key} id={anchor} className='grid scroll-mt-20 gap-1'>
            <h3 className='flex items-center gap-2.5 pt-2 pb-1.5 text-base font-semibold tracking-tight'>
              <span className={cn('flex size-7 items-center justify-center rounded-md border', blueSoft)}>
                <Icon className='size-4' />
              </span>
              {label}
              <span className='text-sm font-normal text-muted-foreground tabular-nums'>{ps.length}</span>
              {status && t && (
                <span className='ms-auto text-xs font-normal text-muted-foreground'>
                  {status.approvers[t].self ? 'Entwicklung gibt selbst frei' : `Freigabe: ${status.approvers[t].name}`}
                </span>
              )}
            </h3>
            <div className='grid gap-1.5'>
              {ps.map((p) => (
                <ProposalRow key={p.id} p={p} written={status?.writebacks.find((w) => w.proposal === p.id)} />
              ))}
            </div>
          </section>
        )
      })}
    </Panel>
  )
}

const opIcon = { replace: PenLine, insert: Plus, rows: Rows3, note: MessageSquare }
const confDot: Record<Confidence, string> = { hoch: 'bg-emerald-500', mittel: 'bg-brand-400', pruefen: 'bg-late' }

/** Own projects: how far the correction is. Approval needs a draft. */
const KIND_WORD = { contradicts: 'stimmt nicht mehr', removed: 'gibt es nicht mehr', missing: 'fehlt' } as const
const draftLabel = (p: LiveProposal) => {
  const f = p.generation?.findings
  if (f?.length) return `${plural(f.length, 'Änderung', 'Änderungen')}: ${[...new Set(f.map((x) => KIND_WORD[x.kind]))].join(', ')}`
  return p.generation?.status === 'draft' ? `Entwurf von ${p.generation.model}` : p.generation?.status === 'no_change' ? 'Laut Prüfung stimmt der Text' : p.generation?.status === 'needs_context' ? 'Rückfrage' : 'Noch kein Entwurf'
}

function ProposalRow({ p, written }: { p: LiveProposal; written?: ChangeStatus['writebacks'][number] }) {
  const decide = useDecisions((s) => s.decide)
  const undo = useDecisions((s) => s.undo)
  const navigate = useNavigate()
  const d = docOf(p.doc)
  const Icon = opIcon[p.op]
  const big = p.size === 'kapitel' || p.size === 'seite'
  const done = p.state !== 'offen'
  const open = () => navigate({ to: '/dokumente/$id', params: { id: p.doc }, search: { p: p.id } })
  return (
    <div
      role='link'
      tabIndex={0}
      onClick={(e) => !(e.target as HTMLElement).closest('button, a') && open()}
      onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && open()}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
        p.state === 'uebernommen' || p.state === 'angepasst' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10' : p.state === 'verworfen' ? 'bg-muted/40 opacity-70' : 'hover:border-brand-300'
      )}
    >
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border', done ? 'border-transparent bg-background text-muted-foreground' : big ? 'border-brand-600 bg-brand-600 text-white' : blueSoft)}>
        <Icon className='size-4' />
      </span>
      <div className='grid min-w-0 flex-1 gap-1'>
        <span className='flex flex-wrap items-center gap-2'>
          {/* Own projects have no calibrated confidence: every finding of the initial check is to be reviewed. */}
          {datasetMode !== 'working' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn('size-2 shrink-0 rounded-full', confDot[p.confidence])} aria-label={confidences[p.confidence]} />
              </TooltipTrigger>
              <TooltipContent>{confidences[p.confidence]}</TooltipContent>
            </Tooltip>
          )}
          <span className={cn('text-sm font-medium', p.state === 'verworfen' && 'line-through')}>{p.title}</span>
          {big && (
            <Badge variant='outline' className={cn('font-normal', blueSoft)}>
              {sizes[p.size]}
            </Badge>
          )}
        </span>
        <span className='truncate text-xs text-muted-foreground'>
          {datasetMode === 'working' ? draftLabel(p) : `${d.title} · ${locationOf(p)}`}
        </span>
        {p.question && !done && (
          <span className={cn('flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm', lateSoft)}>
            <CircleHelp className='mt-0.5 size-3.5 shrink-0' aria-hidden /> {p.question}
          </span>
        )}
        {p.task && !done && (
          <span className={cn('flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm', lateSoft)}>
            <Hand className='mt-0.5 size-3.5 shrink-0' aria-hidden /> {p.task}
          </span>
        )}
      </div>
      <span className='flex shrink-0 items-center gap-1'>
        {done ? (
          <>
            {written ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href={written.target.url} target='_blank' rel='noreferrer' className='flex items-center gap-1 text-xs text-emerald-700 hover:underline dark:text-emerald-300'>
                    <Upload className='size-3.5' /> In {written.target.system}, Version {written.version}
                  </a>
                </TooltipTrigger>
                <TooltipContent>Zurückgeschrieben nach „{written.target.title}“ um {clock(written.at)}</TooltipContent>
              </Tooltip>
            ) : (
              <span className={cn('text-xs', p.state === 'verworfen' ? 'text-muted-foreground' : 'text-emerald-700 dark:text-emerald-300')}>{p.state === 'verworfen' ? 'Verworfen' : 'Übernommen'}</span>
            )}
            <Button size='icon' variant='ghost' className='size-8' title='Zurücknehmen' onClick={() => undo(p.id)}>
              <Undo2 />
            </Button>
          </>
        ) : (
          <>
            <Button asChild size='sm' variant='ghost' className='text-brand-700 dark:text-brand-300'>
              <Link to='/dokumente/$id' params={{ id: p.doc }} search={{ p: p.id }}>
                Ansehen
              </Link>
            </Button>
            {(datasetMode !== 'working' || p.generation?.status === 'draft') && (
              <Button size='icon' variant='outline' className='size-8 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700' title='Übernehmen' onClick={() => decide(p.id, { state: 'uebernommen' }, `Übernommen: ${p.title}`)}>
                <Check />
              </Button>
            )}
            <Button size='icon' variant='ghost' className='size-8 text-muted-foreground' title='Verwerfen' onClick={() => decide(p.id, { state: 'verworfen' }, `Verworfen: ${p.title}`)}>
              <X />
            </Button>
          </>
        )}
      </span>
    </div>
  )
}

/* ---------- Commits ---------- */

function Commits({ b }: { b: LiveBundle }) {
  // A commit straight on the main line has no merge request: its hash is not repeated as one.
  const direct = b.mr === b.commits[0]?.hash
  return (
    <Panel title={plural(b.commits.length, 'Commit', 'Commits')} aside={direct ? undefined : <Badge variant='outline' className={cn('font-normal', blueSoft)}>{b.mr}</Badge>}>
      <ol className='relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-brand-200 dark:before:bg-brand-500/30'>
        {b.commits.map((c) => (
          <li key={c.hash} className={cn('relative grid gap-1 pl-6', c.supersededBy && 'opacity-50')}>
            <span className={cn('absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-brand-500 bg-background', c.supersededBy && 'border-muted-foreground')} />
            <span className='flex items-center gap-2 text-xs text-muted-foreground'>
              <Hash hash={c.hash} hashes={b.commits.map((commit) => commit.hash)} /> {fmtDay(c.date)}
            </span>
            <span className={cn('text-sm leading-snug', c.supersededBy && 'line-through decoration-1')}>{c.message.replace(`${b.ticket} `, '')}</span>
          </li>
        ))}
        <li className='relative pl-6 text-xs text-muted-foreground'>
          <span className='absolute top-0.5 left-0 size-[11px] rounded-full bg-brand-600' />
          {direct ? 'Im Hauptzweig' : 'Gemergt'} {fmtDate(b.merged)}
        </li>
      </ol>
    </Panel>
  )
}
