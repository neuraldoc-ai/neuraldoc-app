/** Icons per doc type and the soft blue badge style, used on the overview. */
import { BookOpen, Code2, Network, PanelsTopLeft, Server, SlidersHorizontal } from 'lucide-react'
import { type DocTypeId } from './data'

export const typeIcon: Record<DocTypeId, typeof BookOpen> = {
  nutzer: BookOpen,
  dialog: PanelsTopLeft,
  parameter: SlidersHorizontal,
  technik: Code2,
  installation: Server,
  architektur: Network,
}

export const blueSoft = 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-200'
