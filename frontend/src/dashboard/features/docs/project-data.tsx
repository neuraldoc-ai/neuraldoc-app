// Daten: the sources of the active project. The showcase reads the MOBIQ sample (dataset.tsx, a separate chunk);
// an imported project shows its repository in the IDE, its documents and, if there is one, its database:
// the repository's SQL files in the browser or an own PostgreSQL connection.
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Database, FileText, GitCommitHorizontal, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Frame } from './ui'
import { ProjectControls } from './project-controls'
import { PullRequestTargets } from './github-publish'
import { datasetMode } from './data'
import { projectState } from './project'
import type { DataTab } from './dataset'
import { sqlFilesOf, useConnections, useProjectSource } from './project-sources'
import { GitLabBrowser } from './sources/gitlab'
import { ProjectFiles } from './sources/project-files'
import { DatabaseBrowser, type DbSource } from './sources/database'
import { ConnectionDialog } from './sources/connection-dialog'
import { sslLabel, type Connection } from './sources/db/db'

const ShowcaseData = lazy(() => import('./dataset').then((m) => ({ default: m.DatasetPage })))

export function DataPage({ tab, onTab }: { tab: DataTab; onTab: (tab: DataTab) => void }) {
  if (datasetMode === 'showcase') return <Suspense fallback={null}><ShowcaseData tab={tab} onTab={onTab} /></Suspense>
  if (!projectState.project) return <Frame title='Daten' lead='Noch kein Projekt importiert.'><ProjectControls prominent /></Frame>
  return <ImportedData tab={tab} onTab={onTab} />
}

function ImportedData({ tab, onTab }: { tab: DataTab; onTab: (tab: DataTab) => void }) {
  const project = projectState.project!
  const source = useProjectSource()
  const connections = useConnections()
  const [dialog, setDialog] = useState<{ connection?: Connection } | null>(null)
  const [dbChoice, setDbChoice] = useState<string>('repository')
  const sql = sqlFilesOf(source.data)
  const list = connections.data ?? []
  const hasDb = sql.length > 0 || list.length > 0
  const documents = new Set(project.documents.map((d) => d.path)).size
  const active = tab === 'datenbank' && hasDb ? 'datenbank' : tab === 'dokumente' || tab === 'doku-arten' || tab === 'confluence' ? 'dokumente' : 'gitlab'
  const history = projectState.history
  const chosen = dbChoice === 'repository' && sql.length ? 'repository' : list.find((c) => c.id === dbChoice) ? dbChoice : sql.length ? 'repository' : list[0]?.id
  const dbSource: DbSource | null = chosen === 'repository' ? { kind: 'repository', name: project.sources.repo.label, files: sql } : chosen ? { kind: 'connection', connection: list.find((c) => c.id === chosen)! } : null

  return (
    <Frame
      title='Daten'
      lead={`${project.name}: Code, Dokumente${hasDb ? ' und Datenbank' : ''}, so wie neuraldoc sie liest. Karte anklicken, um den Inhalt zu sehen.`}
      actions={
        <Button variant='outline' size='sm' onClick={() => setDialog({})}>
          <Database /> Datenbank verbinden
        </Button>
      }
    >
      <ProjectControls />
      <PullRequestTargets />
      <div className={cn('grid gap-4 sm:grid-cols-2', hasDb ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
        <SourceCard active={active === 'gitlab'} onClick={() => onTab('gitlab')} icon={<GitCommitHorizontal />} name='Code' value={project.files.length} unit='Dateien' sub={history?.commits ? `${project.sources.repo.label} · ${history.commits} Commits${history.tag ? ` seit ${history.tag}` : ''}` : `${project.sources.repo.label} · ${project.sources.repo.source === 'url' ? 'von GitHub' : 'hochgeladen, ohne Git-Verlauf'}`} />
        <SourceCard active={active === 'dokumente'} onClick={() => onTab('dokumente')} icon={<FileText />} name='Dokumente' value={documents} unit='Dateien' sub={formats(project.documents) || `${project.documents.length} Abschnitte`} />
        {hasDb && <SourceCard active={active === 'datenbank'} onClick={() => onTab('datenbank')} icon={<Database />} name='Datenbank' value={(sql.length ? 1 : 0) + list.length} unit={(sql.length ? 1 : 0) + list.length === 1 ? 'Quelle' : 'Quellen'} sub={[sql.length ? `${sql.length} SQL-Dateien im Repository` : '', list.length ? `${list.length} ${list.length === 1 ? 'Verbindung' : 'Verbindungen'}` : ''].filter(Boolean).join(' · ')} />}
      </div>
      {active === 'gitlab' && <GitLabBrowser project />}
      {active === 'dokumente' && <ProjectFiles />}
      {active === 'datenbank' && (
        <div className='grid gap-3'>
          <div className='flex flex-wrap items-center gap-2' role='tablist' aria-label='Datenbanken'>
            {sql.length > 0 && <Choice active={chosen === 'repository'} onClick={() => setDbChoice('repository')} title='Aus dem Repository' sub={`${sql.length} SQL-Dateien · im Browser`} />}
            {list.map((c) => (
              <Choice key={c.id} active={chosen === c.id} onClick={() => setDbChoice(c.id)} title={c.name} sub={`${c.host}:${c.port} · ${sslLabel[c.ssl]}`} onEdit={() => setDialog({ connection: c })} />
            ))}
            <Button variant='ghost' size='sm' onClick={() => setDialog({})}><Plus /> Verbindung hinzufügen</Button>
          </div>
          {dbSource && <DatabaseBrowser key={chosen} source={dbSource} />}
        </div>
      )}
      {dialog && <ConnectionDialog key={dialog.connection?.id ?? 'new'} open onOpenChange={(open) => { if (!open) setDialog(null) }} connection={dialog.connection} onSaved={(c) => { setDbChoice(c.id); onTab('datenbank') }} />}
    </Frame>
  )
}

const FORMATS: Record<string, string> = { md: 'Markdown', mdx: 'Markdown', markdown: 'Markdown', txt: 'Text', pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', html: 'HTML', htm: 'HTML', csv: 'CSV', rst: 'reStructuredText', adoc: 'AsciiDoc' }
const formats = (documents: { format: string }[]) => [...new Set(documents.map((d) => FORMATS[d.format] ?? d.format.toUpperCase()))].join(', ')

function SourceCard({ active, onClick, icon, name, value, unit, sub }: { active: boolean; onClick: () => void; icon: ReactNode; name: string; value: number; unit: string; sub: string }) {
  return (
    <button type='button' onClick={onClick} aria-pressed={active} className='rounded-xl text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'>
      <Card className={cn('h-full gap-3 py-5 transition-colors hover:border-brand-300', active && 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-300 dark:bg-brand-500/10')}>
        <CardContent className='grid gap-3'>
          <span className='flex items-center gap-2 text-sm font-medium [&>svg]:size-4 [&>svg]:text-brand-600'>
            {icon} {name}
          </span>
          <span className='flex items-baseline gap-2'>
            <strong className='text-[32px] leading-none font-medium tracking-[-0.03em] tabular-nums'>{value.toLocaleString('de-DE')}</strong>
            <span className='text-sm text-muted-foreground'>{unit}</span>
          </span>
          <span className='truncate text-xs text-muted-foreground'>{sub}</span>
        </CardContent>
      </Card>
    </button>
  )
}

function Choice({ active, onClick, title, sub, onEdit }: { active: boolean; onClick: () => void; title: string; sub: string; onEdit?: () => void }) {
  return (
    <span className={cn('flex items-center rounded-lg border bg-card', active && 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-300 dark:bg-brand-500/10')}>
      <button type='button' role='tab' aria-selected={active} onClick={onClick} className='grid gap-0.5 px-3 py-1.5 text-left'>
        <span className='text-sm font-medium'>{title}</span>
        <span className='text-xs text-muted-foreground'>{sub}</span>
      </button>
      {onEdit && (
        <Button variant='ghost' size='icon' className='me-1 size-7 text-muted-foreground' aria-label={`${title} bearbeiten`} title='Bearbeiten' onClick={onEdit}>
          <Pencil />
        </Button>
      )}
    </span>
  )
}
