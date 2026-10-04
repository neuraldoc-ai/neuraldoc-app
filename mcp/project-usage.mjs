import fs from 'node:fs'
import path from 'node:path'
import { activeProject, projectsDir } from './projects.mjs'

export function projectUsage(params = new URLSearchParams()) {
  const p = activeProject(), file = path.join(projectsDir, p.id, 'calls.jsonl')
  const from = params.get('from'), until = params.get('until')
  const inPeriod = (event) => (!from || Date.parse(event.at) >= Date.parse(from)) && (!until || Date.parse(event.at) <= Date.parse(until))
  const calls = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line, i) => ({ ...JSON.parse(line), line: i })).filter(inPeriod) : []
  const decisions = p.events.filter((e) => e.kind === 'decision' && inPeriod(e))
  const totals = { calls: calls.length, successful: calls.filter((c) => c.ok).length, failed: calls.filter((c) => !c.ok).length, answer: calls.reduce((n, c) => n + (c.tokens?.answer || 0), 0), raw: calls.reduce((n, c) => n + (c.tokens?.raw || 0), 0), timedCalls: 0, durationMs: 0 }
  const events = [...calls.map((c) => ({ id: `call-${c.line}`, at: c.at, kind: 'call', title: c.summary, by: c.client, tool: c.tool, ok: c.ok, detail: c, url: null })), ...decisions.map((e, i) => ({ id: `decision-${i}`, at: e.at, kind: 'decision', title: e.title, action: e.action, detail: e, url: null }))].sort((a, b) => b.at.localeCompare(a.at))
  const days = [...new Set(calls.map((c) => c.at.slice(0, 10)))].map((day) => { const rows = calls.filter((c) => c.at.startsWith(day)); return { day, calls: rows.length, answer: rows.reduce((n, c) => n + c.tokens.answer, 0), raw: rows.reduce((n, c) => n + c.tokens.raw, 0), failed: rows.filter((c) => !c.ok).length } })
  const perTool = [...new Set(calls.map((c) => c.tool))].map((tool) => { const rows = calls.filter((c) => c.tool === tool); return { tool, calls: rows.length, answer: rows.reduce((n, c) => n + c.tokens.answer, 0), raw: rows.reduce((n, c) => n + c.tokens.raw, 0), failed: 0, timedCalls: 0, durationMs: 0 } })
  return { generatedAt: new Date().toISOString(), period: { from, until }, warnings: [], estimated: { method: 'Textlänge ÷ 4 für MCP-Antworten; keine gesamte Agentennutzung.', totals, days, perTool, perClient: [], calls, events, decisions, writebacks: [], comments: [] }, limitations: ['Lokale Freigaben werden gespeichert; keine externen Rückschreibungen.', 'Jev- und LLM-Aufrufe sind separate Modellaufrufe und keine MCP-Tokenersparnis.'] }
}
