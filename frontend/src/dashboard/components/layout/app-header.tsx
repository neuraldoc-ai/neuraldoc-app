import { type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type Crumb = { label: string; to?: string }

// Shared top bar: breadcrumb on the left, search and theme on the right.
export function AppHeader({
  crumbs = [],
  children,
}: {
  crumbs?: Crumb[]
  children?: ReactNode
}) {
  return (
    <Header fixed>
      <nav className='me-auto flex min-w-0 items-center gap-1.5 text-sm' aria-label='Brotkrumen'>
        {crumbs.map((c, i) => (
          <span key={i} className='flex min-w-0 items-center gap-1.5'>
            {i > 0 && <ChevronRight className='size-3.5 shrink-0 text-muted-foreground/50' />}
            {c.to ? (
              <Link
                to={c.to}
                className='truncate text-muted-foreground hover:text-foreground'
              >
                {c.label}
              </Link>
            ) : (
              <span className='truncate font-medium'>{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      {children}
      <Search placeholder='Suchen …' />
      <ThemeSwitch />
    </Header>
  )
}
