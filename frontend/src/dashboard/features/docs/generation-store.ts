import { create } from 'zustand'
import type { Proposal } from './data'

export type Generation = {
  status?: "draft" | "needs_context"
  recommendation?: string
  answer?: string
  id: string
  model: string
  createdAt: string
  evidenceIds: string[]
  usage: { inputTokens: number | null; outputTokens: number; costUsd: number | null }
}
export type GeneratedPatch = Pick<Proposal, 'text' | 'blocks' | 'rows' | 'why' | 'confidence' | 'question'> & { generation: Generation }
export const useGenerated = create<{ proposals: Record<string, GeneratedPatch>; errors: Record<string, string> }>(() => ({ proposals: {}, errors: {} }))

export async function refreshGenerated() {
  const response = await fetch('/api/mcp/drafts')
  if (!response.ok) throw new Error('Erzeugte Texte konnten nicht geladen werden.')
  useGenerated.setState({ proposals: await response.json() as Record<string, GeneratedPatch> })
}

export async function generateProposal(id: string, answer?: string) {
  try {
  const response = await fetch('/api/mcp/drafts/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, answer }) })
  const result = await response.json() as { error?: string; result: { status: 'draft' | 'needs_context'; question: string }; proposal?: GeneratedPatch }
  if (!response.ok) {
    const message = result.error || 'Texterstellung fehlgeschlagen.'
    useGenerated.setState((s) => ({ errors: { ...s.errors, [id]: message } }))
    throw new Error(message)
  }
  useGenerated.setState((s) => { const errors = { ...s.errors }; delete errors[id]; return { errors } })
  if (result.proposal) useGenerated.setState((s) => ({ proposals: { ...s.proposals, [id]: result.proposal! } }))
  return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Texterstellung fehlgeschlagen.'
    useGenerated.setState((s) => ({ errors: { ...s.errors, [id]: message } }))
    throw error
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => void refreshGenerated().catch(() => undefined))
}
