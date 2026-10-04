import { BrainCircuit, Database, GitMerge, LayoutDashboard, Plug, ChartNoAxesCombined, Network } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: { name: 'Produktmanagement', email: 'ERP & Finance', avatar: '' },
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
      ],
    },
  ],
}
