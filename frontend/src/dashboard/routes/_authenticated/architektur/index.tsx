import { createFileRoute } from '@tanstack/react-router'
import { ArchitecturePage } from '@/features/architecture'

export const Route = createFileRoute('/_authenticated/architektur/')({ component: ArchitecturePage })
