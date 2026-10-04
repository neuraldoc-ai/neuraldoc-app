import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Download, RefreshCw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Stat } from './ui'
import { downloadCsv } from './usage-export'
import { dateTime, num, toolLabel, type HistoryEvent, type Usage } from './usage-model'

const estimatedPalette = { answer: { label: 'An den Agenten · geschätzt', color: '#252525' }, raw: { label: 'Von neuraldoc gelesen · geschätzt', color: '#999999' } }

function useUsage(query = '') {
  return useQuery({ queryKey: ['mcp', 'usage', query], queryFn: async (): Promise<Usage> => {
    const response = await fetch(`/api/mcp/usage${query ? `?${query}` : ''}`)
    if (!response.ok) throw new Error('Der Nutzungsverlauf konnte nicht geladen werden.')
    return response.json()
  }, refetchInterval: 10_000, retry: 1 })
}

function Blank({ title, children }: { title: string; children: React.ReactNode }) {
  return <Empty className='min-h-44 border'><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{children}</EmptyDescription></EmptyHeader></Empty>
}

export function UsageSection() {
  const [period, setPeriod] = useState('all')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [rangeAnchor] = useState(() => Date.now())
  const params = new URLSearchParams()
  if (period !== 'all' && period !== 'custom') params.set('from', new Date(rangeAnchor - Number(period) * 86_400_000).toISOString())
  if (period === 'custom' && from) params.set('from', new Date(`${from}T00:00:00`).toISOString())
  if (period === 'custom' && until) params.set('until', new Date(`${until}T23:59:59.999`).toISOString())
  const query = useUsage(params.toString())
  const data = query.data
  return <section id='verlauf' aria-labelledby='usage-title' className='grid scroll-mt-20 gap-5'>
    <div className='flex flex-wrap items-start justify-between gap-3'>
      <div className='grid gap-1'><h2 id='usage-title' className='text-xl font-medium'>Nutzungsverlauf</h2><p className='text-sm text-muted-foreground'>Aufrufe, Entscheidungen und Rückschreibungen nachvollziehen.</p></div>
      <div className='flex flex-wrap gap-2'><Button variant='outline' size='sm' onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw /> Aktualisieren</Button><Button asChild variant='outline' size='sm'><a href={`/api/mcp/usage?${params}&download=1`} download><Download /> Daten exportieren</a></Button></div>
    </div>
    <Card><CardContent className='flex flex-wrap items-end gap-3 pt-5'>
      <div className='grid gap-1.5'><Label htmlFor='usage-period'>Zeitraum</Label><Select value={period} onValueChange={setPeriod}><SelectTrigger id='usage-period' className='w-48'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>Gesamter Verlauf</SelectItem><SelectItem value='7'>Letzte 7 Tage</SelectItem><SelectItem value='30'>Letzte 30 Tage</SelectItem><SelectItem value='90'>Letzte 90 Tage</SelectItem><SelectItem value='custom'>Eigener Zeitraum</SelectItem></SelectContent></Select></div>
      {period === 'custom' && <><div className='grid gap-1.5'><Label htmlFor='usage-from'>Von</Label><Input id='usage-from' type='date' value={from} onChange={(e) => setFrom(e.target.value)} /></div><div className='grid gap-1.5'><Label htmlFor='usage-until'>Bis</Label><Input id='usage-until' type='date' value={until} min={from} onChange={(e) => setUntil(e.target.value)} /></div></>}
      <p className='ms-auto text-xs text-muted-foreground'>Zeitangaben: Berlin{data ? ` · Stand ${dateTime(data.generatedAt)}` : ''}</p>
    </CardContent></Card>
    {query.isPending ? <Skeleton className='h-72' /> : query.isError ? <Blank title='Verlauf nicht erreichbar'>Server und gewählten Zeitraum prüfen. <Button variant='link' onClick={() => void query.refetch()}>Erneut laden</Button></Blank> : data && <>
      {data.warnings.length > 0 && <Card className='border-late/40'><CardContent className='pt-5 text-sm' role='alert'><strong>Ein Teil des Protokolls konnte nicht geprüft werden.</strong>{data.warnings.map((w) => <p key={w}>{w}</p>)}</CardContent></Card>}
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <Stat label='MCP-Aufrufe' value={num(data.estimated.totals.calls)} hint={`${num(data.estimated.totals.successful)} erfolgreich · ${num(data.estimated.totals.failed)} fehlgeschlagen`} />
        <Stat label='An den Agenten · geschätzt' value={`≈ ${num(data.estimated.totals.answer)}`} hint='Werkzeugtexte in Tokens, Zeichen ÷ 4' />
        <Stat label='Durchschnittliche Antwortzeit' value={data.estimated.totals.timedCalls ? `${num(Math.round(data.estimated.totals.durationMs / data.estimated.totals.timedCalls))} ms` : '–'} hint='Aus dem MCP-Protokoll, ohne Agentenlauf' />
        <Stat label='Protokollierte Ereignisse' value={num(data.estimated.events.length)} hint='Aufrufe, Entscheidungen und Rückschreibungen' />
      </div>
      <Tabs defaultValue='betrieb' className='gap-5'>
        <TabsList className='max-w-full overflow-x-auto'><TabsTrigger value='betrieb'>Betrieb · geschätzt</TabsTrigger><TabsTrigger value='ereignisse'>Entscheidungen & Verlauf</TabsTrigger><TabsTrigger value='methode'>Was wird gezählt?</TabsTrigger></TabsList>
        <TabsContent value='betrieb' className='grid gap-5'><Estimated data={data} /><CallTable calls={data.estimated.calls} /></TabsContent>
        <TabsContent value='ereignisse'><EventTable events={data.estimated.events} /></TabsContent>
        <TabsContent value='methode'><Method data={data} /></TabsContent>
      </Tabs>
    </>}
  </section>
}

function Estimated({ data }: { data: Usage }) {
  const rows = data.estimated.days.slice(-60)
  return <>
    <Card><CardHeader><CardTitle>Werkzeugtexte über die Zeit</CardTitle><CardDescription>Geschätzt mit vier Zeichen je Token. {data.estimated.days.length > 60 ? 'Die letzten 60 aktiven Tage des gewählten Zeitraums.' : 'Aktive Tage des gewählten Zeitraums.'} Kein Vergleich mit Einzel-MCPs.</CardDescription></CardHeader><CardContent>
      {rows.length ? <div className='overflow-x-auto'><ChartContainer config={estimatedPalette} className='h-[280px] w-full' style={{ minWidth: Math.max(320, rows.length * 130) }} aria-label='Geschätzte Werkzeugtokens pro aktivem Tag'><BarChart data={rows} accessibilityLayer margin={{ top: 25, left: 5, right: 12 }}><CartesianGrid vertical={false} /><XAxis dataKey='day' tickFormatter={(v: string) => v.slice(5).split('-').reverse().join('.')} tickLine={false} axisLine={false} interval={0} /><YAxis width={65} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} /><Bar dataKey='answer' fill='var(--color-answer)' radius={[4, 4, 0, 0]}><LabelList dataKey='answer' position='top' formatter={(v) => `≈ ${num(Number(v))}`} /></Bar><Bar dataKey='raw' fill='var(--color-raw)' radius={[4, 4, 0, 0]}><LabelList dataKey='raw' position='top' formatter={(v) => `≈ ${num(Number(v))}`} /></Bar></BarChart></ChartContainer></div> : <Blank title='Noch keine Aufrufe'>In diesem Zeitraum wurde kein MCP-Aufruf protokolliert.</Blank>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Nach Funktion</CardTitle><CardDescription>Aufrufe und Fehler gezählt; Tokenwerte geschätzt. Antwortzeiten nur für Aufrufe mit Zeitmessung.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow>{['Funktion', 'Aufrufe', 'Fehler', 'An den Agenten ≈', 'Gelesener Text ≈', 'Ø Antwortzeit'].map((s) => <TableHead key={s}>{s}</TableHead>)}</TableRow></TableHeader><TableBody>{data.estimated.perTool.map((t) => <TableRow key={t.tool}><TableCell>{toolLabel(t.tool)}</TableCell><TableCell>{num(t.calls)}</TableCell><TableCell>{num(t.failed)}</TableCell><TableCell>{num(t.answer)}</TableCell><TableCell>{num(t.raw)}</TableCell><TableCell>{t.timedCalls ? `${num(Math.round(t.durationMs / t.timedCalls))} ms` : '–'}<span className='block text-xs text-muted-foreground'>{t.timedCalls}/{t.calls} gemessen</span></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    <Card><CardHeader><CardTitle>Nach Agent</CardTitle><CardDescription>Name aus der MCP-Verbindung; keine Personenkennung. Alle Werte beziehen sich auf den gewählten Zeitraum.</CardDescription></CardHeader><CardContent>{data.estimated.perClient.length ? <Table><TableHeader><TableRow>{['Agent', 'Aufrufe', 'Fehler', 'An den Agenten ≈', 'Gelesener Text ≈', 'Ø Antwortzeit', 'Letzter Aufruf'].map((s) => <TableHead key={s}>{s}</TableHead>)}</TableRow></TableHeader><TableBody>{data.estimated.perClient.map((c) => <TableRow key={c.client}><TableCell>{c.client}</TableCell><TableCell>{num(c.calls)}</TableCell><TableCell>{num(c.failed)}</TableCell><TableCell>{num(c.answer)}</TableCell><TableCell>{num(c.raw)}</TableCell><TableCell className='whitespace-nowrap'>{c.timedCalls ? `${num(Math.round(c.durationMs / c.timedCalls))} ms` : '–'}<span className='block text-xs text-muted-foreground'>{c.timedCalls}/{c.calls} gemessen</span></TableCell><TableCell className='whitespace-nowrap'>{dateTime(c.lastAt)}</TableCell></TableRow>)}</TableBody></Table> : <p className='text-sm text-muted-foreground'>Noch keine Agenten in diesem Zeitraum protokolliert.</p>}</CardContent></Card>
  </>
}

function CallTable({ calls }: { calls: Usage['estimated']['calls'] }) {
  const [search, setSearch] = useState(''), [tool, setTool] = useState('all'), [client, setClient] = useState('all'), [status, setStatus] = useState('all'), [page, setPage] = useState(0)
  const [selected, setSelected] = useState<HistoryEvent | null>(null)
  const rows = calls.filter((c) => (tool === 'all' || c.tool === tool) && (client === 'all' || (c.client || 'Unbekannt') === client) && (status === 'all' || c.ok === (status === 'ok')) && `${c.summary} ${c.client} ${JSON.stringify(c.args)}`.toLowerCase().includes(search.toLowerCase()))
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 20) - 1))
  return <Card><CardHeader><CardTitle>Alle Aufrufe</CardTitle><CardDescription>Suchbar bis zur ursprünglichen Frage; jeder Eintrag lässt sich öffnen. CSV enthält alle gefilterten Einträge über sämtliche Seiten.</CardDescription></CardHeader><CardContent className='grid gap-4'>
    <div className='flex flex-wrap gap-2'><Input placeholder='Frage, Ticket, MR oder Agent suchen' aria-label='Aufrufe durchsuchen' value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} className='max-w-sm' /><Select value={tool} onValueChange={(v) => { setTool(v); setPage(0) }}><SelectTrigger className='w-48' aria-label='Funktion filtern'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>Alle Funktionen</SelectItem>{[...new Set(calls.map((c) => c.tool))].map((t) => <SelectItem key={t} value={t}>{toolLabel(t)}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}><SelectTrigger className='w-44' aria-label='Ergebnis filtern'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>Alle Ergebnisse</SelectItem><SelectItem value='ok'>Erfolgreich</SelectItem><SelectItem value='error'>Fehlgeschlagen</SelectItem></SelectContent></Select></div>
    <div className='flex flex-wrap gap-2'><Select value={client} onValueChange={(v) => { setClient(v); setPage(0) }}><SelectTrigger className='w-52' aria-label='Agent filtern'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>Alle Agenten</SelectItem>{[...new Set(calls.map((c) => c.client || 'Unbekannt'))].sort().map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Button variant='outline' disabled={!rows.length} onClick={() => downloadCsv('neuraldoc-aufrufe.csv', ['Zeit (ISO)', 'Agent', 'Funktion', 'Ergebnis', 'Antwortzeit (ms)', 'Tokens an Agent (geschätzt)', 'Gelesene Tokens (geschätzt)', 'Inhalt', 'Argumente', 'Bezug'], rows.map((c) => [c.at, c.client, c.tool, c.ok ? 'Erfolgreich' : 'Fehler', c.ms, c.ok ? c.tokens?.answer : null, c.ok ? c.tokens?.raw : null, c.summary, JSON.stringify(c.args), JSON.stringify(c.ref)]))}><Download /> Auswahl als CSV</Button>{(search || tool !== 'all' || client !== 'all' || status !== 'all') && <Button variant='ghost' onClick={() => { setSearch(''); setTool('all'); setClient('all'); setStatus('all'); setPage(0) }}>Filter zurücksetzen</Button>}</div>
    <Table><TableHeader><TableRow>{['Zeit / Agent', 'Funktion', 'Ergebnis', 'Antwortzeit', 'Tokens · geschätzt', ''].map((s, i) => <TableHead key={i}>{s}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.slice(current * 20, (current + 1) * 20).map((c) => <TableRow key={c.line}><TableCell className='whitespace-nowrap'>{dateTime(c.at)}<span className='block text-xs text-muted-foreground'>{c.client || 'Unbekannt'}</span></TableCell><TableCell>{toolLabel(c.tool)}</TableCell><TableCell className='max-w-80'><Badge variant='outline' className={c.ok ? '' : 'border-late/30 text-late-fg'}>{c.ok ? 'Erfolgreich' : 'Fehler'}</Badge><p className='mt-1 line-clamp-2 text-sm'>{c.summary}</p></TableCell><TableCell className='whitespace-nowrap'>{c.ms == null ? '–' : `${num(c.ms)} ms`}</TableCell><TableCell className='whitespace-nowrap tabular-nums'>{c.ok && c.tokens ? `≈ ${num(c.tokens.answer)} / ${num(c.tokens.raw)}` : '–'}</TableCell><TableCell><Button variant='ghost' size='sm' onClick={() => setSelected({ id: `call-${c.line}`, at: c.at, kind: 'call', title: c.summary, by: c.client, detail: c, url: typeof c.ref?.path === 'string' ? c.ref.path : null })}>Details</Button></TableCell></TableRow>)}</TableBody></Table>
    {!rows.length && <p className='text-sm text-muted-foreground'>Keine passenden Aufrufe.</p>}
    <Pagination count={rows.length} page={current} onPage={setPage} />
    <EventDialog event={selected} close={() => setSelected(null)} />
  </CardContent></Card>
}

const eventLabel = (event: HistoryEvent) => event.kind === 'call' ? toolLabel(event.tool ?? '') : ({ decision: 'Entscheidung', writeback: 'Rückschreibung', comment: 'MR-Kommentar' })[event.kind]
const actionLabel = (event: HistoryEvent) => ({ uebernommen: 'Freigegeben', verworfen: 'Verworfen', undo: 'Zurückgenommen', reset: 'Zurückgesetzt', write: 'Demo-Rückschreibung' })[event.action ?? ''] ?? (event.kind === 'call' ? event.ok ? 'Erfolgreich' : 'Fehler' : 'Protokolliert')

function EventTable({ events }: { events: HistoryEvent[] }) {
  const [kind, setKind] = useState('all'), [by, setBy] = useState('all'), [search, setSearch] = useState(''), [page, setPage] = useState(0), [selected, setSelected] = useState<HistoryEvent | null>(null)
  const rows = events.filter((e) => (kind === 'all' || e.kind === kind) && (by === 'all' || (e.by || 'Unbekannt') === by) && `${e.title} ${e.by} ${JSON.stringify(e.detail)}`.toLowerCase().includes(search.toLowerCase()))
  const approved = events.filter((e) => e.kind === 'decision' && e.action === 'uebernommen')
  const decisionUndos = events.filter((e) => e.kind === 'decision' && ['undo', 'reset'].includes(e.action ?? ''))
  const writes = events.filter((e) => e.kind === 'writeback' && e.action === 'write')
  const writeUndos = events.filter((e) => e.kind === 'writeback' && e.action === 'undo')
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 20) - 1))
  return <div className='grid gap-5'><div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
    <Stat label='Protokollierte Freigaben' value={num(approved.length)} hint={`${num(approved.filter((e) => e.detail.edited).length)} mit bearbeitetem Entwurf`} />
    <Stat label='Protokollierte Ablehnungen' value={num(events.filter((e) => e.kind === 'decision' && e.action === 'verworfen').length)} hint='Entscheidungen im gewählten Zeitraum' />
    <Stat label='Demo-Rückschreibungen' value={num(writes.length)} hint='Ausgeführte Ereignisse, kein aktueller Bestand' />
    <Stat label='Zurückgenommene Entscheidungen' value={num(decisionUndos.length)} hint={`${num(writeUndos.length)} Rückschreibungen rückgängig gemacht`} />
  </div><Card><CardHeader><CardTitle>Entscheidungen und Ereignisse</CardTitle><CardDescription>Aufrufe, Freigaben, Rücknahmen, Demo-Rückschreibungen und MR-Kommentare in einem Verlauf. Ältere Entscheidungen sind nicht rückwirkend erfasst. Die Kennzahlen zählen protokollierte Ereignisse im Zeitraum; die Tabellenfilter gelten für die Liste und ihren CSV-Export.</CardDescription></CardHeader><CardContent className='grid gap-4'>
    <div className='flex flex-wrap gap-2'><Input aria-label='Ereignisse durchsuchen' placeholder='Dokument, Person oder Inhalt suchen' value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} className='max-w-sm' /><Select value={kind} onValueChange={(v) => { setKind(v); setPage(0) }}><SelectTrigger className='w-52' aria-label='Ereignisart'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>Alle Ereignisse</SelectItem><SelectItem value='call'>MCP-Aufrufe</SelectItem><SelectItem value='decision'>Entscheidungen</SelectItem><SelectItem value='writeback'>Rückschreibungen</SelectItem><SelectItem value='comment'>MR-Kommentare</SelectItem></SelectContent></Select></div>
    <div className='flex flex-wrap gap-2'><Select value={by} onValueChange={(v) => { setBy(v); setPage(0) }}><SelectTrigger className='w-52' aria-label='Person oder Agent filtern'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>Alle Personen / Agenten</SelectItem>{[...new Set(events.map((e) => e.by || 'Unbekannt'))].sort().map((person) => <SelectItem key={person} value={person}>{person}</SelectItem>)}</SelectContent></Select><Button variant='outline' disabled={!rows.length} onClick={() => downloadCsv('neuraldoc-ereignisse.csv', ['Zeit (ISO)', 'Ereignis', 'Aktion', 'Inhalt', 'Von', 'Änderung', 'Details'], rows.map((e) => [e.at, eventLabel(e), actionLabel(e), e.title, e.by, e.url, JSON.stringify(e.detail)]))}><Download /> Auswahl als CSV</Button>{(search || kind !== 'all' || by !== 'all') && <Button variant='ghost' onClick={() => { setSearch(''); setKind('all'); setBy('all'); setPage(0) }}>Filter zurücksetzen</Button>}</div>
    <Table><TableHeader><TableRow>{['Zeit', 'Ereignis', 'Inhalt', 'Von', ''].map((s, i) => <TableHead key={i}>{s}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.slice(current * 20, (current + 1) * 20).map((e) => <TableRow key={e.id}><TableCell className='whitespace-nowrap'>{dateTime(e.at)}</TableCell><TableCell>{eventLabel(e)}<span className='block text-xs text-muted-foreground'>{actionLabel(e)}{e.kind === 'decision' && e.detail.edited ? ' · Bearbeitet' : ''}</span></TableCell><TableCell className='max-w-96'><p className='line-clamp-2'>{e.title}</p></TableCell><TableCell>{e.by || 'Unbekannt'}</TableCell><TableCell><Button variant='ghost' size='sm' onClick={() => setSelected(e)}>Details</Button></TableCell></TableRow>)}</TableBody></Table>
    {!rows.length && <p className='text-sm text-muted-foreground'>Keine Ereignisse für diese Auswahl.</p>}<Pagination count={rows.length} page={current} onPage={setPage} /><EventDialog event={selected} close={() => setSelected(null)} />
  </CardContent></Card></div>
}

function Pagination({ count, page, onPage }: { count: number; page: number; onPage: (page: number) => void }) {
  return <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'><span>{num(count)} Einträge{count > 0 ? ` · ${page * 20 + 1}–${Math.min(count, (page + 1) * 20)}` : ''}</span><div className='flex gap-2'><Button variant='outline' size='sm' disabled={page === 0} onClick={() => onPage(page - 1)}>Zurück</Button><Button variant='outline' size='sm' disabled={(page + 1) * 20 >= count} onClick={() => onPage(page + 1)}>Weiter</Button></div></div>
}

function EventDialog({ event, close }: { event: HistoryEvent | null; close: () => void }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(event, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `${event?.id ?? 'ereignis'}.json`; a.click(); URL.revokeObjectURL(url)
  }
  return <Dialog open={!!event} onOpenChange={(open) => { if (!open) close() }}><DialogContent className='max-h-[88vh] overflow-y-auto sm:max-w-2xl'><DialogHeader><DialogTitle>{event ? eventLabel(event) : 'Ereignis'}</DialogTitle><DialogDescription>{event ? `${dateTime(event.at)} · ${event.by ?? 'unbekannt'} · ${actionLabel(event)}` : ''}</DialogDescription></DialogHeader>{event && <div className='grid gap-4'><p className='text-sm'>{event.title}</p><pre className='max-h-96 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-xs break-words whitespace-pre-wrap'>{JSON.stringify(event.detail, null, 2)}</pre><div className='flex flex-wrap gap-2'><Button variant='outline' onClick={download}><Download /> Eintrag laden</Button>{event.url && <Button asChild variant='outline'><a href={event.url}>Änderung öffnen <ArrowRight /></a></Button>}</div></div>}</DialogContent></Dialog>
}

function Method({ data }: { data: Usage }) {
  return <Card><CardHeader><CardTitle>Was wird gezählt?</CardTitle><CardDescription>Aufrufe und Antwortzeiten stammen aus dem MCP-Protokoll. Tokenzahlen sind Schätzungen.</CardDescription></CardHeader><CardContent className='grid gap-5'>
    <Table><TableHeader><TableRow><TableHead>Wert</TableHead><TableHead>Herkunft</TableHead><TableHead>Aussage</TableHead></TableRow></TableHeader><TableBody>
      <TableRow><TableCell>Werkzeugtexte</TableCell><TableCell>MCP-Protokoll: Zeichen ÷ 4</TableCell><TableCell>Schätzung f?r Antwort und intern gelesenen Text, kein Agenten-Gesamtverbrauch</TableCell></TableRow>
      <TableRow><TableCell>Aufrufe und Antwortzeit</TableCell><TableCell>MCP-Protokoll</TableCell><TableCell>Tatsächliche Anzahl und Dauer in Millisekunden</TableCell></TableRow>
      <TableRow><TableCell>Entscheidungen und Rückschreibungen</TableCell><TableCell>Ereignisprotokoll</TableCell><TableCell>Protokollierte Freigaben, Ablehnungen, Rücknahmen und Demo-Rückschreibungen</TableCell></TableRow>
    </TableBody></Table>
    <div className='grid gap-3'>{data.limitations.map((s) => <p key={s} className='text-sm text-muted-foreground'>{s}</p>)}</div>
  </CardContent></Card>
}
