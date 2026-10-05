/** The repository as a developer would see it: an IDE (see ide/workbench.tsx), on the MOBIQ sample or an imported project. */
import { lazy, Suspense } from 'react'

// Monaco is large; it is only fetched once the code view is opened.
const Showcase = lazy(() => import('./ide/showcase-workbench'))
const Project = lazy(() => import('./ide/project-workbench'))

export function GitLabBrowser({ project }: { project?: boolean }) {
  return (
    <Suspense fallback={<div className='grid h-[min(780px,calc(100vh-7rem))] min-h-[500px] place-content-center rounded-xl border bg-card text-sm text-muted-foreground'>Editor wird geladen …</div>}>
      {project ? <Project /> : <Showcase />}
    </Suspense>
  )
}
