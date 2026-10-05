import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import type { LiveProposal } from './model'
import { generateProposal, useGenerated } from './generation-store'
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
    // Only places without a draft; existing drafts stay as they are.
    const targets = proposals.filter((p) => p.state === 'offen' && p.op !== 'note' && !p.task && !p.generation)
    // Everything is drafted already: nothing to wait for, go straight to the changes.
    if (!targets.length) { void navigate({ to: '/aenderungen' }); return }
    running.current = true
    setPending(true)
    setOpen(true)
    setError('')
    try {
      setCount({ completed: 0, total: targets.length })
      await prepareReview(targets, generateProposal, (completed, total) => setCount({ completed, total }))
      // Nothing came through (no key, provider down): say why instead of jumping to an empty review.
      const errors = useGenerated.getState().errors, failed = targets.filter((t) => errors[t.id])
      if (targets.length && failed.length === targets.length) throw new Error(errors[failed[0].id])
      await navigate({ to: '/dokumente/$id', params: { id: first.doc }, search: { p: first.id } })
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Entwürfe konnten nicht formuliert werden.')
    } finally { running.current = false; setPending(false) }
  }
  return <>
    <Button size='sm' disabled={!first || pending} onClick={() => void start()}><ScanSearch /> {label}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!running.current) setOpen(value) }}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{error ? 'Keine Entwürfe formuliert' : 'Entwürfe werden formuliert'}</DialogTitle>
          <DialogDescription>{error ? 'Es wurde kein einziger Entwurf erstellt.' : 'Danach springst du zum ersten Vorschlag.'}</DialogDescription>
        </DialogHeader>
        <div role='status' aria-live='polite' className='grid gap-3'>
          {pending && <LoaderCircle className='size-6 animate-spin' />}
          <Progress value={count.total ? count.completed / count.total * 100 : 0} />
          <p className='text-sm text-muted-foreground'>{count.completed} von {count.total} Stellen formuliert</p>
        </div>
        {error && <><p role='alert' className='text-sm'>{error}</p><Button className='w-fit' onClick={() => void navigate({ to: '/einstellungen' }).then(() => setOpen(false))}>Zu den Einstellungen</Button></>}
      </DialogContent>
    </Dialog>
  </>
}
