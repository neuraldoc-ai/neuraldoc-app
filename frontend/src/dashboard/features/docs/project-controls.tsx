import { useRef, useState, type DragEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, FolderGit2, FolderOpen, GitBranch, KeyRound, LoaderCircle, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { importProject, importSample, projectAction, projectState } from './project'
import { archive, candidates, pick, type Picked, type Role } from './upload'
import { repoUrl } from './import-rules.mjs'
import { loadSetup } from '@/features/settings/api'
import { Link } from '@tanstack/react-router'

const mb = (bytes: number) => bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB`

function Dropzone({ role, value, url, onPicked, onUrl, disabled }: { role: Role; value: Picked | null; url: string; onPicked: (picked: Picked | null) => void; onUrl: (url: string) => void; disabled: boolean }) {
  const folder = useRef<HTMLInputElement>(null), files = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState('')
  async function take(source: Promise<Awaited<ReturnType<typeof candidates>>>) {
    setReading(true); setError('')
    try {
      const picked = await pick(await source, role)
      if (role === 'repo' && !picked.code) throw new Error('Keine Code-Dateien gefunden. Bitte den Ordner des Repositories wählen.')
      if (role === 'docs' && !picked.docs) throw new Error('Keine unterstützten Dokumente gefunden. Möglich sind PDF, Word, Excel, PowerPoint, Markdown, Text und HTML.')
      onPicked(picked); onUrl('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Dateien konnten nicht gelesen werden.') } finally { setReading(false) }
  }
  const drop = (event: DragEvent) => { event.preventDefault(); setOver(false); if (!disabled) void take(candidates(event.dataTransfer)) }
  const Icon = role === 'repo' ? FolderGit2 : FileText
  return <div className='grid gap-2'>
    {value ? <div className='flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3'>
      <Icon className='size-5 shrink-0 text-brand-600' />
      <div className='min-w-0 flex-1'><p className='truncate text-sm font-medium'>{value.name}</p><p className='text-xs text-muted-foreground'>{role === 'repo' ? `${value.code} Code-Dateien${value.docs ? ` · ${value.docs} Dokumente` : ''}` : `${value.docs} Dokumente`} · {mb(value.bytes)}</p></div>
      <Button type='button' variant='ghost' size='icon' aria-label='Auswahl entfernen' disabled={disabled} onClick={() => onPicked(null)}><X /></Button>
    </div> : <div role='button' tabIndex={0} aria-disabled={disabled}
      onClick={() => !disabled && (role === 'repo' ? folder : files).current?.click()} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); (role === 'repo' ? folder : files).current?.click() } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}
      className={cn('grid cursor-pointer justify-items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-brand-500/10', over && 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10', disabled && 'pointer-events-none opacity-60')}>
      {reading ? <LoaderCircle className='size-6 animate-spin text-muted-foreground' /> : <Upload className='size-6 text-muted-foreground' />}
      <p className='text-sm font-medium'>{reading ? 'Dateien werden gelesen …' : role === 'repo' ? 'Repository-Ordner hierher ziehen oder klicken' : 'Dokumente hierher ziehen oder klicken'}</p>
      <p className='text-xs text-muted-foreground'>{role === 'repo' ? 'Ordner oder ZIP. node_modules, Build-Ordner und .env werden übersprungen.' : 'PDF, Word, Excel, PowerPoint, Markdown, Text oder HTML. Auch ganze Ordner.'}</p>
      <button type='button' className='text-xs text-brand-700 underline-offset-4 hover:underline dark:text-brand-300' onClick={(e) => { e.stopPropagation(); (role === 'repo' ? files : folder).current?.click() }}>{role === 'repo' ? 'Stattdessen ZIP wählen' : 'Stattdessen Ordner wählen'}</button>
    </div>}
    <input ref={folder} type='file' className='hidden' {...{ webkitdirectory: '', directory: '' }} onChange={(e) => { if (e.target.files?.length) void take(candidates(e.target.files)); e.target.value = '' }} />
    <input ref={files} type='file' className='hidden' multiple={role === 'docs'} accept={role === 'repo' ? '.zip' : '.pdf,.docx,.xlsx,.pptx,.md,.mdx,.markdown,.txt,.rst,.adoc,.html,.htm,.xml,.csv,.zip'} onChange={(e) => { if (e.target.files?.length) void take(candidates(e.target.files)); e.target.value = '' }} />
    {!value && <div className='relative'><GitBranch className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' /><Input aria-label={role === 'repo' ? 'GitHub-URL des Repositories' : 'GitHub-URL der Dokumentation'} className='pl-9' value={url} disabled={disabled} onChange={(e) => onUrl(e.target.value)} placeholder='oder GitHub-URL, z. B. github.com/organisation/repository' /></div>}
    {error && <p role='alert' className='text-xs text-destructive'>{error}</p>}
  </div>
}

export function ProjectControls({ prominent }: { prominent?: boolean }) {
  const [open, setOpen] = useState(false), [pending, setPending] = useState(''), [error, setError] = useState('')
  const [repo, setRepo] = useState<Picked | null>(null), [docsPicked, setDocs] = useState<Picked | null>(null), [repoLink, setRepoLink] = useState(''), [docsLink, setDocsLink] = useState('')
  async function run(action: string, work: () => Promise<void>) {
    setPending(action); setError('')
    try { await work() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Das hat nicht geklappt. Versuch es noch einmal.') } finally { setPending('') }
  }
  if (!projectState?.canImport) return null
  const repoValid = !!repo || !!repoUrl(repoLink), docsValid = !docsLink.trim() || !!repoUrl(docsLink)
  async function submit() {
    if (repoLink.trim() && !repoUrl(repoLink)) throw new Error('Bitte eine gültige GitHub-URL angeben, z. B. https://github.com/organisation/repository.')
    if (!docsValid) throw new Error('Die URL der Dokumentation ist keine gültige GitHub-URL.')
    await importProject(await archive(repo, docsPicked, { ...(repo ? {} : { repoUrl: repoUrl(repoLink)!.url }), ...(docsPicked || !docsLink.trim() ? {} : { docsUrl: repoUrl(docsLink)!.url }) }))
  }
  return <div className='grid gap-2'>
    <div className='flex flex-wrap items-center gap-2'>
      <Dialog open={open} onOpenChange={(value) => { if (!pending) { setOpen(value); setError('') } }}>
        <DialogTrigger asChild>{prominent ? <Button size='lg'><FolderOpen />Eigenes Projekt importieren</Button> : <Button variant='outline' size='sm'><FolderOpen />Eigenes Projekt</Button>}</DialogTrigger>
        <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl' showCloseButton={!pending}>
          <DialogHeader><DialogTitle>Eigenes Projekt prüfen</DialogTitle><DialogDescription>neuraldoc liest deinen Code und deine Doku und zeigt, wo sie nicht mehr zusammenpassen. Deine Dateien werden nicht verändert.</DialogDescription></DialogHeader>
          <form className='grid gap-5' onSubmit={(event) => { event.preventDefault(); void run('import', submit) }}>
            <div className='grid gap-2'><Label>Repository <span className='font-normal text-muted-foreground'>· Pflicht</span></Label><Dropzone role='repo' value={repo} url={repoLink} onPicked={setRepo} onUrl={setRepoLink} disabled={!!pending} /></div>
            <div className='grid gap-2'><Label>Dokumentation <span className='font-normal text-muted-foreground'>· optional</span></Label><Dropzone role='docs' value={docsPicked} url={docsLink} onPicked={setDocs} onUrl={setDocsLink} disabled={!!pending} /><p className='text-xs text-muted-foreground'>Ohne Doku prüft neuraldoc die READMEs und den docs-Ordner im Repository.</p></div>
            {error && <p role='alert' className='text-sm text-destructive'>{error}</p>}
            <Button disabled={!!pending || !repoValid} type='submit'>{pending === 'import' ? <LoaderCircle className='animate-spin' /> : <Upload />}{pending === 'import' ? (repo ? 'Wird hochgeladen und analysiert …' : 'Wird geklont und analysiert …') : 'Importieren'}</Button>
          </form>
          <p className='text-xs text-muted-foreground'>Nur ausprobieren? <button type='button' disabled={!!pending} className='text-brand-700 underline-offset-4 hover:underline disabled:opacity-60 dark:text-brand-300' onClick={() => void run('import', importSample)}>Beispielprojekt MOBIQ laden</button></p>
          {!!projectState.projects?.length && <div className='grid gap-1 border-t pt-3'><p className='text-xs text-muted-foreground'>Bisherige Projekte</p>{projectState.projects.map((project) => <Button key={project.id} variant='ghost' className='justify-between' disabled={!!pending} onClick={() => void run('activate', () => projectAction('activate', { id: project.id }))}><span>{project.name}</span><span className='text-xs text-muted-foreground'>{new Date(project.createdAt).toLocaleDateString('de-DE')}</span></Button>)}</div>}
        </DialogContent>
      </Dialog>
      {projectState.project && <Button variant='outline' size='sm' onClick={() => void downloadExport().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Der Export hat nicht geklappt. Versuch es noch einmal.'))}><Download />Freigaben exportieren</Button>}
    </div>
    {error && !open && <p role='alert' className='text-sm text-destructive'>{error}</p>}
  </div>
}

/** The big call to action on the overview until the initial check has run. Without a Jev key it leads to the settings first. */
export function StartCheck() {
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const setup = useQuery({ queryKey: ['setup'], queryFn: loadSetup })
  // The check only makes sense when its findings can be turned into corrections: Jev and an LLM first.
  const missing = setup.data ? [!setup.data.jev.configured && 'Jev-Key', !setup.data.drafting.configured && 'LLM'].filter(Boolean) : []
  if (missing.length) return <div className='grid justify-items-start gap-2 md:justify-items-end'>
    <Button size='lg' asChild><Link to='/einstellungen'><KeyRound />Einrichtung abschließen</Link></Button>
    <p className='max-w-[42ch] text-xs text-muted-foreground md:text-right'>Für die Erstprüfung fehlt noch: {missing.join(' und ')}.</p>
  </div>
  return <div className='grid justify-items-start gap-2 md:justify-items-end'>
    <Button size='lg' disabled={pending} onClick={() => { setPending(true); setError(''); projectAction('check').catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : 'Die Erstprüfung wurde abgebrochen. Versuch es noch einmal.'); setPending(false) }) }}>{pending ? <LoaderCircle className='animate-spin' /> : <FolderGit2 />}{pending ? 'Prüft …' : 'Erstprüfung starten'}</Button>
    {error && <p role='alert' className='max-w-[42ch] text-xs text-destructive md:text-right'>{error}</p>}
  </div>
}

async function downloadExport() {
  const response = await fetch('/api/mcp/project/export')
  const result = await response.json() as { error?: string; files: { path: string; content: string; beforeSha256: string }[] }
  if (!response.ok) throw new Error(result.error || 'Der Export hat nicht geklappt. Versuch es noch einmal.')
  if (!result.files.length) throw new Error('Noch nichts zu exportieren. Übernimm zuerst mindestens einen Vorschlag.')
  const { zipSync, strToU8 } = await import('fflate')
  const files: Record<string, Uint8Array> = { 'neuraldoc-export.json': strToU8(JSON.stringify(result, null, 2)) }
  for (const file of result.files) files[file.path] = strToU8(file.content)
  const url = URL.createObjectURL(new Blob([zipSync(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'neuraldoc-dokumentaenderungen.zip'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
