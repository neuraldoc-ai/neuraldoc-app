export type Call = {
  line: number; at: string; client: string; tool: string; ok: boolean; summary: string; ms?: number
  args?: Record<string, unknown>; tokens?: { answer: number; raw: number }; ref?: Record<string, unknown>
}
export type HistoryEvent = {
  id: string; at: string; kind: 'call' | 'decision' | 'writeback' | 'comment'; title: string; by?: string; tool?: string; ok?: boolean; action?: string
  detail: Record<string, unknown>; url: string | null
}
export type Usage = {
  generatedAt: string; warnings: string[]; limitations: string[]
  estimated: {
    method: string
    totals: { calls: number; successful: number; failed: number; answer: number; raw: number; timedCalls: number; durationMs: number }
    days: { day: string; calls: number; answer: number; raw: number; failed: number }[]
    perTool: { tool: string; calls: number; answer: number; raw: number; failed: number; timedCalls: number; durationMs: number }[]
    perClient: { client: string; calls: number; answer: number; raw: number; failed: number; timedCalls: number; durationMs: number; lastAt: string }[]
    calls: Call[]; events: HistoryEvent[]; decisions: unknown[]; writebacks: unknown[]; comments: unknown[]
  }
}
export const num = (n: number | null | undefined) => n == null ? '–' : n.toLocaleString('de-DE')
export const dateTime = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' })
export const toolLabel = (tool: string) => ({ ask: 'Fachfrage', ticket_context: 'Ticket vorbereiten', check_change: 'Änderung prüfen' })[tool] ?? tool
