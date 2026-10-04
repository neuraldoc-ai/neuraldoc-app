/**
 * Documents outside Confluence: the SharePoint library "MOBIQ Produktdokumentation" with Word,
 * Excel and PDF files. Each file is shown as it looks (page, spreadsheet, slides, diagram) and can be
 * opened as the real file.
 */
import extractedRaw from '@dataset/dokumente/extracted.json'
import driveRaw from '@dataset/dokumente/driveItems.json'
import { useState, type ReactNode } from 'react'
import { Download, FileSpreadsheet, FileText, FileType2, Folder } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { DocTypesView, docTypeLabel } from './doctypes'
import { RawToggle, blue, fmtDate, type Raw } from './shared'

const extracted = extractedRaw as Record<string, Raw>
const items = (driveRaw as Raw).value as Raw[]
const files = Object.values(extracted)
const itemOf = (f: Raw) => items.find((i) => i.id === f.id)

// URLs of the real files, served by Vite from datasets/mobiq-docs/dokumente/files.
const urls = import.meta.glob('../../../../../../datasets/mobiq-docs/dokumente/files/**/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const urlOf = (f: Raw) => Object.entries(urls).find(([k]) => k.endsWith('/' + f.path))?.[1]

const kindLabel: Record<string, string> = { docx: 'Word', xlsx: 'Excel', pdf: 'PDF' }
const KindIcon = ({ kind, className }: { kind: string; className?: string }) => {
  const Icon = kind === 'xlsx' ? FileSpreadsheet : kind === 'pdf' ? FileType2 : FileText
  return <Icon className={cn('size-4 shrink-0 text-brand-600', className)} />
}

export function FilesBrowser({ view = 'dateien' }: { view?: 'dateien' | 'doku-arten' }) {
  return (
    <Card className='gap-0 py-0'>
      <Tabs defaultValue={view} className='gap-0'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b px-5 py-2'>
          <span className='font-medium'>musterhaus.sharepoint.com · Produktdokumentation › MOBIQ</span>
          <TabsList>
            <TabsTrigger value='dateien'>Dateien ({files.length})</TabsTrigger>
            <TabsTrigger value='doku-arten'>Doku-Arten</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value='dateien'>
          <Library />
        </TabsContent>
        <TabsContent value='doku-arten' className='p-5'>
          <DocTypesView />
        </TabsContent>
      </Tabs>
    </Card>
  )
}

function Library() {
  const [slug, setSlug] = useState(files[0] ? Object.keys(extracted)[0] : '')
  const f = extracted[slug]
  const item = itemOf(f)
  const folders = [...new Set(files.map((x) => x.path.split('/').slice(0, -1).join('/')))]
  const url = urlOf(f)
  return (
    <div className='grid lg:grid-cols-[320px_minmax(0,1fr)]'>
      <nav className='grid max-h-[860px] min-w-0 content-start gap-3 overflow-x-hidden overflow-y-auto border-b p-3 lg:border-e lg:border-b-0' aria-label='Dateien'>
        {folders.map((folder) => (
          <div key={folder} className='grid gap-1'>
            <span className='flex items-center gap-1.5 px-2 text-xs text-muted-foreground'>
              <Folder className='size-3.5' /> {folder}
            </span>
            {Object.entries(extracted)
              .filter(([, x]) => x.path.startsWith(folder + '/') && x.path.split('/').length === folder.split('/').length + 1)
              .map(([s, x]) => (
                <button
                  key={s}
                  type='button'
                  onClick={() => setSlug(s)}
                  className={cn('grid min-w-0 gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted', s === slug && 'bg-brand-50 dark:bg-brand-500/15')}
                >
                  <span className={cn('flex min-w-0 items-center gap-2 text-[13px]', s === slug && 'text-brand-700 dark:text-brand-200')}>
                    <KindIcon kind={x.kind} />
                    <span className='truncate'>{x.name}</span>
                  </span>
                  <span className='ps-6 text-[11px] text-muted-foreground'>
                    {docTypeLabel[x.docType]} · {fmtDate(itemOf(x).lastModifiedDateTime)}
                  </span>
                </button>
              ))}
          </div>
        ))}
      </nav>

      <div className='grid min-w-0 content-start gap-4 p-5 [&>*]:min-w-0'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='grid gap-1'>
            <span className='flex items-center gap-2 text-lg font-medium'>
              <KindIcon kind={f.kind} className='size-5' /> {f.name}
            </span>
            <span className='text-sm text-muted-foreground'>
              {f.path.split('/').slice(0, -1).join(' › ')} · geändert {fmtDate(item.lastModifiedDateTime)} von {item.lastModifiedBy.user.displayName} · {(item.size / 1024).toFixed(1)} KB
            </span>
            <span className='flex gap-1'>
              <Badge variant='outline' className={cn('font-normal', blue)}>
                {docTypeLabel[f.docType]}
              </Badge>
              <Badge variant='secondary' className='font-normal'>
                {kindLabel[f.kind]}
              </Badge>
            </span>
          </div>
          {url && (
            <Button asChild size='sm' variant='outline'>
              <a href={url} download={f.name} target='_blank' rel='noreferrer'>
                <Download /> Datei öffnen
              </a>
            </Button>
          )}
        </div>

        <div className='rounded-xl bg-muted/50 p-4 sm:p-6'>
          {f.kind === 'docx' && <WordPage blocks={f.blocks} />}
          {f.kind === 'xlsx' && <Workbook sheets={f.sheets} key={slug} />}
          {f.kind === 'pdf' && <PdfPages pages={f.pages} title={f.title} />}
        </div>

        <div className='grid gap-1'>
          <RawToggle data={item} label='Metadaten (Microsoft Graph driveItem)' />
          <RawToggle data={f} label='Ausgelesener Inhalt (so liest neuraldoc die Datei)' />
        </div>
      </div>
    </div>
  )
}

/* ---------- Word ---------- */

function Blocks({ blocks, slide }: { blocks: Raw[]; slide?: boolean }) {
  return (
    <>
      {blocks.map((b, i): ReactNode => {
        if (b.title) return <p key={i} className='text-[26px] font-semibold tracking-tight'>{b.title}</p>
        if (b.h1) return <p key={i} className='text-2xl font-semibold text-brand-700 dark:text-brand-300'>{b.h1}</p>
        if (b.h2) return <p key={i} className='mt-3 text-base font-semibold'>{b.h2}</p>
        if (b.p) return <p key={i} className={slide ? 'text-lg' : undefined}>{b.p}</p>
        if (b.note) return <p key={i} className='rounded bg-late-soft px-3 py-2 text-sm'><strong>Hinweis: </strong>{b.note}</p>
        if (b.bullets)
          return (
            <ul key={i} className={cn('grid list-disc gap-1 ps-6', slide && 'gap-3 text-lg')}>
              {b.bullets.map((t: string) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )
        if (b.table)
          return (
            <table key={i} className='w-full border-collapse text-[13px]'>
              <thead>
                <tr>
                  {b.table.head.map((h: string) => (
                    <th key={h} className='border border-neutral-300 bg-[#E7EEFB] px-2 py-1 text-left font-semibold'>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.table.rows.map((r: string[], k: number) => (
                  <tr key={k}>
                    {r.map((c, j) => (
                      <td key={j} className='border border-neutral-300 px-2 py-1 align-top'>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        return null
      })}
    </>
  )
}

function WordPage({ blocks }: { blocks: Raw[] }) {
  return (
    <div className='mx-auto grid max-w-[720px] gap-3 bg-white p-10 text-[14px] leading-6 text-neutral-900 shadow-sm ring-1 ring-black/5' style={{ fontFamily: 'Calibri, Carlito, Arial, sans-serif' }}>
      <Blocks blocks={blocks} />
    </div>
  )
}

/* ---------- Excel ---------- */

const col = (i: number) => String.fromCharCode(65 + i)

function Workbook({ sheets }: { sheets: Raw[] }) {
  const [active, setActive] = useState(0)
  const s = sheets[active]
  return (
    <div className='overflow-hidden rounded-md bg-white text-neutral-900 shadow-sm ring-1 ring-black/5' style={{ fontFamily: 'Calibri, Carlito, Arial, sans-serif' }}>
      <div className='overflow-auto'>
        <table className='border-collapse text-[13px]'>
          <thead>
            <tr>
              <th className='sticky left-0 w-10 border border-neutral-300 bg-neutral-100' />
              {s.rows[0].map((_: unknown, i: number) => (
                <th key={i} className='border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-normal text-neutral-500' style={{ minWidth: (s.widths?.[i] ?? 14) * 7 }}>
                  {col(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r: (string | number)[], ri: number) => (
              <tr key={ri}>
                <td className='sticky left-0 border border-neutral-300 bg-neutral-100 px-2 text-right text-neutral-500'>{ri + 1}</td>
                {r.map((c, ci) => (
                  <td key={ci} className={cn('border border-neutral-200 px-2 py-0.5 whitespace-nowrap', ri === 0 && 'bg-[#E7EEFB] font-semibold', typeof c === 'number' && 'text-right')}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='flex gap-0.5 border-t border-neutral-300 bg-neutral-100 px-2'>
        {sheets.map((sh: Raw, i: number) => (
          <button key={sh.name} type='button' onClick={() => setActive(i)} className={cn('px-3 py-1 text-xs', i === active ? 'border-b-2 border-[#1D4ED8] bg-white font-medium text-[#1D4ED8]' : 'text-neutral-600 hover:bg-white/60')}>
            {sh.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- PDF ---------- */

function PdfPages({ pages, title }: { pages: Raw[]; title: string }) {
  return (
    <div className='grid gap-6'>
      {pages.map((p: Raw, i: number) => (
        <div key={i} className='grid gap-1'>
          <div
            className={cn('relative mx-auto w-full overflow-hidden bg-white text-neutral-900 shadow-sm ring-1 ring-black/5', p.slide ? 'max-w-[760px]' : 'max-w-[620px]')}
            style={{ aspectRatio: p.slide ? '842 / 595' : '595 / 842', fontFamily: 'Helvetica, Arial, sans-serif' }}
          >
            {p.slide && <div className='absolute inset-x-0 top-0 h-2 bg-[#1D4ED8]' />}
            <div className={cn('grid content-start gap-3', p.slide ? 'p-12' : 'p-10 text-[13px] leading-5')}>
              <Blocks blocks={p.blocks} slide={p.slide} />
            </div>
            {p.diagram && <Diagram d={p.diagram} />}
          </div>
          <span className='text-center text-xs text-muted-foreground'>
            {title} · Seite {i + 1} von {pages.length}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Draws the diagram from its PDF coordinates (595 × 842 pt, origin bottom left). */
function Diagram({ d }: { d: Raw }) {
  return (
    <svg viewBox='0 0 595 842' className='absolute inset-0 size-full'>
      <defs>
        <marker id='arrow' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'>
          <path d='M0 0 L10 5 L0 10 z' fill='#4b5563' />
        </marker>
      </defs>
      {d.arrows.map(([x1, y1, x2, y2]: number[], i: number) => (
        <line key={i} x1={x1} y1={842 - y1} x2={x2} y2={842 - y2} stroke='#4b5563' strokeWidth='1.2' markerEnd='url(#arrow)' />
      ))}
      {d.boxes.map((b: Raw, i: number) => (
        <g key={i}>
          <rect x={b.x} y={842 - b.y - b.h} width={b.w} height={b.h} fill={b.fill ? '#E7EEFB' : '#F3F5FC'} stroke='#BFBFBF' />
          {String(b.label)
            .split('\n')
            .map((l: string, k: number, all: string[]) => (
              <text key={k} x={b.x + 8} y={842 - b.y - b.h / 2 - (all.length - 1) * 6 + k * 12 + 4} fontSize='10' fontWeight={k === 0 ? 700 : 400} fill='#111'>
                {l}
              </text>
            ))}
        </g>
      ))}
      {d.captions?.map((c: Raw, i: number) => (
        <text key={i} x={c.x} y={842 - c.y} fontSize='9' fill='#6b7280'>
          {c.text}
        </text>
      ))}
    </svg>
  )
}
