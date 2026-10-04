import { createFileRoute } from '@tanstack/react-router'
import { DatasetPage, type DataTab } from '@/features/docs/dataset'

const TABS: DataTab[] = ['gitlab', 'jira', 'confluence', 'dokumente', 'doku-arten', 'datenbank']

export const Route = createFileRoute('/_authenticated/daten/')({
  validateSearch: (search: Record<string, unknown>): { tab?: DataTab } => ({
    tab: TABS.includes(search.tab as DataTab) ? (search.tab as DataTab) : undefined,
  }),
  component: function DatenRoute() {
    const { tab = 'gitlab' } = Route.useSearch()
    const navigate = Route.useNavigate()
    return <DatasetPage tab={tab} onTab={(next) => navigate({ search: { tab: next }, replace: true })} />
  },
})
