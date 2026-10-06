/**
 * The rules behind the pages, without React: lookups, the audience filter and where a proposal sits.
 * Shared by the dashboard (through model.ts) and the MCP server (mcp/core.mjs), so both always agree.
 * Imports carry the .ts extension because Node loads this file directly.
 */
import { changeKinds, changeTypes, datasetMode, docTypeOrder, docTypes, docs, bundles, modules, proposals, type Bundle, type Doc, type DocTypeId, type Nature, type Proposal } from './data.ts'

/* ---------- Lookups ---------- */

export const docOf = (id: string) => docs.find((d) => d.id === id)!
export const bundleOf = (id: string) => bundles.find((b) => b.id === id)
export const commitOf = (hash: string) => bundles.flatMap((b) => b.commits).find((c) => c.hash === hash)

/** The overall nature of a change: fachlich wins over technisch over umbenennung over intern. */
export function natureOf(b: Bundle): Nature {
  if (b.type) return changeTypes[b.type].nature
  const order: Nature[] = ['fachlich', 'technisch', 'umbenennung', 'intern']
  const present = new Set(b.aspects.map((a) => changeKinds[a.kind].nature))
  return order.find((n) => present.has(n)) ?? 'intern'
}

/** The heading a proposal belongs to, e.g. „nach 3.3 Montage“ for an insert. */
export function locationOf(p: Proposal) {
  const d = docOf(p.doc)
  if (p.at < 0) return d.planned ? 'neue Seite' : 'Anfang'
  for (let i = p.at; i >= 0; i--) {
    const blk = d.blocks[i]
    if (blk.kind === 'h') return p.op === 'insert' ? `nach ${blk.text}` : blk.text
  }
  return d.title
}

/* ---------- Audience filter ---------- */

const docMatches = (doc: Doc, module: string) => module === 'plattform' || doc.modules.includes('plattform') || doc.modules.includes(module as never)

export type Route = {
  type: DocTypeId
  /** vorschlaege: proposals exist · passt: checked, nothing to change · nicht: readers not affected · fehlt: no document of this type for the module */
  status: 'vorschlaege' | 'passt' | 'nicht' | 'fehlt'
  reason: string
  proposals: Proposal[]
  checkedDocs: Doc[]
}

export function routing(b: Bundle): Route[] {
  return docTypeOrder.map((type) => {
    const t = docTypes[type]
    const relevant = b.aspects.filter((a) => t.reactsTo.includes(a.kind))
    const ps = proposals.filter((p) => p.bundle === b.id && docOf(p.doc).type === type)
    if (datasetMode === 'working') {
      const checkedDocs = docs.filter((d) => d.type === type)
      return { type, status: ps.length ? 'vorschlaege' : checkedDocs.length ? 'passt' : 'nicht', reason: ps.length ? `${plural(ps.length, 'Vorschlag', 'Vorschläge')} aus Jev-Zuordnungen` : checkedDocs.length ? 'Keine Abweichung, die zu dieser Änderung gehört.' : 'Keine Dokumente dieser Art importiert.', proposals: ps, checkedDocs }
    }
    if (!relevant.length) {
      const kinds = [...new Set(b.aspects.map((a) => changeKinds[a.kind].label))]
      const reason =
        kinds.length <= 2
          ? `Nur ${list(kinds)} geändert. Betrifft die Leser nicht.`
          : `Nichts dabei, worauf diese Doku-Art reagiert (${list(t.reactsTo.map((k) => changeKinds[k].label))}).`
      return { type, status: 'nicht', reason, proposals: [], checkedDocs: [] }
    }
    const checkedDocs = docs.filter((d) => d.type === type && (!d.planned || ps.some((p) => p.doc === d.id)) && relevant.some((a) => docMatches(d, a.module)))
    if (ps.length) {
      const n = new Set(ps.map((p) => p.doc)).size
      return { type, status: 'vorschlaege', reason: `${plural(ps.length, 'Vorschlag', 'Vorschläge')} in ${plural(n, 'Dokument', 'Dokumenten')}`, proposals: ps, checkedDocs }
    }
    if (!checkedDocs.length) {
      const mods = [...new Set(relevant.map((a) => modules[a.module]))]
      return { type, status: 'fehlt', reason: `Kein Dokument dieser Art für ${list(mods)}.`, proposals: [], checkedDocs }
    }
    return { type, status: 'passt', reason: `${plural(checkedDocs.length, 'Dokument', 'Dokumente')} geprüft, alles stimmt noch.`, proposals: [], checkedDocs }
  })
}

/* ---------- Formatting ---------- */

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`

export function list(items: string[]) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`
}
