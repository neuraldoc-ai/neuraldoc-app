import { createFileRoute } from '@tanstack/react-router'
import { OverviewPage } from '@/features/docs/overview'

export const Route = createFileRoute('/_authenticated/')({
  component: OverviewPage,
})
