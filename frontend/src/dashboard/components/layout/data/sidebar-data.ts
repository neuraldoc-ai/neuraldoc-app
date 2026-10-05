import { BrainCircuit, Database, GitMerge, LayoutDashboard, Plug, ChartNoAxesCombined, Network, Settings } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'Überblick',
      items: [
        { title: 'Übersicht', url: '/', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Arbeiten',
      items: [
        { title: 'Änderungen', url: '/aenderungen', icon: GitMerge },
        { title: 'Company Brain', url: '/brain', icon: BrainCircuit },
      ],
    },
    {
      title: 'Steuern',
      items: [
        { title: 'Daten', url: '/daten', icon: Database },
        { title: 'MCP', url: '/mcp', icon: Plug },
        { title: 'Analytics', url: '/analytics', icon: ChartNoAxesCombined },
        { title: 'Architektur', url: '/architektur', icon: Network },
        { title: 'Einstellungen', url: '/einstellungen', icon: Settings },
      ],
    },
  ],
}
