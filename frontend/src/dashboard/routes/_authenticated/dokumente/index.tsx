import { createFileRoute, redirect } from '@tanstack/react-router'

// Doc types and the audience filter now live on the Daten page (Dokumente › Doku-Arten).
export const Route = createFileRoute('/_authenticated/dokumente/')({
  beforeLoad: () => {
    throw redirect({ to: '/daten', search: { tab: 'doku-arten' } })
  },
})
