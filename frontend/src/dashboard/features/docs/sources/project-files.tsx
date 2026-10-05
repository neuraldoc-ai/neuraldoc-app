/**
 * The documents of an imported project as neuraldoc read them: Markdown rendered, Word, Excel, PDF and PowerPoint
 * as their extracted text. Grouped by folder, with the sections the initial check found outdated.
 */
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Eye, FileSpreadsheet, FileText, FileType2, Folder, Presentation, SquareCode } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { docTypes, proposals } from '../data'
import { docOf } from '../logic'
import { useProjectDocuments, type ProjectDocument } from '../project-sources'
import { CodeView, Markdown, blue } from './shared'

const formatLabel: Record<string, string> = { md: 'Markdown', mdx: 'Markdown', markdown: 'Markdown', txt: 'Text', rst: 'reStructuredText', adoc: 'AsciiDoc', html: 'HTML', htm: 'HTML', pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', csv: 'CSV', xml: 'XML' }
const isMarkdown = (d: ProjectDocument) => ['md', 'mdx', 'markdown'].includes(d.format)

function FormatIcon({ format, className }: { format: string; className?: string }) {
  const Icon = format === 'xlsx' || format === 'csv' ? FileSpreadsheet : format === 'pdf' ? FileType2 : format === 'pptx' ? Presentation : FileText
  return <Icon className={cn('size-4 shrink-0 text-brand-600', className)} />
}

/** The document's title as the import read it; multi-part documents carry „Titel · Abschnitt“ per section. */
const titleOf = (d: ProjectDocument) => docOf(d.sections[0])?.title.split(' · ')[0] || d.path.split('/').pop()!

const folderOf = (d: ProjectDocument) => {
  const parts = d.path.split('/')
  return parts.slice(0, -1).join(' › ').replace(/^repository/, 'Repository').replace(/^dokumentation/, 'Dokumentation')
}

export function ProjectFiles() {
  const query = useProjectDocuments()
  const [selected, setSelected] = useState<string>()
  if (query.isError) return <Card className='p-6 text-sm text-muted-foreground'>{query.error.message}</Card>
  if (!query.data) return <Card className='p-6 text-sm text-muted-foreground'>Dokumente werden geladen …</Card>
  const documents = query.data
  const current = documents.find((d) => d.id === selected) ?? documents[0]
  const folders = [...new Set(documents.map(folderOf))]
  return (
    <Card className='gap-0 py-0'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3'>
        <span className='font-medium'>Dokumente</span>
        <span className='text-sm text-muted-foreground'>{documents.length} Dateien · so liest neuraldoc sie</span>
      </div>
      <div className='grid lg:grid-cols-[320px_minmax(0,1fr)]'>
        <nav className='grid max-h-[860px] min-w-0 content-start gap-3 overflow-x-hidden overflow-y-auto border-b p-3 lg:border-e lg:border-b-0' aria-label='Dokumente'>
          {folders.map((folder) => (
            <div key={folder} className='grid gap-1'>
              <span className='flex items-center gap-1.5 px-2 text-xs text-muted-foreground'>
                <Folder className='size-3.5' /> {folder}
              </span>
              {documents.filter((d) => folderOf(d) === folder).map((d) => {
                const open = proposals.filter((p) => d.sections.includes(p.doc)).length
                return (
                  <button key={d.id} type='button' onClick={() => setSelected(d.id)} className={cn('grid min-w-0 gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted', d.id === current?.id && 'bg-brand-50 dark:bg-brand-500/15')}>
                    <span className={cn('flex min-w-0 items-center gap-2 text-[13px]', d.id === current?.id && 'text-brand-700 dark:text-brand-200')}>
                      <FormatIcon format={d.format} />
                      <span className='truncate'>{titleOf(d)}</span>
                      {open > 0 && <span className='ms-auto size-1.5 shrink-0 rounded-full bg-late' aria-label='weicht vom Code ab' />}
                    </span>
                    <span className='ps-6 text-[11px] text-muted-foreground'>
                      {d.path.split('/').pop()} · {d.sections.length === 1 ? '1 Abschnitt' : `${d.sections.length} Abschnitte`}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        {current && <DocumentView key={current.id} d={current} />}
      </div>
    </Card>
  )
}

function DocumentView({ d }: { d: ProjectDocument }) {
  const [source, setSource] = useState(false)
  const sections = d.sections.map((id) => docOf(id)).filter(Boolean)
  const types = [...new Set(sections.map((s) => s.type))]
  const outdated = proposals.filter((p) => d.sections.includes(p.doc))
  return (
    <div className='grid min-w-0 content-start gap-4 p-5 [&>*]:min-w-0'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='grid gap-1'>
          <span className='flex items-center gap-2 text-lg font-medium'>
            <FormatIcon format={d.format} className='size-5' /> {titleOf(d)}
          </span>
          <span className='text-sm text-muted-foreground'>{d.path.replace(/^repository\//, '').replace(/^dokumentation\//, '')}</span>
          <span className='flex flex-wrap gap-1'>
            {types.map((t) => (
              <Badge key={t} variant='outline' className={cn('font-normal', blue)}>{docTypes[t].label}</Badge>
            ))}
            <Badge variant='secondary' className='font-normal'>{formatLabel[d.format] ?? d.format.toUpperCase()}</Badge>
            {d.binary && <Badge variant='secondary' className='font-normal'>ausgelesener Text</Badge>}
          </span>
        </div>
        {isMarkdown(d) && (
          <Button size='sm' variant='outline' onClick={() => setSource(!source)}>
            {source ? <Eye /> : <SquareCode />} {source ? 'Vorschau' : 'Quelltext'}
          </Button>
        )}
      </div>

      {outdated.length > 0 && (
        <div className='grid gap-2 rounded-xl border border-late/30 bg-late-soft p-3 text-sm'>
          <span className='font-medium'>{outdated.length === 1 ? 'Ein Abschnitt weicht vom Code ab' : `${outdated.length} Abschnitte weichen vom Code ab`}</span>
          {outdated.map((p) => (
            <Link key={p.id} to='/dokumente/$id' params={{ id: p.doc }} search={{ p: p.id }} className='flex items-center gap-1.5 text-late-fg hover:underline'>
              {docOf(p.doc).title} <ArrowRight className='size-3.5' />
            </Link>
          ))}
        </div>
      )}

      <div className='rounded-xl bg-muted/50 p-4 sm:p-6'>
        {isMarkdown(d) && !source ? (
          <div className='mx-auto max-w-[760px] rounded-md bg-card p-8 shadow-sm ring-1 ring-black/5'>
            <Markdown text={d.text} />
          </div>
        ) : isMarkdown(d) ? (
          <CodeView text={d.text} maxHeight={720} />
        ) : (
          <div className='mx-auto grid max-w-[720px] gap-3 bg-white p-10 text-[14px] leading-6 whitespace-pre-wrap text-neutral-900 shadow-sm ring-1 ring-black/5'>{d.text}</div>
        )}
      </div>
    </div>
  )
}
