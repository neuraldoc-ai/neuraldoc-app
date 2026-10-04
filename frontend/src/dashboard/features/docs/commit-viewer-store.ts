import { create } from 'zustand'

type CommitViewerState = {
  open: boolean
  hash: string
  hashes: string[]
  trigger: HTMLElement | null
  show: (hash: string, hashes?: string[], trigger?: HTMLElement) => void
  close: () => void
}

export const useCommitViewer = create<CommitViewerState>((set) => ({
  open: false,
  hash: '',
  hashes: [],
  trigger: null,
  show: (hash, hashes = [hash], trigger) => set({
    open: true,
    hash,
    hashes: [...new Set([...hashes, hash])],
    trigger: trigger ?? null,
  }),
  close: () => set({ open: false }),
}))
