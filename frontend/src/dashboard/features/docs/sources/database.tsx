/** A PostgreSQL database: explorer, SQL console, migrations and relationships (see db/browser.tsx). */
import { lazy, Suspense } from 'react'
import type { DbSource } from './db/view'

export type { DbSource }

// PGlite (Postgres as WebAssembly) and Monaco are large; they are only fetched once this view is opened.
const View = lazy(() => import('./db/view'))

export function DatabaseBrowser({ source = { kind: 'showcase' } }: { source?: DbSource }) {
  return (
    <Suspense fallback={<div className='grid h-[min(780px,calc(100vh-7rem))] min-h-[500px] place-content-center rounded-xl border bg-card text-sm text-muted-foreground'>Datenbank wird geladen …</div>}>
      <View source={source} />
    </Suspense>
  )
}
