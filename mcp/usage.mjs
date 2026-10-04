import fs from 'node:fs'
import path from 'node:path'
import { STATE } from './core.mjs'
import { bundles, proposals } from '../frontend/src/dashboard/features/docs/data.ts'

function readJson(file, fallback, warnings) {
  if (!fs.existsSync(file)) return fallback
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { warnings.push(`${path.basename(file)} ist nicht lesbar.`); return fallback }
}
function readLines(file, warnings) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line, i) => {
    try { return [{ ...JSON.parse(line), line: i + 1 }] } catch { warnings.push(`${path.basename(file)}, Zeile ${i + 1}: ungültiger Eintrag.`); return [] }
  })
}

export function usage(params = new URLSearchParams(), roots = {}) {
  const state = roots.state ?? STATE
  const warnings = []
  const from = params.get('from'), until = params.get('until')
  if ((from && !Number.isFinite(Date.parse(from))) || (until && !Number.isFinite(Date.parse(until)))) throw new Error('Zeitraum ist ungültig')
  if (from && until && Date.parse(from) > Date.parse(until)) throw new Error('Zeitraum ist vertauscht')
  const selected = (at) => (!from || Date.parse(at) >= Date.parse(from)) && (!until || Date.parse(at) <= Date.parse(until))
  const calls = readLines(path.join(state, 'log.jsonl'), warnings).filter((e) => !e.benchmarkRun && selected(e.at)).reverse()
  const decisions = readLines(path.join(state, 'decisions-log.jsonl'), warnings).filter((e) => selected(e.at)).reverse()
  const writebacks = readLines(path.join(state, 'writebacks.jsonl'), warnings).filter((e) => selected(e.at)).reverse()
  const recordedComments = readLines(path.join(state, 'mr-comments-log.jsonl'), warnings)
  const legacyComments = Object.values(readJson(path.join(state, 'mr-comments.json'), {}, warnings)).filter((c) => !recordedComments.some((r) => r.at === c.at && r.mr === c.mr))
  const comments = [...recordedComments, ...legacyComments].filter((e) => selected(e.at))
  const totals = { calls: calls.length, successful: calls.filter((e) => e.ok).length, failed: calls.filter((e) => !e.ok).length, answer: 0, raw: 0, timedCalls: 0, durationMs: 0 }
  const days = new Map(), perTool = new Map(), perClient = new Map()
  for (const c of calls) {
    const key = new Date(c.at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
    const clientName = c.client || 'Unbekannt'
    const day = days.get(key) ?? { day: key, calls: 0, answer: 0, raw: 0, failed: 0 }
    const tool = perTool.get(c.tool) ?? { tool: c.tool, calls: 0, answer: 0, raw: 0, failed: 0, timedCalls: 0, durationMs: 0 }
    const client = perClient.get(clientName) ?? { client: clientName, calls: 0, answer: 0, raw: 0, failed: 0, timedCalls: 0, durationMs: 0, lastAt: c.at }
    for (const group of [day, tool, client]) {
      group.calls++
      if (!c.ok) group.failed++
      if (c.ok && c.tokens) for (const k of ['answer', 'raw']) group[k] += Number.isFinite(c.tokens[k]) ? c.tokens[k] : 0
    }
    if (c.ok && c.tokens) for (const k of ['answer', 'raw']) totals[k] += Number.isFinite(c.tokens[k]) ? c.tokens[k] : 0
    if (Number.isFinite(c.ms)) for (const group of [totals, tool, client]) { group.timedCalls++; group.durationMs += c.ms }
    if (Date.parse(c.at) > Date.parse(client.lastAt)) client.lastAt = c.at
    days.set(key, day); perTool.set(c.tool, tool); perClient.set(clientName, client)
  }
  const events = [
    ...calls.map((c) => ({ id: `call-${c.line}`, at: c.at, kind: 'call', title: c.summary, by: c.client, tool: c.tool, ok: c.ok, detail: c, change: c.ref?.change })),
    ...decisions.map((d) => ({ id: `decision-${d.line}`, at: d.at, kind: 'decision', title: d.title, by: d.by, action: d.action, detail: d, change: proposals.find((p) => p.id === d.proposal)?.bundle })),
    ...writebacks.map((w) => ({ id: `writeback-${w.line}`, at: w.at, kind: 'writeback', title: w.title ?? 'Rückschreibung zurückgenommen', by: w.by, action: w.action ?? 'write', detail: w, change: w.bundle ?? proposals.find((p) => p.id === w.proposal)?.bundle })),
    ...comments.map((c, i) => ({ id: `comment-${i}`, at: c.at, kind: 'comment', title: `Kommentar zu ${c.mr}`, by: c.by, detail: c })),
  ].map((e) => ({ ...e, url: e.change && bundles.some((b) => b.id === e.change) ? `/app/aenderungen/${e.change}` : null })).sort((a, b) => b.at.localeCompare(a.at))
  return {
    generatedAt: new Date().toISOString(), period: { from, until }, warnings,
    estimated: { method: 'Zeichen ÷ 4; neue Aufrufe schätzen die gesamte MCP-Antwort, ältere nur den Antworttext. Keine gesamte Agentennutzung.', totals, days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)), perTool: [...perTool.values()], perClient: [...perClient.values()].sort((a, b) => b.calls - a.calls || a.client.localeCompare(b.client)), calls, events, decisions, writebacks, comments },
    limitations: [
      'Werkzeugtokens werden aus Textlängen geschätzt. Modellkosten und die gesamte Agentennutzung werden nicht erfasst.',
      'Freigaben und Rückschreibungen sind Demo-Ereignisse. Ältere Freigaben vor Einführung des Ereignisprotokolls sind nicht rückwirkend rekonstruierbar; von älteren MR-Kommentaren ist nur der zuletzt gespeicherte Stand bekannt.',
    ],
  }
}
