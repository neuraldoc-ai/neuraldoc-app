import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import type { LiveProposal } from './model'
import { generateProposal } from './generation-store'
import { prepareReview } from './review-batch.mjs'

export function StartReview({ proposals, first, label = "Starten" }: { proposals: LiveProposal[]; first?: LiveProposal; label?: string }) {
  const navigate = useNavigate()
  const running = useRef(false)
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [count, setCount] = useState({ completed: 0, total: 0 })
  async function start() {
    if (running.current || !first) return
    running.current = true
    setPending(true)
    setOpen(true)
    setError('')
    try {
      const targets = proposals.filter((p) => p.state === 'offen' && p.op !== 'note' && !p.task)
      setCount({ completed: 0, total: targets.length })
      await prepareReview(targets, generateProposal, (completed, total) => setCount({ completed, total }))
      await navigate({ to: '/aenderungen' })
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Übersicht konnte nicht geöffnet werden.')
    } finally { running.current = false; setPending(false) }
  }
  return <>
    <Button size='sm' disabled={!first || pending} onClick={() => void start()}><ScanSearch /> {label}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!running.current) setOpen(value) }}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{error ? 'Übersicht öffnen' : 'Doku-Vorschläge werden vorbereitet'}</DialogTitle>
          <DialogDescription>Danach öffnet sich die Übersicht der Änderungen.</DialogDescription>
        </DialogHeader>
        <div role='status' aria-live='polite' className='grid gap-3'>
          {pending && <LoaderCircle className='size-6 animate-spin' />}
          <Progress value={count.total ? count.completed / count.total * 100 : 0} />
          <p className='text-sm text-muted-foreground'>{count.completed} von {count.total} Textstellen bearbeitet</p>
        </div>
        {error && <><p role='alert' className='text-sm'>{error}</p><Button onClick={() => void navigate({ to: '/aenderungen' }).then(() => setOpen(false))}>Zur Übersicht</Button></>}
      </DialogContent>
    </Dialog>
  </>
}
