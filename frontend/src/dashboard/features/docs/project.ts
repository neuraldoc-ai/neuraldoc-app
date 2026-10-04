import { installDataset, type ProjectDataset } from './data'
import { installBrain, type brain } from './brain/model'

type Source = { label: string; source: 'upload' | 'url' }
export type ProjectState = {
  mode: 'showcase' | 'working'; canImport: boolean
  project: null | {
    id: string; name: string; createdAt: string; warnings: string[]
    sources: { repo: Source; docs: Source | null }
    mapping: null | { subjects: number; mismatches: number; consistent: number; deferred: string[]; usage: { requests: number; estimatedUsd: number } }
    files: { id: string; path: string }[]
    documents: { id: string; title: string; path: string; origin: 'repo' | 'docs'; format: string; part: number; parts: number }[]
  }
  projects?: { id: string; name: string; createdAt: string }[]
  dataset: ProjectDataset | null; graph: typeof brain | null
}
export let projectState: ProjectState
export async function loadProject() {
  const response = await fetch('/api/mcp/project', { cache: 'no-store' })
  if (!response.ok) throw new Error('Lokaler Node-Server ist nicht erreichbar.')
  projectState = await response.json() as ProjectState
  installDataset(projectState.dataset)
  installBrain(projectState.graph)
  const { refreshDecisions } = await import('./store')
  const { refreshGenerated } = await import('./generation-store')
  await Promise.all([refreshDecisions(), refreshGenerated()])
}

async function result(response: Response) {
  const body = await response.json().catch(() => ({ error: `Server antwortet mit HTTP ${response.status}.` })) as { error?: string }
  if (!response.ok) throw new Error(body.error || 'Projektaktion fehlgeschlagen.')
}
export async function projectAction(action: 'activate' | 'check', body: unknown = {}) {
  await result(await fetch(`/api/mcp/project/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  // A new dataset invalidates document and change ids of the previous one.
  if (action === 'check') window.location.reload()
  else window.location.assign(`${import.meta.env.BASE_URL}`)
}
export async function importProject(archive: Uint8Array) {
  await result(await fetch('/api/mcp/project/import', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: archive as Uint8Array<ArrayBuffer> }))
  window.location.assign(`${import.meta.env.BASE_URL}`)
}
