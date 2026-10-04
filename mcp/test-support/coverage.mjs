import fs from 'node:fs'
import { dataPath } from '../dataset.mjs'

export const QUALITY_VERSION = 'keywords-v1'
const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/[„“"`*]/g, '').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim()
const all = (text, patterns) => patterns.every((p) => new RegExp(p, 'i').test(text))
const truthPath = dataPath('ground-truth.json')

const RULES = {
  ticket: [
    ['basis', 'Baut auf MOB-4812 auf', ['mob-4812', 'baut|aufbau|basis|grundlage|abh.ng|bereits|vorarbeit|teillieferung']],
    ['finanzkauf', 'Teillieferung bei Finanzkauf gesperrt', ['finanzkauf', 'gesperrt|sperre|nicht m.glich|keine teillieferung|ausgeschlossen|nicht erlaubt']],
    ['offen', 'MOB-4808 ist offen', ['mob-4808', 'offen|ungekl.rt|r.ckfrage|ausstehend']],
    ['standard', 'Standard höchstens 3 Teile', ['(?:standard|maximal|h.chstens|max\.?|default|vorgabe)[^.;\n]{0,65}\\b3\\b|\\b3\\b[^.;\n]{0,45}(?:standard|default)', 'teil|liefer']],
    ['bereich', 'Einstellbar von 2 bis 5', ['2\\s*(?:-|bis|\\.\\.)\\s*5', 'konfigur|einstell|parameter|anzahl|bereich']],
    ['minimum', 'Je Teil mindestens 20 % Warenwert', ['20\\s*(?:%|prozent)', 'warenwert', 'mind|minimal|untergrenze']],
  ],
  frage: [
    ['anteil', 'Anteilig nach Warenwert des Lieferteils', ['anteilig|proportional|anteil', 'warenwert', 'teil']],
    ['rundung', 'Letzter Teil gleicht Rundungsdifferenz aus', ['rundung|rundungsrest', 'letzt']],
    ['voll', 'Ohne Teillieferung voll mit Schlussrechnung', ['ohne teillieferung|keine teillieferung|komplettlieferung|vollst.ndige lieferung|normalfall', 'voll|komplett|gesamt|100\\s*%', 'schlussrechnung']],
    ['veraltet', 'Doku ist veraltet', ['doku|handbuch|anleitung', 'veraltet|nicht mehr|falsch|widerspr|stimmt nicht|.berholt']],
  ],
}

// One explicit rule per expected location, in ground-truth order. This is deliberately
// conservative: document + location + change terms must occur in the same answer block.
const CHECK_RULES = [
  ['3\\.2|lieferbereitschaft', 'vollst.ndig|komplett|immer', 'teilliefer'],
  ['3\\.3|teillieferung vereinbaren|neue.{0,15}(?:kapitel|abschnitt)', 'aufteil|wunschtermin|teilrechnung'],
  ['kapitel|abschnitt|finanzkauf', 'finanzkauf', 'gesperrt|keine|nicht|sperre'],
  ['\\b4\\b|anzahlung', 'anteilig|anteil', 'teilrechnung|restzahlung'],
  ['\\b2\\b|stopp', 'stopp', 'teil'],
  ['2\\.3|montage einplanen', 'montage', 'position|teil'],
  ['\\b3\\b|lieferschein|auslieferung', 'fahrer|kassier', 'anteil|teil'],
  ['\\b7\\b|restzahlung', 'restzahlung|fahrer', 'teil'],
  ['5\\.2|anzahlungen', 'anteilig|anteil', 'teilrechnung|letzt'],
  ['5\\.3|erl.se', '\\btr\\b|teilrechnung', 'belegart|erl.s|datum|op'],
  ['stopp', 'lieferteil|teilliefer'],
  ['feldtabelle|feld|checkbox', 'teillieferung erlaubt', 'lieferung aufteilen'],
  ['neu|dialog|abschnitt', 'lieferung aufteilen', 'position|warenwert|wunschtermin'],
  ['screenshot|register-lieferung\\.png', 'neu|aktualisier|fehl'],
  ['tabelle|parameter', 'teillief_erlaubt', 'teillief_max_anzahl', 'teillief_min_warenwert_proz', '2\\s*(?:-|bis)\\s*5', '\\b3\\b'],
  ['tabelle|parameter', 'fibu_belegart_teilrechnung', '\\btr\\b'],
  ['\\b2\\b|belegart', 'belegart', '\\btr\\b'],
  ['\\b2\\b|feld', 'teillieferung_nr', 'az_verrechnet'],
  ['\\b3\\b|anzahlung', 'anteilig|anteil', 'warenwert', 'rundung|letzt'],
  ['tabelle|datenmodell', 'lieferteil', 'lt_id', 'kv_position', 'tour_stopp'],
  ['tabelle|migration', 'v26_4_012|v26\\.4\\.012', 'lieferteil'],
  ['bild|draw\\.?io|datenfluss', 'lieferteil', 'teilrechnung', 'fibu'],
  ['auftrag', 'teillief_erlaubt', 'teillief_max_anzahl', 'teillief_min_warenwert_proz'],
  ['fibu', 'fibu_belegart_teilrechnung', '\\btr\\b'],
  ['.nderungshistorie', '26\\.4'],
  ['register|lieferung|\\b2\\b', 'teillieferung erlaubt', 'lieferung aufteilen'],
  ['neu|dialog|abschnitt', 'lieferung aufteilen', 'feldtabelle|position|warenwert'],
  ['folie\\s*2|lieferung vereinbaren', 'komplett|vollst.ndig', 'teilliefer'],
  ['neu.{0,15}folie|teillieferung vereinbaren', 'teilliefer'],
  ['kaufvertrag und auftrag|\\b1\\b', 'teilliefer'],
  ['\\b4\\b|finanzbuchhaltung', 'belegart', '\\btr\\b'],
  ['tabellen und spalten|auftragsabwicklung', 'lieferteil', 'lt_id', 'kv_position', 'tour_stopp'],
  ['seite\\s*1|datenfluss', 'lieferteil', 'teilrechnung', 'fibu'],
]
const unaffected = /nicht betroffen|keine (?:anpassung|.nderung)|unver.ndert|nicht an(?:zu)?passen|passt bereits/
const identifies = (block, doc) => [doc.pageId, doc.fileId, doc.title].filter(Boolean).some((v) => block.includes(norm(v)))
const excerpt = (text) => text.slice(0, 1200)

export function evaluate(task, answer, groundTruth = JSON.parse(fs.readFileSync(truthPath, 'utf8'))) {
  const blocks = answer.split(/\n\s*\n|\n(?=\s*(?:[-*] |\d+[.)] |\|))/).map(norm).filter(Boolean)
  const limitations = [
    'Feste Schlüsselbegriffe; keine fachliche Bewertung durch ein Modell.',
    'Sinngleiche Formulierungen können fehlen; Schlüsselbegriffe können trotz falscher Aussage treffen. Treffer und Regeln sind einzeln einsehbar.',
  ]
  if (task === 'smoke') return { version: QUALITY_VERSION, points: [], found: 0, total: 0, score: null, limitations: ['Anbindungstest, keine Qualitätswertung.'] }
  if (RULES[task]) {
    const points = RULES[task].map(([id, label, patterns]) => {
      const hit = blocks.find((b) => all(b, patterns))
      return { id, label, patterns, hit: !!hit, evidence: hit ? excerpt(hit) : null }
    })
    const found = points.filter((p) => p.hit).length
    return { version: QUALITY_VERSION, points, found, total: points.length, score: found / points.length, limitations }
  }
  if (task !== 'check') throw new Error(`Unbekannte Aufgabe: ${task}`)
  const change = groundTruth.changes.find((c) => c.id === 'teillieferung')
  if (change.expected.length !== CHECK_RULES.length) throw new Error('Ground Truth geändert: Regeln müssen ausdrücklich geprüft werden.')
  const points = change.expected.map((doc, i) => {
    const patterns = CHECK_RULES[i]
    const hit = blocks.find((b) => identifies(b, doc) && !unaffected.test(b) && all(b, patterns))
    return { id: `stelle-${i + 1}`, label: `${doc.title} › ${doc.section}`, level: doc.level, expected: doc.what, patterns, hit: !!hit, evidence: hit ? excerpt(hit) : null }
  })
  const recall = (level) => {
    const ps = points.filter((p) => p.level === level)
    return { found: ps.filter((p) => p.hit).length, total: ps.length, score: ps.filter((p) => p.hit).length / ps.length }
  }
  const pages = JSON.parse(fs.readFileSync(dataPath('confluence/pages.json'), 'utf8')).results
  const filesRaw = JSON.parse(fs.readFileSync(dataPath('dokumente/driveItems.json'), 'utf8'))
  const files = Array.isArray(filesRaw) ? filesRaw : filesRaw.value ?? []
  const known = [...pages.map((p) => ({ pageId: p.id, title: p.title })), ...files.map((p) => ({ fileId: p.id, title: p.name }))]
  const falseAlarms = known.filter((d) => !change.expected.some((e) => (d.pageId && e.pageId === d.pageId) || (d.fileId && e.fileId === d.fileId) || norm(d.title) === norm(e.title)))
    .flatMap((d) => {
      const hit = blocks.find((b) => identifies(b, d) && !unaffected.test(b))
      return hit ? [{ ...d, evidence: excerpt(hit) }] : []
    })
  const found = points.filter((p) => p.hit).length
  limitations.push('Dokument + Stelle + Änderungsbegriffe müssen im selben Absatz oder Tabellen-/Listenpunkt stehen. Fehlalarme zählen genannte, bekannte Dokumente außerhalb der Soll-Liste; unbekannte Dokumentnamen werden nicht erkannt.')
  return { version: QUALITY_VERSION, points, found, total: points.length, score: found / points.length, must: recall('must'), should: recall('should'), falseAlarms, limitations }
}
