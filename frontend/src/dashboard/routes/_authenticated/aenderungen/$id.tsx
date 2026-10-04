import { createFileRoute } from '@tanstack/react-router'
import { BundlePage } from '@/features/docs/bundle'

export const Route = createFileRoute('/_authenticated/aenderungen/$id')({
  component: function BundleRoute() {
    const { id } = Route.useParams()
    return <BundlePage key={id} id={id} />
  },
})
