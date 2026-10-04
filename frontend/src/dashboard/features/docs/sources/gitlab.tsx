/** GitLab, as a developer would see it: an IDE on the repository at release/26.4 (see ide/workbench.tsx). */
import { lazy, Suspense } from 'react'

// Monaco is large; it is only fetched once the GitLab view is opened.
const Workbench = lazy(() => import('./ide/workbench'))

export function GitLabBrowser() {
  return (
    <Suspense fallback={<div className='grid h-[min(780px,calc(100vh-7rem))] min-h-[500px] place-content-center rounded-xl border bg-card text-sm text-muted-foreground'>Editor wird geladen …</div>}>
      <Workbench />
    </Suspense>
  )
}
