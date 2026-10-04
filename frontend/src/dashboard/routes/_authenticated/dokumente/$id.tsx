import { createFileRoute } from '@tanstack/react-router'
import { EditorPage } from '@/features/docs/editor'

// `p` opens the editor on one proposal, e.g. /dokumente/nh-fibu?p=p08
export const Route = createFileRoute('/_authenticated/dokumente/$id')({
  validateSearch: (search: Record<string, unknown>): { p?: string } => ({
    p: typeof search.p === 'string' ? search.p : undefined,
  }),
  component: function EditorRoute() {
    const { id } = Route.useParams()
    const { p } = Route.useSearch()
    return <EditorPage key={`${id}:${p ?? ''}`} id={id} focus={p} />
  },
})
