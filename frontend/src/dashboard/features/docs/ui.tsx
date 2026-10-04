/**
 * Frame and small building blocks shared by the pages — all shadcn/ui, black on white.
 * Color is rare on purpose: orange only marks what needs a person (Kurz prüfen, Rückfrage).
 */
import { type ReactNode } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowRight, Check, ChevronRight, CircleDashed, CircleHelp, Pencil, RotateCcw, X } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { company, datasetMode, confidences, docTypes, natures, people, release, sizes, type Confidence, type DocTypeId, type Nature, type PersonId, type Size, type Step } from './data'
import { commitOf, fmtDate, initials, pStateLabel, type PState } from './model'
import { useDecisions } from './store'
import { useCommitViewer } from './commit-viewer-store'

type Crumb = { label: string; to?: string }

/** Page frame: breadcrumb, one line saying this is example data, title and lead. */
export function Frame({ title, lead, crumbs, actions, children }: { title: ReactNode; lead?: ReactNode; crumbs?: Crumb[]; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <AppHeader crumbs={crumbs ?? [{ label: String(title) }]} />
      <Main className='flex min-w-0 flex-col gap-6 pb-16'>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div className='grid gap-1.5'>
            <span className='text-xs text-muted-foreground'>
              {datasetMode === 'working' ? 'Eigenes Projekt' : 'Showcase · Beispieldaten'} · {company.product} {release.id}
            </span>
            <h1 className='text-[28px] leading-tight font-medium tracking-[-0.025em]'>{title}</h1>
            {lead && <p className='max-w-[72ch] text-sm text-muted-foreground'>{lead}</p>}
          </div>
          <div className='flex flex-wrap gap-2'>
            {actions}
            <ResetButton />
          </div>
        </div>
        {children}
      </Main>
    </>
  )
}

function ResetButton() {
  const count = useDecisions((s) => Object.keys(s.decisions).length)
  const reset = useDecisions((s) => s.reset)
  if (!count) return null
  return (
    <Button variant='outline' size='sm' onClick={reset} title='Alle Entscheidungen dieser Sitzung zurücknehmen'>
      <RotateCcw /> {count === 1 ? '1 Entscheidung' : `${count} Entscheidungen`} zurücksetzen
    </Button>
  )
}

export function Panel({ title, description, aside, children, className, footer, id }: { title: ReactNode; description?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; footer?: ReactNode; id?: string }) {
  return (
    <Card className={cn('scroll-mt-20', className)} id={id}>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
        <div className='grid gap-1'>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {aside}
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>{children}</CardContent>
      {footer && <CardFooter className='text-xs text-muted-foreground'>{footer}</CardFooter>}
    </Card>
  )
}

export function Stat({ label, value, hint, to }: { label: ReactNode; value: ReactNode; hint?: ReactNode; to?: LinkProps['to'] }) {
  const body = (
    <Card className={cn('h-full gap-1 py-5', to && 'transition-colors hover:border-brand-300')}>
      <CardContent className='flex flex-col gap-1.5'>
        <span className='text-sm text-muted-foreground'>{label}</span>
        <strong className='text-[32px] leading-none font-medium tracking-[-0.03em] tabular-nums'>{value}</strong>
        {hint && <small className='text-xs text-muted-foreground'>{hint}</small>}
      </CardContent>
    </Card>
  )
  return to ? (
    <Link to={to} className='rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'>
      {body}
    </Link>
  ) : (
    body
  )
}

export function MoreLink({ to, children, params, search }: { to: LinkProps['to']; children: ReactNode; params?: LinkProps['params']; search?: LinkProps['search'] }) {
  return (
    <Link to={to} params={params} search={search} className='inline-flex shrink-0 items-center gap-1 text-sm text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300'>
      {children} <ArrowRight className='size-3.5' />
    </Link>
  )
}

/** Small uppercase label above a block. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('block text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase', className)}>{children}</span>
}

/* ---------- Badges ---------- */

export function NatureBadge({ nature }: { nature: Nature }) {
  return (
    <Badge variant='outline' className={cn('font-normal', nature === 'fachlich' && 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-200', nature === 'intern' && 'text-muted-foreground')}>
      {natures[nature]}
    </Badge>
  )
}

export function DocTypeBadge({ type, count }: { type: DocTypeId; count?: number }) {
  return (
    <Badge variant='secondary' className='font-normal'>
      {docTypes[type].label}
      {count !== undefined && <span className='text-muted-foreground tabular-nums'>{count}</span>}
    </Badge>
  )
}

export function SizeBadge({ size }: { size: Size }) {
  const big = size === 'kapitel' || size === 'seite'
  return (
    <Badge variant='outline' className={cn('font-normal', big && 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-200')}>
      {sizes[size]}
    </Badge>
  )
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (confidence === 'pruefen')
    return (
      <Badge variant='outline' className='border-late/30 bg-late-soft font-normal text-late-fg'>
        <CircleHelp aria-hidden /> {confidences[confidence]}
      </Badge>
    )
  return (
    <Badge variant='outline' className='font-normal text-muted-foreground'>
      {confidences[confidence]}
    </Badge>
  )
}

const stateIcon = { offen: CircleDashed, uebernommen: Check, angepasst: Pencil, verworfen: X }

export function StateBadge({ state }: { state: PState }) {
  const Icon = stateIcon[state]
  return (
    <Badge variant={state === 'offen' ? 'outline' : 'secondary'} className={cn('font-normal', state === 'verworfen' && 'text-muted-foreground line-through decoration-1')}>
      <Icon aria-hidden /> {pStateLabel[state]}
    </Badge>
  )
}

/* ---------- People and commits ---------- */

export function Person({ id, withRole, className }: { id: PersonId; withRole?: boolean; className?: string }) {
  const p = people[id]
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Avatar className='size-6'>
        <AvatarFallback className='bg-muted text-[10px] font-medium'>{initials(p.name)}</AvatarFallback>
      </Avatar>
      <span className='flex min-w-0 flex-col leading-tight'>
        <span className='truncate text-sm'>{p.name}</span>
        {withRole && <span className='truncate text-xs text-muted-foreground'>{p.role}</span>}
      </span>
    </span>
  )
}

/** Open the original commit diff; keep all related commits available in the viewer. */
export function Hash({ hash, hashes }: { hash: string; hashes?: string[] }) {
  const c = commitOf(hash)
  const show = useCommitViewer((s) => s.show)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='h-auto rounded-md bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground'
          aria-label={`Commit ${hash} ansehen`}
          aria-haspopup='dialog'
          onClick={(event) => {
            event.stopPropagation()
            show(hash, hashes, event.currentTarget)
          }}
        >
          <code className='font-mono'>{hash}</code>
        </Button>
      </TooltipTrigger>
      {c && (
        <TooltipContent className='max-w-xs'>
          {c.message} · {c.author}, {fmtDate(c.date)}
        </TooltipContent>
      )}
    </Tooltip>
  )
}

/** Where a change sits in the product: Bereich › Modul › Kapitel. */
export function Path({ path, className }: { path: string[]; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-1', className)}>
      {path.map((p, i) => (
        <span key={p} className='inline-flex items-center gap-1.5'>
          {i > 0 && <ChevronRight className='size-3.5 text-muted-foreground/60' aria-hidden />}
          <span className={cn(i === path.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground')}>{p}</span>
        </span>
      ))}
    </span>
  )
}

/* ---------- Process before / after ---------- */

export function Process({ before, after, compact }: { before: Step[]; after: Step[]; compact?: boolean }) {
  return (
    <div className='grid gap-4 md:grid-cols-2'>
      <Steps title='Bisher' steps={before} muted compact={compact} />
      <Steps title='Ab jetzt' steps={after} compact={compact} />
    </div>
  )
}

function Steps({ title, steps, muted, compact }: { title: string; steps: Step[]; muted?: boolean; compact?: boolean }) {
  return (
    <div className={cn('grid content-start gap-2 rounded-xl border p-4', muted && 'bg-muted/40')}>
      <Eyebrow>{title}</Eyebrow>
      <ol className='grid gap-1.5'>
        {steps.map((s, i) => (
          <li key={i} className={cn('flex items-start gap-2.5 text-sm', muted && 'text-muted-foreground', compact && 'text-[13px]')}>
            <span
              className={cn(
                'mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums',
                s.mark === 'neu' && 'border-brand-600 bg-brand-600 text-white',
                s.mark === 'geändert' && 'border-brand-500 text-brand-700 dark:text-brand-300'
              )}
            >
              {i + 1}
            </span>
            <span className='flex-1'>{s.text}</span>
            {s.mark && (
              <Badge variant='outline' className={cn('font-normal', s.mark === 'neu' ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-200' : 'text-muted-foreground')}>
                {s.mark}
              </Badge>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
