/** The company database (PostgreSQL) of the example: explorer, SQL console, migrations and relationships (see db/browser.tsx). */
import { lazy, Suspense } from 'react'

// PGlite (Postgres as WebAssembly) and Monaco are large; they are only fetched once this view is opened.
const Browser = lazy(() => import('./db/browser'))

export function DatabaseBrowser() {
  return (
    <Suspense fallback={<div className='grid h-[min(780px,calc(100vh-7rem))] min-h-[500px] place-content-center rounded-xl border bg-card text-sm text-muted-foreground'>Datenbank wird geladen …</div>}>
      <Browser />
    </Suspense>
  )
}
