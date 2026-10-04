import { installDataset, type ProjectDataset } from './data'
import { installBrain, type brain } from './brain/model'

export type ProjectState = {
  mode: 'showcase' | 'working'; canImport: boolean
  project: null | { id: string; name: string; repository: string; documentation: string; base: string; head: string; warnings: string[]; mapping: null | { subjects: number; deferred: string[]; usage: { requests: number; estimatedUsd: number } }; files: { id: string; path: string; changed: boolean; deleted?: boolean }[]; documents: { id: string; title: string; path: string }[] }
  projects?: { id: string; name: string; head: string }[]
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
export async function projectAction(action: string, body: unknown = {}) {
  const response = await fetch(`/api/mcp/project/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json() as { error?: string }
  if (!response.ok) throw new Error(result.error || 'Projektaktion fehlgeschlagen.')
  // A new dataset invalidates document and change ids of the previous one.
  if (action === 'map') window.location.reload()
  else window.location.assign(`${import.meta.env.BASE_URL}`)
}
