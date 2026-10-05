// Daten: the uploaded code and documentation of an imported project. The MOBIQ source browsers
// (dataset.tsx) read the sample dataset, so only the showcase loads them.
import { lazy, Suspense } from 'react'
import { Frame } from './ui'
import { ImportedSources, ProjectControls } from './project-controls'
import { datasetMode } from './data'
import type { DataTab } from './dataset'

const ShowcaseData = lazy(() => import('./dataset').then((m) => ({ default: m.DatasetPage })))

export function DataPage({ tab, onTab }: { tab: DataTab; onTab: (tab: DataTab) => void }) {
  if (datasetMode === 'showcase') return <Suspense fallback={null}><ShowcaseData tab={tab} onTab={onTab} /></Suspense>
  return (
    <Frame title='Daten' lead='Dein hochgeladener Code und deine Dokumentation.'>
      <ProjectControls />
      <div className='flex gap-2'>
        <button className='rounded-lg border px-3 py-2 text-sm hover:border-brand-300' onClick={() => onTab('gitlab')}>Code</button>
        <button className='rounded-lg border px-3 py-2 text-sm hover:border-brand-300' onClick={() => onTab('dokumente')}>Dokumente</button>
      </div>
      <ImportedSources tab={tab} />
    </Frame>
  )
}
