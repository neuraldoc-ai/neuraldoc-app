/**
 * A repository as a real IDE (Monaco, the editor of VS Code): explorer, search, commit history and merge requests
 * in the side bar, files / commits / merge requests as editor tabs, diffs in a diff editor, status bar.
 * The data comes from a RepoSource: the MOBIQ GitLab sample (showcase-source.ts) or an imported repository (project-source.ts).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  BookOpen,
  Braces,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Coffee,
  Columns2,
  Copy,
  Database,
  Eye,
  File,
  FileCode2,
  FileCog,
  FilePlus2,
  FileText,
  FileX2,
  FileDiff,
  Files,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Rows2,
  Search,
  SquareCode,
  Table2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Markdown, RawToggle, fmtDate, fmtDateTime, type Raw } from '../shared'
import { CodeEditor, DiffViewer, type Cursor } from './editors'
import { buildTree, languageOf, parseDiff, searchFiles, type TreeNode } from './model'

/** What the IDE shows: files with content and last commit, history, merge requests and the diffs of a commit. */
export type RepoSource = {
  repo: { project: string; ref: string | null; head: Raw | null; files: Record<string, Raw> }
  commits: Raw[]
  mrs: Raw[]
  diffsOf: (id: string) => Raw[] | Promise<Raw[]>
  commitsOfMr: (m: Raw) => Raw[]
  /** Shown in the title bar, e.g. „schreibgeschützt“. */
  note?: string
}

const SourceContext = createContext<RepoSource | null>(null)
const useSource = () => useContext(SourceContext)!

type Tab = { kind: 'file' | 'commit' | 'mr'; id: string }
type Panel = 'explorer' | 'search' | 'commits' | 'mrs'

const tabKey = (t: Tab) => `${t.kind}:${t.id}`
const baseName = (p: string) => p.split('/').pop()!

const FILE_ICONS: Record<string, [LucideIcon, string]> = {
  java: [Coffee, 'text-orange-500'],
  kt: [FileCode2, 'text-violet-500'],
  pas: [FileCode2, 'text-sky-600'],
  ts: [FileCode2, 'text-blue-500'],
  tsx: [FileCode2, 'text-cyan-500'],
  sql: [Database, 'text-amber-500'],
  yaml: [FileCog, 'text-rose-500'],
  yml: [FileCog, 'text-rose-500'],
  json: [Braces, 'text-yellow-500'],
  xml: [FileCode2, 'text-emerald-500'],
  jmx: [FileCode2, 'text-emerald-500'],
  html: [FileCode2, 'text-orange-600'],
  md: [BookOpen, 'text-sky-500'],
  csv: [Table2, 'text-green-600'],
  rc: [FileText, 'text-slate-500'],
}

function FileIcon({ path, className }: { path: string; className?: string }) {
  const ext = path.includes('.') ? path.split('.').pop()!.toLowerCase() : ''
  const [Icon, color] = FILE_ICONS[ext] ?? [File, 'text-muted-foreground']
  return <Icon className={cn('size-4 shrink-0', color, className)} />
}

export default function Workbench({ source }: { source: RepoSource }) {
  return (
    <SourceContext.Provider value={source}>
      <Ide />
    </SourceContext.Provider>
  )
}

/** README at the top level if there is one, otherwise the first file. */
const startFile = (files: Record<string, Raw>) => Object.keys(files).find((p) => /^readme(\.md)?$/i.test(p)) ?? Object.keys(files).sort()[0]

function Ide() {
  const { repo, commits, mrs, note } = useSource()
  const commitById = (id: string) => commits.find((c) => c.id === id)
  const mrByIid = (iid: string) => mrs.find((m) => String(m.iid) === iid)
  const tree = useMemo(() => buildTree(Object.keys(repo.files)), [repo])
  const first = startFile(repo.files)
  const [panel, setPanel] = useState<Panel | null>('explorer')
  const [width, setWidth] = useState(288)
  const [tabs, setTabs] = useState<Tab[]>(first ? [{ kind: 'file', id: first }] : [])
  const [active, setActive] = useState(first ? `file:${first}` : '')
  const [reveal, setReveal] = useState<{ line: number; nonce: number }>()
  const [cursor, setCursor] = useState<Cursor>({ line: 1, column: 1, selected: 0 })
  const [source, setSource] = useState<Record<string, boolean>>({})
  const [sideBySide, setSideBySide] = useState(true)
  const [quickOpen, setQuickOpen] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set(tree.children.filter((n) => !n.file).map((n) => n.path)))
  const root = useRef<HTMLDivElement>(null)

  const open = (tab: Tab, line?: number) => {
    setTabs((t) => (t.some((x) => tabKey(x) === tabKey(tab)) ? t : [...t, tab]))
    setActive(tabKey(tab))
    if (tab.kind === 'file') {
      const parts = tab.id.split('/')
      setExpanded((s) => new Set([...s, ...parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))]))
      if (line) setReveal({ line, nonce: Date.now() })
    }
  }
  const openFile = (path: string, line?: number) => open({ kind: 'file', id: path }, line)

  const close = (key: string) => {
    const index = tabs.findIndex((t) => tabKey(t) === key)
    const rest = tabs.filter((t) => tabKey(t) !== key)
    setTabs(rest)
    if (key === active) setActive(rest.length ? tabKey(rest[Math.min(index, rest.length - 1)]) : '')
  }

  const current = tabs.find((t) => tabKey(t) === active)
  const file = current?.kind === 'file' ? repo.files[current.id] : undefined

  useEffect(() => {
    root.current?.querySelector('[data-tab-active=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 'p') {
      e.preventDefault()
      setQuickOpen(true)
    } else if (k === 'b') {
      e.preventDefault()
      setPanel((p) => (p ? null : 'explorer'))
    } else if (e.shiftKey && k === 'f') {
      e.preventDefault()
      setPanel('search')
    }
  }

  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p))
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const left = target.parentElement!.getBoundingClientRect().left + 44
    const move = (ev: PointerEvent) => setWidth(Math.min(520, Math.max(200, ev.clientX - left)))
    const stop = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', stop)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', stop)
  }

  const activity: { id: Panel; icon: LucideIcon; label: string }[] = [
    { id: 'explorer', icon: Files, label: 'Explorer (Strg+B)' },
    { id: 'search', icon: Search, label: 'Suchen (Strg+Umschalt+F)' },
    ...(commits.length ? [{ id: 'commits' as const, icon: GitCommitHorizontal, label: 'Verlauf' }] : []),
    ...(mrs.length ? [{ id: 'mrs' as const, icon: GitMerge, label: 'Merge-Requests' }] : []),
  ]

  return (
    <div ref={root} onKeyDown={onKeyDown} className='flex h-[min(780px,calc(100vh-7rem))] min-h-[500px] flex-col overflow-hidden rounded-xl border bg-card text-sm shadow-xs'>
      <div className='flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-1.5'>
        <span className='flex min-w-0 items-center gap-2 text-[13px] font-medium'>
          <SquareCode className='size-4 shrink-0 text-brand-600' />
          <span className='truncate'>{repo.project}</span>
          <span className='hidden text-xs font-normal text-muted-foreground sm:inline'>{note ?? 'schreibgeschützt'}</span>
        </span>
        <button
          type='button'
          onClick={() => setQuickOpen(true)}
          className='flex w-56 max-w-[50%] items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:border-brand-300 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
        >
          <Search className='size-3.5' /> <span className='truncate'>Datei suchen …</span>
          <kbd className='ms-auto hidden rounded border px-1 font-mono text-[10px] sm:inline'>Strg P</kbd>
        </button>
      </div>

      <div className='flex min-h-0 flex-1'>
        <nav className='flex w-11 shrink-0 flex-col items-center gap-1 border-e bg-muted/30 py-2' aria-label='Ansichten'>
          {activity.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type='button'
              title={label}
              aria-label={label}
              aria-pressed={panel === id}
              onClick={() => togglePanel(id)}
              className={cn(
                'relative grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                panel === id && 'text-foreground before:absolute before:inset-y-1.5 before:-start-1 before:w-0.5 before:rounded-full before:bg-brand-600'
              )}
            >
              <Icon className='size-[18px]' />
            </button>
          ))}
        </nav>

        {panel && (
          <>
            <aside style={{ width }} className='flex shrink-0 flex-col bg-muted/10' aria-label={activity.find((a) => a.id === panel)?.label}>
              {panel === 'explorer' && <Explorer tree={tree} expanded={expanded} setExpanded={setExpanded} activePath={current?.kind === 'file' ? current.id : ''} onOpen={openFile} />}
              {panel === 'search' && <SearchPanel onOpen={openFile} />}
              {panel === 'commits' && <HistoryPanel activeId={current?.kind === 'commit' ? current.id : ''} onOpen={(id) => open({ kind: 'commit', id })} />}
              {panel === 'mrs' && <MergeRequestPanel activeId={current?.kind === 'mr' ? current.id : ''} onOpen={(id) => open({ kind: 'mr', id })} />}
            </aside>
            <div role='separator' aria-orientation='vertical' aria-label='Seitenleiste verbreitern' onPointerDown={startResize} className='-ms-px w-1 shrink-0 cursor-col-resize border-s hover:bg-brand-300/60 active:bg-brand-400/70' />
          </>
        )}

        <main className='flex min-w-0 flex-1 flex-col'>
          <div role='tablist' aria-label='Geöffnete Editoren' className='flex shrink-0 overflow-x-auto border-b bg-muted/30 [scrollbar-width:thin]'>
            {tabs.map((t) => {
              const key = tabKey(t)
              const isActive = key === active
              const c = t.kind === 'commit' ? commitById(t.id) : undefined
              const label = t.kind === 'file' ? baseName(t.id) : t.kind === 'commit' ? c?.short_id.slice(0, 7) : mrByIid(t.id)?.reference ?? `!${t.id}`
              const title = t.kind === 'file' ? t.id : t.kind === 'commit' ? c?.title : mrByIid(t.id)?.title
              return (
                <div
                  key={key}
                  role='tab'
                  aria-selected={isActive}
                  data-tab-active={isActive}
                  title={title}
                  onAuxClick={(e) => e.button === 1 && close(key)}
                  className={cn('group relative flex shrink-0 items-center border-e text-[13px]', isActive ? 'bg-card text-foreground after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-brand-600' : 'text-muted-foreground hover:bg-muted/60')}
                >
                  <button type='button' onClick={() => setActive(key)} className='flex items-center gap-1.5 py-2 ps-3 pe-1 focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-[3px] focus-visible:ring-ring/50'>
                    {t.kind === 'file' ? <FileIcon path={t.id} /> : t.kind === 'commit' ? <GitCommitHorizontal className='size-4 shrink-0 text-brand-600' /> : <GitMerge className='size-4 shrink-0 text-brand-600' />}
                    <span className={cn(t.kind !== 'file' && 'font-mono text-xs')}>{label}</span>
                  </button>
                  <button type='button' aria-label={`${label} schließen`} onClick={() => close(key)} className={cn('me-1.5 grid size-5 place-items-center rounded hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none', !isActive && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}>
                    <X className='size-3.5' />
                  </button>
                </div>
              )
            })}
          </div>

          <div className='min-h-0 flex-1'>
            {current?.kind === 'file' && file && (
              <FileView
                key='file'
                path={current.id}
                file={file}
                preview={!source[current.id]}
                onTogglePreview={() => setSource((s) => ({ ...s, [current.id]: !s[current.id] }))}
                reveal={reveal}
                onCursor={setCursor}
                onOpenCommit={(id) => open({ kind: 'commit', id })}
              />
            )}
            {current?.kind === 'commit' && commitById(current.id) && (
              <CommitView key={current.id} commit={commitById(current.id)!} sideBySide={sideBySide} setSideBySide={setSideBySide} onOpenFile={openFile} />
            )}
            {current?.kind === 'mr' && mrByIid(current.id) && <MergeRequestView key={current.id} mr={mrByIid(current.id)!} onOpenCommit={(id) => open({ kind: 'commit', id })} />}
            {!current && <Welcome onQuickOpen={() => setQuickOpen(true)} onOpen={openFile} />}
          </div>
        </main>
      </div>

      <footer className='flex shrink-0 items-center justify-between gap-3 bg-brand-700 px-3 py-1 text-xs text-white'>
        <span className='flex min-w-0 items-center gap-3'>
          {repo.ref && (
            <span className='flex shrink-0 items-center gap-1'>
              <GitBranch className='size-3.5' /> {repo.ref}
            </span>
          )}
          {repo.head && (
            <span className='hidden truncate sm:inline'>
              {repo.head.short_id.slice(0, 7)} {repo.head.title}
            </span>
          )}
        </span>
        <span className='flex shrink-0 items-center gap-4'>
          {current?.kind === 'file' && file && (
            <>
              <span>
                Zeile {cursor.line}, Spalte {cursor.column}
                {cursor.selected > 0 && ` (${cursor.selected} markiert)`}
              </span>
              <span className='hidden sm:inline'>UTF-8</span>
              <span className='hidden sm:inline'>LF</span>
              <span>{languageOf(current.id).label}</span>
            </>
          )}
          {current?.kind === 'commit' && <span>Diff-Editor</span>}
          <span className='hidden md:inline'>F1: Befehle</span>
        </span>
      </footer>

      <QuickOpen open={quickOpen} onOpenChange={setQuickOpen} onSelect={(p) => { setQuickOpen(false); openFile(p) }} />
    </div>
  )
}

/* ---------- Side bar panels ---------- */

function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className='flex h-9 shrink-0 items-center justify-between ps-4 pe-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'>
      <span>{title}</span>
      <span className='flex items-center'>{children}</span>
    </div>
  )
}

function Explorer({ tree, expanded, setExpanded, activePath, onOpen }: { tree: TreeNode; expanded: Set<string>; setExpanded: (s: Set<string>) => void; activePath: string; onOpen: (p: string) => void }) {
  const { repo } = useSource()
  const toggle = (path: string) => {
    const next = new Set(expanded)
    if (!next.delete(path)) next.add(path)
    setExpanded(next)
  }
  return (
    <>
      <PanelHeader title={repo.project}>
        <button type='button' title='Alle Ordner einklappen' aria-label='Alle Ordner einklappen' onClick={() => setExpanded(new Set())} className='grid size-6 place-items-center rounded hover:bg-muted'>
          <ChevronsDownUp className='size-3.5' />
        </button>
      </PanelHeader>
      <div role='tree' aria-label='Dateien' className='min-h-0 flex-1 overflow-auto pb-2'>
        {tree.children.map((n) => (
          <TreeRow key={n.path} node={n} depth={0} expanded={expanded} toggle={toggle} activePath={activePath} onOpen={onOpen} />
        ))}
      </div>
    </>
  )
}

function TreeRow({ node, depth, expanded, toggle, activePath, onOpen }: { node: TreeNode; depth: number; expanded: Set<string>; toggle: (p: string) => void; activePath: string; onOpen: (p: string) => void }) {
  const pad = { paddingInlineStart: 10 + depth * 12 }
  if (node.file)
    return (
      <button
        type='button'
        role='treeitem'
        aria-selected={activePath === node.path}
        onClick={() => onOpen(node.path)}
        style={pad}
        className={cn('flex w-full items-center gap-1.5 py-[3px] pe-2 text-left text-[13px] hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none', activePath === node.path && 'bg-brand-50 text-brand-800 hover:bg-brand-50 dark:bg-brand-500/20 dark:text-brand-100')}
      >
        <span className='w-3 shrink-0' />
        <FileIcon path={node.path} />
        <span className='truncate'>{node.name}</span>
      </button>
    )
  const isOpen = expanded.has(node.path)
  return (
    <div role='group'>
      <button type='button' role='treeitem' aria-expanded={isOpen} onClick={() => toggle(node.path)} style={pad} className='flex w-full items-center gap-1.5 py-[3px] pe-2 text-left text-[13px] hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none'>
        {isOpen ? <ChevronDown className='size-3 shrink-0' /> : <ChevronRight className='size-3 shrink-0' />}
        {isOpen ? <FolderOpen className='size-4 shrink-0 text-brand-600' /> : <Folder className='size-4 shrink-0 text-brand-600' />}
        <span className='truncate'>{node.name}</span>
      </button>
      {isOpen && node.children.map((c) => <TreeRow key={c.path} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} activePath={activePath} onOpen={onOpen} />)}
    </div>
  )
}

function SearchPanel({ onOpen }: { onOpen: (path: string, line: number) => void }) {
  const { repo } = useSource()
  const [query, setQuery] = useState('')
  const { hits, total } = useMemo(() => searchFiles(repo.files, query), [repo, query])
  return (
    <>
      <PanelHeader title='Suche' />
      <div className='px-3 pb-2'>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='In allen Dateien suchen'
          aria-label='In allen Dateien suchen'
          className='w-full rounded-md border bg-background px-2.5 py-1.5 text-[13px] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
        />
        {query && (
          <p className='mt-2 text-xs text-muted-foreground'>
            {total} {total === 1 ? 'Treffer' : 'Treffer'} in {hits.length} {hits.length === 1 ? 'Datei' : 'Dateien'}
          </p>
        )}
      </div>
      <div className='min-h-0 flex-1 overflow-auto pb-2'>
        {hits.map((h) => (
          <div key={h.path}>
            <div className='flex items-center gap-1.5 px-3 py-1 text-[13px] font-medium'>
              <FileIcon path={h.path} />
              <span className='truncate' title={h.path}>{baseName(h.path)}</span>
              <span className='truncate text-xs font-normal text-muted-foreground'>{h.path.split('/').slice(0, -1).join('/')}</span>
              <Badge variant='secondary' className='ms-auto px-1.5 py-0 text-[10px]'>{h.matches.length}</Badge>
            </div>
            {h.matches.map((m) => {
              const lead = m.text.length - m.text.trimStart().length
              const text = m.text.trim()
              const from = m.from - lead
              return (
                <button key={m.line} type='button' onClick={() => onOpen(h.path, m.line)} className='flex w-full gap-2 py-[3px] ps-8 pe-3 text-left font-mono text-xs hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none'>
                  <span className='w-7 shrink-0 text-end text-muted-foreground/70'>{m.line}</span>
                  <span className='truncate'>
                    {text.slice(0, from)}
                    <mark className='rounded-sm bg-brand-200 text-foreground dark:bg-brand-500/40'>{text.slice(from, from + query.length)}</mark>
                    {text.slice(from + query.length)}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

function HistoryPanel({ activeId, onOpen }: { activeId: string; onOpen: (id: string) => void }) {
  const { commits } = useSource()
  return (
    <>
      <PanelHeader title={`Verlauf · ${commits.length} Commits`} />
      <div className='min-h-0 flex-1 overflow-auto pb-2'>
        {commits.map((c) => {
          const merge = c.parent_ids.length > 1
          return (
            <button key={c.id} type='button' onClick={() => onOpen(c.id)} className={cn('relative block w-full py-1.5 ps-9 pe-3 text-left hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none', activeId === c.id && 'bg-brand-50 dark:bg-brand-500/20')}>
              <span aria-hidden className='absolute inset-y-0 start-[19px] w-px bg-border' />
              <span aria-hidden className={cn('absolute start-[14px] top-[13px] size-[11px] rounded-full border-2 bg-card', merge ? 'border-brand-600 bg-brand-600' : 'border-muted-foreground/60')} />
              <span className={cn('block truncate text-[13px]', merge && 'text-muted-foreground')}>{c.title}</span>
              <span className='flex items-center gap-2 text-[11px] text-muted-foreground'>
                <span className='truncate'>{c.author_name} · {fmtDate(c.authored_date)}</span>
                <code className='ms-auto shrink-0 font-mono'>{c.short_id.slice(0, 7)}</code>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function MergeRequestPanel({ activeId, onOpen }: { activeId: string; onOpen: (iid: string) => void }) {
  const { mrs } = useSource()
  return (
    <>
      <PanelHeader title={`Merge-Requests · ${mrs.length}`} />
      <div className='min-h-0 flex-1 overflow-auto pb-2'>
        {mrs.map((m) => (
          <button key={m.iid} type='button' onClick={() => onOpen(String(m.iid))} className={cn('block w-full px-4 py-2 text-left hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none', activeId === String(m.iid) && 'bg-brand-50 dark:bg-brand-500/20')}>
            <span className='flex items-center gap-1.5 text-[13px]'>
              <GitMerge className='size-3.5 shrink-0 text-brand-600' />
              <span className='truncate'>{m.title}</span>
            </span>
            <span className='block truncate ps-5 text-[11px] text-muted-foreground'>
              {m.reference ?? `!${m.iid}`}{m.source_branch ? ` · ${m.source_branch}` : ''} · {m.author.name}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

/* ---------- Editor area ---------- */

function Welcome({ onQuickOpen, onOpen }: { onQuickOpen: () => void; onOpen: (p: string) => void }) {
  const readme = Object.keys(useSource().repo.files).find((p) => /^readme(\.md)?$/i.test(p))
  return (
    <div className='grid h-full place-content-center justify-items-center gap-4 p-6 text-center text-muted-foreground'>
      <SquareCode className='size-12 text-brand-600/60' />
      <p>Kein Editor geöffnet. Datei im Explorer wählen oder</p>
      <div className='flex flex-wrap justify-center gap-2'>
        <Button size='sm' variant='outline' onClick={onQuickOpen}>
          <Search className='size-3.5' /> Datei suchen (Strg+P)
        </Button>
        {readme && (
          <Button size='sm' variant='outline' onClick={() => onOpen(readme)}>
            <BookOpen className='size-3.5' /> README öffnen
          </Button>
        )}
      </div>
    </div>
  )
}

function Breadcrumbs({ path, children }: { path: string; children?: ReactNode }) {
  const parts = path.split('/')
  return (
    <div className='flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1 text-xs text-muted-foreground'>
      <ol className='flex min-w-0 items-center gap-0.5 overflow-hidden'>
        {parts.map((p, i) => (
          <li key={i} className={cn('flex shrink-0 items-center gap-0.5', i === parts.length - 1 && 'min-w-0 text-foreground')}>
            {i > 0 && <ChevronRight className='size-3' />}
            {i === parts.length - 1 && <FileIcon path={path} className='size-3.5' />}
            <span className='truncate'>{p}</span>
          </li>
        ))}
      </ol>
      <div className='flex shrink-0 items-center gap-1'>{children}</div>
    </div>
  )
}

function ToolButton({ icon: Icon, label, onClick, active }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <Button size='sm' variant='ghost' className={cn('h-6 gap-1 px-2 text-xs', active && 'bg-muted text-foreground')} onClick={onClick} aria-pressed={active}>
      <Icon className='size-3.5' /> <span className='hidden md:inline'>{label}</span>
    </Button>
  )
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text)
  toast.success('Kopiert')
}

function FileView({ path, file, preview, onTogglePreview, reveal, onCursor, onOpenCommit }: { path: string; file: Raw; preview: boolean; onTogglePreview: () => void; reveal?: { line: number; nonce: number }; onCursor: (c: Cursor) => void; onOpenCommit: (id: string) => void }) {
  const { commits } = useSource()
  const isMd = /\.(md|mdx|markdown)$/i.test(path)
  const last = file.lastCommit && commits.find((c) => c.id.startsWith(file.lastCommit.short_id) || file.lastCommit.short_id.startsWith(c.short_id))
  return (
    <div className='flex h-full flex-col'>
      <Breadcrumbs path={path}>
        {last && (
          <button type='button' onClick={() => onOpenCommit(last.id)} className='me-1 hidden max-w-72 items-center gap-1.5 truncate rounded px-1.5 py-0.5 hover:bg-muted lg:flex' title='Letzte Änderung öffnen'>
            <GitCommitHorizontal className='size-3.5 shrink-0' />
            <span className='truncate'>{file.lastCommit.short_id} {file.lastCommit.title} · {file.lastCommit.author_name}, {fmtDate(file.lastCommit.authored_date ?? file.lastCommit.committed_date)}</span>
          </button>
        )}
        {isMd && <ToolButton icon={preview ? SquareCode : Eye} label={preview ? 'Quelltext' : 'Vorschau'} onClick={onTogglePreview} />}
        <ToolButton icon={Copy} label='Kopieren' onClick={() => copy(file.content)} />
      </Breadcrumbs>
      <div className='min-h-0 flex-1'>
        {isMd && preview ? (
          <div className='h-full overflow-auto p-6'>
            <div className='mx-auto max-w-3xl'>
              <Markdown text={file.content} />
            </div>
          </div>
        ) : (
          <CodeEditor path={file.extracted ? `${path}.txt` : path} text={file.content} reveal={reveal?.line ? reveal : undefined} onCursor={onCursor} />
        )}
      </div>
    </div>
  )
}

function CommitView({ commit: c, sideBySide, setSideBySide, onOpenFile }: { commit: Raw; sideBySide: boolean; setSideBySide: (v: boolean) => void; onOpenFile: (p: string) => void }) {
  const { repo, diffsOf } = useSource()
  const files = useDiffs(diffsOf, c.id)
  const [selected, setSelected] = useState(0)
  const counts = useMemo(() => files.map((f) => parseDiff(String(f.diff))), [files])
  const merge = c.parent_ids.length > 1
  const file = files[selected]
  return (
    <div className='flex h-full flex-col'>
      <div className='max-h-[45%] shrink-0 overflow-auto border-b px-5 py-3'>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <h3 className='flex min-w-0 items-center gap-2 text-base font-medium'>
            {merge ? <GitMerge className='size-4 shrink-0 text-brand-600' /> : <GitCommitHorizontal className='size-4 shrink-0 text-brand-600' />}
            {c.title}
          </h3>
          <button type='button' onClick={() => copy(c.id)} title='Commit-Hash kopieren' className='flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-muted'>
            {c.short_id.slice(0, 8)} <Copy className='size-3' />
          </button>
        </div>
        <p className='mt-1 text-xs text-muted-foreground'>
          {c.author_name} · {fmtDateTime(c.authored_date)} · <span className='text-brand-600'>+{c.stats.additions}</span> −{c.stats.deletions}
          {merge && ' · Merge-Commit: übernimmt einen Feature-Branch ins Release'}
        </p>
        {c.message.trim() !== c.title && <pre className='mt-3 rounded-lg bg-muted/40 p-3 text-[13px] whitespace-pre-wrap'>{c.message.trim()}</pre>}
        <div className='mt-3'>
          <RawToggle data={c} />
        </div>
      </div>
      {file ? (
        <>
          <div className='flex shrink-0 items-center justify-between gap-2 border-b bg-muted/20 pe-2'>
            <div role='tablist' aria-label='Geänderte Dateien' className='flex min-w-0 overflow-x-auto [scrollbar-width:thin]'>
              {files.map((f, i) => {
                const Icon = f.new_file ? FilePlus2 : f.deleted_file ? FileX2 : FileDiff
                return (
                  <button key={f.new_path} type='button' role='tab' aria-selected={i === selected} title={f.new_path} onClick={() => setSelected(i)} className={cn('flex shrink-0 items-center gap-1.5 border-e px-3 py-1.5 text-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset', i === selected ? 'bg-card text-foreground' : 'text-muted-foreground hover:bg-muted/60')}>
                    <Icon className={cn('size-3.5', f.new_file ? 'text-emerald-500' : f.deleted_file ? 'text-red-500' : 'text-amber-500')} />
                    {baseName(f.new_path)}
                    <span className='font-mono text-[10px]'>
                      <span className='text-emerald-600'>+{counts[i].added}</span> <span className='text-red-500'>−{counts[i].removed}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div className='flex shrink-0 items-center'>
              {repo.files[file.new_path] && <ToolButton icon={File} label='Datei öffnen' onClick={() => onOpenFile(file.new_path)} />}
              <ToolButton icon={sideBySide ? Columns2 : Rows2} label={sideBySide ? 'Nebeneinander' : 'Inline'} onClick={() => setSideBySide(!sideBySide)} />
            </div>
          </div>
          <div className='min-h-0 flex-1'>
            <DiffViewer diff={String(file.diff)} path={file.new_path} sideBySide={sideBySide} />
          </div>
        </>
      ) : files === EMPTY_LOADING ? (
        <p role='status' className='p-6 text-sm text-muted-foreground'>Änderungen werden geladen …</p>
      ) : (
        <p className='p-6 text-sm text-muted-foreground'>{merge ? 'Dieser Merge-Commit bringt keine eigenen Änderungen mit, die Dateiänderungen stehen in den Commits des Branches.' : 'Keine Dateiänderungen.'}</p>
      )}
    </div>
  )
}

function MergeRequestView({ mr: m, onOpenCommit }: { mr: Raw; onOpenCommit: (id: string) => void }) {
  const mine = useSource().commitsOfMr(m)
  return (
    <div className='h-full overflow-auto p-6'>
      <div className='mx-auto grid max-w-3xl gap-5'>
        <div>
          <h3 className='flex items-center gap-2 text-lg font-medium'>
            <GitMerge className='size-5 shrink-0 text-brand-600' /> {m.reference ?? `!${m.iid}`} {m.title}
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
            {m.source_branch && m.target_branch ? `${m.source_branch} → ${m.target_branch} · ` : ''}{m.author.name} · gemergt {fmtDate(m.merged_at)}{m.merged_by?.name ? ` von ${m.merged_by.name}` : ''}
          </p>
          <div className='mt-2 flex flex-wrap gap-1'>
            {m.labels.map((l: string) => (
              <Badge key={l} variant='secondary' className='font-normal'>{l}</Badge>
            ))}
          </div>
        </div>
        {m.description?.trim() && (
          <div className='rounded-lg border p-5'>
            <Markdown text={m.description} />
          </div>
        )}
        <div className='grid gap-1'>
          <span className='mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider'>{mine.length} Commits</span>
          {mine.map((c) => (
            <button key={c.id} type='button' onClick={() => onOpenCommit(c.id)} className='flex items-center gap-3 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'>
              <GitCommitHorizontal className='size-4 shrink-0 text-muted-foreground' />
              <code className='font-mono text-xs text-muted-foreground'>{c.short_id.slice(0, 8)}</code>
              <span className='truncate'>{c.title}</span>
            </button>
          ))}
        </div>
        <RawToggle data={m} />
      </div>
    </div>
  )
}

function QuickOpen({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (o: boolean) => void; onSelect: (path: string) => void }) {
  const { repo } = useSource()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className='sr-only'>
        <DialogTitle>Datei suchen</DialogTitle>
        <DialogDescription>Datei im Repository per Name öffnen</DialogDescription>
      </DialogHeader>
      <DialogContent className='overflow-hidden p-0' showCloseButton={false}>
        <Command>
          <CommandInput placeholder='Dateiname eingeben …' />
          <CommandList>
            <CommandEmpty>Keine Datei gefunden.</CommandEmpty>
            {Object.keys(repo.files).map((p) => (
              <CommandItem key={p} value={p} onSelect={() => onSelect(p)}>
                <FileIcon path={p} />
                <span>{baseName(p)}</span>
                <span className='truncate text-xs text-muted-foreground'>{p.split('/').slice(0, -1).join('/')}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Diffs: synchronous for the sample, fetched for an imported repository ---------- */

const EMPTY_LOADING: Raw[] = []

function useDiffs(diffsOf: RepoSource['diffsOf'], id: string): Raw[] {
  const initial = useMemo(() => diffsOf(id), [diffsOf, id])
  const [loaded, setLoaded] = useState<{ id: string; files: Raw[] } | null>(null)
  useEffect(() => {
    if (!(initial instanceof Promise)) return
    let live = true
    initial.then((files) => { if (live) setLoaded({ id, files }) }).catch(() => { if (live) setLoaded({ id, files: [] }) })
    return () => { live = false }
  }, [initial, id])
  if (!(initial instanceof Promise)) return initial
  return loaded?.id === id ? loaded.files : EMPTY_LOADING
}
