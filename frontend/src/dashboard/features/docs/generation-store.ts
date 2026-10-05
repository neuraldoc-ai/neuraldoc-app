import { create } from 'zustand'
import type { Proposal } from './data'

/** One deviation the initial check found in a section, with its reason, its evidence and the line edits that fix it. */
export type Finding = {
  kind: "contradicts" | "removed" | "missing"
  doc_quote: string
  explanation: string
  evidence: { id: string; quote: string; source: string; file: string }[]
  absent: string[]
  edits: { op: "replace" | "insert_after" | "delete"; start: number; end: number; text: string }[]
  /** Jev confirmed the finding. */
  sure: boolean
  jev: { verdict: string; probability: number } | null
}
export type Generation = {
  status?: "draft" | "needs_context" | "no_change"
  recommendation?: string
  answer?: string
  id: string
  model: string
  createdAt: string
  evidenceIds: string[]
  /** Own projects: the findings behind the correction, one per marked change. */
  findings?: Finding[]
  usage: { inputTokens: number | null; outputTokens: number; costUsd: number | null }
}
export type GeneratedPatch = Pick<Proposal, 'text' | 'blocks' | 'rows' | 'why' | 'confidence' | 'question'> & { generation: Generation }
export const useGenerated = create<{ proposals: Record<string, GeneratedPatch>; errors: Record<string, string> }>(() => ({ proposals: {}, errors: {} }))

export async function refreshGenerated() {
  const response = await fetch('/api/mcp/drafts')
  if (!response.ok) throw new Error('Die formulierten Texte konnten nicht geladen werden.')
  useGenerated.setState({ proposals: await response.json() as Record<string, GeneratedPatch> })
}

export async function generateProposal(id: string, answer?: string) {
  try {
  const response = await fetch('/api/mcp/drafts/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, answer }) })
  const result = await response.json() as { error?: string; result: { status: 'draft' | 'needs_context' | 'no_change'; question: string }; proposal?: GeneratedPatch }
  if (!response.ok) {
    const message = result.error || 'Der Text konnte nicht formuliert werden.'
    useGenerated.setState((s) => ({ errors: { ...s.errors, [id]: message } }))
    throw new Error(message)
  }
  useGenerated.setState((s) => { const errors = { ...s.errors }; delete errors[id]; return { errors } })
  if (result.proposal) useGenerated.setState((s) => ({ proposals: { ...s.proposals, [id]: result.proposal! } }))
  return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Der Text konnte nicht formuliert werden.'
    useGenerated.setState((s) => ({ errors: { ...s.errors, [id]: message } }))
    throw error
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => void refreshGenerated().catch(() => undefined))
}
