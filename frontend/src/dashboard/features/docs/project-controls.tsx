import { useState } from 'react'
import { Download, FolderOpen, LoaderCircle, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { projectAction, projectState } from './project'
import { docs, bundles } from './data'
import { Link } from '@tanstack/react-router'

export function ProjectControls() {
  const [open, setOpen] = useState(false), [pending, setPending] = useState(''), [error, setError] = useState('')
  const [repository, setRepository] = useState(''), [documentation, setDocumentation] = useState(''), [name, setName] = useState(''), [base, setBase] = useState(''), [head, setHead] = useState('HEAD'), [modules, setModules] = useState('')
  async function run(action: string, body?: unknown) {
    setPending(action); setError('')
    try { await projectAction(action, body) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen.') } finally { setPending('') }
  }
  if (!projectState?.canImport) return null
  return <div className='grid gap-2'>
    <div className='flex flex-wrap items-center gap-2'>
      <Dialog open={open} onOpenChange={(value) => { if (!pending) { setOpen(value); setError('') } }}>
        <DialogTrigger asChild><Button variant='outline' size='sm'><FolderOpen />Eigenes Projekt</Button></DialogTrigger>
        <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl' showCloseButton={!pending}>
          <DialogHeader><DialogTitle>Eigenes Projekt importieren</DialogTitle><DialogDescription>Ein lokales Git-Repository und Dokumente auf dem Rechner, auf dem neuraldoc läuft. Der Import ist lokal und löst keine Modellaufrufe aus.</DialogDescription></DialogHeader>
          <form className='grid gap-4' onSubmit={(event) => { event.preventDefault(); let configured: unknown[]; try { configured = modules.trim() ? JSON.parse(modules) as unknown[] : [] } catch { setError('Komponenten müssen eine gültige JSON-Liste sein.'); return }; void run('import', { repository, documentation, name, base, head, modules: configured }) }}>
            <div className='grid gap-2'><Label htmlFor='project-name'>Projektname</Label><Input id='project-name' value={name} onChange={(e) => setName(e.target.value)} placeholder='Wird aus dem Repository abgeleitet' maxLength={100} /></div>
            <div className='grid gap-2'><Label htmlFor='project-repository'>Repository-Pfad</Label><Input id='project-repository' required value={repository} onChange={(e) => setRepository(e.target.value)} placeholder='C:\Projekte\mein-repo oder /home/…/mein-repo' /><p className='text-xs text-muted-foreground'>Nur committed Dateien des gewählten Git-Stands. Deine Arbeitskopie wird nicht verändert.</p></div>
            <div className='grid gap-2'><Label htmlFor='project-docs'>Dokumentationsordner</Label><Input id='project-docs' required value={documentation} onChange={(e) => setDocumentation(e.target.value)} placeholder='Absoluter Pfad zum docs-Ordner' /><p className='text-xs text-muted-foreground'>Markdown, MDX, Text, RST oder HTML · bis 40 Dokumente, je 8.000 Zeichen.</p></div>
            <div className='grid grid-cols-2 gap-3'><div className='grid gap-2'><Label htmlFor='project-base'>Vergleich mit</Label><Input id='project-base' value={base} onChange={(e) => setBase(e.target.value)} placeholder='Vorheriger Commit' /></div><div className='grid gap-2'><Label htmlFor='project-head'>Aktueller Stand</Label><Input id='project-head' value={head} onChange={(e) => setHead(e.target.value)} required /></div></div>
            <details className='rounded-lg border p-3'><summary className='cursor-pointer text-sm'>Komponenten konfigurieren (optional)</summary><Label className='sr-only' htmlFor='project-modules'>Komponenten als JSON</Label><Textarea id='project-modules' className='mt-3 min-h-28 font-mono text-xs' value={modules} onChange={(e) => setModules(e.target.value)} placeholder={'[{"name":"Druck", "path":"src/print", "description":"Belegausgabe und Vorlagen"}]'} /><p className='mt-2 text-xs text-muted-foreground'>Ohne Konfiguration werden die obersten Code-Ordner als technische Komponenten verwendet.</p></details>
            {error && <p role='alert' className='text-sm text-destructive'>{error}</p>}
            <Button disabled={!!pending} type='submit'>{pending === 'import' ? <LoaderCircle className='animate-spin' /> : <FolderOpen />}{pending === 'import' ? 'Snapshot wird analysiert …' : 'Lokal importieren'}</Button>
          </form>
          {!!projectState.projects?.length && <div className='grid gap-2 border-t pt-3'><p className='text-xs text-muted-foreground'>Vorhandene Projekte</p>{projectState.projects.map((project) => <Button key={project.id} variant='ghost' className='justify-start' disabled={!!pending} onClick={() => void run('activate', { id: project.id })}>{project.name} · {project.head}</Button>)}</div>}
        </DialogContent>
      </Dialog>
      {projectState.project && <><Button variant='outline' size='sm' disabled={!!pending} onClick={() => void run('map')}>{pending === 'map' ? <LoaderCircle className='animate-spin' /> : <Network />}{pending === 'map' ? 'Jev prüft …' : 'Mit Jev zuordnen'}</Button><Button variant='outline' size='sm' onClick={() => void downloadExport().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Export fehlgeschlagen.'))}><Download />Freigaben exportieren</Button><Button variant='ghost' size='sm' disabled={!!pending} onClick={() => void run('activate', { id: null })}>Showcase ansehen</Button></>}
    </div>
    {projectState.project && <p className='text-xs text-muted-foreground'>Jev verarbeitet Code- und Dokumentausschnitte über die TypeSafe API. Der Zuordnungslauf nutzt dein konfiguriertes Budget; Entwürfe starten erst über „Starten“ oder „Formulieren“.</p>}
    {error && !open && <p role='alert' className='text-sm text-destructive'>{error}</p>}
  </div>
}

async function downloadExport() {
  const response = await fetch('/api/mcp/project/export')
  const result = await response.json() as { error?: string; files: { path: string; content: string; beforeSha256: string }[] }
  if (!response.ok) throw new Error(result.error || 'Export fehlgeschlagen.')
  if (!result.files.length) throw new Error('Noch keine Dokumentänderung freigegeben.')
  const { zipSync, strToU8 } = await import('fflate')
  const archive: Record<string, Uint8Array> = { 'neuraldoc-export.json': strToU8(JSON.stringify(result, null, 2)) }
  for (const file of result.files) archive[`documents/${file.path.replace(/\.html$/i, '.txt')}`] = strToU8(file.content)
  const url = URL.createObjectURL(new Blob([zipSync(archive) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'neuraldoc-dokumentaenderungen.zip'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ImportedSources({ tab }: { tab: string }) {
  const project = projectState.project!
  return <div className='grid gap-4'>
    <div className='grid gap-4 md:grid-cols-3'>{[{ title: 'Git-Snapshot', value: project.files.length, detail: `${project.base.slice(0, 8)} → ${project.head.slice(0, 8)}` }, { title: 'Dokumente', value: project.documents.length, detail: 'Lokaler Dokumentimport' }, { title: 'Komponenten', value: Object.keys(projectState.dataset?.modules || {}).length, detail: 'Konfigurierte Pfadregeln' }].map((item) => <Card key={item.title}><CardHeader><CardTitle className='text-sm'>{item.title}</CardTitle></CardHeader><CardContent><p className='text-3xl font-medium'>{item.value}</p><p className='mt-2 text-xs text-muted-foreground'>{item.detail}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Importierte Quellen</CardTitle></CardHeader><CardContent className='grid gap-4'><div className='grid gap-1 text-xs text-muted-foreground'><p>Repository: {project.repository}</p><p>Dokumentation: {project.documentation}</p></div><div className='grid gap-1'>{(tab === 'dokumente' || tab === 'confluence' || tab === 'doku-arten' ? docs.map((doc) => <Link key={doc.id} to='/dokumente/$id' params={{ id: doc.id }} className='rounded-lg border px-3 py-2 text-sm hover:border-brand-300'>{doc.title}</Link>) : project.files.map((file) => <p key={file.id} className='rounded-lg border px-3 py-2 text-xs'>{file.path}{file.deleted ? ' · gelöscht' : file.changed ? ' · geändert' : ''}</p>))}</div><p className='text-xs text-muted-foreground'>{bundles[0]?.commits.length || 0} Commits im Vergleich. Jira-, Confluence- und SharePoint-Connectoren sind für eigene Projekte noch nicht angebunden.</p></CardContent></Card>
    {!!project.warnings.length && <details className='rounded-xl border p-4'><summary className='cursor-pointer text-sm'>{project.warnings.length} Hinweise zur Analyse</summary><ul className='mt-3 grid gap-1 text-xs text-muted-foreground'>{project.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
  </div>
}
