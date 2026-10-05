/**
 * Confluence, as readers see it: spaces with their page tree, each page rendered from the storage
 * format (headings, tables, info/note panels, images, draw.io diagrams, child-page lists).
 */
import pagesRaw from '@dataset/confluence/pages.json'
import spacesRaw from '@dataset/confluence/spaces.json'
import metaRaw from '@dataset/confluence/page_meta.json'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, ImageIcon, Paperclip, Workflow } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import jiraRaw from '@dataset/jira/search_jql.json'
import { CodeView, RawToggle, blue, fmtDate, type Raw } from './shared'

/** Atlassian account id → display name, collected from everything Jira returns. */
const accountNames: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  const add = (u: Raw) => u?.accountId && (map[u.accountId] = u.displayName)
  for (const i of (jiraRaw as Raw).issues) {
    add(i.fields.assignee)
    add(i.fields.reporter)
    for (const c of i.fields.comment.comments) add(c.author)
  }
  return map
})()


const pages = (pagesRaw as Raw).results as Raw[]
const spaces = (spacesRaw as Raw).results as Raw[]
const meta = metaRaw as Record<string, Raw>
const byId = Object.fromEntries(pages.map((p) => [p.id, p]))
const childrenOf = (id: string | null, spaceId: string) => pages.filter((p) => p.parentId === id && p.spaceId === spaceId).sort((a, b) => a.position - b.position)

export function ConfluenceBrowser() {
  return (
    <Card className='gap-0 py-0'>
      <div className='border-b px-5 py-3 font-medium'>musterhaus-software.atlassian.net/wiki · {pages.length} Seiten</div>
      <PagesView />
    </Card>
  )
}

function PagesView() {
  const [pageId, setPageId] = useState('393281702')
  const page = byId[pageId]
  const [space, setSpace] = useState(page.spaceId)
  const pick = (id: string) => {
    setPageId(id)
    setSpace(byId[id].spaceId)
  }
  return (
    <div className='grid lg:grid-cols-[290px_minmax(0,1fr)]'>
      <nav className='grid max-h-[820px] content-start gap-3 overflow-auto border-b p-3 lg:border-e lg:border-b-0' aria-label='Bereiche und Seiten'>
        <div className='grid gap-1'>
          {spaces.map((s) => (
            <button
              key={s.id}
              type='button'
              onClick={() => {
                setSpace(s.id)
                pick(s.homepageId)
              }}
              className={cn('flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted', space === s.id && 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200')}
            >
              {s.name}
              <span className='font-mono text-[10px] text-muted-foreground'>{s.key}</span>
            </button>
          ))}
        </div>
        <div className='border-t pt-2'>
          {childrenOf(null, space).map((p) => (
            <PageNode key={p.id} page={p} depth={0} selected={pageId} onSelect={pick} />
          ))}
        </div>
      </nav>
      <Page page={page} onOpen={pick} />
    </div>
  )
}

function PageNode({ page, depth, selected, onSelect }: { page: Raw; depth: number; selected: string; onSelect: (id: string) => void }) {
  const kids = childrenOf(page.id, page.spaceId)
  const [open, setOpen] = useState(true)
  return (
    <div>
      <div className='flex items-center' style={{ paddingInlineStart: depth * 14 }}>
        {kids.length ? (
          <button type='button' onClick={() => setOpen(!open)} className='rounded p-0.5 text-muted-foreground hover:bg-muted' aria-label={open ? 'Zuklappen' : 'Aufklappen'}>
            {open ? <ChevronDown className='size-3' /> : <ChevronRight className='size-3' />}
          </button>
        ) : (
          <span className='w-4' />
        )}
        <button
          type='button'
          onClick={() => onSelect(page.id)}
          className={cn('flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-muted', selected === page.id && 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200')}
        >
          <FileText className='size-3.5 shrink-0 text-muted-foreground' />
          <span className='truncate'>{page.title}</span>
        </button>
      </div>
      {open && kids.map((k) => <PageNode key={k.id} page={k} depth={depth + 1} selected={selected} onSelect={onSelect} />)}
    </div>
  )
}

function Page({ page, onOpen }: { page: Raw; onOpen: (id: string) => void }) {
  const space = spaces.find((s) => s.id === page.spaceId)
  const crumbs: Raw[] = []
  for (let p = byId[page.parentId]; p; p = byId[p.parentId]) crumbs.unshift(p)
  const html = useMemo(() => renderStorage(page), [page])
  const m = meta[page.id]
  const [source, setSource] = useState(false)
  return (
    <article className='grid min-w-0 content-start gap-5 p-6 sm:px-10'>
      <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
        {crumbs[0]?.title !== space?.name && <span>{space?.name}</span>}
        {crumbs.map((c, i) => (
          <span key={c.id} className='flex items-center gap-1.5'>
            {(i > 0 || crumbs[0]?.title !== space?.name) && <ChevronRight className='size-3' />}
            <button type='button' className='hover:underline' onClick={() => onOpen(c.id)}>
              {c.title}
            </button>
          </span>
        ))}
      </div>
      <div className='grid gap-2'>
        <h2 className='text-[28px] leading-tight font-medium tracking-[-0.02em]'>{page.title}</h2>
        <span className='text-sm text-muted-foreground'>
          Zuletzt geändert von {accountNames[page.version.authorId] ?? 'unbekannt'} am {fmtDate(page.version.createdAt)} · Version {page.version.number}
          {page.version.message && ` · „${page.version.message}“`}
        </span>
        {m.labels.results.length > 0 && (
          <span className='flex flex-wrap gap-1'>
            {m.labels.results.map((l: Raw) => (
              <Badge key={l.id} variant='outline' className={cn('font-normal', blue)}>
                {l.name}
              </Badge>
            ))}
          </span>
        )}
      </div>

      <div
        className={cn(
          'max-w-[78ch] text-[15px] leading-7',
          '[&_h2]:mt-6 [&_h2]:mb-1 [&_h2]:text-xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h3]:mt-5 [&_h3]:font-semibold',
          '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-6',
          '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:border [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:px-3 [&_td]:py-1.5 [&_td_p]:my-0 [&_th_p]:my-0',
          '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]'
        )}
        onClick={(e) => {
          const id = (e.target as HTMLElement).closest('[data-page]')?.getAttribute('data-page')
          if (id) onOpen(id)
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {m.attachments.results.length > 0 && (
        <div className='grid gap-2 border-t pt-4'>
          <span className='flex items-center gap-1.5 text-sm font-medium'>
            <Paperclip className='size-4' /> Anhänge
          </span>
          {m.attachments.results.map((a: Raw) => (
            <span key={a.id} className='flex items-center gap-2 text-sm'>
              {a.mediaType.startsWith('image') ? <ImageIcon className='size-4 text-muted-foreground' /> : <Workflow className='size-4 text-muted-foreground' />}
              {a.title}
              <span className='text-xs text-muted-foreground'>
                {(a.fileSize / 1024).toFixed(0)} KB · {a.mediaTypeDescription}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className='grid gap-2 border-t pt-4'>
        <button type='button' className='w-fit text-sm text-muted-foreground hover:text-foreground' onClick={() => setSource(!source)}>
          {source ? '▾' : '▸'} Seiteninhalt im Storage-Format (XHTML)
        </button>
        {source && <CodeView text={page.body.storage.value.replace(/></g, '>\n<')} maxHeight={520} header='body.storage.value' />}
        <RawToggle data={{ ...page, labels: m.labels, attachments: m.attachments }} label='Originaldaten (Confluence REST v2)' />
      </div>
    </article>
  )
}

/* ---------- Storage format → HTML ---------- */

const panelTone: Record<string, string> = {
  info: 'border-brand-200 bg-brand-50/70 dark:border-brand-500/30 dark:bg-brand-500/10',
  note: 'border-late/30 bg-late-soft',
  tip: 'border-border bg-muted/50',
  warning: 'border-late/40 bg-late-soft',
}

function renderStorage(page: Raw): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const headings = [...page.body.storage.value.matchAll(/<h([23])>(.*?)<\/h\1>/g)].map((m) => m[2])
  const kids = childrenOf(page.id, page.spaceId)
  return page.body.storage.value
    .replace(
      /<ac:structured-macro ac:name="(info|note|tip|warning)"[^>]*>((?:<ac:parameter[^>]*>[^<]*<\/ac:parameter>)*)<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body><\/ac:structured-macro>/g,
      (_: string, kind: string, params: string, body: string) => {
        const title = params.match(/ac:name="title">([^<]*)</)?.[1]
        return `<div class="my-4 rounded-lg border px-4 py-2 ${panelTone[kind]}">${title ? `<p class="font-medium">${title}</p>` : ''}${body}</div>`
      }
    )
    .replace(
      /<ac:structured-macro ac:name="expand"[^>]*><ac:parameter ac:name="title">([^<]*)<\/ac:parameter><ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body><\/ac:structured-macro>/g,
      '<details class="my-3 rounded-lg border px-4 py-2"><summary class="cursor-pointer font-medium">$1</summary>$2</details>'
    )
    .replace(
      /<ac:structured-macro ac:name="drawio"[\s\S]*?<ac:parameter ac:name="diagramName">([^<]+)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/g,
      '<figure class="my-4 grid h-56 place-items-center rounded-lg border border-dashed bg-muted/30 text-sm text-muted-foreground"><span>draw.io-Diagramm „$1“ (Anhang $1.drawio)</span></figure>'
    )
    .replace(
      /<ac:image[^>]*>\s*<ri:attachment ri:filename="([^"]+)"\s*\/>\s*<\/ac:image>/g,
      '<figure class="my-4 grid h-48 place-items-center rounded-lg border border-dashed bg-muted/30 text-sm text-muted-foreground"><span>Screenshot: $1</span></figure>'
    )
    .replace(/<ac:structured-macro ac:name="children"[\s\S]*?<\/ac:structured-macro>/g, () =>
      kids.length ? `<ul>${kids.map((k) => `<li><a data-page="${k.id}" class="cursor-pointer text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">${esc(k.title)}</a></li>`).join('')}</ul>` : ''
    )
    .replace(/<ac:structured-macro ac:name="toc"[\s\S]*?<\/ac:structured-macro>/g, () => (headings.length ? `<ul>${headings.map((h) => `<li>${h}</li>`).join('')}</ul>` : ''))
    .replace(/<ac:structured-macro ac:name="jira"[\s\S]*?<ac:parameter ac:name="key">([^<]+)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/g, '<span class="rounded border px-1.5 font-mono text-xs">$1</span>')
    .replace(/<ac:link><ri:page ri:content-title="([^"]+)"[^>]*\/><ac:plain-text-link-body><!\[CDATA\[([^\]]*)\]\]><\/ac:plain-text-link-body><\/ac:link>/g, '<span class="text-brand-700 dark:text-brand-300">$2</span>')
    .replace(/<colgroup>[\s\S]*?<\/colgroup>/g, '')
}
