/**
 * Sources on the overview: the code is followed by itself (each commit on the main branch checks the sections it
 * touches); the documentation is watched, and a person decides when to check what was written there.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, GitBranch, LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { loadCheckStatus, loadSync, syncAction, type SyncState } from './project'

const ago = (iso?: string | null) => {
  if (!iso) return null
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return minutes < 1 ? 'gerade eben' : minutes < 60 ? `vor ${minutes} Min.` : `vor ${Math.round(minutes / 60)} Std.`
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function docsLine(s: SyncState) {
  const changes = s.docs?.changes ?? [], pending = s.pendingSections ?? 0
  if (changes.length) {
    const pages = changes.slice(0, 2).map((c) => `„${c.title}“`).join(', ')
    return { open: true, text: `${plural(changes.length, 'Seite', 'Seiten')} geändert: ${pages}${changes.length > 2 ? ' …' : ''}` }
  }
  if (pending) return { open: true, text: `${plural(pending, 'Abschnitt', 'Abschnitte')} seit der letzten Prüfung geändert` }
  return { open: false, text: 'Unverändert seit der letzten Prüfung' }
}

export function SourceSync() {
  const [pending, setPending] = useState<'look' | 'docs' | null>(null), [error, setError] = useState('')
  const sync = useQuery({ queryKey: ['sync'], queryFn: loadSync, refetchInterval: (q) => (q.state.data?.running || pending ? 2000 : 30_000) })
  const check = useQuery({ queryKey: ['check-status'], queryFn: loadCheckStatus, refetchInterval: (q) => (q.state.data?.running || sync.data?.running ? 1500 : 30_000) })
  // A sync or a check that ends brings new proposals: the page reloads, as after the initial check.
  const wasRunning = useRef(false)
  useEffect(() => {
    if (check.data?.running || sync.data?.running) wasRunning.current = true
    else if (wasRunning.current && check.data && !check.data.running) window.location.reload()
  }, [check.data, sync.data])
  const s = sync.data
  if (!s?.available) return null
  const act = (action: 'look' | 'docs') => { setPending(action); setError(''); syncAction(action).then(() => void sync.refetch()).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Der Abgleich hat nicht geklappt.')).finally(() => setPending(null)) }
  const busy = !!(s.running || check.data?.running || pending)
  const code = s.running === 'code' ? 'Neuer Commit, Quellen werden gelesen …'
    : check.data?.running && s.lastCode?.checked ? `Neuer Commit: ${plural(s.lastCode.sections, 'Abschnitt wird', 'Abschnitte werden')} geprüft …`
      : s.lastCode ? `Letzter Commit ${ago(s.lastCode.at)}: ${plural(s.lastCode.files, 'Datei', 'Dateien')}, ${s.lastCode.sections ? `${plural(s.lastCode.sections, 'Abschnitt', 'Abschnitte')} neu geprüft` : 'keine Doku betroffen'}`
        : `Hauptbranch${s.repo?.head ? ` · ${s.repo.head.slice(0, 7)}` : ''} · abgeglichen ${ago(s.lastLook) ?? 'beim Import'}`
  const docs = s.docsWatch?.ok ? docsLine(s) : null

  return <Card className='h-fit'>
    <CardHeader>
      <CardTitle>Quellen</CardTitle>
      <CardDescription>Neue Commits prüft neuraldoc von selbst.</CardDescription>
    </CardHeader>
    <CardContent className='grid gap-4 text-sm'>
      <div className='flex items-start gap-3'>
        <span className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/50'><GitBranch className='size-3.5' /></span>
        <div className='grid min-w-0 flex-1 gap-0.5'>
          <span className='font-medium'>Code · {s.repo?.label}</span>
          <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>{(s.running === 'code' || (check.data?.running && s.lastCode?.checked)) && <LoaderCircle className='size-3 animate-spin' />}{code}</span>
        </div>
        <Button variant='ghost' size='icon' className='size-7 shrink-0' title='Jetzt abgleichen' aria-label='Jetzt abgleichen' disabled={busy} onClick={() => act('look')}>
          <RefreshCw className={cn('size-3.5', pending === 'look' && 'animate-spin')} />
        </Button>
      </div>
      <div className='flex items-start gap-3'>
        <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/50', docs?.open && 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300')}><FileText className='size-3.5' /></span>
        <div className='grid min-w-0 flex-1 gap-0.5'>
          <span className='font-medium'>Doku</span>
          <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>{s.running === 'docs' && <LoaderCircle className='size-3 animate-spin' />}{s.running === 'docs' ? 'Doku wird gelesen …' : docs ? docs.text : s.docsWatch?.reason}</span>
        </div>
        {docs && <Button variant={docs.open ? 'default' : 'outline'} size='sm' className='shrink-0' disabled={busy} onClick={() => act('docs')}>Doku prüfen</Button>}
      </div>
      {(error || s.error) && <p role='alert' className='text-xs text-destructive'>{error || `Quellen nicht erreichbar: ${s.error}`}</p>}
    </CardContent>
  </Card>
}
