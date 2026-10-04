import type { LiveProposal } from './model'

export function GenerateText({ p }: { p: LiveProposal }) {
  if (!p.generation) return null
  if (p.generation.status === 'needs_context') return <span className='text-xs text-muted-foreground'>Rückfrage von {p.generation.model}.</span>
  if (p.generation.status === 'no_change') return <span className='text-xs text-muted-foreground'>Laut {p.generation.model} stimmt der Text mit dem Code überein.</span>
  return <span className='text-xs text-muted-foreground'>Erstellt mit {p.generation.model}.{p.state === 'offen' ? ' Fachliche Prüfung offen.' : ''}</span>
}
