/**
 * A PostgreSQL database: tables, columns and data, a SQL console with completion, the migrations and the relationships
 * as a diagram. Read-only. The MOBIQ example and an imported repository's SQL files run in PGlite; an own connection
 * goes through the local server. See ./db.ts.
 */
import '@xyflow/react/dist/style.css'
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, applyNodeChanges, type Edge, type Node, type NodeChange, type NodeProps } from '@xyflow/react'
import { Database, FileCode2, KeyRound, Link2, Loader2, Play, Table2 } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { CodeEditor, SqlEditor, setSqlNames } from '../ide/editors'
import {
  catalogOf,
  formatCell,
  type ColumnInfo,
  type DbBackend,
  type ForeignKey,
  type MigrationRow,
  type QueryResult,
  type TableInfo,
} from './db'

type Catalog = { version: string; tables: TableInfo[]; fks: ForeignKey[]; columns: Record<string, ColumnInfo[]>; history: MigrationRow[]; warnings: string[] }

const DbContext = createContext<{ db: DbBackend; api: ReturnType<typeof catalogOf> } | null>(null)
const useDb = () => useContext(DbContext)!

export default function DatabaseBrowser({ backend }: { backend: DbBackend }) {
  const api = useMemo(() => catalogOf(backend), [backend])
  const [catalog, setCatalog] = useState<Catalog>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const warnings = await backend.ready()
        const [version, tables, fks, history] = await Promise.all([api.serverVersion(), api.listTables(), api.listForeignKeys(), api.migrationHistory()])
        const columns: Record<string, ColumnInfo[]> = {}
        for (const t of tables) columns[t.name] = await api.listColumns(t.name)
        setSqlNames([
          ...tables.map((t) => ({ label: t.name, detail: t.kind === 'v' ? 'Sicht' : 'Tabelle', kind: 'table' as const })),
          ...tables.flatMap((t) => columns[t.name].map((c) => ({ label: c.name, detail: `${t.name}.${c.type}`, kind: 'column' as const }))),
        ])
        if (!cancelled) setCatalog({ version, tables, fks, columns, history, warnings })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [backend, api])

  if (error) return <Card className='p-6 text-sm text-destructive'>{backend.exactCounts ? 'Die Datenbank konnte nicht gestartet werden' : 'Die Datenbank konnte nicht gelesen werden'}: {error}</Card>
  if (!catalog)
    return (
      <Card className='grid h-[min(780px,calc(100vh-7rem))] min-h-[500px] place-content-center justify-items-center gap-3 text-sm text-muted-foreground'>
        <Loader2 className='size-6 animate-spin text-brand-600' />
        <span>{backend.exactCounts ? 'PostgreSQL startet und spielt Schema, Daten und Migrationen ein …' : `Verbinde mit ${backend.where} …`}</span>
      </Card>
    )
  return (
    <DbContext.Provider value={{ db: backend, api }}>
      <Workbench catalog={catalog} />
    </DbContext.Provider>
  )
}

/** Without prepared examples the console starts on the first table. */
const firstQuery = (db: DbBackend, catalog: Catalog) => db.examples?.[0]?.sql ?? (catalog.tables[0] ? `SELECT *\nFROM "${catalog.tables[0].name}"\nLIMIT 100;` : 'SELECT version();')

function Workbench({ catalog }: { catalog: Catalog }) {
  const { db } = useDb()
  const [sql, setSql] = useState(() => firstQuery(db, catalog))
  const [result, setResult] = useState<QueryResult>()
  const [sqlError, setSqlError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState(() => (catalog.tables.length === 0 && catalog.warnings.length > 0 && db.files?.length ? 'migrationen' : 'tabellen'))

  const execute = useCallback(async (text: string) => {
    setBusy(true)
    setSqlError(undefined)
    try {
      setResult(await db.run(text.replace(/;\s*$/, '')))
    } catch (e) {
      setResult(undefined)
      setSqlError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [db])

  const migrations = catalog.history.length > 0 || !!db.files?.length
  // Only migrations without their starting schema: nothing to browse, but the files are worth reading.
  const unbuilt = catalog.tables.length === 0 && catalog.warnings.length > 0
  const rowsTotal = catalog.tables.filter((t) => t.kind !== 'v').reduce((n, t) => n + t.rows, 0)
  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3'>
        <span className='flex items-center gap-2 font-medium'>
          <Database className='size-4 text-brand-600' /> {db.name}
          <Badge variant='outline' className='gap-1.5 font-normal'>
            <span className='size-1.5 rounded-full bg-emerald-500' /> verbunden
          </Badge>
          <Badge variant='secondary' className='font-normal'>nur lesen</Badge>
        </span>
        <span className='text-sm text-muted-foreground'>
          {catalog.version} · {catalog.tables.length} Tabellen und Sichten · {catalog.tables.some((t) => t.estimated && t.kind !== 'v') ? 'ca. ' : ''}{rowsTotal.toLocaleString('de-DE')} Zeilen · {db.where}
        </span>
      </div>
      {unbuilt ? (
        <p className='border-b bg-late-soft px-5 py-3 text-sm'>
          Aus den SQL-Dateien ließ sich keine Datenbank aufbauen. Meist sind es Migrationen, die ein bestehendes Schema voraussetzen. Die Dateien kannst du unter „Migrationen“ lesen. Um die echte Datenbank zu sehen, verbinde sie über „Datenbank verbinden“.
        </p>
      ) : catalog.warnings.length > 0 && (
        <details className='border-b bg-late-soft px-5 py-2 text-xs'>
          <summary className='cursor-pointer'>{catalog.warnings.length === 1 ? 'Eine SQL-Datei' : `${catalog.warnings.length} SQL-Dateien`} ließen sich nicht einspielen. Der Rest ist vollständig geladen.</summary>
          <ul className='mt-2 grid gap-1 font-mono text-[11px]'>
            {catalog.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </details>
      )}
      <Tabs value={tab} onValueChange={setTab} className='gap-0'>
        <div className='border-b px-5 py-2'>
          <TabsList>
            <TabsTrigger value='tabellen'>Tabellen</TabsTrigger>
            <TabsTrigger value='sql'>SQL</TabsTrigger>
            <TabsTrigger value='beziehungen'>Beziehungen</TabsTrigger>
            {migrations && <TabsTrigger value='migrationen'>Migrationen</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value='tabellen'>
          <TablesView catalog={catalog} />
        </TabsContent>
        <TabsContent value='sql'>
          <SqlView sql={sql} setSql={setSql} result={result} error={sqlError} busy={busy} onRun={() => execute(sql)} initial={() => !result && !sqlError && execute(sql)} />
        </TabsContent>
        <TabsContent value='beziehungen'>
          <ErDiagram catalog={catalog} />
        </TabsContent>
        {migrations && (
          <TabsContent value='migrationen'>
            <MigrationsView history={catalog.history} />
          </TabsContent>
        )}
      </Tabs>
    </Card>
  )
}

/* ---------- Results ---------- */

const NUMERIC_TYPES = [20, 21, 23, 700, 701, 1700]
const isNumeric = (f: { type: number }) => NUMERIC_TYPES.includes(f.type)

function ResultTable({ result, maxHeight = 420 }: { result: QueryResult; maxHeight?: number }) {
  if (!result.fields.length) return <p className='p-4 text-sm text-muted-foreground'>Keine Spalten.</p>
  return (
    <div className='overflow-auto' style={{ maxHeight }}>
      <table className='w-full border-collapse text-[13px]'>
        <thead className='sticky top-0 z-10 bg-muted'>
          <tr>
            <th className='w-10 border-b px-2 py-1.5 text-right font-normal text-muted-foreground'>#</th>
            {result.fields.map((f) => (
              <th key={f.name} className={cn('border-b px-3 py-1.5 font-medium whitespace-nowrap', isNumeric(f) ? 'text-right' : 'text-left')}>
                {f.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i} className='hover:bg-muted/40'>
              <td className='border-b px-2 py-1 text-right text-muted-foreground/70 tabular-nums'>{i + 1}</td>
              {result.fields.map((f) => {
                const v = r[f.name]
                const numeric = isNumeric(f)
                return (
                  <td key={f.name} className={cn('border-b px-3 py-1 font-mono text-xs whitespace-nowrap', numeric && 'text-right tabular-nums', v === null && 'text-muted-foreground/60 italic')}>
                    {formatCell(v, f.type)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 && <p className='p-4 text-sm text-muted-foreground'>Keine Zeilen.</p>}
    </div>
  )
}

/* ---------- Tables ---------- */

function TablesView({ catalog }: { catalog: Catalog }) {
  const { db } = useDb()
  const [selected, setSelected] = useState(() => (catalog.tables.some((t) => t.name === db.preferredTable) ? db.preferredTable! : catalog.tables[0]?.name ?? ''))
  const info = catalog.tables.find((t) => t.name === selected)
  if (!info) return <p className='p-6 text-sm text-muted-foreground'>Im Schema „{db.schema}“ gibt es keine Tabellen.</p>
  return (
    <div className='grid lg:grid-cols-[250px_minmax(0,1fr)]'>
      <nav className='max-h-[640px] overflow-auto border-b p-2 lg:border-e lg:border-b-0' aria-label='Tabellen'>
        {catalog.tables.map((t) => (
          <button
            key={t.name}
            type='button'
            onClick={() => setSelected(t.name)}
            aria-current={selected === t.name}
            className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-muted', selected === t.name && 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100')}
          >
            <Table2 className={cn('size-3.5 shrink-0', t.kind === 'v' ? 'text-amber-500' : 'text-brand-600')} />
            <span className='truncate'>{t.name}</span>
            <span className='ms-auto text-xs text-muted-foreground tabular-nums'>{t.kind === 'v' && t.estimated ? '' : `${t.estimated ? '≈ ' : ''}${t.rows.toLocaleString('de-DE')}`}</span>
          </button>
        ))}
      </nav>
      <TableDetail key={selected} info={info} columns={catalog.columns[selected]} fks={catalog.fks} />
    </div>
  )
}

function TableDetail({ info, columns, fks }: { info: TableInfo; columns: ColumnInfo[]; fks: ForeignKey[] }) {
  const { db, api } = useDb()
  const [data, setData] = useState<QueryResult>()
  const [indexes, setIndexes] = useState<{ indexname: string; indexdef: string }[]>([])
  const [parts, setParts] = useState<{ name: string; rows: number }[]>([])
  useEffect(() => {
    void db.run(`SELECT * FROM "${info.name.replaceAll('"', '""')}" ORDER BY 1 LIMIT 100`).then(setData, () => setData({ fields: [], rows: [], ms: 0 }))
    void api.listIndexes(info.name).then(setIndexes)
    if (info.kind === 'p') void api.listPartitions(info.name).then(setParts)
  }, [info, db, api])
  const fkOf = (col: string) => fks.find((f) => f.src === info.name && f.cols.split(', ').includes(col))
  const kind = info.kind === 'v' ? 'Sicht' : info.kind === 'p' ? 'Partitionierte Tabelle' : 'Tabelle'
  return (
    <div className='grid min-w-0 content-start gap-4 p-5'>
      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <h3 className='font-mono text-base font-medium'>{info.name}</h3>
        <span className='text-sm text-muted-foreground'>
          {kind} · {info.kind === 'v' && info.estimated ? '' : `${info.estimated ? 'ca. ' : ''}${info.rows.toLocaleString('de-DE')} Zeilen · `}{columns.length} Spalten
        </span>
      </div>
      <Tabs defaultValue='spalten' className='gap-3'>
        <TabsList>
          <TabsTrigger value='spalten'>Spalten</TabsTrigger>
          <TabsTrigger value='daten'>Daten</TabsTrigger>
          <TabsTrigger value='indizes'>Indizes{info.kind === 'p' ? ' und Partitionen' : ''}</TabsTrigger>
        </TabsList>
        <TabsContent value='spalten' className='overflow-auto rounded-lg border'>
          <table className='w-full border-collapse text-[13px]'>
            <thead className='bg-muted'>
              <tr>
                {['Spalte', 'Typ', 'Null', 'Standardwert', 'Schlüssel'].map((h) => (
                  <th key={h} className='border-b px-3 py-1.5 text-left font-medium'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => {
                const fk = fkOf(c.name)
                return (
                  <tr key={c.name} className='hover:bg-muted/40'>
                    <td className='border-b px-3 py-1.5 font-mono text-xs font-medium'>{c.name}</td>
                    <td className='border-b px-3 py-1.5 font-mono text-xs text-muted-foreground'>{c.type}</td>
                    <td className='border-b px-3 py-1.5 text-xs'>{c.nullable ? 'ja' : 'nein'}</td>
                    <td className='max-w-48 truncate border-b px-3 py-1.5 font-mono text-xs text-muted-foreground' title={c.def ?? ''}>{c.def ?? ''}</td>
                    <td className='border-b px-3 py-1.5 text-xs'>
                      <span className='flex flex-wrap gap-1'>
                        {c.pk && (
                          <Badge variant='outline' className='gap-1 font-normal'>
                            <KeyRound className='size-3 text-amber-500' /> PK
                          </Badge>
                        )}
                        {fk && (
                          <Badge variant='outline' className='gap-1 font-normal'>
                            <Link2 className='size-3 text-brand-600' /> {fk.ref}
                          </Badge>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TabsContent>
        <TabsContent value='daten' className='grid gap-2'>
          <p className='font-mono text-xs text-muted-foreground'>
            SELECT * FROM {info.name} ORDER BY 1 LIMIT 100{data ? ` · ${data.rows.length.toLocaleString('de-DE')} Zeilen` : ''}
          </p>
          <div className='overflow-hidden rounded-lg border'>{data ? <ResultTable result={data} /> : <p className='p-4 text-sm text-muted-foreground'>Lädt …</p>}</div>
        </TabsContent>
        <TabsContent value='indizes' className='grid gap-3'>
          <ul className='grid gap-2'>
            {indexes.map((i) => (
              <li key={i.indexname} className='rounded-lg border p-3'>
                <span className='font-mono text-xs font-medium'>{i.indexname}</span>
                <code className='mt-1 block font-mono text-[11px] break-words text-muted-foreground'>{i.indexdef}</code>
              </li>
            ))}
            {indexes.length === 0 && <li className='text-sm text-muted-foreground'>Keine Indizes.</li>}
          </ul>
          {parts.length > 0 && (
            <div className='grid gap-1.5'>
              <span className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>{parts.length} Partitionen</span>
              <div className='flex flex-wrap gap-1.5'>
                {parts.map((p) => (
                  <Badge key={p.name} variant={p.rows ? 'secondary' : 'outline'} className='font-mono text-[11px] font-normal'>
                    {p.name.replace(`${info.name}_`, '')}: {p.rows}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------- SQL console ---------- */

function SqlView({ sql, setSql, result, error, busy, onRun, initial }: { sql: string; setSql: (s: string) => void; result?: QueryResult; error?: string; busy: boolean; onRun: () => void; initial: () => void }) {
  const examples = useDb().db.examples ?? []
  useEffect(() => {
    initial()
    // only the first visit of the console runs the example query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className='grid'>
      <div className='flex flex-wrap items-center gap-2 border-b px-5 py-2.5'>
        <Button size='sm' onClick={onRun} disabled={busy}>
          {busy ? <Loader2 className='animate-spin' /> : <Play />} Ausführen <kbd className='ms-1 hidden rounded border border-white/30 px-1 font-mono text-[10px] sm:inline'>Strg ↵</kbd>
        </Button>
        {examples.length > 0 && <span className='ms-2 hidden text-xs text-muted-foreground md:inline'>Beispiele:</span>}
        {examples.map((e) => (
          <Button key={e.label} size='sm' variant='outline' className='h-7 text-xs font-normal' onClick={() => setSql(e.sql)}>
            {e.label}
          </Button>
        ))}
      </div>
      <div className='h-52 border-b'>
        <SqlEditor value={sql} onChange={setSql} onRun={onRun} />
      </div>
      <div className='min-h-40'>
        {error && <p className='m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs text-destructive'>{error}</p>}
        {result && (
          <>
            <p className='border-b px-5 py-2 text-xs text-muted-foreground'>
              {result.rows.length.toLocaleString('de-DE')} {result.rows.length === 1 ? 'Zeile' : 'Zeilen'}{result.truncated ? ' (gekürzt)' : ''} in {result.ms.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ms
            </p>
            <ResultTable result={result} maxHeight={340} />
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- Migrations ---------- */

function MigrationsView({ history }: { history: MigrationRow[] }) {
  const { db } = useDb()
  const files = useMemo(() => db.files ?? [], [db])
  const names = files.map((f) => f.name)
  const [file, setFile] = useState(() => names.find((f) => f.startsWith('12_')) ?? names[0])
  const [loaded, setLoaded] = useState<{ file: string; text: string }>()
  useEffect(() => {
    const f = files.find((x) => x.name === file)
    if (f) void f.load().then((text) => setLoaded({ file: f.name, text }))
  }, [file, files])
  const fileOf = (m: MigrationRow) => names.find((f) => f.endsWith(`_${m.script}`) || f.endsWith(`/${m.script}`)) ?? names[0]
  return (
    <div className='grid min-w-0'>
      {history.length > 0 && <div className='overflow-auto border-b'>
        <table className='w-full border-collapse text-[13px]'>
          <thead className='bg-muted'>
            <tr>
              {['#', 'Version', 'Beschreibung', 'Skript', 'Prüfsumme', 'Eingespielt', 'ms'].map((h) => (
                <th key={h} className='border-b px-3 py-1.5 text-left font-medium whitespace-nowrap'>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((m) => {
              const f = fileOf(m)
              return (
                <tr key={m.rank} onClick={() => setFile(f)} className={cn('cursor-pointer hover:bg-muted/40', f === file && 'bg-brand-50 dark:bg-brand-500/15')}>
                  <td className='border-b px-3 py-1.5 tabular-nums'>{m.rank}</td>
                  <td className='border-b px-3 py-1.5 font-mono text-xs'>{m.version}</td>
                  <td className='border-b px-3 py-1.5'>{m.description}</td>
                  <td className='border-b px-3 py-1.5 font-mono text-xs text-muted-foreground'>{m.script}</td>
                  <td className='border-b px-3 py-1.5 font-mono text-xs text-muted-foreground'>{m.checksum ?? ''}</td>
                  <td className='border-b px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground'>{m.installedOn}</td>
                  <td className='border-b px-3 py-1.5 text-xs tabular-nums text-muted-foreground'>{m.ms}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}
      {names.length > 0 && <>
      <div className='flex flex-wrap items-center gap-1.5 border-b px-5 py-2'>
        <span className='me-1 flex items-center gap-1.5 text-xs text-muted-foreground'>
          <FileCode2 className='size-3.5' /> {db.filesLabel ?? 'SQL-Dateien:'}
        </span>
        {names.map((f) => (
          <Button key={f} size='sm' variant={f === file ? 'secondary' : 'ghost'} className='h-6 px-2 font-mono text-[11px] font-normal' onClick={() => setFile(f)}>
            {f}
          </Button>
        ))}
      </div>
      <div className='h-[360px]'>
        {loaded?.file === file && <CodeEditor path={file.endsWith('.sql') ? file : `db/${file}`} text={loaded.text} onCursor={() => {}} />}
      </div>
      </>}
    </div>
  )
}

/* ---------- Relationships ---------- */

type TableNodeData = { name: string; kind: TableInfo['kind']; columns: ColumnInfo[]; fkCols: Set<string> }

function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  return (
    <div className='w-56 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs'>
      <Handle type='source' position={Position.Left} className='!size-1.5 !border-0 !bg-brand-500' />
      <Handle type='target' position={Position.Right} className='!size-1.5 !border-0 !bg-brand-500' />
      <div className={cn('flex items-center gap-1.5 border-b px-2.5 py-1.5 text-xs font-medium', data.kind === 'v' ? 'bg-amber-500/10' : 'bg-brand-50 dark:bg-brand-500/15')}>
        <Table2 className='size-3.5 text-brand-600' /> <span className='font-mono'>{data.name}</span>
      </div>
      <ul className='py-1'>
        {data.columns.map((c) => (
          <li key={c.name} className='flex items-center gap-1.5 px-2.5 py-0.5 text-[11px]'>
            {c.pk ? <KeyRound className='size-3 shrink-0 text-amber-500' /> : data.fkCols.has(c.name) ? <Link2 className='size-3 shrink-0 text-brand-600' /> : <span className='size-3 shrink-0' />}
            <span className='font-mono'>{c.name}</span>
            <span className='ms-auto truncate text-muted-foreground'>{c.type.replace('character varying', 'varchar').replace('timestamp without time zone', 'timestamp')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const nodeTypes = { table: TableNode }

/** Parents to the left, children to the right: the column is the longest foreign-key chain above a table. */
function layoutTables(catalog: Catalog): Node<TableNodeData>[] {
  const real = catalog.tables.filter((t) => t.kind !== 'v')
  const parents = (t: string) => catalog.fks.filter((f) => f.src === t && f.ref !== t).map((f) => f.ref)
  const depth = (t: string, seen: string[] = []): number => (seen.includes(t) ? 0 : parents(t).reduce((m, p) => Math.max(m, 1 + depth(p, [...seen, t])), 0))
  const height = (name: string) => 40 + catalog.columns[name].length * 20 + 24
  const MAX = 720
  const COL = 300
  const placed: Node<TableNodeData>[] = []
  let x = 0
  for (const d of [...new Set(real.map((t) => depth(t.name)))].sort((a, b) => a - b)) {
    // a level that is taller than the canvas continues in a further column
    let y = 0
    let used = false
    for (const t of real.filter((r) => depth(r.name) === d)) {
      if (y > 0 && y + height(t.name) > MAX) {
        x += COL
        y = 0
      }
      const cols = catalog.columns[t.name]
      placed.push({
        id: t.name,
        type: 'table',
        position: { x, y },
        data: { name: t.name, kind: t.kind, columns: cols, fkCols: new Set(catalog.fks.filter((f) => f.src === t.name).flatMap((f) => f.cols.split(', '))) },
      })
      y += height(t.name)
      used = true
    }
    if (used) x += COL
  }
  return placed
}

function ErDiagram({ catalog }: { catalog: Catalog }) {
  const [nodes, setNodes] = useState(() => layoutTables(catalog))
  const edges = useMemo<Edge[]>(
    () =>
      catalog.fks.map((f) => ({
        id: f.name,
        source: f.src,
        target: f.ref,
        type: 'smoothstep',
        label: f.cols,
        labelStyle: { fontSize: 10 },
        style: { stroke: 'var(--brand-500)', strokeWidth: 1.5 },
      })),
    [catalog],
  )
  const onNodesChange = useCallback((changes: NodeChange<Node<TableNodeData>>[]) => setNodes((n) => applyNodeChanges(changes, n)), [])
  return (
    <div className='h-[680px]'>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} nodesConnectable={false} elementsSelectable={false} fitView fitViewOptions={{ padding: 0.1 }} minZoom={0.2} maxZoom={1.5} proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color='var(--border)' />
        <Controls showInteractive={false} position='bottom-right' />
      </ReactFlow>
    </div>
  )
}
