import { Outlet, useLocation } from '@tanstack/react-router'
import { datasetMode } from '@/features/docs/data'
import { EmptyStart } from '@/features/docs/empty-start'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'
import { CommitViewer } from '@/features/docs/commit-viewer'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

// Pages that make sense before anything is imported; every other page shows the start screen.
const WITHOUT_PROJECT = ['/einstellungen', '/architektur']

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  const pathname = useLocation({ select: (l) => l.pathname.replace(/^\/app/, '').replace(/\/$/, '') })
  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              // Set content container, so we can use container queries
              '@container/content',

              // If layout is fixed, set the height
              // to 100svh to prevent overflow
              'has-data-[layout=fixed]:h-svh',

              // If layout is fixed and sidebar is inset,
              // set the height to 100svh - spacing (total margins) to prevent overflow
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
            )}
          >
            {children ?? (datasetMode === 'empty' && !WITHOUT_PROJECT.includes(pathname) ? <EmptyStart /> : <Outlet />)}
          </SidebarInset>
          <CommitViewer />
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  )
}
