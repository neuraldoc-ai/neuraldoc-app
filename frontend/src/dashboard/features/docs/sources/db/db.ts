/**
 * The MOBIQ database as real PostgreSQL: PGlite (Postgres compiled to WebAssembly) runs in the browser and loads exactly the
 * files a Postgres container would run on first start (datasets/mobiq-db/initdb: schema 26.2, data, the Flyway
 * migrations from the repository, data after 26.4). No server needed.
 */
import { PGlite } from '@electric-sql/pglite'

const files = import.meta.glob('../../../../../../../datasets/mobiq-db/initdb/*.sql', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

export const initFiles = Object.keys(files)
  .sort()
  .map((p) => p.split('/').pop()!)

export async function loadInitFile(name: string) {
  const path = Object.keys(files).find((p) => p.endsWith(`/${name}`))
  return path ? files[path]() : ''
}

let booting: Promise<PGlite> | undefined

export function getDb() {
  booting ??= (async () => {
    const db = new PGlite()
    for (const path of Object.keys(files).sort()) await db.exec(await files[path]())
    return db
  })()
  return booting
}

export type Cell = string | number | boolean | null | Date | bigint
export type QueryResult = { fields: { name: string; type: number }[]; rows: Record<string, Cell>[]; ms: number }

/** Every query runs in a read-only transaction: the example database can be explored but not changed. */
export async function run(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const db = await getDb()
  const t0 = performance.now()
  const result = await db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION READ ONLY')
    return tx.query<Record<string, Cell>>(sql, params)
  })
  return { fields: result.fields.map((f) => ({ name: f.name, type: f.dataTypeID })), rows: result.rows, ms: performance.now() - t0 }
}

const rows = async <T>(sql: string, params: unknown[] = []) => (await run(sql, params)).rows as T[]

/* ---------- catalog ---------- */

export type TableInfo = { name: string; kind: 'r' | 'p' | 'v'; rows: number }
export type ColumnInfo = { name: string; type: string; nullable: boolean; def: string | null; pk: boolean }
export type ForeignKey = { name: string; src: string; cols: string; ref: string }
export type MigrationRow = { rank: number; version: string | null; description: string; script: string; checksum: number | null; installedOn: string; ms: number }

export async function listTables(): Promise<TableInfo[]> {
  const list = await rows<{ name: string; kind: TableInfo['kind'] }>(
    `SELECT c.relname AS name, c.relkind AS kind
     FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v') AND NOT c.relispartition
     ORDER BY c.relname`,
  )
  const out: TableInfo[] = []
  for (const t of list) out.push({ ...t, rows: Number((await rows<{ n: number }>(`SELECT count(*) AS n FROM "${t.name}"`))[0].n) })
  return out
}

export const listColumns = (table: string) =>
  rows<ColumnInfo>(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
            pg_get_expr(d.adbin, d.adrelid) AS def,
            EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS pk
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
    [`public."${table}"`],
  )

export const listForeignKeys = () =>
  rows<ForeignKey>(
    `SELECT c.conname AS name, c.conrelid::regclass::text AS src, c.confrelid::regclass::text AS ref,
            (SELECT string_agg(a.attname, ', ') FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS cols
     FROM pg_constraint c WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace ORDER BY 2, 1`,
  )

export const listIndexes = (table: string) => rows<{ indexname: string; indexdef: string }>(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`, [table])

export async function listPartitions(table: string) {
  const parts = await rows<{ name: string }>(`SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = $1::regclass ORDER BY 1`, [`public."${table}"`])
  const out: { name: string; rows: number }[] = []
  for (const p of parts) out.push({ name: p.name, rows: Number((await rows<{ n: number }>(`SELECT count(*) AS n FROM "${p.name}"`))[0].n) })
  return out
}

export const serverVersion = async () => ((await rows<{ v: string }>('SELECT version() AS v'))[0].v.match(/^PostgreSQL [\d.]+/)?.[0] ?? 'PostgreSQL')

export const migrationHistory = () =>
  rows<{ installed_rank: number; version: string | null; description: string; script: string; checksum: number | null; installed_on: Date; execution_time: number }>(
    'SELECT installed_rank, version, description, script, checksum, installed_on, execution_time FROM flyway_schema_history ORDER BY installed_rank',
  ).then((list) => list.map((r): MigrationRow => ({ rank: r.installed_rank, version: r.version, description: r.description, script: r.script, checksum: r.checksum, installedOn: formatCell(r.installed_on, 1114), ms: r.execution_time })))

/** Cell text for the result tables: dates without the time zone noise PGlite's Date objects carry. */
export function formatCell(v: Cell, type?: number): string {
  if (v === null) return 'NULL'
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    if (type === 1082) return v.toISOString().slice(0, 10)
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`
  }
  return String(v)
}
