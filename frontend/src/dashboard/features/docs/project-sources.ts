// What the Daten page of an imported project reads from the local server: repository with history, full
// documents and the own database connections. Shared query keys, so every view loads each of them once.
import { useQuery } from '@tanstack/react-query'
import type { Raw } from './sources/shared'
import type { Connection } from './sources/db/db'

export type ProjectSource = {
  repository: { project: string; ref: string | null; tag: string | null; head: Raw | null; files: Record<string, { content: string; lastCommit: Raw | null; extracted?: boolean }> }
  commits: Raw[]
  mergeRequests: Raw[]
}
export type ProjectDocument = { id: string; path: string; origin: 'repo' | 'docs'; format: string; binary: boolean; text: string; sections: string[] }

async function get<T>(url: string, message: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const body = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || message)
  return body
}

export const useProjectSource = () => useQuery({ queryKey: ['project', 'source'], queryFn: () => get<ProjectSource>('/api/mcp/project/source', 'Das Repository konnte nicht geladen werden.'), staleTime: Infinity })
export const useProjectDocuments = () => useQuery({ queryKey: ['project', 'documents'], queryFn: async () => (await get<{ documents: ProjectDocument[] }>('/api/mcp/project/documents', 'Die Dokumente konnten nicht geladen werden.')).documents, staleTime: Infinity })
export const useConnections = () => useQuery({ queryKey: ['db', 'connections'], queryFn: async () => (await get<{ connections: Connection[] }>('/api/mcp/db/connections', 'Die Verbindungen konnten nicht geladen werden.')).connections })

/** SQL files of the repository: schema, migrations, seed data. */
export const sqlFilesOf = (source?: ProjectSource) =>
  Object.entries(source?.repository.files ?? {})
    .filter(([path]) => /\.sql$/i.test(path))
    .map(([path, f]) => ({ path, text: f.content }))

export async function post<T>(url: string, body: unknown, message: string): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(result.error || message)
  return result
}
