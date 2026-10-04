import { ArrowUpRight } from 'lucide-react'
import { Logo } from '@/assets/logo'
import { company, currentUser } from '@/features/docs/data'
import { useBundles } from '@/features/docs/model'
import { useLayout } from '@/context/layout-provider'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'

function SidebarBrand() {
  const { toggleSidebar } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size='lg' tooltip='Seitenleiste ein- und ausklappen' onClick={toggleSidebar}>
          <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
            <Logo className='size-4.5' />
          </div>
          <span className='flex min-w-0 flex-col leading-tight'>
            <span className='text-[15px] font-semibold tracking-[-0.03em]'>neuraldoc</span>
            <span className='truncate text-xs text-muted-foreground'>
              {company.product} · {company.short}
            </span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** Live counts next to the navigation: changes and documents with open proposals. */
function useBadges(): Record<string, string | undefined> {
  const open = useBundles().filter((b) => b.open > 0).length
  return { '/aenderungen': open ? String(open) : undefined }
}

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const badges = useBadges()
  const navGroups = sidebarData.navGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, badge: item.url ? badges[String(item.url)] : undefined })),
  }))
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter className='gap-1 p-2 pb-3'>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* The landing page lives outside the app router (/app), so a plain link. */}
            <SidebarMenuButton asChild tooltip='Zur Website'>
              <a href={import.meta.env.VITE_LANDING_URL || 'http://localhost:5173/'}>
                <ArrowUpRight />
                <span>Zur Website</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' className='pointer-events-none'>
              <Avatar className='size-8'>
                <AvatarFallback className='bg-background text-xs ring-1 ring-border ring-inset'>{currentUser.initials}</AvatarFallback>
              </Avatar>
              <span className='flex min-w-0 flex-col leading-tight'>
                <span className='truncate text-sm font-medium'>{currentUser.name}</span>
                <span className='truncate text-xs text-muted-foreground'>{currentUser.role}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
