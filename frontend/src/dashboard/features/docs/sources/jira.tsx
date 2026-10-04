/**
 * Jira, as the team sees it: a board of project MOB (Zu erledigen / In Arbeit / Fertig).
 * Clicking a ticket opens it like in Jira: description, comments, details, links, sub-tasks.
 */
import jiraRaw from '@dataset/jira/search_jql.json'
import { useState } from 'react'
import { Bookmark, Bug, CheckSquare, Layers, MessageSquare, SquareStack } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { Adf, PersonChip, RawToggle, blue, fmtDate, fmtDateTime, type Raw } from './shared'

const issues = (jiraRaw as Raw).issues as Raw[]
const byKey = Object.fromEntries(issues.map((i) => [i.key, i]))

const typeIcon: Record<string, typeof Bug> = { Epic: Layers, Story: Bookmark, Bug, Aufgabe: CheckSquare, Unteraufgabe: SquareStack }
const typeTone: Record<string, string> = { Epic: 'text-brand-700', Story: 'text-brand-600', Bug: 'text-late-fg', Aufgabe: 'text-muted-foreground', Unteraufgabe: 'text-muted-foreground' }

const columns = [
  { key: 'new', label: 'Zu erledigen' },
  { key: 'indeterminate', label: 'In Arbeit' },
  { key: 'done', label: 'Fertig' },
]

export function JiraBrowser() {
  const [open, setOpen] = useState<string | null>(null)
  const [version, setVersion] = useState('26.4')
  const shown = issues.filter((i) => i.fields.issuetype.name !== 'Epic' && (version === 'alle' || i.fields.fixVersions.some((v: Raw) => v.name === version)))
  const epics = issues.filter((i) => i.fields.issuetype.name === 'Epic')
  return (
    <Card className='gap-0 py-0'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3'>
        <span className='font-medium'>MOB · MOBIQ ERP</span>
        <ToggleGroup type='single' size='sm' variant='outline' value={version} onValueChange={(v) => v && setVersion(v)}>
          {['26.4', '26.5', 'alle'].map((v) => (
            <ToggleGroupItem key={v} value={v} className='px-3 text-xs data-[state=on]:bg-brand-50 data-[state=on]:text-brand-700'>
              {v === 'alle' ? 'Alle' : `Release ${v}`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className='flex flex-wrap gap-2 border-b px-5 py-3'>
        {epics.map((e) => (
          <button key={e.key} type='button' onClick={() => setOpen(e.key)} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-muted', blue)}>
            <Layers className='size-3' /> {e.fields.summary}
          </button>
        ))}
      </div>

      <div className='grid gap-4 p-5 md:grid-cols-3'>
        {columns.map((col) => {
          const list = shown.filter((i) => i.fields.status.statusCategory.key === col.key)
          return (
            <div key={col.key} className='grid content-start gap-2 rounded-xl bg-muted/40 p-2'>
              <span className='px-2 pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                {col.label} <span className='tabular-nums'>{list.length}</span>
              </span>
              {list.map((i) => (
                <IssueCard key={i.key} issue={i} onOpen={() => setOpen(i.key)} />
              ))}
            </div>
          )
        })}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side='right' className='w-full gap-0 overflow-y-auto sm:max-w-3xl'>
          {open && <IssueDetail issue={byKey[open]} onOpen={setOpen} />}
        </SheetContent>
      </Sheet>
    </Card>
  )
}

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = typeIcon[type] ?? CheckSquare
  return <Icon className={cn('size-4 shrink-0', typeTone[type], className)} aria-label={type} />
}

function IssueCard({ issue: i, onOpen }: { issue: Raw; onOpen: () => void }) {
  const f = i.fields
  return (
    <button type='button' onClick={onOpen} className='grid gap-2 rounded-lg border bg-card p-3 text-left text-sm shadow-xs transition-colors hover:border-brand-300'>
      <span className='line-clamp-2'>{f.summary}</span>
      {f.parent && <span className='truncate text-xs text-brand-700 dark:text-brand-300'>{f.parent.fields.summary}</span>}
      <span className='flex items-center justify-between gap-2'>
        <span className='flex items-center gap-1.5'>
          <TypeIcon type={f.issuetype.name} />
          <span className='font-mono text-xs text-muted-foreground'>{i.key}</span>
          {f.comment.total > 0 && (
            <span className='flex items-center gap-0.5 text-xs text-muted-foreground'>
              <MessageSquare className='size-3' />
              {f.comment.total}
            </span>
          )}
        </span>
        {f.assignee && (
          <span className='flex size-6 items-center justify-center rounded-full bg-brand-50 text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' title={f.assignee.displayName}>
            {f.assignee.displayName
              .split(' ')
              .map((w: string) => w[0])
              .join('')}
          </span>
        )}
      </span>
    </button>
  )
}

function IssueDetail({ issue: i, onOpen }: { issue: Raw; onOpen: (key: string) => void }) {
  const f = i.fields
  const children = issues.filter((x) => x.fields.parent?.key === i.key)
  return (
    <>
      <SheetHeader className='border-b'>
        <SheetDescription className='flex items-center gap-1.5 text-xs'>
          {f.parent && (
            <>
              <button type='button' className='hover:underline' onClick={() => onOpen(f.parent.key)}>
                {f.parent.key}
              </button>
              <span>/</span>
            </>
          )}
          <TypeIcon type={f.issuetype.name} className='size-3.5' />
          <span className='font-mono'>{i.key}</span>
        </SheetDescription>
        <SheetTitle className='text-xl font-medium'>{f.summary}</SheetTitle>
      </SheetHeader>

      <div className='grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_220px]'>
        <div className='grid min-w-0 content-start gap-6'>
          <section className='grid gap-2'>
            <span className='text-sm font-medium'>Beschreibung</span>
            {f.description ? <Adf node={f.description} /> : <p className='text-sm text-muted-foreground'>Keine Beschreibung.</p>}
          </section>

          {children.length > 0 && (
            <section className='grid gap-2'>
              <span className='text-sm font-medium'>{f.issuetype.name === 'Epic' ? 'Vorgänge im Epic' : 'Unteraufgaben'}</span>
              <div className='grid gap-1'>
                {children.map((c) => (
                  <button key={c.key} type='button' onClick={() => onOpen(c.key)} className='flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted'>
                    <TypeIcon type={c.fields.issuetype.name} />
                    <span className='font-mono text-xs text-muted-foreground'>{c.key}</span>
                    <span className='flex-1 truncate'>{c.fields.summary}</span>
                    <StatusBadge status={c.fields.status} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {f.issuelinks.length > 0 && (
            <section className='grid gap-2'>
              <span className='text-sm font-medium'>Verknüpfte Vorgänge</span>
              {f.issuelinks.map((l: Raw) => {
                const other = l.outwardIssue ?? l.inwardIssue
                return (
                  <button key={l.id} type='button' onClick={() => onOpen(other.key)} className='flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted'>
                    <span className='w-28 shrink-0 text-xs text-muted-foreground'>{l.outwardIssue ? l.type.outward : l.type.inward}</span>
                    <span className='font-mono text-xs text-muted-foreground'>{other.key}</span>
                    <span className='flex-1 truncate'>{other.fields.summary}</span>
                    <StatusBadge status={other.fields.status} />
                  </button>
                )
              })}
            </section>
          )}

          <section className='grid gap-3'>
            <span className='text-sm font-medium'>Kommentare ({f.comment.total})</span>
            {f.comment.comments.length === 0 && <p className='text-sm text-muted-foreground'>Keine Kommentare.</p>}
            {f.comment.comments.map((c: Raw) => (
              <div key={c.id} className='grid gap-2'>
                <span className='flex items-center gap-2'>
                  <PersonChip name={c.author.displayName} />
                  <span className='text-xs text-muted-foreground'>{fmtDateTime(c.created)}</span>
                </span>
                <div className='ms-8 rounded-lg border bg-muted/20 px-3 py-2'>
                  <Adf node={c.body} />
                </div>
              </div>
            ))}
          </section>

          <RawToggle data={i} label='Originaldaten (Jira REST v3)' />
        </div>

        <aside className='grid content-start gap-3 rounded-xl border p-4 text-sm'>
          <StatusBadge status={f.status} large />
          <Separator />
          <Detail label='Typ'>{f.issuetype.name}</Detail>
          <Detail label='Priorität'>{f.priority.name}</Detail>
          <Detail label='Zuständig'>
            <PersonChip name={f.assignee?.displayName} />
          </Detail>
          <Detail label='Melder'>
            <PersonChip name={f.reporter?.displayName} />
          </Detail>
          <Detail label='Lösungsversion'>{f.fixVersions.map((v: Raw) => v.name).join(', ') || '–'}</Detail>
          <Detail label='Komponenten'>{f.components.map((c: Raw) => c.name).join(', ') || '–'}</Detail>
          <Detail label='Labels'>
            <span className='flex flex-wrap gap-1'>
              {f.labels.length
                ? f.labels.map((l: string) => (
                    <Badge key={l} variant='secondary' className='font-normal'>
                      {l}
                    </Badge>
                  ))
                : '–'}
            </span>
          </Detail>
          <Detail label='Sprint'>{f.customfield_10020.map((s: Raw) => s.name).join(', ') || '–'}</Detail>
          <Detail label='Story Points'>{f.customfield_10016 ?? '–'}</Detail>
          <Separator />
          <span className='text-xs text-muted-foreground'>
            Erstellt {fmtDate(f.created)}
            <br />
            Aktualisiert {fmtDate(f.updated)}
            {f.resolutiondate && (
              <>
                <br />
                Erledigt {fmtDate(f.resolutiondate)}
              </>
            )}
          </span>
        </aside>
      </div>
    </>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='grid gap-1'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <span>{children}</span>
    </div>
  )
}

function StatusBadge({ status, large }: { status: Raw; large?: boolean }) {
  const cat = status.statusCategory.key
  return (
    <Badge variant='outline' className={cn('w-fit font-normal', large && 'px-3 py-1 text-sm', cat === 'done' ? blue : cat === 'indeterminate' ? 'border-foreground/20' : 'text-muted-foreground')}>
      {status.name}
    </Badge>
  )
}
