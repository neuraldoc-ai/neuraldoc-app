import { useEffect, useState } from 'react'
import { Columns2, Rows2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { commitOf, fmtDate } from './model'
import { resolveCommitSource, type SourceCommit } from './commit-source'
import { datasetMode } from './data'
import { DiffViewer } from './sources/ide/editors'
import { parseDiff } from './sources/ide/model'

type FileDiff = { new_path: string; old_path: string; diff: string; new_file: boolean; deleted_file: boolean; renamed_file: boolean }

export default function CommitDetails({ initialHash, hashes }: { initialHash: string; hashes: string[] }) {
  const [hash, setHash] = useState(initialHash)
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      {hashes.length > 1 && (
        <nav aria-label='Zugehörige Commits' className='flex max-h-40 shrink-0 flex-wrap gap-2 overflow-auto border-b p-3'>
          {hashes.map((h) => (
            <Button key={h} size='sm' variant={h === hash ? 'default' : 'outline'} aria-pressed={h === hash} onClick={() => setHash(h)} title={commitOf(h)?.message}>
              <code className='font-mono text-xs'>{h}</code>
            </Button>
          ))}
        </nav>
      )}
      <CommitCode key={hash} hash={hash} />
    </div>
  )
}

type Loaded = { commit: SourceCommit; files: FileDiff[] } | { error: string } | null

/** Imported projects load the commit and its original diffs from the local server. */
function ImportedCommit({ hash }: { hash: string }) {
  const [loaded, setLoaded] = useState<Loaded>(null)
  useEffect(() => {
    let live = true
    fetch(`/api/mcp/project/commit?sha=${encodeURIComponent(hash)}`)
      .then(async (response) => {
        const body = await response.json() as { commit: SourceCommit; files: FileDiff[]; error?: string }
        if (live) setLoaded(response.ok ? body : { error: body.error || 'Commit konnte nicht geladen werden.' })
      })
      .catch(() => { if (live) setLoaded({ error: 'Der lokale Server antwortet nicht.' }) })
    return () => { live = false }
  }, [hash])
  if (!loaded) return <p role='status' className='p-6 text-sm text-muted-foreground'>Commit wird geladen …</p>
  if ('error' in loaded) return <p role='alert' className='p-6 text-sm text-muted-foreground'>{loaded.error}</p>
  return <CommitView c={loaded.commit} files={loaded.files} />
}

/** The showcase reads its GitLab sample, a separate chunk. */
function ShowcaseCommit({ hash }: { hash: string }) {
  const [loaded, setLoaded] = useState<Loaded | 'missing'>(null)
  useEffect(() => {
    let live = true
    import('./showcase-commits').then(({ commits, diffs }) => {
      const c = resolveCommitSource(hash, commits)
      if (live) setLoaded(c ? { commit: c, files: (diffs as Record<string, FileDiff[]>)[c.id] ?? [] } : 'missing')
    }).catch(() => { if (live) setLoaded({ error: 'Beispieldaten konnten nicht geladen werden.' }) })
    return () => { live = false }
  }, [hash])
  if (!loaded) return <p role='status' className='p-6 text-sm text-muted-foreground'>Commit wird geladen …</p>
  if (loaded === 'missing') return <p className='p-6 text-sm text-muted-foreground'>Für Commit {hash} liegt kein GitLab-Beleg im Beispieldatensatz vor.</p>
  if ('error' in loaded) return <p role='alert' className='p-6 text-sm text-muted-foreground'>{loaded.error}</p>
  return <CommitView c={loaded.commit} files={loaded.files} />
}

function CommitCode({ hash }: { hash: string }) {
  return datasetMode === 'showcase' ? <ShowcaseCommit hash={hash} /> : <ImportedCommit hash={hash} />
}

function CommitView({ c, files }: { c: SourceCommit; files: FileDiff[] }) {
  const [sideBySide, setSideBySide] = useState(true)
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='max-h-[35%] shrink-0 overflow-auto border-b px-5 py-4'>
        <h3 className='text-base font-medium'>{c.title}</h3>
        <p className='mt-2 text-xs text-muted-foreground'>
          {c.author_name} · {fmtDate(c.committed_date)} · {files.length} {files.length === 1 ? 'Datei' : 'Dateien'} · <span className='text-emerald-600'>+{c.stats.additions}</span> <span className='text-red-500'>−{c.stats.deletions}</span>
        </p>
        <p className='mt-2 break-all font-mono text-[11px] text-muted-foreground'>Git-Commit: {c.id}</p>
        {c.message.trim() !== c.title && <pre className='mt-3 text-xs whitespace-pre-wrap'>{c.message.trim()}</pre>}
      </div>
      {files.length ? (
        <Tabs key={c.id} defaultValue={files[0].new_path} className='min-h-0 flex-1 gap-0'>
          <div className='flex shrink-0 items-center gap-2 border-b px-3 py-2'>
            <TabsList aria-label='Geänderte Dateien' className='min-w-0 flex-1 justify-start overflow-x-auto'>
              {files.map((f) => {
                const counts = parseDiff(f.diff)
                return (
                  <TabsTrigger key={f.new_path} value={f.new_path} title={f.new_path} className='shrink-0'>
                    {f.new_path.split('/').pop()} <span className='text-emerald-600'>+{counts.added}</span> <span className='text-red-500'>−{counts.removed}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
            <Button variant='ghost' size='icon' onClick={() => setSideBySide(!sideBySide)} aria-label={sideBySide ? 'Diff untereinander anzeigen' : 'Diff nebeneinander anzeigen'} title={sideBySide ? 'Untereinander' : 'Nebeneinander'}>
              {sideBySide ? <Rows2 /> : <Columns2 />}
            </Button>
          </div>
          {files.map((f) => (
            <TabsContent key={f.new_path} value={f.new_path} className='flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden'>
              <p className='shrink-0 border-b px-4 py-2 font-mono text-[11px] break-all text-muted-foreground'>
                {f.renamed_file ? `${f.old_path} → ${f.new_path}` : f.new_path}{f.new_file ? ' · Neue Datei' : f.deleted_file ? ' · Gelöscht' : ''}
              </p>
              <div className='min-h-0 flex-1'>
                <DiffViewer diff={f.diff} path={f.new_path} sideBySide={sideBySide} />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : <p className='p-6 text-sm text-muted-foreground'>Für diesen Commit sind keine Dateiänderungen hinterlegt.</p>}
    </div>
  )
}
