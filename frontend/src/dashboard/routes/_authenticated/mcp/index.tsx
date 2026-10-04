import { createFileRoute } from '@tanstack/react-router'
import { McpPage } from '@/features/docs/mcp'

export const Route = createFileRoute('/_authenticated/mcp/')({
  component: McpPage,
})
