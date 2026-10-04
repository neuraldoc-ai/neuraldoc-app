import { lazy, Suspense } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCommitViewer } from './commit-viewer-store'
import { datasetMode } from './data'

const CommitDetails = lazy(() => import('./commit-details'))

/** Mounted outside the document popover so opening a commit cannot dismiss its own viewer. */
export function CommitViewer() {
  const { open, hash, hashes, trigger, close } = useCommitViewer()
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) close() }}>
      <DialogContent
        className='flex h-[min(840px,90svh)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl'
        onCloseAutoFocus={(event) => {
          if (trigger?.isConnected) {
            event.preventDefault()
            trigger.focus()
          }
        }}
      >
        <DialogHeader className='shrink-0 border-b px-5 py-4 pe-12'>
          <DialogTitle>{hashes.length > 1 ? 'Zugehörige Commits' : 'Commit ansehen'}</DialogTitle>
          <DialogDescription>{datasetMode === 'working' ? 'Aus deinem lokalen Git-Repository.' : 'Beispieldaten aus GitLab.'} Hinzugefügte und entfernte Codezeilen im Vergleich.</DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={<p role='status' className='p-6 text-sm text-muted-foreground'>Commit wird geladen …</p>}>
            <CommitDetails key={hash} initialHash={hash} hashes={hashes} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  )
}
