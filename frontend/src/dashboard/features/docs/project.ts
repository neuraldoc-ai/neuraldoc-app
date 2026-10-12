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
    mapping: null | {
      subjects: number; mismatches: number; consistent: number; deferred: string[]; model?: string
      /** Section check (since October 2026): sections without prose, open questions, failed sections, all findings. */
      skipped?: number; unclear?: number; errors?: number; findings?: number
      usage: { requests: number; estimatedUsd: number; llm?: { calls: number; cached: number; usd: number } }
    }
    files: { id: string; path: string }[]
    documents: { id: string; title: string; path: string; origin: 'repo' | 'docs'; format: string; part: number; parts: number }[]
  }
  /** The Git history of a cloned repository since its last release; null for an uploaded folder. */
  history?: null | { ref: string; tag: string | null; commits: number }
  projects?: { id: string; name: string; createdAt: string }[]
  dataset: ProjectDataset | null; graph: Brain | null
  /** The code brain's summary and clean-up (mcp/code-brain.mjs); null in the showcase and for older imports. */
  codeBrain?: null | {
    stats: { sections: number; linked: number; links: number; codeFiles: number; linkedFiles: number }
    cleanup: {
      undocumented: { name: string; kind: string; path: string; line: number; fanIn: number }[]
      dead: { name: string; sections: string[]; weight: number }[]
      unlinked: string[]
    }
  }
  /** null in the public showcase, where nobody has a profile. */
  profile: Profile | null
}
export let projectState: ProjectState
/** Number of entries on the Company Brain's Lücken tab. */
export const gapCount = () => {
  const c = projectState?.codeBrain?.cleanup
  return c ? c.unlinked.length + c.undocumented.length + c.dead.length : 0
}
export async function loadProject() {
  const response = await fetch('/api/mcp/project', { cache: 'no-store' })
  if (!response.ok) throw new Error('Der neuraldoc-Server antwortet nicht. Läuft der Container?')
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
  const body = await response.json().catch(() => ({ error: `Der Server meldet HTTP ${response.status}.` })) as { error?: string }
  if (!response.ok) throw new Error(body.error || 'Das hat nicht geklappt. Versuch es noch einmal.')
}
export async function projectAction(action: 'activate', body: unknown = {}) {
  await result(await fetch(`/api/mcp/project/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  // A new dataset invalidates document and change ids of the previous one.
  window.location.assign(`${import.meta.env.BASE_URL}`)
}

/** The initial check runs on the server in the background: sections, then completeness of lists, then Jev. */
export type CheckStatus = { running: boolean; phase: 'sections' | 'lists' | 'jev' | 'done' | 'failed' | null; done: number; total: number; findings: number; error: string | null; finishedAt: string | null }
export async function startCheck() {
  await result(await fetch('/api/mcp/project/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
}
export async function loadCheckStatus(): Promise<CheckStatus> {
  const response = await fetch('/api/mcp/project/check', { cache: 'no-store' })
  if (!response.ok) throw new Error('Der Stand der Erstprüfung ist nicht abrufbar.')
  return response.json() as Promise<CheckStatus>
}
/** Keeping the project in step with its sources (mcp/source-watch.mjs). */
export type SyncState = {
  available: boolean
  minutes?: number
  repo?: { label: string; url: string | null; head: string | null }
  docsWatch?: { ok: boolean; reason?: string }
  pendingSections?: number
  running?: 'code' | 'docs' | null
  lastLook?: string | null
  lastCode?: { at: string; from: string | null; to: string | null; files: number; sections: number; checked: boolean } | null
  docs?: { changes: { source: string; title: string; change: 'neu' | 'geändert' | 'gelöscht' }[]; lookedAt: string | null }
  error?: string | null
}
export async function loadSync(): Promise<SyncState> {
  const response = await fetch('/api/mcp/sync', { cache: 'no-store' })
  if (!response.ok) throw new Error('Der Abgleich ist nicht abrufbar.')
  return response.json() as Promise<SyncState>
}
export async function syncAction(action: 'look' | 'docs') {
  await result(await fetch(action === 'docs' ? '/api/mcp/sync/docs' : '/api/mcp/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
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
