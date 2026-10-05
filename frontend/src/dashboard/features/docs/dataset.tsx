/**
 * Daten: the example dataset as the tools themselves show it. The cards on top switch the view below:
 * GitLab, Jira, Confluence and the document library (Word/Excel/PDF).
 */
import data from '@dataset/dashboard.json'
import overview from '@dataset/postgres/overview.json'
import { Database, FileText, FileType2, GitCommitHorizontal, SquareKanban } from 'lucide-react'
import { type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AboutMobiq } from './sources/about'
import { ConfluenceBrowser } from './sources/confluence'
import { DatabaseBrowser } from './sources/database'
import { FilesBrowser } from './sources/files'
import { GitLabBrowser } from './sources/gitlab'
import { JiraBrowser } from './sources/jira'
import { Frame } from './ui'

export type DataTab = 'gitlab' | 'jira' | 'confluence' | 'dokumente' | 'doku-arten' | 'datenbank'

export function DatasetPage({ tab, onTab }: { tab: DataTab; onTab: (tab: DataTab) => void }) {
  const withCode = data.issues.filter((i) => i.hasCode).length
  const kinds = [...new Set(data.files.map((f) => ({ pdf: 'PDF', docx: 'Word', xlsx: 'Excel' })[f.kind]))].join(', ')
  const active = tab === 'doku-arten' ? 'dokumente' : tab
  return (
    <Frame title='Daten' lead={`Beispieldatensatz MOBIQ ${data.release}. Karte anklicken, um den Inhalt zu sehen.`} actions={<AboutMobiq />}>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
        <Source active={active === 'gitlab'} onClick={() => onTab('gitlab')} icon={<GitCommitHorizontal />} name='GitLab' value={data.commits.total} unit='Commits' sub={`Code · ${data.commits.merges} Merge-Requests`} />
        <Source active={active === 'jira'} onClick={() => onTab('jira')} icon={<SquareKanban />} name='Jira' value={data.issues.length} unit='Tickets' sub={`${withCode} mit Code`} />
        <Source active={active === 'confluence'} onClick={() => onTab('confluence')} icon={<FileText />} name='Confluence' value={data.pages.length} unit='Seiten' sub={`${data.spaces.length} Bereiche`} />
        <Source active={active === 'dokumente'} onClick={() => onTab('dokumente')} icon={<FileType2 />} name='Dokumente' value={data.files.length} unit='Dateien' sub={kinds} />
        <Source active={active === 'datenbank'} onClick={() => onTab('datenbank')} icon={<Database />} name='Datenbank' value={overview.tables} unit='Tabellen' sub={`${overview.version} · ${overview.rows.toLocaleString('de-DE')} Zeilen`} />
      </div>

      <div className='min-w-0'>
      {active === 'gitlab' && <GitLabBrowser />}
      {active === 'jira' && <JiraBrowser />}
      {active === 'confluence' && <ConfluenceBrowser />}
      {active === 'dokumente' && <FilesBrowser view={tab === 'doku-arten' ? 'doku-arten' : 'dateien'} />}
      {active === 'datenbank' && <DatabaseBrowser />}
      </div>
    </Frame>
  )
}

function Source({ icon, name, value, unit, sub, active, onClick }: { icon: ReactNode; name: string; value: number; unit: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button type='button' onClick={onClick} aria-pressed={active} className='rounded-xl text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'>
      <Card className={cn('h-full gap-3 py-5 transition-colors hover:border-brand-300', active && 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-300 dark:bg-brand-500/10')}>
        <CardContent className='grid gap-3'>
          <span className='flex items-center gap-2 text-sm font-medium [&>svg]:size-4 [&>svg]:text-brand-600'>
            {icon} {name}
          </span>
          <span className='flex items-baseline gap-2'>
            <strong className='text-[32px] leading-none font-medium tracking-[-0.03em] tabular-nums'>{value}</strong>
            <span className='text-sm text-muted-foreground'>{unit}</span>
          </span>
          <span className='text-xs text-muted-foreground'>{sub}</span>
        </CardContent>
      </Card>
    </button>
  )
}
