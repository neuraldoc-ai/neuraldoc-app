import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/qualitaet/')({
  beforeLoad: () => { throw redirect({ to: '/analytics' }) },
})
