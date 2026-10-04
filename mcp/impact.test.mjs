import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { evaluate } from './test-support/coverage.mjs'
import { dataPath } from './dataset.mjs'
import { answerTable, changeFacts, completeAnswer, inspectImpact, reviewAnswer, sourceEvidence } from './impact.mjs'
import { commitBySha, mergeRequestFiles, sourceDocuments, approxTokens } from './sources.mjs'

const truth = JSON.parse(fs.readFileSync(dataPath('ground-truth.json'), 'utf8')).changes.find((c) => c.id === 'teillieferung')

test('source impact covers every reference location without introducing unrelated source targets', () => {
  const scan = inspectImpact('1287')
  const text = scan.impacts.map((i) => `- ${i.title} [${i.sourceId}] › ${i.section}: ${i.what}`).join('\n')
  const quality = evaluate('check', text)
  assert.equal(quality.found, quality.total)
  assert.equal(scan.coverage.scanned, 40)
  assert.equal(scan.coverage.warnings.length, 0)
  assert.ok(scan.facts.find((f) => f.id === 'invoice').evidence.some((e) => e.system === 'Jira' && e.issue === 'MOB-4812' && /Erlös mit Datum der Teilrechnung/.test(e.excerpt)))
  // Ground-truth file keys are extraction aliases; the MCP exposes real drive-item IDs.
  const extracted = JSON.parse(fs.readFileSync(dataPath('dokumente/extracted.json'), 'utf8'))
  const expectedIds = new Set(truth.expected.map((e) => e.pageId ?? extracted[e.fileId].id))
  assert.deepEqual(new Set(scan.impacts.map((i) => i.sourceId)), expectedIds)
  for (const i of scan.impacts) {
    assert.equal(i.title, sourceEvidence(i.sourceId).title)
    assert.ok(i.facts.length)
    for (const id of i.facts) assert.ok(scan.facts.find((f) => f.id === id)?.evidence.length)
  }
  // The unchanged v1 evaluator also matches generic parent-page names inside filenames.
  // Exact target IDs above guard actual false targets separately, without changing old scoring.
  assert.deepEqual(quality.falseAlarms.map((f) => f.title), ['Kaufvertrag', 'Kasse'])
})

test('source rules discover another training document rather than relying on fixture IDs', () => {
  const corpus = sourceDocuments()
  const training = corpus.find((d) => d.labels.includes('schulung'))
  const extra = { ...training, id: 'canary-training', title: 'Weitere_Schulung.pdf' }
  const scan = inspectImpact('1287', { corpus: [...corpus, extra] })
  assert.equal(scan.impacts.filter((i) => i.sourceId === extra.id).length, 2)
  assert.equal(scan.coverage.scanned, 41)
})

test('parameter facts follow current code values rather than historical patches or fixed fixture answers', () => {
  const files = mergeRequestFiles('1287').map((f) => f.file === 'config/parameter/auftrag.yaml' ? { ...f, text: f.text.replace('TEILLIEF_MAX_ANZAHL:\n  typ: int\n  standard: 3\n  min: 2\n  max: 5', 'TEILLIEF_MAX_ANZAHL:\n  typ: int\n  standard: 4\n  min: 3\n  max: 7') } : f)
  const facts = changeFacts('1287', { files })
  assert.match(facts.facts.find((f) => f.id === 'split').text, /höchstens 4 Teile.*Höchstzahl ist von 3 bis 7 einstellbar/)
  assert.equal(inspectImpact('1290').supported, false)
  assert.ok(inspectImpact('1290').coverage.limitation)
})

test('answer review catches dropped source locations and omitted important details', () => {
  const scan = inspectImpact('1287')
  assert.equal(reviewAnswer(answerTable(scan.impacts), scan).complete, true)
  const withoutGlossary = reviewAnswer(answerTable(scan.impacts.filter((i) => i.title !== 'Glossar')), scan)
  assert.equal(withoutGlossary.complete, false)
  assert.ok(withoutGlossary.missing.some((i) => i.title === 'Glossar'))
  const shortened = scan.impacts.map((i) => ({ ...i, what: i.what.replaceAll('teillieferung_nr', '').replaceAll('az_verrechnet', '') }))
  assert.ok(reviewAnswer(answerTable(shortened), scan).missing.some((i) => i.missing.includes('az_verrechnet')))
  const ready = completeAnswer(scan, 'http://localhost/app/aenderungen/teillieferung')
  assert.equal(reviewAnswer(ready, scan).complete, true)
  assert.equal(evaluate('check', ready).found, 33)
  assert.equal(completeAnswer(inspectImpact('1290'), 'http://localhost/'), null)
  assert.equal(reviewAnswer('Keine Doku betroffen.', inspectImpact('1290')).complete, false)
})

test('MCP answers retain quality facts, support complete source retrieval and avoid duplicate default payloads', async (t) => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'neuraldoc-impact-test-'))
  const previous = process.env.NEURALDOC_STATE_DIR
  process.env.NEURALDOC_STATE_DIR = state
  t.after(() => {
    if (previous == null) delete process.env.NEURALDOC_STATE_DIR
    else process.env.NEURALDOC_STATE_DIR = previous
    const resolved = fs.realpathSync(state)
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('neuraldoc-impact-test-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  })
  const { activity, callTool, toolList } = await import('./core.mjs')
  assert.equal(toolList().length, 3)
  const ticket = await callTool('ticket_context', { ticket: 'MOB-4844' })
  assert.equal(evaluate('ticket', ticket.content[0].text).found, 6)
  assert.match(ticket.content[0].text, /TEILLIEF_MAX_ANZAHL/)
  const richTicket = await callTool('ticket_context', { ticket: 'MOB-4844', format: 'structured' })
  for (const file of richTicket.structuredContent.result.files) assert.ok(JSON.parse(fs.readFileSync(dataPath('gitlab/repository.json'), 'utf8')).files[file]?.content)
  for (const v of richTicket.structuredContent.result.today) for (const sha of v.because?.commits ?? []) assert.ok(commitBySha(sha))
  const question = await callTool('ask', { question: 'Wie wird die Anzahlung bei einer Teillieferung verrechnet?', limit: 1 })
  assert.equal(evaluate('frage', question.content[0].text).found, 4)
  const compact = await callTool('check_change', { merge_request: '1287' })
  const rich = await callTool('check_change', { merge_request: '1287', format: 'structured', details: true })
  assert.equal(evaluate('check', compact.content[0].text).found, 33)
  assert.equal(compact.structuredContent.result, undefined)
  assert.ok(rich.structuredContent.result.impacts.length >= 33)
  assert.equal(compact.structuredContent.tokens.answer, approxTokens(JSON.stringify(compact)))
  const commentsBefore = fs.readFileSync(path.join(state, 'mr-comments-log.jsonl'), 'utf8')
  const audit = await callTool('check_change', { merge_request: '1287', answer: answerTable(rich.structuredContent.result.impacts), format: 'structured' })
  assert.equal(audit.structuredContent.result.review.complete, true)
  const corrected = await callTool('check_change', { merge_request: '1287', answer: 'Nur Glossar prüfen.', format: 'structured' })
  assert.equal(corrected.structuredContent.result.review.complete, false)
  assert.equal(corrected.structuredContent.result.finalReview.complete, true)
  assert.equal(evaluate('check', corrected.structuredContent.result.finalAnswer).found, 33)
  const sourceId = rich.structuredContent.result.impacts.find((i) => i.title.endsWith('.pdf') && /Schulung/.test(i.title)).sourceId
  const details = await callTool('check_change', { merge_request: '1287', source_id: sourceId, format: 'structured' })
  assert.equal(details.structuredContent.result.source.id, sourceId)
  for (const u of sourceEvidence(sourceId).units) assert.ok(details.content[0].text.includes(u.text))
  assert.equal(fs.readFileSync(path.join(state, 'mr-comments-log.jsonl'), 'utf8'), commentsBefore)
  assert.equal(activity().checks.length, 1)
  assert.equal(activity().checks[0].title, 'Teillieferung im Kaufvertrag')
  assert.equal((await callTool('check_change', { merge_request: '1287', source_id: '../private' })).isError, true)
})
