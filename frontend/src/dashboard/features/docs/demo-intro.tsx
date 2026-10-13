/**
 * The hosted demo's first screen: where the sample data lives (GitHub, Confluence, Drive) and what neuraldoc does
 * with it. Shown once per browser; the sources come from the active project, so the links follow its import.
 */
import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, BookOpen, Code2, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { projectState } from './project'

const SEEN = 'neuraldoc-demo-intro'
const seen = () => { try { return localStorage.getItem(SEEN) === '1' } catch { return false } }
const remember = () => { try { localStorage.setItem(SEEN, '1') } catch { /* private window: shown again next time */ } }

function Out({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target='_blank' rel='noreferrer' className='inline-flex items-center gap-0.5 underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground'>{children}<ArrowUpRight className='size-3' /></a>
}

function Row({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: ReactNode }) {
  return (
    <li className='flex gap-3'>
      <span className='flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted/50'><Icon className='size-4' /></span>
      <span className='grid gap-0.5 text-sm'>
        <span className='font-medium'>{title}</span>
        <span className='text-muted-foreground'>{children}</span>
      </span>
    </li>
  )
}

export function DemoIntro() {
  const [open, setOpen] = useState(() => !!projectState?.publicDemo && !seen())
  const sources = projectState?.project?.sources
  if (!projectState?.publicDemo || !sources) return null
  const close = () => { remember(); setOpen(false) }
  const repo = sources.repo, live = sources.docs?.live
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>So ist die Demo aufgebaut</DialogTitle>
          <DialogDescription>MOBIQ ist ein erfundener ERP-Hersteller für den Möbelhandel. Seine Daten liegen in echten Systemen, so wie bei euch:</DialogDescription>
        </DialogHeader>
        <ul className='grid gap-4 py-1'>
          <Row icon={Code2} title='Code'>
            {repo.url ? <Out href={repo.url.replace(/\.git$/, '')}>GitHub · {repo.label}</Out> : repo.label} · Java, Kotlin, TypeScript und Delphi
          </Row>
          {live?.confluence && (
            <Row icon={BookOpen} title='Doku in Confluence'>
              {live.confluence.spaces.map((s, i) => <span key={s.key}>{i > 0 && ' · '}<Out href={`${live.confluence!.site}/wiki/spaces/${s.key}`}>{s.name}</Out></span>)}
            </Row>
          )}
          {live?.drive && (
            <Row icon={FolderOpen} title='Dateien in Google Drive'>
              <Out href={live.drive.folder.url}>{live.drive.folder.name}</Out> · Word, Excel und PDF
            </Row>
          )}
        </ul>
        <p className='text-sm text-muted-foreground'>Bei jedem Commit auf dem Hauptbranch prüft neuraldoc die Doku-Stellen, die dazu gehören. Die jüngsten fachlichen Änderungen findest du unter „Änderungen“.</p>
        <DialogFooter>
          <Button variant='outline' onClick={close}>Selbst umsehen</Button>
          <Button asChild onClick={close}><Link to='/aenderungen'>Änderungen ansehen</Link></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
