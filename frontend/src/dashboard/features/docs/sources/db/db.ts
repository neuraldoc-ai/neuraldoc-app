/**
 * Databases on the Daten page, behind one interface (DbBackend):
 * - the MOBIQ database: PGlite (Postgres compiled to WebAssembly) in the browser loads exactly the files a Postgres
 *   container would run on first start (datasets/mobiq-db/initdb). No server needed.
 * - an imported repository's SQL files (schema, migrations), loaded into PGlite the same way.
 * - an own PostgreSQL connection, queried through the local server (mcp/db-connections.mjs).
 * Every query is read-only.
 */
import type { PGlite } from '@electric-sql/pglite'

export type Cell = string | number | boolean | null | Date | bigint
export type QueryResult = { fields: { name: string; type: number }[]; rows: Record<string, Cell>[]; ms: number; truncated?: boolean }
export type Runner = (sql: string, params?: unknown[]) => Promise<QueryResult>

export type DbBackend = {
  /** Shown in the header, e.g. the database name. */
  name: string
  /** Where it runs, e.g. „im Browser (PGlite)“ or „db.example.com:5432 · SSL“. */
  where: string
  schema: string
  run: Runner
  /** Exact row counts are cheap in PGlite; a real server gets the planner's estimate. */
  exactCounts: boolean
  /** Waits until the database is ready; resolves with problems worth showing (e.g. a file that failed). */
  ready: () => Promise<string[]>
  examples?: { label: string; sql: string }[]
  /** Source files (schema, migrations) shown in the Migrationen tab. */
  files?: { name: string; load: () => Promise<string> }[]
  filesLabel?: string
  preferredTable?: string
}

/* ---------- PGlite ---------- */

/** Flyway order: V1__, V1.1__, V2__ by version, then everything else by path. */
export function sqlOrder(a: string, b: string) {
  const version = (p: string) => p.split('/').pop()!.match(/^V(\d+(?:[._]\d+)*)__/i)?.[1].split(/[._]/).map(Number)
  const va = version(a), vb = version(b)
  if (va && vb) {
    for (let i = 0; i < Math.max(va.length, vb.length); i++) if ((va[i] ?? 0) !== (vb[i] ?? 0)) return (va[i] ?? 0) - (vb[i] ?? 0)
    return 0
  }
  if (va) return -1
  if (vb) return 1
  return a.localeCompare(b, undefined, { numeric: true })
}

export function pgliteBackend({ name, files, examples, preferredTable, filesLabel, stopOnError = true }: { name: string; files: { name: string; load: () => Promise<string> }[]; examples?: DbBackend['examples']; preferredTable?: string; filesLabel?: string; stopOnError?: boolean }): DbBackend {
  let booting: Promise<{ db: PGlite; warnings: string[] }> | undefined
  const boot = () =>
    (booting ??= (async () => {
      const { PGlite } = await import('@electric-sql/pglite')
      const db = new PGlite()
      const warnings: string[] = []
      for (const f of files) {
        try {
          await db.exec(await f.load())
        } catch (e) {
          if (stopOnError) throw e
          // One file that needs an extension or another dialect must not hide everything else.
          warnings.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      return { db, warnings }
    })())
  return {
    name,
    where: 'im Browser (PGlite)',
    schema: 'public',
    exactCounts: true,
    examples,
    files,
    filesLabel,
    preferredTable,
    ready: async () => (await boot()).warnings,
    run: async (sql, params = []) => {
      const { db } = await boot()
      const t0 = performance.now()
      const result = await db.transaction(async (tx) => {
        await tx.query('SET TRANSACTION READ ONLY')
        return tx.query<Record<string, Cell>>(sql, params)
      })
      return { fields: result.fields.map((f) => ({ name: f.name, type: f.dataTypeID })), rows: result.rows, ms: performance.now() - t0 }
    },
  }
}

/* ---------- The MOBIQ example ---------- */

const mobiqFiles = import.meta.glob('../../../../../../../datasets/mobiq-db/initdb/*.sql', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

const MOBIQ_EXAMPLES: { label: string; sql: string }[] = [
  {
    label: 'Umsatz je Filiale 2026',
    sql: `SELECT f.name AS filiale, count(*) AS belege, sum(b.summe) AS umsatz
FROM kassenbeleg b
JOIN filiale f USING (filial_id)
WHERE b.belegdatum >= DATE '2026-01-01' AND NOT b.storniert
GROUP BY f.name
ORDER BY umsatz DESC;`,
  },
  {
    label: 'Teillieferungen (MOB-4812)',
    sql: `SELECT k.kv_nr, l.teil_nr, l.wunsch_kw, l.status, count(p.kvp_id) AS positionen
FROM lieferteil l
JOIN kaufvertrag k USING (kv_id)
LEFT JOIN kv_position p ON p.lt_id = l.lt_id
GROUP BY k.kv_nr, l.teil_nr, l.wunsch_kw, l.status
ORDER BY k.kv_nr, l.teil_nr;`,
  },
  {
    label: 'Finanzkäufe nach Status',
    sql: `SELECT status, count(*) FILTER (WHERE finanzkauf) AS finanzkauf, count(*) AS gesamt
FROM kaufvertrag
GROUP BY status
ORDER BY gesamt DESC;`,
  },
  {
    label: 'Gutscheine mit Restguthaben',
    sql: `SELECT gutschein_nr, wert, restwert, round(100 * restwert / wert) AS rest_prozent, gueltig_bis
FROM gutschein
WHERE restwert > 0 AND restwert < wert
ORDER BY restwert DESC;`,
  },
  {
    label: 'Partitionen der Kassenbelege (MOB-4790)',
    sql: `SELECT tableoid::regclass AS partition, count(*) AS belege, min(belegdatum) AS von, max(belegdatum) AS bis
FROM kassenbeleg
GROUP BY 1
ORDER BY 1;`,
  },
]

export const showcaseBackend = () =>
  pgliteBackend({
    name: 'mobiq',
    files: Object.keys(mobiqFiles).sort().map((p) => ({ name: p.split('/').pop()!, load: mobiqFiles[p] })),
    examples: MOBIQ_EXAMPLES,
    preferredTable: 'kaufvertrag',
    filesLabel: 'Dateien beim ersten Start (docker-compose, Ordner initdb):',
  })

/** The SQL files of an imported repository, in Flyway order. */
export const repositoryBackend = (name: string, files: { path: string; text: string }[]) =>
  pgliteBackend({
    name,
    files: [...files].sort((a, b) => sqlOrder(a.path, b.path)).map((f) => ({ name: f.path, load: async () => f.text })),
    filesLabel: 'SQL-Dateien aus dem Repository, in dieser Reihenfolge eingespielt:',
    stopOnError: false,
  })

/* ---------- An own connection, through the local server ---------- */

export type Connection = { id: string; name: string; host: string; port: number; database: string; user: string; ssl: 'disable' | 'prefer' | 'require' | 'verify-full'; schema: string; passwordSet: boolean }

export const sslLabel: Record<Connection['ssl'], string> = { disable: 'ohne SSL', prefer: 'SSL wenn möglich', require: 'SSL', 'verify-full': 'SSL mit Zertifikatsprüfung' }

export function remoteBackend(c: Connection): DbBackend {
  return {
    name: c.database,
    where: `${c.host}:${c.port} · ${sslLabel[c.ssl]}`,
    schema: c.schema,
    exactCounts: false,
    ready: async () => [],
    run: async (sql, params = []) => {
      const response = await fetch('/api/mcp/db/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, sql, params }) })
      const body = (await response.json().catch(() => ({}))) as QueryResult & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Die Abfrage ist fehlgeschlagen.')
      return body
    },
  }
}

/* ---------- Catalog: the same SQL for every backend ---------- */

export type TableInfo = { name: string; kind: 'r' | 'p' | 'v'; rows: number; estimated?: boolean }
export type ColumnInfo = { name: string; type: string; nullable: boolean; def: string | null; pk: boolean }
export type ForeignKey = { name: string; src: string; cols: string; ref: string }
export type MigrationRow = { rank: number; version: string | null; description: string; script: string; checksum: number | null; installedOn: string; ms: number }

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`

export function catalogOf(db: DbBackend) {
  const rows = async <T>(sql: string, params: unknown[] = []) => (await db.run(sql, params)).rows as T[]
  const qualified = (table: string) => `${ident(db.schema)}.${ident(table)}`
  // Exact counts in PGlite and for small or never analyzed tables; a large table on a server gets the planner's estimate.
  const count = async (table: string, estimate: number): Promise<{ rows: number; estimated?: boolean }> => {
    if (!db.exactCounts && estimate >= 50_000) return { rows: Math.round(estimate), estimated: true }
    try { return { rows: Number((await rows<{ n: number }>(`SELECT count(*) AS n FROM ${qualified(table)}`))[0].n) } } catch { return { rows: Math.max(0, Math.round(estimate)), estimated: true } }
  }
  return {
    async listTables(): Promise<TableInfo[]> {
      const list = await rows<{ name: string; kind: TableInfo['kind']; estimate: number }>(
        `SELECT c.relname AS name, c.relkind AS kind, c.reltuples::float8 AS estimate
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relkind IN ('r','p','v') AND NOT c.relispartition
         ORDER BY c.relname LIMIT 500`,
        [db.schema],
      )
      const out: TableInfo[] = []
      for (const t of list) out.push({ name: t.name, kind: t.kind, ...(t.kind === 'v' && !db.exactCounts ? { rows: 0, estimated: true } : await count(t.name, Number(t.estimate))) })
      return out
    },
    listColumns: (table: string) =>
      rows<ColumnInfo>(
        `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
                pg_get_expr(d.adbin, d.adrelid) AS def,
                EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS pk
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
        [qualified(table)],
      ),
    listForeignKeys: () =>
      rows<ForeignKey>(
        `SELECT c.conname AS name, c.conrelid::regclass::text AS src, c.confrelid::regclass::text AS ref,
                (SELECT string_agg(a.attname, ', ') FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS cols
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.contype = 'f' AND n.nspname = $1 ORDER BY 2, 1`,
        [db.schema],
      ).then((list) => list.map((f) => ({ ...f, src: unqualify(f.src, db.schema), ref: unqualify(f.ref, db.schema) }))),
    listIndexes: (table: string) => rows<{ indexname: string; indexdef: string }>(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname`, [db.schema, table]),
    async listPartitions(table: string) {
      const parts = await rows<{ name: string; estimate: number }>(`SELECT c.relname AS name, c.reltuples::float8 AS estimate FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = $1::regclass ORDER BY 1`, [qualified(table)])
      const out: { name: string; rows: number }[] = []
      for (const p of parts) out.push({ name: p.name, rows: (await count(p.name, Number(p.estimate))).rows })
      return out
    },
    serverVersion: async () => ((await rows<{ v: string }>('SELECT version() AS v'))[0].v.match(/^PostgreSQL [\d.]+/)?.[0] ?? 'PostgreSQL'),
    /** Flyway's history table, if the database has one. */
    async migrationHistory(): Promise<MigrationRow[]> {
      const exists = (await rows<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${ident(db.schema)}.flyway_schema_history`]))[0]?.t
      if (!exists) return []
      const list = await rows<{ installed_rank: number; version: string | null; description: string; script: string; checksum: number | null; installed_on: Date | string; execution_time: number }>(
        `SELECT installed_rank, version, description, script, checksum, installed_on, execution_time FROM ${ident(db.schema)}.flyway_schema_history ORDER BY installed_rank`,
      )
      return list.map((r) => ({ rank: r.installed_rank, version: r.version, description: r.description, script: r.script, checksum: r.checksum, installedOn: formatCell(r.installed_on, 1114), ms: r.execution_time }))
    },
  }
}

/** Names outside the search path come back schema-qualified (and quoted when needed). */
const unqualify = (name: string, schema: string) => name.replace(new RegExp(`^"?${schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?\\.`), '').replace(/^"(.*)"$/, '$1')

/** Cell text for the result tables: dates without the time zone noise PGlite's Date objects carry. */
export function formatCell(v: Cell, type?: number): string {
  if (v === null) return 'NULL'
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    if (type === 1082) return v.toISOString().slice(0, 10)
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`
  }
  if (type === 1082 && typeof v === 'string') return v.slice(0, 10)
  return String(v)
}
