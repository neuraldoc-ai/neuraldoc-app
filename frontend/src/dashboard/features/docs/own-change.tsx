/**
 * A change of an own project with Git history, in plain words: what is different now (described by the model from
 * the commits and the diff, or the cleaned commit subject before the first check), which parts it touches, and
 * which of the project's own documents need a change. The showcase's doc types are not used here: an own project
 * has its own documents.
 */
import { Check, FileText, FolderGit2, GitCommitHorizontal, PenLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { changeTypes, docs } from './data'
import { docLabel, docOf, plural, type LiveBundle } from './model'
import { blueSoft } from './overview-icons'
import { NatureBadge, Panel } from './ui'

const greenSoft = 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'

/** The kind of change: Neue Funktion, Geändertes Verhalten, Fehlerbehebung or Intern; the showcase's natures otherwise. */
export function ChangeBadge({ b }: { b: LiveBundle }) {
  if (!b.type) return <NatureBadge nature={b.nature} />
  const t = changeTypes[b.type]
  return (
    <Badge variant='outline' className={cn('font-normal', t.nature === 'fachlich' && 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-200', b.type === 'fix' && 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200', t.nature === 'intern' && 'text-muted-foreground')}>
      {t.label}
    </Badge>
  )
}

/** Changed files by folder, biggest folders first. */
function folders(files: string[]) {
  const by = new Map<string, number>()
  for (const f of files) {
    const parts = f.split('/')
    const key = parts.length > 2 ? parts.slice(0, 2).join('/') : parts.length === 2 ? parts[0] : '(Hauptordner)'
    by.set(key, (by.get(key) ?? 0) + 1)
  }
  return [...by].sort((a, b) => b[1] - a[1])
}

export function OwnChange({ b, className }: { b: LiveBundle; className?: string }) {
  const files = [...new Set(b.commits.flatMap((c) => c.files))]
  const groups = folders(files)
  return (
    <Panel className={className} title='Was sich ändert'>
      <div className='grid gap-3'>
        {b.summary ? <p className='text-[15px] leading-relaxed'>{b.summary}</p> : <p className='text-sm text-muted-foreground'>Noch keine Beschreibung. Die Erstprüfung beschreibt jede Änderung in einfachen Worten.</p>}
        {b.areas && b.areas.length > 0 && (
          <span className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
            Betrifft
            {b.areas.map((a) => (
              <Badge key={a} variant='outline' className={cn('font-normal', blueSoft)}>
                {a}
              </Badge>
            ))}
          </span>
        )}
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='grid content-start gap-2 rounded-xl border p-3'>
          <span className='flex items-center gap-2 text-xs text-muted-foreground'>
            <GitCommitHorizontal className='size-3.5' /> {b.commits.length > 1 ? 'Aus den Commits' : 'Aus dem Commit'}
          </span>
          {b.commits.slice(0, 4).map((c) => (
            <span key={c.hash} className='font-mono text-xs leading-relaxed break-words text-foreground/80'>
              {c.message}
            </span>
          ))}
          {b.commits.length > 4 && <span className='text-xs text-muted-foreground'>und {plural(b.commits.length - 4, 'weiterer', 'weitere')}</span>}
        </div>
        <div className='grid content-start gap-2 rounded-xl border p-3'>
          <span className='flex items-center gap-2 text-xs text-muted-foreground'>
            <FolderGit2 className='size-3.5' /> {plural(files.length, 'geänderte Datei', 'geänderte Dateien')}
          </span>
          {groups.slice(0, 5).map(([folder, n]) => (
            <span key={folder} className='flex items-center justify-between gap-3 text-xs'>
              <span className='truncate font-mono'>{folder}</span>
              <span className='shrink-0 text-muted-foreground tabular-nums'>{n}</span>
            </span>
          ))}
          {groups.length > 5 && <span className='text-xs text-muted-foreground'>und {plural(groups.length - 5, 'weiterer Ordner', 'weitere Ordner')}</span>}
        </div>
      </div>
    </Panel>
  )
}

/** The project's documents: the ones this change makes outdated first, then the ones that still match. */
export function OwnDocs({ b, checked }: { b: LiveBundle; checked: boolean }) {
  const touched = b.docs.map((id) => ({ doc: docOf(id), open: b.proposals.filter((p) => p.doc === id && p.state === 'offen').length, all: b.proposals.filter((p) => p.doc === id).length }))
  const rest = docs.filter((d) => !b.docs.includes(d.id))
  const shown = rest.slice(0, Math.max(0, 6 - touched.length))
  return (
    <Panel title='Welche Doku' description={touched.length ? `${plural(touched.length, 'Dokument muss', 'Dokumente müssen')} angepasst werden` : checked ? 'Kein Dokument muss angepasst werden' : 'Noch nicht geprüft'}>
      <div className='grid gap-1.5'>
        {touched.map(({ doc, open, all }) => (
          <a key={doc.id} href={`#doc-${doc.id}`} className={cn('flex items-center gap-3 rounded-xl border p-3 transition-colors hover:border-brand-400', blueSoft)}>
            <PenLine className='size-4 shrink-0' />
            <span className='min-w-0 flex-1 truncate text-sm font-medium'>{docLabel(doc)}</span>
            <span className='shrink-0 text-xs'>{open ? `${plural(open, 'Stelle', 'Stellen')} anpassen` : `${plural(all, 'Stelle', 'Stellen')} entschieden`}</span>
          </a>
        ))}
        {checked &&
          shown.map((doc) => (
            <Tooltip key={doc.id}>
              <TooltipTrigger asChild>
                <div className='flex items-center gap-3 rounded-xl border px-3 py-2 text-muted-foreground'>
                  <FileText className='size-4 shrink-0' />
                  <span className='min-w-0 flex-1 truncate text-sm'>{docLabel(doc)}</span>
                  <span className={cn('flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]', greenSoft)}>
                    <Check className='size-3' /> stimmt
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent className='max-w-xs'>Die Erstprüfung hat in diesem Dokument nichts gefunden, was diese Änderung betrifft.</TooltipContent>
            </Tooltip>
          ))}
        {checked && rest.length > shown.length && <span className='px-1 text-xs text-muted-foreground'>und {plural(rest.length - shown.length, 'weiteres Dokument stimmt', 'weitere Dokumente stimmen')} noch</span>}
      </div>
    </Panel>
  )
}
