import { useMemo } from 'react'
import DatabaseBrowser from './browser'
import { remoteBackend, repositoryBackend, showcaseBackend, type Connection } from './db'

export type DbSource = { kind: 'showcase' } | { kind: 'repository'; name: string; files: { path: string; text: string }[] } | { kind: 'connection'; connection: Connection }

/** Builds the backend once per source; a different source starts a fresh browser. */
const keyOf = (s: DbSource) => (s.kind === 'showcase' ? 'showcase' : s.kind === 'repository' ? `repo:${s.name}:${s.files.map((f) => f.path).join('|')}` : `db:${JSON.stringify(s.connection)}`)

export default function DatabaseView({ source }: { source: DbSource }) {
  const key = keyOf(source)
  const backend = useMemo(
    () => (source.kind === 'showcase' ? showcaseBackend() : source.kind === 'repository' ? repositoryBackend(source.name, source.files) : remoteBackend(source.connection)),
    // The key stands for the source; a new object with the same content keeps the running database.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  return <DatabaseBrowser backend={backend} />
}
