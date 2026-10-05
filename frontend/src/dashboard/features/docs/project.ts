import { installDataset, installShowcase, type ProjectDataset } from './data'
import { installBrain, showcaseBrain, type Brain } from './brain/model'
import { useProfile, type Profile } from '@/features/settings/profile-store'

type Source = { label: string; source: 'upload' | 'url' }
export type ProjectState = {
  /** showcase only in the showcase build (NEURALDOC_MODE=showcase); the normal app is empty or working. */
  mode: 'showcase' | 'working' | 'empty'; canImport: boolean
  project: null | {
    id: string; name: string; createdAt: string; warnings: string[]
    sources: { repo: Source; docs: Source | null }
    mapping: null | { subjects: number; mismatches: number; consistent: number; deferred: string[]; usage: { requests: number; estimatedUsd: number } }
    files: { id: string; path: string }[]
    documents: { id: string; title: string; path: string; origin: 'repo' | 'docs'; format: string; part: number; parts: number }[]
  }
  projects?: { id: string; name: string; createdAt: string }[]
  dataset: ProjectDataset | null; graph: Brain | null
  /** null in the public showcase, where nobody has a profile. */
  profile: Profile | null
}
export let projectState: ProjectState
export async function loadProject() {
  const response = await fetch('/api/mcp/project', { cache: 'no-store' })
  if (!response.ok) throw new Error('neuraldoc-Server ist nicht erreichbar.')
  projectState = await response.json() as ProjectState
  useProfile.getState().set(projectState.profile ?? null)
  if (projectState.mode === 'showcase') {
    await installShowcase()
    installBrain(await showcaseBrain())
  } else {
    installDataset(projectState.dataset)
    installBrain(projectState.graph)
  }
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

/** The fictional MOBIQ example as a normal project: code 26.4 and documentation 26.3, cloned from GitHub. */
export const SAMPLE = { repo: 'https://github.com/neuraldoc-ai/mobiq-code.git', docs: 'https://github.com/neuraldoc-ai/mobiq-docs.git' }
export async function importSample() {
  const { archive } = await import('./upload')
  await importProject(await archive(null, null, { repoUrl: SAMPLE.repo, docsUrl: SAMPLE.docs, projectName: 'MOBIQ (Beispiel)' }))
}
