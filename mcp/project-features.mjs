// Turns an imported project's Git history into the same changes (bundles) the showcase shows: one per feature,
// with its commits, the kinds of change and the proposals of the initial check whose code it touched.
import { BUNDLE_ID } from './project-import.mjs'

const short = (id) => id.slice(0, 7)
const TOUCHES = { fix: 'intern', test: 'intern' }

/** Paths of the code excerpts a proposal's section contradicts (chunk ids look like file:<path>#L<line>). */
export function proposalPaths(p, proposal) {
  const record = p.mapping?.records?.find((r) => r.doc === (proposal.section ?? proposal.doc))
  return [...new Set((record?.contradicts ?? []).map((id) => id.replace(/^file:/, '').replace(/#L\d+$/, '')))]
}

/** The release the history belongs to: release/26.4 → 26.4, otherwise the tag it starts from. */
export function releaseOf(history, fallbackDate) {
  const head = history?.head?.committed_date?.slice(0, 10) ?? fallbackDate
  const id = history?.ref?.match(/^release[/-](.+)$/)?.[1] ?? (history?.tag ? `seit ${history.tag}` : head)
  return { id, freeze: head, ship: head }
}

export function withFeatures(p, dataset) {
  const history = p.history
  if (!history?.features?.length) return dataset
  const commitsById = new Map(history.commits.map((c) => [c.id, c]))
  const moduleOf = (file) => [...p.moduleDefs].sort((a, b) => b.path.length - a.path.length).find((m) => !m.path || file === m.path || file.startsWith(m.path + '/'))?.id ?? p.moduleDefs[0]?.id
  const checked = !!p.mapping
  const assigned = new Map()
  for (const proposal of dataset.proposals) {
    const paths = proposalPaths(p, proposal)
    let best = null, score = 0
    // Newest feature first: on a tie the latest change wins.
    for (const f of history.features) {
      const n = paths.filter((x) => f.files.includes(x)).length
      if (n > score) { best = f; score = n }
    }
    if (best) assigned.set(proposal.id, { feature: best, paths })
  }
  const bundles = history.features.map((f) => {
    const commits = f.commits.map(({ id, kind, files }) => {
      const c = commitsById.get(id)
      return { hash: short(id), date: c.committed_date.slice(0, 10), author: c.author_name, message: c.title, kind, files }
    })
    // One tile per kind of change, like the showcase: what changed, in which part of the code.
    const byKind = new Map()
    for (const c of f.commits) { const kind = TOUCHES[c.kind] ?? c.kind; byKind.set(kind, [...(byKind.get(kind) ?? []), c]) }
    const aspects = [...byKind].map(([kind, list]) => {
      const titles = list.map((c) => stripTicket(commitsById.get(c.id).title, f.ticket))
      return { kind, module: moduleOf(list[0].files[0] ?? f.files[0] ?? ''), text: titles.length > 1 ? `${titles[0]} und ${titles.length - 1} ${titles.length === 2 ? 'weiterer Commit' : 'weitere Commits'}` : titles[0], commits: list.map((c) => short(c.id)) }
    })
    const modules = [...new Set(f.files.map(moduleOf).filter(Boolean))].map((m) => p.dataset.modules[m]).filter(Boolean)
    const mine = [...assigned.values()].filter((a) => a.feature === f).length
    return {
      id: f.id, title: f.title, ticket: f.ticket ?? short(f.commits[0].id), mr: f.mr ?? short(f.commits[0].id), merged: f.merged.slice(0, 10),
      path: modules.slice(0, 1), alsoAffects: modules.slice(1, 4),
      classifiedVia: ['Git-Historie', f.mr ? `Merge-Request ${f.mr}` : 'Commit', ...(f.ticket ? [`Ticket ${f.ticket}`] : [])],
      summary: f.summary.split('\n').filter((l) => !/^(Closes|Fixes|Resolves|Refs)\b/i.test(l)).join(' ').trim(),
      aspects, commits, files: f.files,
      ...(mine ? {} : { noDocsReason: checked ? 'Die Erstprüfung hat zu den geänderten Dateien keine Abweichung in der Doku gefunden.' : 'Noch nicht geprüft. Starte die Erstprüfung auf der Übersicht.' }),
    }
  })
  const proposals = dataset.proposals.map((proposal) => {
    const a = assigned.get(proposal.id)
    if (!a) return proposal
    const touching = a.feature.commits.filter((c) => c.files.some((x) => a.paths.includes(x)))
    const commits = (touching.length ? touching : a.feature.commits).map(({ id }) => short(id))
    return { ...proposal, bundle: a.feature.id, commits }
  })
  const rest = proposals.filter((x) => x.bundle === BUNDLE_ID).length
  const initial = dataset.bundles.find((b) => b.id === BUNDLE_ID)
  // Findings no commit since the last release explains: older drift, listed after the features.
  const extra = rest && initial ? [{ ...initial, title: 'Weitere Abweichungen', ticket: 'Erstprüfung', mr: history.tag ? `vor ${history.tag}` : 'ohne Commit', summary: 'Diese Abschnitte passen nicht zum aktuellen Code, aber kein Commit seit dem letzten Release erklärt die Abweichung. Sie sind wahrscheinlich schon länger veraltet.' }] : []
  return { ...dataset, release: releaseOf(history, dataset.release.id), bundles: [...bundles, ...extra], proposals }
}

const stripTicket = (title, ticket) => (ticket ? title.replace(new RegExp(`^\\[?${ticket.replace('-', '-?')}\\]?[:\\s-]*`, 'i'), '').trim() : title) || title
