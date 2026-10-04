import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { dataPath } from './dataset.mjs'
import graph from '../frontend/src/dashboard/features/docs/brain/source-graph.json' with { type: 'json' }
import { distances, projectConnections, shortestPath } from '../frontend/src/dashboard/features/docs/brain/graph-utils.mjs'

const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
const named = (label) => graph.nodes.find((n) => n.label === label)

test('all indexed relationships have existing endpoints, unique IDs and attributable evidence', () => {
  assert.equal(nodes.size, graph.nodes.length)
  assert.equal(new Set(graph.edges.map((e) => e.id)).size, graph.edges.length)
  for (const e of graph.edges) {
    assert.ok(nodes.has(e.source), e.id)
    assert.ok(nodes.has(e.target), e.id)
    assert.ok(e.evidence.source && e.evidence.text, e.id)
    assert.ok(['belegt', 'abgeleitet', 'zugeordnet'].includes(e.certainty), e.id)
  }
})

test('code and schema relationship excerpts occur verbatim in their declared snapshot', () => {
  // Module assignment cites the path itself; other relationships quote file contents.
  for (const e of graph.edges.filter((e) => e.kind !== 'module' && /^(repo\/|postgres\/)/.test(e.evidence.source))) {
    const text = fs.readFileSync(dataPath(e.evidence.source), 'utf8')
    assert.ok(text.includes(e.evidence.text), e.id)
  }
})

test('a commit links to original changed files and function mentions without claiming runtime execution', () => {
  const relation = graph.edges.find((e) => e.kind === 'mentions' && nodes.get(e.target).label === 'AnzahlungVerrechnung.rest()')
  assert.ok(relation)
  assert.equal(nodes.get(relation.source).type, 'commit')
  const diff = JSON.parse(fs.readFileSync(dataPath(relation.evidence.source), 'utf8'))
  assert.ok(diff.some((d) => d.diff.includes(relation.evidence.text)))
  assert.ok(graph.edges.some((e) => e.source === relation.source && e.kind === 'changes' && nodes.get(e.target).path.endsWith('AnzahlungVerrechnung.java')))
})

test('typed function calls and parameter use retain the original statements', () => {
  const rest = named('AnzahlungVerrechnung.rest()'), invoice = named('TeilrechnungService.teilrechnung()')
  const call = graph.edges.find((e) => e.source === invoice.id && e.target === rest.id && e.kind === 'calls')
  assert.ok(call)
  assert.match(call.evidence.text, /verrechnung\.rest/)
  const split = named('TeillieferungService.aufteilen()')
  assert.ok(graph.edges.some((e) => e.source === split.id && e.target === 'param:TEILLIEF_MAX_ANZAHL' && e.certainty === 'belegt'))
})

test('SQL fields preserve numeric types and link the exact foreign-key columns', () => {
  assert.match(nodes.get('col:kaufvertrag.anzahlung').sub, /numeric\(10,2\)/)
  assert.ok(graph.edges.some((e) => e.source === 'col:lieferteil.kv_id' && e.target === 'col:kaufvertrag.kv_id' && e.kind === 'foreignKey'))
  assert.ok(graph.edges.some((e) => e.source === 'db:kassenbeleg_alle' && e.target === 'db:kassenbeleg' && e.kind === 'reads'))
  assert.equal(nodes.has('db:kassenbeleg_'), false)
  assert.match(nodes.get('db:kassenbeleg_[Jahr]').description, /Laufzeitobjekte.*nicht abgefragt/)
})

test('department paths explicitly depend on inferred associations; proof filter removes them', () => {
  const all = shortestPath(graph.edges, 'f:teillieferung', 'a:Buchhaltung')
  assert.ok(all)
  assert.ok(all.edges.some((e) => e.certainty === 'abgeleitet'))
  assert.equal(shortestPath(graph.edges.filter((e) => e.certainty === 'belegt'), 'f:teillieferung', 'a:Buchhaltung'), null)
})

test('path and depth exploration handle cycles, reverse traversal, disconnection and identical endpoints', () => {
  const edges = [{ source: 'b', target: 'a' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' }, { source: 'c', target: 'd' }]
  assert.deepEqual(shortestPath(edges, 'a', 'd').nodes, ['a', 'c', 'd'])
  assert.equal(shortestPath(edges, 'a', 'z'), null)
  assert.deepEqual(shortestPath(edges, 'a', 'a'), { nodes: ['a'], edges: [] })
  assert.deepEqual([...distances(edges, 'a', 1).keys()].sort(), ['a', 'b', 'c'])
})

test('overview projection preserves every intermediate edge and never crosses another visible object', () => {
  const edges = [{ source: 'a', target: 'hidden' }, { source: 'hidden', target: 'b' }, { source: 'b', target: 'c' }]
  const projected = projectConnections(edges, ['a', 'b', 'c'])
  assert.equal(projected.some((p) => p.source === 'a' && p.target === 'c'), false)
  assert.deepEqual(projected.find((p) => p.source === 'a' && p.target === 'b').nodes, ['a', 'hidden', 'b'])
  assert.equal(projected.find((p) => p.source === 'a' && p.target === 'b').edges.length, 2)
})

test('model links remain hypotheses with provenance; the planned empty document has no model links', () => {
  for (const e of graph.edges.filter((e) => e.kind === 'semantic')) {
    assert.equal(e.certainty, 'abgeleitet')
    assert.equal(e.evidence.decision.model, 'jev-1.13.0')
    assert.ok(e.evidence.decision.probability >= 0.9)
    assert.match(e.evidence.decision.fingerprint, /^[a-f0-9]{64}$/)
  }
  assert.equal(graph.edges.some((e) => e.kind === 'semantic' && e.source === 'doc:dlg-fahrzeug'), false)
})
