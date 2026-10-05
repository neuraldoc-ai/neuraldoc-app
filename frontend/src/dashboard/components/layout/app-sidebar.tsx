import { Link } from '@tanstack/react-router'
import { ArrowUpRight, UserRound } from 'lucide-react'
import { Logo } from '@/assets/logo'
import { company, currentUser, datasetMode } from '@/features/docs/data'
import { initials, useBundles } from '@/features/docs/model'
import { projectState } from '@/features/docs/project'
import { useProfile } from '@/features/settings/profile-store'
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
  const profile = useProfile((s) => s.profile)
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
              {datasetMode === 'working' ? `${company.product} · ${profile?.company || 'Eigenes Projekt'}` : datasetMode === 'showcase' ? `Showcase · ${company.product}` : profile?.company || 'Noch kein Projekt'}
            </span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

const site = import.meta.env.VITE_LANDING_URL
  ? { url: import.meta.env.VITE_LANDING_URL, label: 'Zur Website' }
  : { url: 'https://github.com/neuraldoc-ai/neuraldoc-app', label: 'neuraldoc auf GitHub' }

/** Who uses this installation, from Einstellungen. The public showcase shows its sample persona. */
function UserButton() {
  const profile = useProfile((s) => s.profile)
  const person = (name: string, detail: string, avatar: React.ReactNode) => (
    <>
      <Avatar className='size-8'>
        <AvatarFallback className='bg-background text-xs ring-1 ring-border ring-inset'>{avatar}</AvatarFallback>
      </Avatar>
      <span className='flex min-w-0 flex-col leading-tight'>
        <span className='truncate text-sm font-medium'>{name}</span>
        <span className='truncate text-xs text-muted-foreground'>{detail}</span>
      </span>
    </>
  )
  if (!projectState?.canImport)
    return <SidebarMenuButton size='lg' className='pointer-events-none'>{person(currentUser.name, currentUser.role, currentUser.initials)}</SidebarMenuButton>
  return (
    <SidebarMenuButton size='lg' asChild tooltip='Profil bearbeiten'>
      <Link to='/einstellungen'>
        {profile?.name
          ? person(profile.name, profile.company || profile.role || 'Profil bearbeiten', initials(profile.name))
          : person('Profil einrichten', 'Name und Unternehmen', <UserRound className='size-4' />)}
      </Link>
    </SidebarMenuButton>
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
            {/* Outside the app router (/app), so a plain link. The hosted showcase sets its own website. */}
            <SidebarMenuButton asChild tooltip={site.label}>
              <a href={site.url} target='_blank' rel='noreferrer'>
                <ArrowUpRight />
                <span>{site.label}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UserButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
