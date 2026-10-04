/**
 * Shared pieces for the source browsers on the Daten page: code view, diff, a small Markdown
 * renderer (README), ADF rendering (Jira) and a toggle that shows the original API JSON.
 */
import jiraRaw from '@dataset/jira/search_jql.json'
import { Fragment, useState, type ReactNode } from 'react'
import { ChevronRight, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

/* eslint-disable @typescript-eslint/no-explicit-any -- raw API JSON is rendered as delivered */
export type Raw = any

export const blue = 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-200'

/** Atlassian account id → display name, collected from everything Jira returns. */
export const accountNames: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  const add = (u: Raw) => u?.accountId && (map[u.accountId] = u.displayName)
  for (const i of (jiraRaw as Raw).issues) {
    add(i.fields.assignee)
    add(i.fields.reporter)
    for (const c of i.fields.comment.comments) add(c.author)
  }
  return map
})()

export const initials = (name = '?') =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export function PersonChip({ name, className }: { name?: string | null; className?: string }) {
  if (!name) return <span className='text-sm text-muted-foreground'>Nicht zugewiesen</span>
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm', className)}>
      <Avatar className='size-6'>
        <AvatarFallback className='bg-brand-50 text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'>{initials(name)}</AvatarFallback>
      </Avatar>
      {name}
    </span>
  )
}

export const fmtDateTime = (iso: string) => new Date(iso.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
export const fmtDate = (iso: string) => new Date(iso.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')).toLocaleDateString('de-DE', { dateStyle: 'medium' })

/* ---------- Code with line numbers ---------- */

export function CodeView({ text, json, maxHeight = 640, header }: { text: string; json?: boolean; maxHeight?: number; header?: ReactNode }) {
  const lines = text.replace(/\n$/, '').split('\n')
  const copy = () => {
    void navigator.clipboard?.writeText(text)
    toast.success('Kopiert')
  }
  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground'>
        <span className='min-w-0 truncate'>{header ?? `${lines.length} Zeilen`}</span>
        <Button size='sm' variant='ghost' className='h-7 shrink-0' onClick={copy}>
          <Copy className='size-3.5' /> Kopieren
        </Button>
      </div>
      <pre className='overflow-auto py-2 font-mono text-[12px] leading-5' style={{ maxHeight }}>
        {lines.map((l, i) => (
          <div key={i} className='flex hover:bg-muted/50'>
            <span className='w-12 shrink-0 pe-3 text-right text-muted-foreground/50 select-none'>{i + 1}</span>
            <span className='pe-4 whitespace-pre'>{json ? <JsonLine line={l} /> : l || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}

function JsonLine({ line }: { line: string }) {
  const m = line.match(/^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)(.*)$/)
  const value = (v: string) => (/^\s*(-?\d|true|false|null)/.test(v) ? <span className='text-muted-foreground'>{v}</span> : v)
  if (!m) return <>{value(line)}</>
  return (
    <>
      {m[1]}
      <span className='text-brand-700 dark:text-brand-300'>{m[2]}</span>
      {m[3]}
      {value(m[4])}
    </>
  )
}

/** "Originaldaten" — the record exactly as the API returned it, folded away until needed. */
export function RawToggle({ data, label = 'Originaldaten der API' }: { data: unknown; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant='ghost' size='sm' className='-ms-2 text-muted-foreground'>
          <ChevronRight className={cn('transition-transform', open && 'rotate-90')} /> {label}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='pt-2'>{open && <CodeView text={JSON.stringify(data, null, 2)} json maxHeight={520} />}</CollapsibleContent>
    </Collapsible>
  )
}

/* ---------- Diff ---------- */

export function DiffFile({ file }: { file: Raw }) {
  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5'>
        <code className='truncate font-mono text-[12px]'>{file.new_path}</code>
        <Badge variant='outline' className='font-normal'>
          {file.new_file ? 'neue Datei' : file.deleted_file ? 'gelöscht' : 'geändert'}
        </Badge>
      </div>
      <pre className='max-h-[420px] overflow-auto font-mono text-[12px] leading-5'>
        {String(file.diff)
          .replace(/\n$/, '')
          .split('\n')
          .map((l: string, i: number) => (
            <div
              key={i}
              className={cn(
                'px-3 whitespace-pre',
                l.startsWith('+') && 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100',
                l.startsWith('-') && 'bg-late-soft text-late-fg',
                l.startsWith('@@') && 'bg-muted/50 text-muted-foreground'
              )}
            >
              {l || ' '}
            </div>
          ))}
      </pre>
    </div>
  )
}

/* ---------- Markdown (README, MR descriptions) ---------- */

function inlineMd(s: string): ReactNode {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('`') ? (
      <code key={i} className='rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]'>
        {part.slice(1, -1)}
      </code>
    ) : part.startsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  )
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) continue
    const h = l.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const size = ['text-2xl', 'text-xl', 'text-lg', 'text-base'][h[1].length - 1]
      blocks.push(<p key={i} className={cn('mt-2 font-medium tracking-tight', size)}>{inlineMd(h[2])}</p>)
      continue
    }
    if (/^\s*[-*] /.test(l)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*] /, ''))
      i--
      blocks.push(
        <ul key={i} className='grid gap-1 ps-5'>
          {items.map((it, k) => {
            const task = it.match(/^\[( |x)\] (.*)$/)
            return (
              <li key={k} className={cn(task ? 'list-none -ms-5 flex items-center gap-2' : 'list-disc')}>
                {task ? (
                  <>
                    <input type='checkbox' checked={task[1] === 'x'} readOnly className='accent-[var(--brand-600)]' />
                    {inlineMd(task[2])}
                  </>
                ) : (
                  inlineMd(it)
                )}
              </li>
            )
          })}
        </ul>
      )
      continue
    }
    blocks.push(<p key={i}>{inlineMd(l)}</p>)
  }
  return <div className='grid gap-3 text-[15px] leading-7'>{blocks}</div>
}

/* ---------- ADF (Jira descriptions and comments) ---------- */

export function Adf({ node }: { node: Raw }): ReactNode {
  if (!node) return null
  const kids = (n: Raw) => (n.content ?? []).map((c: Raw, i: number) => <Adf key={i} node={c} />)
  switch (node.type) {
    case 'doc':
      return <div className='grid gap-3 text-[15px] leading-7'>{kids(node)}</div>
    case 'text':
      return node.marks?.some((m: Raw) => m.type === 'code') ? <code className='rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]'>{node.text}</code> : node.text
    case 'paragraph':
      return <p>{kids(node)}</p>
    case 'heading':
      return <p className='mt-1 text-base font-semibold'>{kids(node)}</p>
    case 'bulletList':
      return <ul className='grid list-disc gap-1 ps-5'>{kids(node)}</ul>
    case 'orderedList':
      return <ol className='grid list-decimal gap-1 ps-5'>{kids(node)}</ol>
    case 'listItem':
      return <li className='[&>p]:inline'>{kids(node)}</li>
    case 'codeBlock':
      return <pre className='overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[12px] leading-5'>{kids(node)}</pre>
    case 'panel':
      return <div className='rounded-lg border border-late/30 bg-late-soft px-3 py-2 text-late-fg'>{kids(node)}</div>
    default:
      return <>{kids(node)}</>
  }
}
