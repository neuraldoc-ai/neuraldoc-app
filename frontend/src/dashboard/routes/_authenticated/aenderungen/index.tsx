import { createFileRoute } from '@tanstack/react-router'
import { BundlesPage } from '@/features/docs/bundles'

export const Route = createFileRoute('/_authenticated/aenderungen/')({
  component: BundlesPage,
})
