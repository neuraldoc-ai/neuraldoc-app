import { createFileRoute } from '@tanstack/react-router'
import { AnalyticsPage } from '@/features/docs/analytics'

export const Route = createFileRoute('/_authenticated/analytics/')({
  component: AnalyticsPage,
})
