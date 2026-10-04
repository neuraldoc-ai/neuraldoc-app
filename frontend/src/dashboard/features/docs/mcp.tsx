/**
 * MCP: neuraldoc for the developer's agent. Three tools only (check_change, ask, ticket_context);
 * neuraldoc reads GitLab, Jira, Confluence and SharePoint itself and hands back only what is needed.
 * Talks to the real server mounted at /mcp (mcp/handler.mjs).
 */
import { useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Ban,
  Check,
  CircleHelp,
  Copy,
  FileQuestion,
  GitPullRequestArrow,
  Hand,
  KeyRound,
  MessageCircleQuestion,
  MessageSquare,
  PenLine,
  Play,
  Ticket,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { datasetMode, docs, release, type DocTypeId } from './data'
import { blueSoft, typeIcon } from './overview-icons'
import { Frame } from './ui'
import { UsageSection } from './usage'

/* ---------- Server types ---------- */

type ToolName = 'check_change' | 'ask' | 'ticket_context'
type Person = { id: string; name: string; role: string }
type Approver = Person & { self: boolean }
type Rules = { approvers: Record<DocTypeId, string>; writeBack: boolean; mrComment: boolean }
type Info = {
  token: string
  protocol: string
  stdioPath: string
  tools: { name: ToolName; title: string; description: string; example: Record<string, unknown> }[]
  surfaceTokens: number
  sources: { id: string; name: string; items: string }[]
  rules: Rules
  docTypes: { type: DocTypeId; label: string; audience: string }[]
  people: Person[]
}
type Tokens = { answer: number; raw: number }
type LogEntry = { at: string; client: string; tool: ToolName; ok: boolean; summary: string; tokens?: Tokens }
type Activity = {
  log: LogEntry[]
  checks: { change: string; title: string; mr: string; path: string; at: string; client: string; total: number; approved: number; rejected: number }[]
  questions: { at: string; client: string; question: string; statuses: Partial<Record<Status, number>> }[]
  writebacks: { at: string; proposal: string; doc: string; title: string; target: { system: string; title: string; url: string }; version: number; edited: boolean; by: string }[]
  mrComments: { mr: string; at: string; by: string; text: string }[]
  stats: { calls: number; answer: number; raw: number; perTool: Record<ToolName, { calls: number; answer: number; raw: number }> }
}

type Draft = { id: string; doc: string; docTitle: string; where: string; title: string; confidence: string; state: 'offen' | 'freigegeben' | 'verworfen' }
type CheckData = {
  found: boolean
  known?: { id: string; title: string; ticket: string; mr: string }[]
  via?: string
  change?: { id: string; title: string; ticket: string; mr: string; nature: string; summary: string }
  counts?: { drafts: number; docs: number; approved: number; open: number; rejected: number }
  types?: { type: DocTypeId; label: string; status: 'vorschlaege' | 'passt' | 'nicht' | 'fehlt'; reason: string; approver: Approver; drafts: Draft[] }[]
  questions?: { id: string; title: string; ask: string }[]
  tasks?: { id: string; title: string; task: string; doc: string }[]
  mrComment?: string | null
  impacts?: { id: string; sourceId: string; title: string; section: string; what: string; kind: string }[]
  coverage?: { scanned: number; affected: number; locations: number; unassigned: unknown[]; warnings: string[]; limitation: string }
}
type Status = 'stimmt' | 'veraltet' | 'unvollstaendig' | 'aktualisiert'
type Verified = { status: Status; doc: string; docTitle: string; type: DocTypeId; chapter: string; quote: string; code: string | null; because: { ticket: string; commits: string[]; method?: string } | null; draft: { id: string; title: string } | null }
type AskData = { question: string; release: string; found: Verified[]; change: { title: string; ticket: string; mr: string; summary: string } | null }
type TicketData = {
  ticket: { key: string; summary: string; type: string; status: string; fixVersions: string[]; description: string; url: string }
  related: { id: string; title: string; ticket: string; mr: string; summary: string; own: boolean }[]
  rules: string[]
  today: Verified[]
  files: string[]
  open: { kind: 'ticket' | 'frage'; key: string; text: string; title?: string; status?: string }[]
  later: { type: DocTypeId; label: string; approver: Approver }[]
}

/* ---------- Helpers ---------- */

const getJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}
const postJson = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error ?? r.status)
  return data
}

const endpoint = () => `${window.location.origin}/mcp`
const num = (n: number) => n.toLocaleString('de-DE')
const time = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

const greenSoft = 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'
const lateSoft = 'border-late/30 bg-late-soft text-late-fg'

const toolLook: Record<ToolName, { icon: typeof Ticket; when: string; input: string; returns: string[] }> = {
  ticket_context: { icon: Ticket, when: 'Vor dem Programmieren', input: 'Ticket', returns: ['Regeln aus dem Code', 'Doku-Stand', 'Offene Punkte'] },
  ask: { icon: MessageCircleQuestion, when: 'Bei einer Fachfrage', input: 'Frage', returns: ['Zitate mit Quelle', 'Stimmt oder veraltet'] },
  check_change: { icon: GitPullRequestArrow, when: 'Wenn das Feature fertig ist', input: 'MR, Branch oder Ticket', returns: ['Betroffene Doku', 'Fertige Entwürfe', 'Link zum Freigeben'] },
}
// What the project tools actually return: source search and the imported comparison, no tickets.
const projectLook: Record<ToolName, { input: string; returns: string[] }> = {
  ticket_context: { input: 'Aufgabe', returns: ['Fundstellen in Code und Doku'] },
  ask: { input: 'Frage', returns: ['Fundstellen mit Quelle'] },
  check_change: { input: 'Git-Vergleich', returns: ['Betroffene Doku', 'Entwürfe', 'Link zum Freigeben'] },
}
const ORDER: ToolName[] = ['ticket_context', 'ask', 'check_change']

/* ------------------------------------------------------------------ */

export function McpPage() {
  const info = useQuery({ queryKey: ['mcp', 'info'], queryFn: () => getJson<Info & { server: unknown }>('/api/mcp/info') })
  const activity = useQuery({ queryKey: ['mcp', 'activity'], queryFn: () => getJson<Activity>('/api/mcp/activity'), refetchInterval: 3000 })
  const [tab, setTab] = useState<ToolName>('check_change')
  const tryRef = useRef<HTMLDivElement>(null)

  if (info.isError)
    return (
      <Frame title='MCP'>
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>MCP-Server nicht erreichbar</EmptyTitle>
            <EmptyDescription>Die App mit npm run dev starten; der Server läuft unter /mcp mit.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Frame>
    )
  if (!info.data) return <Frame title='MCP'>{null}</Frame>
  const d = info.data
  const a = activity.data
  const tryOut = (name: ToolName) => {
    setTab(name)
    setTimeout(() => tryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  return (
    <Frame title='MCP' lead={datasetMode === 'working' ? 'Drei Funktionen für den Coding-Agenten. neuraldoc durchsucht dein importiertes Repository und deine Dokumente.' : 'Drei Funktionen für den Coding-Agenten der Entwicklung. neuraldoc liest GitLab, Jira, Confluence und SharePoint selbst und gibt nur das Nötige zurück.'}>
      <div className='grid gap-4 lg:grid-cols-3 [&>*]:min-w-0'>
        <Connect info={d} className='lg:col-span-2' />
        <Savings info={d} activity={a} />
      </div>

      <div className='grid gap-4 md:grid-cols-3 [&>*]:min-w-0'>
        {ORDER.map((name, i) => (
          <ToolCard key={name} step={i + 1} tool={d.tools.find((t) => t.name === name)!} stats={a?.stats.perTool[name]} onTry={() => tryOut(name)} />
        ))}
      </div>

      <div ref={tryRef} className='scroll-mt-20'>
        <Playground info={d} tab={tab} onTab={setTab} />
      </div>

      <div className='grid gap-4 lg:grid-cols-2 [&>*]:min-w-0'>
        <ApprovalRules info={d} />
        <Started activity={a} />
      </div>

      <div className='grid gap-4 xl:grid-cols-3 [&>*]:min-w-0'>
        <Questions activity={a} />
        <CallLog activity={a} info={d} className='xl:col-span-2' />
      </div>
      <UsageSection />
    </Frame>
  )
}

/* ---------- Connect ---------- */

function CopyLine({ value, multiline }: { value: string; multiline?: boolean }) {
  const copy = () => {
    void navigator.clipboard?.writeText(value)
    toast.success('Kopiert')
  }
  return (
    <div className='flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2'>
      <code className={cn('min-w-0 flex-1 font-mono text-[12px]', multiline ? 'break-all whitespace-pre-wrap' : 'truncate')}>{value}</code>
      <Button size='icon' variant='ghost' className='size-7 shrink-0' onClick={copy} aria-label='Kopieren'>
        <Copy className='size-3.5' />
      </Button>
    </div>
  )
}

function Connect({ info, className }: { info: Info; className?: string }) {
  const url = endpoint()
  const auth = `Bearer ${info.token}`
  const snippets: [string, string, string][] = [
    ['claude', 'Claude Code', `claude mcp add --transport http neuraldoc ${url} --header "Authorization: ${auth}"`],
    ['cursor', 'Cursor', JSON.stringify({ mcpServers: { neuraldoc: { url, headers: { Authorization: auth } } } }, null, 2)],
    ['vscode', 'VS Code', JSON.stringify({ servers: { neuraldoc: { type: 'http', url, headers: { Authorization: auth } } } }, null, 2)],
    ['codex', 'Codex', `codex mcp add neuraldoc -- node ${info.stdioPath}

# oder über HTTP (App muss laufen):
setx NEURALDOC_MCP_TOKEN ${info.token}
codex mcp add neuraldoc --url ${url} --bearer-token-env-var NEURALDOC_MCP_TOKEN`],
    ['stdio', 'Lokal (stdio)', `claude mcp add neuraldoc -- node ${info.stdioPath}`],
  ]
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Verbinden</CardTitle>
        <CardDescription className='flex flex-wrap items-center gap-1.5'>
          <KeyRound className='size-3.5' /> Ein Endpunkt, Zugangsdaten zu {info.sources.map((s) => s.name).join(', ')} bleiben in neuraldoc
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3'>
        <CopyLine value={url} />
        <Tabs defaultValue='claude'>
          <TabsList>
            {snippets.map(([id, label]) => (
              <TabsTrigger key={id} value={id}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {snippets.map(([id, , code]) => (
            <TabsContent key={id} value={id}>
              <CopyLine value={code} multiline />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

/* ---------- Token savings ---------- */

function Savings({ info, activity }: { info: Info; activity?: Activity }) {
  const s = activity?.stats
  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle>Tokens</CardTitle>
        <CardDescription>Was der Agent bekommt, neben dem, was neuraldoc dafür gelesen hat</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4'>
        {s && s.calls > 0 ? (
          <>
            <div className='flex flex-wrap items-end gap-x-3 gap-y-1'>
              <strong className='text-[32px] leading-none font-medium tracking-[-0.03em] whitespace-nowrap tabular-nums'>{num(s.answer)}</strong>
              <span className='pb-0.5 text-sm text-muted-foreground'>Tokens an den Agenten, {s.calls === 1 ? 'ein Aufruf' : `${num(s.calls)} Aufrufe`}</span>
            </div>
            <div className='grid gap-2'>
              <Bar label='An den Agenten' value={s.answer} max={s.raw} className='bg-brand-500' />
              <Bar label='Von neuraldoc gelesen' value={s.raw} max={s.raw} className='bg-muted-foreground/30' />
            </div>
          </>
        ) : (
          <p className='text-sm text-muted-foreground'>Noch keine Aufrufe. Unten ausprobieren oder im Agenten verbinden.</p>
        )}
        <p className='border-t pt-3 text-xs text-muted-foreground'>
          Geschätzt mit vier Zeichen je Token. Aufrufe und Ereignisse stehen unten im Nutzungsverlauf. {info.tools.length} Werkzeuge, ≈ {num(info.surfaceTokens)} Tokens Beschreibung.
        </p>
      </CardContent>
    </Card>
  )
}

function Bar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return (
    <div className='grid gap-1'>
      <span className='flex justify-between text-xs text-muted-foreground'>
        {label}
        <span className='tabular-nums'>{num(value)}</span>
      </span>
      <span className='h-2 overflow-hidden rounded-full bg-muted'>
        <span className={cn('block h-full rounded-full', className)} style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%` }} />
      </span>
    </div>
  )
}

/* ---------- The three tools ---------- */

function ToolCard({ step, tool, stats, onTry }: { step: number; tool: Info['tools'][number]; stats?: { calls: number; answer: number; raw: number }; onTry: () => void }) {
  const look = datasetMode === 'working' ? { ...toolLook[tool.name], ...projectLook[tool.name] } : toolLook[tool.name]
  return (
    <Card className='gap-4'>
      <CardHeader className='flex flex-row items-start gap-3'>
        <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white'>
          <look.icon className='size-5' />
        </span>
        <div className='grid min-w-0 gap-0.5'>
          <span className='text-xs text-muted-foreground'>
            {step} · {look.when}
          </span>
          <CardTitle className='text-base'>{tool.title}</CardTitle>
          <code className='font-mono text-[11px] text-muted-foreground'>{tool.name}</code>
        </div>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-3'>
        <div className='flex flex-wrap items-center gap-1.5 text-xs'>
          <Badge variant='outline' className='font-normal text-muted-foreground'>
            {look.input}
          </Badge>
          <ArrowRight className='size-3.5 text-muted-foreground' />
          {look.returns.map((r) => (
            <Badge key={r} variant='outline' className={cn('font-normal', blueSoft)}>
              {r}
            </Badge>
          ))}
        </div>
        <div className='mt-auto flex items-center justify-between gap-2 border-t pt-3'>
          <span className='text-xs text-muted-foreground tabular-nums'>
            {stats?.calls ? `${stats.calls === 1 ? '1 Aufruf' : `${num(stats.calls)} Aufrufe`} · ⌀ ${num(Math.round(stats.answer / stats.calls))} Tokens` : 'Noch nicht aufgerufen'}
          </span>
          <Button size='sm' variant='outline' onClick={onTry}>
            <Play /> Ausprobieren
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- Playground: a real MCP call against /mcp, the answer drawn ---------- */

type CallResult = { text: string; data: unknown; tokens?: Tokens; error?: boolean }

function useMcp(token: string, protocol: string) {
  const session = useRef<string | null>(null)
  const rpc = async (body: unknown) => {
    const r = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}`, ...(session.current ? { 'Mcp-Session-Id': session.current } : {}) },
      body: JSON.stringify(body),
    })
    const sid = r.headers.get('Mcp-Session-Id')
    if (sid) session.current = sid
    return r.status === 202 ? null : r.json()
  }
  return async (name: ToolName, args: Record<string, unknown>): Promise<CallResult> => {
    if (!session.current) {
      await rpc({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'neuraldoc-Dashboard', version: '1' } } })
      await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })
    }
    const res = await rpc({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: { ...args, format: 'structured' } } })
    if (res?.error) return { text: res.error.message, data: null, error: true }
    return { text: res.result.content.map((c: { text: string }) => c.text).join('\n'), data: res.result.structuredContent?.result, tokens: res.result.structuredContent?.tokens, error: res.result.isError }
  }
}

type InputSpec = { key: string; label: string; placeholder: string; examples: string[] }
// Own projects: examples come from the imported documents; there are no tickets or merge requests.
const projectInputs = (): Record<ToolName, InputSpec> => {
  const titles = docs.slice(0, 3).map((d) => d.title)
  return {
    check_change: { key: 'ref', label: 'Git-Stand', placeholder: release.id, examples: [release.id] },
    ask: { key: 'question', label: 'Frage', placeholder: titles[0] ?? 'Wonach suchst du?', examples: titles },
    ticket_context: { key: 'ticket', label: 'Aufgabe oder Frage', placeholder: titles[0] ?? 'Was willst du ändern?', examples: titles },
  }
}
const showcaseInputs: Record<ToolName, InputSpec> = {
  check_change: { key: 'merge_request', label: 'Merge-Request, Branch oder Ticket', placeholder: '!1287, feature/MOB-4835-lieferstopp oder MOB-4812', examples: ['!1287', 'feature/MOB-4835-lieferstopp', 'MOB-4815'] },
  ask: { key: 'question', label: 'Frage', placeholder: 'Wie wird die Anzahlung bei einer Teillieferung verrechnet?', examples: ['Wie wird die Anzahlung bei einer Teillieferung verrechnet?', 'Kann ein Gutschein teilweise eingelöst werden?', 'Wie plane ich eine Tour?'] },
  ticket_context: { key: 'ticket', label: 'Jira-Ticket', placeholder: 'MOB-4844', examples: ['MOB-4844', 'MOB-4808', 'MOB-4850'] },
}

/** check_change takes one of several keys; pick it from what was typed. */
function argsFor(name: ToolName, value: string): Record<string, unknown> {
  const v = value.trim()
  if (datasetMode === 'working') return name === 'check_change' ? { ref: v } : { [projectInputs()[name].key]: v }
  if (name !== 'check_change') return { [showcaseInputs[name].key]: v }
  if (/^!?\d+$/.test(v)) return { merge_request: v }
  if (v.includes('/')) return { branch: v }
  if (/^[0-9a-f]{7,40}$/i.test(v)) return { commits: [v] }
  return { ticket: v }
}

function Playground({ info, tab, onTab }: { info: Info; tab: ToolName; onTab: (t: ToolName) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ausprobieren</CardTitle>
        <CardDescription>Echter Aufruf über /mcp, so wie ihn der Agent macht</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => onTab(v as ToolName)}>
          <TabsList>
            {ORDER.map((n) => {
              const Icon = toolLook[n].icon
              return (
                <TabsTrigger key={n} value={n}>
                  <Icon /> {info.tools.find((t) => t.name === n)?.title}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {ORDER.map((n) => (
            <TabsContent key={n} value={n} className='pt-3'>
              <Try info={info} name={n} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

function Try({ info, name }: { info: Info; name: ToolName }) {
  const qc = useQueryClient()
  const call = useMcp(info.token, info.protocol)
  const spec = (datasetMode === 'working' ? projectInputs() : showcaseInputs)[name]
  const [value, setValue] = useState(spec.examples[0])
  const [result, setResult] = useState<CallResult | null>(null)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const source = useMutation({ mutationFn: (id: string) => call('check_change', { merge_request: (result?.data as CheckData)?.change?.mr, source_id: id }) })
  const run = useMutation({
    mutationFn: (v: string) => call(name, argsFor(name, v)),
    onSuccess: (r) => {
      setResult(r)
      void qc.invalidateQueries({ queryKey: ['mcp', 'activity'] })
    },
    onError: (e: Error) => setResult({ text: e.message, data: null, error: true }),
  })
  const go = (v = value) => {
    setValue(v)
    run.mutate(v)
  }
  return (
    <div className='grid gap-4'>
      <form
        className='grid gap-2'
        onSubmit={(e) => {
          e.preventDefault()
          go()
        }}
      >
        <label className='text-sm font-medium' htmlFor={`in-${name}`}>
          {spec.label}
        </label>
        <div className='flex gap-2'>
          <Input id={`in-${name}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={spec.placeholder} />
          <Button type='submit' disabled={run.isPending || !value.trim()}>
            <Play /> Aufrufen
          </Button>
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {spec.examples.map((x) => (
            <Button key={x} type='button' size='sm' variant='ghost' className='h-7 rounded-full border px-2.5 text-xs font-normal text-muted-foreground' onClick={() => go(x)}>
              {x}
            </Button>
          ))}
        </div>
      </form>
      {result && (
        <div className='grid gap-3'>
          {result.error || !result.data ? (
            <pre className={cn('rounded-lg border p-3 font-mono text-[12px] whitespace-pre-wrap', result.error ? lateSoft : 'bg-muted/40')}>{result.text}</pre>
          ) : name === 'check_change' ? (
            <CheckView data={result.data as CheckData} loadingSource={source.isPending} onSource={(id) => { setSourceId(id); source.mutate(id) }} />
          ) : name === 'ask' ? (
            <AskView data={result.data as AskData} />
          ) : (
            <TicketView data={result.data as TicketData} />
          )}
          {!result.error && <AgentSees result={result} />}
        </div>
      )}
      <Dialog open={sourceId !== null} onOpenChange={(open) => { if (!open) setSourceId(null) }}><DialogContent className='max-h-[88vh] overflow-y-auto sm:max-w-4xl'><DialogHeader><DialogTitle>Originalquelle und Codebelege</DialogTitle><DialogDescription>{sourceId} · Vollständiger extrahierter Text und Belege aus dem aktuellen Release</DialogDescription></DialogHeader>{source.isPending ? <Skeleton className='h-48' /> : source.isError ? <p role='alert'>Die Quelle konnte nicht geladen werden: {source.error.message}</p> : source.data && <pre className='rounded-lg border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words'>{source.data.text}</pre>}</DialogContent></Dialog>
    </div>
  )
}

/** The plain text the agent gets, with its size next to the raw data behind it. */
function AgentSees({ result }: { result: CallResult }) {
  return (
    <Collapsible className='rounded-lg border'>
      <CollapsibleTrigger className='flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm'>
        <span className='font-medium'>Was der Agent bekommt</span>
        {result.tokens && (
          <span className='text-xs text-muted-foreground tabular-nums'>
            ≈ {num(result.tokens.answer)} Tokens · neuraldoc hat dafür ≈ {num(result.tokens.raw)} gelesen
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className='max-h-96 overflow-auto border-t bg-muted/40 p-3 font-mono text-[12px] whitespace-pre-wrap'>{result.text}</pre>
      </CollapsibleContent>
    </Collapsible>
  )
}

/* ---------- check_change drawn ---------- */

const routeLook = {
  vorschlaege: { icon: PenLine, cls: blueSoft, short: 'anpassen' },
  passt: { icon: Check, cls: greenSoft, short: 'stimmt noch' },
  nicht: { icon: Ban, cls: 'border-dashed text-muted-foreground', short: 'nicht betroffen' },
  fehlt: { icon: FileQuestion, cls: lateSoft, short: 'kein Dokument' },
} as const

function CheckView({ data, onSource, loadingSource }: { data: CheckData; onSource: (id: string) => void; loadingSource: boolean }) {
  if (!data.found || !data.change || !data.types || !data.counts)
    return (
      <div className={cn('grid gap-2 rounded-xl border p-4 text-sm', lateSoft)}>
        <span className='font-medium'>Diese Änderung kennt neuraldoc noch nicht.</span>
        <span>Sobald der Branch in GitLab liegt, prüft neuraldoc ihn. Bekannt: {data.known?.map((k) => k.mr).join(', ')}</span>
      </div>
    )
  const c = data.counts
  return (
    <div className='grid gap-3 rounded-xl border p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='grid gap-1'>
          <span className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
            {data.change.ticket} · {data.change.mr} · erkannt über {data.via}
          </span>
          <span className='text-lg font-medium tracking-tight'>{data.change.title}</span>
        </div>
        {c.drafts > 0 && (
          <Button asChild size='sm'>
            <Link to='/aenderungen/$id' params={{ id: data.change.id }}>
              Prüfen und freigeben <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
      {c.drafts > 0 ? (
        <div className='grid gap-1.5'>
          <span className='flex justify-between text-xs text-muted-foreground'>
            <span>
              {num(c.drafts)} vorbereitete Entwürfe in {num(c.docs)} Dashboard-Dokumenten
            </span>
            <span className='tabular-nums'>
              {c.approved} freigegeben · {c.open} offen
            </span>
          </span>
          <Progress value={(c.approved / c.drafts) * 100} className='h-1.5' indicatorClassName={c.approved === c.drafts ? 'bg-emerald-500' : 'bg-brand-500'} />
        </div>
      ) : (
        <p className={cn('rounded-lg border px-3 py-2 text-sm', greenSoft)}>Keine Doku betroffen. {data.change.summary}</p>
      )}
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6'>
        {data.types.map((t) => {
          const look = routeLook[t.status]
          const Icon = typeIcon[t.type]
          return (
            <Tooltip key={t.type}>
              <TooltipTrigger asChild>
                <div className={cn('grid gap-1.5 rounded-xl border p-3', look.cls)}>
                  <span className='flex items-center justify-between'>
                    <Icon className='size-4' />
                    {t.status === 'vorschlaege' ? (
                      <span className='flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-medium text-white tabular-nums'>{t.drafts.length}</span>
                    ) : (
                      <look.icon className='size-3.5 opacity-70' />
                    )}
                  </span>
                  <span className={cn('text-sm leading-tight font-medium', t.status === 'nicht' && 'font-normal')}>{t.label}</span>
                  <span className='truncate text-[11px] opacity-80'>{t.status === 'vorschlaege' ? (t.approver.self ? 'Entwickler gibt frei' : t.approver.name) : look.short}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className='max-w-xs'>{t.status === 'vorschlaege' ? `${t.reason}. Freigabe: ${t.approver.name} (${t.approver.role})` : t.reason}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      {data.coverage && !!data.impacts?.length && <Card><CardHeader><CardTitle>Fundstellen in den Originalquellen</CardTitle><CardDescription>{data.coverage.locations} Stellen in {data.coverage.affected} Quellen · {data.coverage.scanned} Quellen durchsucht. Die Liste umfasst auch Schulungen, Leistungsbeschreibungen und Dateiversionen. Diese Fundstellen sind Prüfhilfen; Freigaben gelten für die vorbereiteten Entwürfe oben.</CardDescription></CardHeader><CardContent className='grid gap-3'><Table><TableHeader><TableRow><TableHead>Originalquelle</TableHead><TableHead>Stelle</TableHead><TableHead>Was sich ändert</TableHead><TableHead>Belege</TableHead></TableRow></TableHeader><TableBody>{data.impacts.map((i) => <TableRow key={i.id}><TableCell className='min-w-44 break-words'>{i.title}<span className='block text-xs text-muted-foreground'>{i.sourceId}</span></TableCell><TableCell className='min-w-40'>{i.section}</TableCell><TableCell className='min-w-72'>{i.what}{i.kind === 'von Hand' && <Badge variant='outline' className='mt-1 block w-fit'>Von Hand ändern</Badge>}</TableCell><TableCell><Button size='sm' variant='outline' disabled={loadingSource} onClick={() => onSource(i.sourceId)}>Original & Code</Button></TableCell></TableRow>)}</TableBody></Table><p className='text-xs text-muted-foreground'>{data.coverage.unassigned.length} Quellen ohne automatische Zuordnung. {data.coverage.limitation}</p>{data.coverage.warnings.map((warning) => <p key={warning} className='text-sm text-late-fg'>{warning}</p>)}</CardContent></Card>}
      {!!data.questions?.length && (
        <div className='grid gap-1.5'>
          {data.questions.map((q) => (
            <span key={q.id} className={cn('flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm', lateSoft)}>
              <CircleHelp className='mt-0.5 size-3.5 shrink-0' aria-hidden /> {q.ask}
            </span>
          ))}
        </div>
      )}
      {!!data.tasks?.length && (
        <div className='grid gap-1.5'>
          {data.tasks.map((t) => (
            <span key={t.id} className={cn('flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm', lateSoft)}>
              <Hand className='mt-0.5 size-3.5 shrink-0' aria-hidden /> {t.doc}: {t.task}
            </span>
          ))}
        </div>
      )}
      {data.mrComment && (
        <div className='flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
          <MessageSquare className='mt-0.5 size-3.5 shrink-0' aria-hidden />
          <span>
            <span className='font-medium text-foreground'>Kommentar in {data.change.mr}:</span> {data.mrComment.replace(/\*\*/g, '')}
          </span>
        </div>
      )}
    </div>
  )
}

/* ---------- ask and ticket_context drawn ---------- */

const statusLook: Record<Status, { label: string; cls: string; icon: typeof Check }> = {
  stimmt: { label: 'Stimmt', cls: greenSoft, icon: Check },
  aktualisiert: { label: 'Aktualisiert', cls: greenSoft, icon: Upload },
  veraltet: { label: 'Veraltet', cls: lateSoft, icon: CircleHelp },
  unvollstaendig: { label: 'Unvollständig', cls: blueSoft, icon: PenLine },
}

function StatusBadge({ status }: { status: Status }) {
  const look = statusLook[status]
  return (
    <Badge variant='outline' className={cn('gap-1 font-normal', look.cls)}>
      <look.icon className='size-3' /> {look.label}
    </Badge>
  )
}

function VerifiedRow({ v }: { v: Verified }) {
  const Icon = typeIcon[v.type]
  return (
    <div className='grid gap-2 rounded-xl border p-3'>
      <span className='flex flex-wrap items-center gap-2 text-sm'>
        <StatusBadge status={v.status} />
        <Icon className='size-3.5 text-muted-foreground' aria-hidden />
        <span className='font-medium'>{v.docTitle}</span>
        <span className='text-muted-foreground'>› {v.chapter}</span>
      </span>
      <div className={cn('grid gap-1.5', v.code && 'sm:grid-cols-2')}>
        <p className={cn('rounded-lg border bg-muted/30 px-3 py-2 text-sm', v.status === 'veraltet' && 'text-muted-foreground line-through decoration-red-400/60')}>
          <span className='mb-0.5 block text-[11px] text-muted-foreground no-underline'>Doku</span>„{v.quote}“
        </p>
        {v.code && (
          <p className={cn('rounded-lg border px-3 py-2 text-sm', v.status === 'veraltet' ? greenSoft : blueSoft)}>
            <span className='mb-0.5 block text-[11px] opacity-80'>
              {v.because?.method === 'prepared-draft' ? 'Vorbereiteter Doku-Entwurf' : v.status === 'veraltet' ? 'Code' : 'Fehlt'} · {v.because?.ticket}
            </span>
            {v.code}
          </p>
        )}
      </div>
      {v.draft && (
        <Link to='/dokumente/$id' params={{ id: v.doc }} search={{ p: v.draft.id }} className='flex w-fit items-center gap-1 text-xs text-brand-700 hover:underline dark:text-brand-300'>
          Entwurf zur Freigabe <ArrowRight className='size-3' />
        </Link>
      )}
    </div>
  )
}

function AskView({ data }: { data: AskData }) {
  return (
    <div className='grid gap-2'>
      <span className='text-xs text-muted-foreground'>Geprüft gegen den Code-Stand von Release {data.release}. Wo Doku und Code abweichen, gilt der Code.</span>
      {data.found.length ? data.found.map((v, i) => <VerifiedRow key={i} v={v} />) : <p className='text-sm text-muted-foreground'>Dazu steht nichts in der Doku.</p>}
      {data.change && (
        <p className='text-xs text-muted-foreground'>
          Zuletzt im Code geändert: {data.change.title} ({data.change.ticket}, {data.change.mr})
        </p>
      )}
    </div>
  )
}

function TicketView({ data }: { data: TicketData }) {
  const t = data.ticket
  return (
    <div className='grid gap-4'>
      <div className='grid gap-1 rounded-xl border p-4'>
        <span className='text-xs text-muted-foreground'>
          {t.key} · {t.type} · {t.status}
          {t.fixVersions.length ? ` · ${t.fixVersions.join(', ')}` : ''}
        </span>
        <span className='text-lg font-medium tracking-tight'>{t.summary}</span>
        <span className='text-sm text-muted-foreground'>{t.description}</span>
        {data.related.map((b) => (
          <Link key={b.id} to='/aenderungen/$id' params={{ id: b.id }} className={cn('mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-brand-400', blueSoft)}>
            <span className='text-xs opacity-80'>{b.own ? 'Die Änderung' : 'Baut auf'}</span>
            <span className='font-medium'>
              {b.ticket} {b.title}
            </span>
            <span className='text-xs opacity-80'>{b.mr}</span>
          </Link>
        ))}
      </div>
      <div className='grid gap-4 lg:grid-cols-2 [&>*]:min-w-0'>
        <Section title='Fachregeln und Codebelege'>
          {data.rules.length ? (
            <ul className='grid gap-1 text-sm'>
              {data.rules.map((r) => (
                <li key={r} className='flex gap-2'>
                  <Check className='mt-0.5 size-3.5 shrink-0 text-emerald-600' aria-hidden /> {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-sm text-muted-foreground'>Keine frühere Änderung im selben Bereich.</p>
          )}
        </Section>
        <div className='grid content-start gap-4'>
          {data.open.length > 0 && (
            <Section title='Vor dem Programmieren klären'>
              {data.open.map((o) => (
                <span key={o.key} className={cn('flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm', lateSoft)}>
                  <CircleHelp className='mt-0.5 size-3.5 shrink-0' aria-hidden />
                  {o.kind === 'ticket' ? `${o.key} ${o.text}` : o.text}
                </span>
              ))}
            </Section>
          )}
          {data.files.length > 0 && (
            <Section title='Code-Stellen'>
              <div className='flex flex-wrap gap-1.5'>
                {data.files.map((f) => (
                  <code key={f} className='rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]'>
                    {f}
                  </code>
                ))}
              </div>
            </Section>
          )}
          {data.later.length > 0 && (
            <Section title='Doku, die später dazugehört'>
              <div className='flex flex-wrap gap-1.5'>
                {data.later.map((l) => (
                  <Badge key={l.type} variant='outline' className={cn('font-normal', blueSoft)}>
                    {l.label} · {l.approver.self ? 'du selbst' : l.approver.name}
                  </Badge>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
      {data.today.length > 0 && (
        <Section title='So steht es heute in der Doku'>
          {data.today.map((v, i) => (
            <VerifiedRow key={i} v={v} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='grid content-start gap-2'>
      <span className='text-xs font-medium text-muted-foreground'>{title}</span>
      {children}
    </div>
  )
}

/* ---------- Who approves which doc type ---------- */

function ApprovalRules({ info }: { info: Info }) {
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (patch: { approvers?: Partial<Rules['approvers']>; writeBack?: boolean; mrComment?: boolean }) => postJson('/api/mcp/rules', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp', 'info'] }),
  })
  const r = info.rules
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-5'>
        <CardTitle>Wer gibt frei</CardTitle>
        <CardDescription>Je Doku-Art. Technische Doku darf die Entwicklung selbst freigeben.</CardDescription>
      </CardHeader>
      <Table>
        <TableBody>
          {info.docTypes.map((t) => {
            const Icon = typeIcon[t.type]
            return (
              <TableRow key={t.type}>
                <TableCell className='ps-6'>
                  <span className='flex items-center gap-2.5'>
                    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md border', blueSoft)}>
                      <Icon className='size-4' />
                    </span>
                    <span className='grid'>
                      <span className='font-medium'>{t.label}</span>
                      <span className='max-w-[220px] truncate text-xs text-muted-foreground'>{t.audience}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className='pe-6 text-right'>
                  <Select value={r.approvers[t.type]} onValueChange={(v) => save.mutate({ approvers: { [t.type]: v } })}>
                    <SelectTrigger size='sm' className='ms-auto w-[190px]' aria-label={`Freigabe ${t.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align='end'>
                      {info.people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className='grid gap-3 border-t px-6 py-4'>
        <Toggle label='Nach der Freigabe zurückschreiben' hint='neuraldoc schreibt die Seite in Confluence oder die Datei in SharePoint' checked={r.writeBack} onChange={(v) => save.mutate({ writeBack: v })} />
        <Toggle label='Link im Merge-Request kommentieren' hint='Damit Review und Doku zusammen sichtbar sind' checked={r.mrComment} onChange={(v) => save.mutate({ mrComment: v })} />
      </div>
    </Card>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className='flex items-center justify-between gap-4'>
      <span className='grid'>
        <span className='text-sm font-medium'>{label}</span>
        <span className='text-xs text-muted-foreground'>{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

/* ---------- What agents started, and what was written back ---------- */

function Started({ activity }: { activity?: Activity }) {
  const checks = activity?.checks ?? []
  const writebacks = activity?.writebacks ?? []
  const comments = new Map((activity?.mrComments ?? []).map((c) => [c.mr, c]))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vom Agenten angestoßen</CardTitle>
        <CardDescription>Geprüfte Änderungen, Stand der Freigaben, was zurückgeschrieben wurde</CardDescription>
      </CardHeader>
      <CardContent className='grid grid-cols-1 gap-4'>
        {checks.length === 0 ? (
          <p className='text-sm text-muted-foreground'>Noch nichts. Oben „Änderung prüfen“ ausprobieren.</p>
        ) : (
          <div className='grid grid-cols-1 gap-2'>
            {checks.map((c) => {
              const done = c.approved + c.rejected
              return (
                <div key={c.change} className='grid gap-2 rounded-xl border p-3'>
                  <span className='flex flex-wrap items-center justify-between gap-2'>
                    <span className='grid'>
                      <span className='text-sm font-medium'>{c.title}</span>
                      <span className='text-xs text-muted-foreground'>
                        {c.mr} · {c.client} · {time(c.at)}
                      </span>
                    </span>
                    {c.total > 0 && (
                      <Button asChild size='sm' variant='ghost' className='text-brand-700 dark:text-brand-300'>
                        <Link to='/aenderungen/$id' params={{ id: c.change }}>
                          Öffnen <ArrowRight />
                        </Link>
                      </Button>
                    )}
                  </span>
                  {c.total > 0 ? (
                    <span className='grid gap-1'>
                      <Progress value={(done / c.total) * 100} className='h-1.5' indicatorClassName={done === c.total ? 'bg-emerald-500' : 'bg-brand-500'} />
                      <span className='text-xs text-muted-foreground tabular-nums'>
                        {c.approved} von {c.total} freigegeben{c.rejected ? `, ${c.rejected} verworfen` : ''}
                      </span>
                    </span>
                  ) : (
                    <span className='text-xs text-muted-foreground'>Keine Doku betroffen</span>
                  )}
                  {comments.get(c.mr) && (
                    <span className='flex items-start gap-1.5 text-xs text-muted-foreground'>
                      <MessageSquare className='mt-0.5 size-3.5 shrink-0' aria-hidden /> Link im {c.mr} kommentiert
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {writebacks.length > 0 && (
          <div className='grid grid-cols-1 gap-1.5 border-t pt-4'>
            <span className='text-xs font-medium text-muted-foreground'>Zurückgeschrieben</span>
            {writebacks.map((w, i) => (
              <span key={i} className='flex items-center gap-2 text-sm'>
                <Upload className='size-3.5 shrink-0 text-emerald-600' aria-hidden />
                <span className='min-w-0 flex-1 truncate'>
                  {w.title}
                  <span className='text-muted-foreground'>
                    {' '}
                    → {w.target.system} „{w.target.title}“, Version {w.version}
                    {w.edited ? ', angepasst' : ''}
                  </span>
                </span>
                <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>{time(w.at)}</span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- Questions developers asked (where the documentation let them down) ---------- */

function Questions({ activity }: { activity?: Activity }) {
  const qs = activity?.questions ?? []
  const outdated = qs.filter((q) => (q.statuses.veraltet ?? 0) + (q.statuses.unvollstaendig ?? 0) > 0).length
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fragen der Entwicklung</CardTitle>
        <CardDescription>{qs.length ? `Bei ${outdated} von ${qs.length} Fragen war die Doku nicht aktuell` : 'Was gefragt wurde und ob die Doku stimmte'}</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-2'>
        {qs.length === 0 ? (
          <p className='text-sm text-muted-foreground'>Noch keine Fragen.</p>
        ) : (
          qs.map((q, i) => (
            <div key={i} className='grid gap-1.5 rounded-xl border p-3'>
              <span className='text-sm'>{q.question}</span>
              <span className='flex flex-wrap items-center gap-1.5'>
                {(Object.keys(statusLook) as Status[])
                  .filter((s) => q.statuses[s])
                  .map((s) => (
                    <Badge key={s} variant='outline' className={cn('font-normal tabular-nums', statusLook[s].cls)}>
                      {q.statuses[s]} {statusLook[s].label.toLowerCase()}
                    </Badge>
                  ))}
                <span className='ms-auto text-xs text-muted-foreground'>{time(q.at)}</span>
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- Call log ---------- */

function CallLog({ activity, info, className }: { activity?: Activity; info: Info; className?: string }) {
  const rows = activity?.log ?? []
  const title = (n: string) => info.tools.find((t) => t.name === n)?.title ?? n
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardHeader className='border-b py-5'>
        <CardTitle>Protokoll</CardTitle>
        <CardDescription>Letzte Aufrufe, Agent und geschätzte Werkzeugtokens</CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <p className='px-6 py-5 text-sm text-muted-foreground'>Noch keine Aufrufe.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='ps-6'>Zeit</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Funktion</TableHead>
              <TableHead>Ergebnis</TableHead>
              <TableHead className='pe-6 text-right'>Tokens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 15).map((r, i) => (
              <TableRow key={i}>
                <TableCell className='ps-6 text-sm text-muted-foreground tabular-nums'>{time(r.at)}</TableCell>
                <TableCell className='text-sm'>{r.client}</TableCell>
                <TableCell className='text-sm'>{title(r.tool)}</TableCell>
                <TableCell className={cn('max-w-[280px] truncate text-sm', !r.ok && 'text-late-fg')}>{r.summary}</TableCell>
                <TableCell className='pe-6 text-right text-sm tabular-nums'>
                  {r.tokens ? (
                    <Tooltip>
                      <TooltipTrigger className='tabular-nums'>
                        {num(r.tokens.answer)} <span className='text-muted-foreground'>/ {num(r.tokens.raw)}</span>
                      </TooltipTrigger>
                      <TooltipContent>Antwort an den Agenten / Rohdaten, die neuraldoc dafür gelesen hat</TooltipContent>
                    </Tooltip>
                  ) : (
                    '–'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
