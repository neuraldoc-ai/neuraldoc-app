// Collects a dropped or picked folder (or ZIP) in the browser and keeps only what the server reads.
import { classify, ignored, LIMITS } from './import-rules.mjs'

export type Role = 'repo' | 'docs'
export type Picked = { name: string; files: { path: string; data: Uint8Array }[]; code: number; docs: number; bytes: number }
type Candidate = { path: string; size: number; read: () => Promise<Uint8Array> }

const fromFile = (file: File, path: string): Candidate => ({ path, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) })

async function fromZip(file: File): Promise<Candidate[]> {
  const { unzipSync } = await import('fflate')
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => !f.name.endsWith('/') && !ignored(f.name) })
  return Object.entries(entries).map(([path, data]) => ({ path, size: data.length, read: async () => data }))
}

async function fromEntry(entry: FileSystemEntry, out: Candidate[]): Promise<void> {
  const path = entry.fullPath.replace(/^\/+/, '')
  if (ignored(path)) return
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push(fromFile(file, path)); return
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  // readEntries returns at most 100 entries per call.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    for (const child of batch) await fromEntry(child, out)
  }
}

/** Candidates from a file input (folder or single files) or a drop; a single ZIP is unpacked. */
export async function candidates(source: FileList | DataTransfer): Promise<Candidate[]> {
  const out: Candidate[] = []
  if ('items' in source) {
    const entries = [...source.items].map((item) => item.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e)
    if (entries.length === 1 && entries[0].isFile && /\.zip$/i.test(entries[0].name)) return fromZip(source.files[0])
    for (const entry of entries) await fromEntry(entry, out)
    return out
  }
  const files = [...source]
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) return fromZip(files[0])
  for (const file of files) { const path = file.webkitRelativePath || file.name; if (!ignored(path)) out.push(fromFile(file, path)) }
  return out
}

/** Strips a shared top folder (as in GitHub ZIPs), filters by the import rules and reads the remaining files. */
export async function pick(list: Candidate[], role: Role): Promise<Picked> {
  const tops = new Set(list.map((c) => c.path.includes('/') ? c.path.split('/')[0] : ''))
  const top = tops.size === 1 && !tops.has('') ? [...tops][0] : ''
  const kept = list.map((c) => ({ ...c, path: top ? c.path.slice(top.length + 1) : c.path })).map((c) => ({ ...c, kind: classify(c.path, role) })).filter((c) => c.kind && c.size <= (c.kind === 'code' ? LIMITS.codeBytes : LIMITS.fileBytes))
  const bytes = kept.reduce((sum, c) => sum + c.size, 0)
  if (bytes > LIMITS.uploadBytes) throw new Error(`Zu groß: ${Math.round(bytes / 1e6)} MB nach dem Filtern, erlaubt sind ${LIMITS.uploadBytes / 1e6} MB.`)
  const files = await Promise.all(kept.map(async (c) => ({ path: c.path, data: await c.read() })))
  const name = (top || list[0]?.path.split('/')[0] || '').replace(/\.zip$/i, '').replace(/-(main|master)$/, '') || (role === 'repo' ? 'Repository' : 'Dokumentation')
  return { name, files, code: kept.filter((c) => c.kind === 'code').length, docs: kept.filter((c) => c.kind === 'doc').length, bytes }
}

export async function archive(repo: Picked | null, docs: Picked | null, manifest: { repoUrl?: string; docsUrl?: string }) {
  const { zipSync, strToU8 } = await import('fflate')
  const entries: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify({ ...manifest, repoName: repo?.name, docsName: docs?.name })) }
  for (const file of repo?.files ?? []) entries[`repo/${file.path}`] = file.data
  for (const file of docs?.files ?? []) entries[`docs/${file.path}`] = file.data
  return zipSync(entries, { level: 1 })
}
