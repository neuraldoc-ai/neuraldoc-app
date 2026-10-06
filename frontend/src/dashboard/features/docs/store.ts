/**
 * What a visitor decides: accepted, edited or rejected proposals.
 * Every page reads the same store, so all counts move together. Each decision also goes to the
 * neuraldoc MCP server (/api/mcp/decisions): there the developer's agent sees the state, and an
 * approval is written back to Confluence or SharePoint. Without the server the store just stays local.
 */
import { create } from 'zustand'
import { datasetMode, type Block } from './data'
import { useGenerated } from './generation-store'
import { toast } from 'sonner'

export type Decision = {
  state: 'uebernommen' | 'verworfen'
  /** The accepted text: changed in the editor, or the generated text as it was when accepted. */
  edited?: { text?: string; blocks?: Block[]; rows?: string[][] }
}

export type LogEntry = { at: string; what: string }

type Store = {
  decisions: Record<string, Decision>
  log: LogEntry[]
  decide: (id: string, decision: Decision, what: string) => void
  decideMany: (ids: string[], state: Decision['state'], what: string) => void
  undo: (id: string) => void
  reset: () => void
}

const now = () => new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

const API = '/api/mcp/decisions'
const BY = 'neuraldoc-Dashboard'
const post = async (url: string, body: unknown) => {
  if (datasetMode === 'showcase') return
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error || 'Entscheidung konnte nicht gespeichert werden.') }
}
const failed = (error: unknown) => { toast.error(error instanceof Error ? error.message : 'Entscheidung konnte nicht gespeichert werden.') }

// Keep the approved wording even if code changes later and invalidates the generation cache.
const snapshotGenerated = (id: string, decision: Decision): Decision => {
  const generated = useGenerated.getState().proposals[id]
  if (decision.state !== 'uebernommen' || decision.edited || !generated) return decision
  return { ...decision, edited: { ...(generated.text !== undefined ? { text: generated.text } : {}), ...(generated.blocks ? { blocks: generated.blocks } : {}), ...(generated.rows ? { rows: generated.rows } : {}) } }
}

export const useDecisions = create<Store>((set) => ({
  decisions: {},
  log: [],
  decide: (id, decision, what) => {
    if (decision.state === "uebernommen" && useGenerated.getState().proposals[id]?.generation.status === "needs_context" && !decision.edited) return
    decision = snapshotGenerated(id, decision)
    void post(API, { id, decision, by: BY }).then(() => set((s) => ({ decisions: { ...s.decisions, [id]: decision }, log: [{ at: now(), what }, ...s.log] }))).catch(failed)
  },
  decideMany: (ids, state, what) => {
    const decisions = Object.fromEntries(ids.map((id) => [id, snapshotGenerated(id, { state })]))
    const save = Object.values(decisions).some((d) => d.edited) ? Promise.all(Object.entries(decisions).map(([id, decision]) => post(API, { id, decision, by: BY }))) : post(API, { ids, decision: { state }, by: BY })
    void save.then(() => set((s) => ({
      decisions: { ...s.decisions, ...decisions },
      log: [{ at: now(), what }, ...s.log],
    }))).catch(failed)
  },
  undo: (id) => {
    void post(API, { id, decision: null, by: BY }).then(() => set((s) => {
      const next = { ...s.decisions }
      delete next[id]
      return { decisions: next }
    })).catch(failed)
  },
  reset: () => {
    void post(`${API}/reset`, {}).then(() => set({ decisions: {}, log: [] })).catch(failed)
  },
}))

/** Loads the decisions the server knows, e.g. after a link from the agent opened a new tab. */
export async function refreshDecisions() {
  if (datasetMode === 'showcase') {
    try { useDecisions.setState({ decisions: JSON.parse(sessionStorage.getItem('neuraldoc-showcase-decisions') || '{}') as Record<string, Decision> }) } catch { useDecisions.setState({ decisions: {} }) }
    return
  }
  return fetch(API)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: Record<string, Decision> | null) => {
      if (!d) return
      const decisions = Object.fromEntries(Object.entries(d).map(([id, x]) => [id, { state: x.state, ...(x.edited ? { edited: x.edited } : {}) }]))
      useDecisions.setState({ decisions })
    })
    .catch(() => undefined)
}

if (typeof window !== 'undefined') {
  useDecisions.subscribe((state) => { if (datasetMode === 'showcase') { try { sessionStorage.setItem('neuraldoc-showcase-decisions', JSON.stringify(state.decisions)) } catch { /* Storage can be unavailable in private browsing. */ } } })
  window.addEventListener('focus', () => void refreshDecisions())
}
