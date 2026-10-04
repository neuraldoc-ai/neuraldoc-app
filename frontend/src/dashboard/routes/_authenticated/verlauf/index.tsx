import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/verlauf/')({
  beforeLoad: () => { throw redirect({ to: '/mcp', hash: 'verlauf', replace: true }) },
})
