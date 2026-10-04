import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, FileText, GitMerge, Laptop, Moon, Sun } from 'lucide-react'
import { bundles, docTypes, docs } from '@/features/docs/data'
import { useSearch } from '@/context/search-provider'
import { useTheme } from '@/context/theme-provider'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { sidebarData } from './layout/data/sidebar-data'
import { ScrollArea } from './ui/scroll-area'

export function CommandMenu() {
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const { open, setOpen } = useSearch()

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false)
      command()
    },
    [setOpen]
  )

  return (
    <CommandDialog modal open={open} onOpenChange={setOpen}>
      <CommandInput placeholder='Änderung, Dokument oder Seite suchen …' />
      <CommandList>
        <ScrollArea type='hover' className='h-80 pe-1'>
          <CommandEmpty>Nichts gefunden.</CommandEmpty>
          {sidebarData.navGroups.map((group) => (
            <CommandGroup key={group.title} heading={group.title}>
              {group.items.map((navItem) =>
                navItem.url ? (
                  <CommandItem key={String(navItem.url)} value={navItem.title} onSelect={() => runCommand(() => navigate({ to: navItem.url }))}>
                    <div className='flex size-4 items-center justify-center'>
                      <ArrowRight className='size-2 text-muted-foreground/80' />
                    </div>
                    {navItem.title}
                  </CommandItem>
                ) : null
              )}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading='Änderungen'>
            {bundles.map((b) => (
              <CommandItem key={b.id} value={`${b.title} ${b.ticket}`} onSelect={() => runCommand(() => navigate({ to: '/aenderungen/$id', params: { id: b.id } }))}>
                <GitMerge className='size-4 text-muted-foreground' />
                <span className='flex min-w-0 flex-col'>
                  <span className='truncate'>{b.title}</span>
                  <span className='truncate text-xs text-muted-foreground'>{b.ticket}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading='Dokumente'>
            {docs.map((d) => (
              <CommandItem key={d.id} value={`${d.title} ${docTypes[d.type].label}`} onSelect={() => runCommand(() => navigate({ to: '/dokumente/$id', params: { id: d.id }, search: {} }))}>
                <FileText className='size-4 text-muted-foreground' />
                <span className='flex min-w-0 flex-col'>
                  <span className='truncate'>{d.title}</span>
                  <span className='truncate text-xs text-muted-foreground'>{docTypes[d.type].label}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading='Darstellung'>
            <CommandItem onSelect={() => runCommand(() => setTheme('light'))}>
              <Sun /> <span>Hell</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme('dark'))}>
              <Moon className='scale-90' />
              <span>Dunkel</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme('system'))}>
              <Laptop />
              <span>Wie das System</span>
            </CommandItem>
          </CommandGroup>
        </ScrollArea>
      </CommandList>
    </CommandDialog>
  )
}
