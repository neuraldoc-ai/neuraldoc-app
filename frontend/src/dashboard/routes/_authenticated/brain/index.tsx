import { createFileRoute } from '@tanstack/react-router'
import { BrainWeb } from '@/features/docs/brain/web'

export const Route = createFileRoute('/_authenticated/brain/')({
  component: BrainWeb,
})
