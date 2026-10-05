import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { LiveProposal } from './model'
import { generateProposal, useGenerated } from './generation-store'
import { useDecisions } from './store'

export function ProposalQuestion({ p }: { p: LiveProposal }) {
  const [editing, setEditing] = useState(false)
  const [answer, setAnswer] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const preparationError = useGenerated((s) => s.errors[p.id])
  const decide = useDecisions((s) => s.decide)
  if (p.state !== 'offen' || (!p.question && !preparationError)) return null
  const recommendation = p.generation?.recommendation || p.why
  async function respond(text: string) {
    setPending(true)
    setError('')
    try {
      await generateProposal(p.id, text)
      setEditing(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Deine Antwort konnte nicht verarbeitet werden. Versuch es noch einmal.') }
    finally { setPending(false) }
  }
  return <div className='grid gap-2 rounded-lg border border-late/30 bg-late-soft p-3 text-sm' onClick={(e) => e.stopPropagation()}>
    {p.question ? <>
      <strong className='font-medium'>Kurz entscheiden</strong>
      <p>{p.question}</p>
      <p className='text-muted-foreground'><strong>{p.generation ? 'Modellvorschlag: ' : 'Vorschlag: '}</strong>{recommendation}</p>
      <div className='flex flex-wrap gap-2'>
        <Button size='sm' disabled={pending} onClick={() => void respond('Ja. Ich stimme diesem redaktionellen Vorschlag zu: ' + recommendation)}>{pending ? 'Wird formuliert …' : 'Ja'}</Button>
        <Button size='sm' variant='outline' disabled={pending} onClick={() => decide(p.id, { state: 'verworfen' }, 'Nein: ' + p.title)}>Nein, weglassen</Button>
        <Button size='sm' variant='outline' disabled={pending} onClick={() => setEditing(!editing)}>Anpassen</Button>
      </div>
      {editing && <div className='grid gap-2'>
        <Textarea aria-label='Antwort zur Rückfrage' placeholder='Wie soll der Vorschlag angepasst werden?' value={answer} maxLength={2000} onChange={(e) => setAnswer(e.target.value)} />
        <Button size='sm' className='w-fit' disabled={pending || !answer.trim()} onClick={() => void respond(answer)}>Mit Antwort formulieren</Button>
      </div>}
    </> : <><p>Der Text konnte nicht formuliert werden: {preparationError}</p><Button size='sm' className='w-fit' disabled={pending} onClick={() => void respond('Bitte den belegten Stand für diese Stelle formulieren.')}>Erneut formulieren</Button></>}
    {(error || (p.question && preparationError)) && <p role='alert'>{error || preparationError}</p>}
  </div>
}
