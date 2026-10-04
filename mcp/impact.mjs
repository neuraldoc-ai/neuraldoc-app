// Source-based, deterministic impact rules for this demo. Ground truth is reserved for tests.
// Keep facts, original locations and retrieval separate: compression may remove repetition,
// never the inventory of affected sources. Unsupported changes remain explicitly bounded.
import { createHash } from 'node:crypto'
import { jiraIssue, mergeRequest, mergeRequestFiles, sourceDocuments } from './sources.mjs'

export const IMPACT_VERSION = 'source-impact-v4'
const digest = (s) => createHash('sha256').update(s).digest('hex')
const sourceCorpus = sourceDocuments()

function evidence(file, pattern) {
  if (!file) return null
  const lines = file.text.split('\n'), index = lines.findIndex((line) => pattern.test(line))
  if (index < 0) return null
  const from = Math.max(0, index - 1), to = Math.min(lines.length, index + 8)
  return { file: file.file, revision: file.revision, line: index + 1, url: `${file.url}#L${index + 1}`, excerpt: lines.slice(from, to).join('\n'), sha256: digest(file.text) }
}

function parameters(files) {
  return files.filter((f) => /config\/parameter\/.*\.yaml$/.test(f.file)).flatMap((file) => file.text.split(/^(?=[A-Z][A-Z0-9_]*:)/m).flatMap((part) => {
    const name = part.match(/^([A-Z][A-Z0-9_]*):/)?.[1]
    if (!name || !/^(?:TEILLIEF_|FIBU_BELEGART_TEILRECHNUNG)/.test(name)) return []
    const value = (field) => part.match(new RegExp(`^  ${field}: (.+)$`, 'm'))?.[1].replace(/^"|"$/g, '')
    return [{ name, standard: value('standard'), min: value('min'), max: value('max'), description: value('beschreibung'), evidence: evidence(file, new RegExp(`^${name}:`)) }]
  }))
}

export function changeFacts(mr, { files = mergeRequestFiles(mr) } = {}) {
  const facts = [], warnings = []
  const find = (suffix) => files.find((f) => f.file.endsWith(suffix))
  const add = (id, text, supports) => {
    const proof = supports.filter(Boolean)
    if (proof.length === supports.length && proof.length) facts.push({ id, text, evidence: proof })
    else warnings.push(`Code-Beleg für ${id} ist unvollständig; diese Regel wird nicht als bestätigt ausgegeben.`)
  }
  const params = parameters(files)
  const max = params.find((p) => p.name === 'TEILLIEF_MAX_ANZAHL'), min = params.find((p) => p.name === 'TEILLIEF_MIN_WARENWERT_PROZ')
  const service = find('/TeillieferungService.java')
  const supported = !!service && /TEILLIEF_ERLAUBT/.test(service.text)
  if (supported) {
    if (max && min) add('split', `Teillieferung: Standard höchstens ${max.standard} Teile. Diese Höchstzahl ist von ${max.min} bis ${max.max} einstellbar; der Bereich bezeichnet die Konfiguration, nicht die Anzahl einer konkreten Lieferung. Je Teil mindestens ${min.standard} % des Warenwerts (einstellbar ${min.min} bis ${min.max} %).`, [max.evidence, min.evidence, evidence(service, /wert.compareTo\(min\)/)])
    else warnings.push('Grenzwerte für die Aufteilung konnten nicht vollständig aus dem aktuellen Code gelesen werden.')
    const clarification = service.text.match(/MOB-\d+/)?.[0], issue = clarification && jiraIssue(clarification)
    if (/if \(kv.finanzkauf\(\)\)/.test(service.text)) add('finance', `Teillieferung bei Finanzkauf gesperrt.${issue ? ` ${issue.key}: ${issue.done ? 'Klärung abgeschlossen' : 'Entscheidung noch offen'}, Jira-Status ${issue.status}.` : 'Die Entscheidung mit der Partnerbank ist nicht abschließend belegt.'}`, [evidence(service, /if \(kv.finanzkauf\(\)\)/)])
    const advance = find('/AnzahlungVerrechnung.java')
    if (advance && /multiply\(anteil\)/.test(advance.text) && /subtract\(bereitsVerrechnet\)/.test(advance.text) && /return kv.anzahlung\(\)/.test(advance.text)) add('advance', 'Anzahlung anteilig nach Warenwert des Lieferteils verrechnen; Rundungsdifferenz mit dem letzten Teil ausgleichen. Ohne Teillieferung die gesamte Anzahlung voll mit der Schlussrechnung verrechnen.', [evidence(advance, /Ohne Teillieferung/), evidence(advance, /letzter Teil/), evidence(advance, /Anzahlung anteilig/)])
    const invoice = find('/TeilrechnungService.java')
    if (invoice && /Rechnung.neu\(Belegart.TR/.test(invoice.text)) {
      const issue = jiraIssue(mergeRequest(mr)?.title.match(/MOB-\d+/)?.[0] ?? '')
      const comment = issue?.comments.find((c) => /Erlös mit Datum der Teilrechnung/.test(c.text) && /OP-Zuordnung.*KV-Nummer/.test(c.text))
      const requirement = comment ? { system: 'Jira', issue: issue.key, author: comment.author, at: comment.at, url: issue.url, excerpt: comment.text, sha256: digest(comment.text) } : null
      add('invoice', `Je Lieferteil entsteht eine Teilrechnung mit Belegart TR.${requirement ? ' Erlös mit Datum der jeweiligen Teilrechnung, offene Posten über dieselbe Kaufvertragsnummer zuordnen.' : ' Erlösdatum und Zuordnung offener Posten fachlich klären; im Codeausschnitt nicht belegt.'}`, [evidence(invoice, /Rechnung.neu\(Belegart.TR/), ...(requirement ? [requirement] : [])])
      if (!requirement) warnings.push('Die Jira-Fachanforderung zu Erlösdatum und OP-Zuordnung ist nicht belegt; daraus keine bestätigte Buchungsregel ableiten.')
    }
    const tour = find('/StoppBuilder.java')
    if (tour && /teile.stream\(\)/.test(tour.text)) add('tour', 'Nicht immer genau ein Stopp je Kaufvertrag: bei Teillieferung ein eigener Tourstopp je Lieferteil (T1, T2 …).', [evidence(tour, /Ein Kaufvertrag ergibt/), evidence(tour, /teile.stream\(\)/)])
    if (tour && /t.positionen\(\).*p.montage\(\)/.test(tour.text)) add('montage', 'Montage nur beim Teil mit der Montageposition einplanen.', [evidence(tour, /Montage nur/), evidence(tour, /t.positionen\(\).*p.montage\(\)/)])
    const rest = find('/Restzahlung.kt')
    if (rest && /api.teilrechnung\(.*\).offen/.test(rest.text)) add('rest', 'Der Fahrer kassiert nur den Anteil der Restzahlung des gelieferten Teils; die Fahrer-App zeigt den offenen Betrag der Teilrechnung.', [evidence(rest, /api.teilrechnung\(/)])
    const fields = find('/Buchungssatz.java')
    if (fields && /teillieferungNr/.test(fields.text) && /azVerrechnet/.test(fields.text)) add('export', 'Im Exportformat die Felder teillieferung_nr und az_verrechnet ergänzen.', [evidence(fields, /teillieferungNr/)])
    const migration = files.find((f) => /\.sql$/.test(f.file) && /CREATE TABLE lieferteil/.test(f.text))
    if (migration) {
      const columns = [...migration.text.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/g)]
      const version = migration.file.split('/').at(-1).split('__')[0]
      add('schema', `Tabelle lieferteil und ${columns.map((m) => `Spalte ${m[2]} in ${m[1]}`).join(' sowie ')} ergänzen; Migration ${version} dokumentieren.`, [evidence(migration, /CREATE TABLE lieferteil/), ...columns.map((m) => evidence(migration, new RegExp(`ALTER TABLE ${m[1]}`)))])
    }
    const register = find('/RegisterLieferung.tsx'), dialog = find('/LieferungAufteilen.tsx')
    if (register && /param.TEILLIEF_ERLAUBT && !kv.finanzkauf/.test(register.text)) add('fields', 'Feldtabelle: Checkbox „Teillieferung erlaubt“ nur bei TEILLIEF_ERLAUBT = Ja, bei Finanzkauf gesperrt; Schaltfläche „Lieferung aufteilen“ ergänzen.', [evidence(register, /param.TEILLIEF_ERLAUBT && !kv.finanzkauf/)])
    if (dialog && /DragListe/.test(dialog.text) && /KwAuswahl/.test(dialog.text)) add('dialog', 'Neuen Dialog „Lieferung aufteilen“ mit Feldtabelle dokumentieren: Teil, Positionen (Drag & Drop), Warenwert-Anteil mit Warnung und Wunschtermin je Teil.', [evidence(dialog, /<DragListe/), evidence(dialog, /<KwAuswahl/)])
  }
  return { supported, facts, parameters: params, files, warnings }
}

const parameterText = (rows) => rows.map((p) => `${p.name}: Standard ${p.standard === 'false' ? 'Nein' : p.standard}${p.min != null ? `, Bereich ${p.min}–${p.max}` : ''}${p.name.endsWith('_PROZ') ? ' % Warenwert je Teil' : ''}`).join('; ')

export function inspectImpact(mr, { corpus = sourceCorpus } = {}) {
  const code = changeFacts(mr), impacts = [], unaffected = []
  const fact = (id) => code.facts.find((f) => f.id === id)
  const add = (doc, section, ids, what, kind = 'anpassen') => {
    if (!ids.every((id) => fact(id))) return
    const key = `${doc.id}:${section}:${ids.join(',')}`
    if (!impacts.some((i) => i.id === key)) impacts.push({ id: key, sourceId: doc.id, title: doc.title, system: doc.system, version: doc.version, url: doc.url, section, what, kind, facts: ids })
  }
  if (code.supported) for (const doc of corpus) {
    const handbook = doc.labels.includes('anwenderhandbuch'), training = doc.labels.includes('schulung'), commercial = doc.labels.includes('leistungsbeschreibung')
    const parameters = doc.labels.includes('parametertabelle'), dialog = doc.labels.includes('dialogbeschreibung')
    const technical = doc.labels.includes('technische-doku')
    for (const unit of doc.units) {
      const text = unit.text, section = unit.section
      if (/immer (?:vollständig ausgeliefert|komplett geliefert)|Komplettlieferung je Kaufvertrag/i.test(text)) {
        add(doc, section, ['split'], `Die Aussage zur immer vollständigen/kompletten Lieferung korrigieren: ${fact('split')?.text}`)
        if (handbook) {
          const anchor = doc.units.at(-1).section
          add(doc, `nach ${anchor}: neues Kapitel „Teillieferung vereinbaren“`, ['split', 'fields', 'dialog', 'invoice'], `${fact('fields')?.text} ${fact('dialog')?.text} ${fact('split')?.text} ${fact('invoice')?.text}`, 'ergänzen')
          add(doc, 'neues Kapitel „Teillieferung vereinbaren“: Finanzkauf', ['finance'], fact('finance')?.text, 'ergänzen')
        }
        if (training) add(doc, `nach ${section}: neue Folie „Teillieferung vereinbaren“`, ['split', 'dialog'], `${fact('split')?.text} ${fact('dialog')?.text}`, 'ergänzen')
      }
      if (handbook && /Anzahlung/.test(text) && /Schlussrechnung/.test(text)) add(doc, section, ['advance', 'invoice'], `${fact('advance')?.text} Restzahlung je Teilrechnung statt einmal pro Kaufvertrag. ${fact('invoice')?.text}`)
      if (handbook && /immer genau ein Stopp/.test(text)) add(doc, section, ['tour'], fact('tour')?.text)
      if (handbook && /Montage einplanen/.test(section)) add(doc, section, ['montage'], fact('montage')?.text)
      if (handbook && /Fahrer.*kassiert|Restzahlungen, die der Fahrer kassiert/.test(text)) add(doc, section, ['rest'], fact('rest')?.text)
      if (handbook && /Erlöse/.test(section)) add(doc, section, ['invoice'], fact('invoice')?.text)
      if (handbook && /Glossar/.test(doc.title) && /Stopp/.test(text)) add(doc, 'Tabelle: Stopp', ['tour'], `Glossar-Stopp nicht mehr nur einem Kaufvertrag gleichsetzen; Begriffe Lieferteil und Teillieferung ergänzen. ${fact('tour')?.text}`)
      if (dialog && /Lieferung/.test(section)) {
        add(doc, `${section} › Feldtabelle`, ['fields'], fact('fields')?.text)
        add(doc, `neu nach ${section}: Dialog „Lieferung aufteilen“`, ['dialog'], fact('dialog')?.text, 'ergänzen')
        const screenshots = [...(unit.html ?? '').matchAll(/ri:filename="([^"]+)"/g)]
        for (const image of screenshots) add(doc, `${section} › Screenshot ${image[1]}`, ['fields'], `Screenshot ${image[1]} aktualisieren: neue Checkbox und Schaltfläche fehlen.`, 'von Hand')
      }
      if (parameters) {
        const scope = `${doc.title} ${section}`
        const rows = code.parameters.filter((p) => /Auftrag|Lieferung/.test(scope) ? p.name.startsWith('TEILLIEF_') : /Finanzbuchhaltung|Fibu/.test(scope) ? p.name.startsWith('FIBU_') : false)
        if (rows.length && !/Änderungshistorie/.test(section)) add(doc, `${section} › Tabelle: neue Parameter`, ['split'], `${parameterText(rows)}. Seit Version 26.4; alte Zwischenstände der Grenzen nicht übernehmen.`, 'ergänzen')
        if (/Änderungshistorie/.test(section)) add(doc, section, ['split'], `Änderungshistorie um Version 26.4 und die neuen Parameter ${code.parameters.map((p) => p.name).join(', ')} ergänzen.`, 'ergänzen')
      }
      if (technical && /Schnittstelle/.test(doc.title) && /Exportformat/.test(section)) {
        add(doc, section, ['invoice'], 'Belegart TR = Teilrechnung in der Exporttabelle ergänzen.', 'ergänzen')
        add(doc, section, ['export'], fact('export')?.text, 'ergänzen')
      }
      if (technical && /Schnittstelle/.test(doc.title) && /Verrechnung von Anzahlungen/.test(section)) add(doc, section, ['advance'], fact('advance')?.text)
      if (technical && /Migrationen/.test(doc.title) && /Version[\s\S]*Inhalt/.test(text)) add(doc, `${section} › Tabelle`, ['schema'], fact('schema')?.text, 'ergänzen')
      if (commercial && /Finanzbuchhaltung/.test(section)) add(doc, section, ['invoice'], 'Belegart TR für Teilrechnung in der Leistungsbeschreibung ergänzen.', 'ergänzen')
    }
    if (technical && /Datenmodell/.test(doc.title) && doc.units.some((u) => /kv_position/.test(u.text)) && doc.units.some((u) => /tour_stopp/.test(u.text))) add(doc, doc.system === 'SharePoint' ? `Blatt ${doc.units.map((u) => u.section.replace(/^Blatt /, '')).join(' und ')}` : 'Tabelle', ['schema'], fact('schema')?.text, 'ergänzen')
    if (doc.labels.includes('architektur') && doc.units.some((u) => /fibu-export/.test(u.text))) add(doc, doc.system === 'SharePoint' ? 'Seite 1 › Datenfluss' : 'Bild (draw.io) › Datenfluss', ['schema', 'invoice', 'export'], 'Datenfluss Lieferteil → Teilrechnung → fibu-export im draw.io ergänzen; PDF anschließend neu exportieren. Grafik von Hand ändern.', 'von Hand')
    if (doc.labels.includes('installation') && !code.files.some((f) => /(?:deploy|install|Vorlagen|Konvertieren)/i.test(f.file))) unaffected.push({ sourceId: doc.id, title: doc.title, reason: 'Diese Teillieferungsänderung ändert keinen Installations- oder Update-Ablauf; die automatische Migration bleibt im vorhandenen Verfahren.' })
  }
  const assigned = new Set(impacts.map((i) => i.sourceId).concat(unaffected.map((u) => u.sourceId)))
  return { version: IMPACT_VERSION, supported: code.supported, impacts, unaffected, facts: code.facts, parameters: code.parameters, coverage: { scanned: corpus.length, affected: new Set(impacts.map((i) => i.sourceId)).size, locations: impacts.length, unassigned: corpus.filter((d) => !assigned.has(d.id)).map((d) => ({ id: d.id, title: d.title })), warnings: [...code.warnings, ...corpus.filter((d) => d.unreadable).map((d) => `Kein lesbarer Inhalt für ${d.title}.`)], limitation: 'Deterministische Demo-Regeln für Teillieferung, keine allgemeine semantische Codeanalyse. Ohne automatische Zuordnung ist eine Quelle nicht automatisch als unbetroffen geprüft.' }, raw: corpus.map((d) => d.units.map((u) => u.text).join('\n')).join('\n') + code.files.map((f) => f.text).join('\n') }
}

export function sourceEvidence(id) {
  return sourceCorpus.find((doc) => doc.id === id) ?? null
}

const normalized = (s) => String(s).normalize('NFKC').toLowerCase().replace(/[„“"`*]/g, '').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim()
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A lossless, ready-to-use projection. IDs keep identically named copies distinguishable. */
export function answerTable(impacts) {
  const cell = (s) => s.replaceAll('|', '\\|').replaceAll('\n', '<br>')
  return ['| Originalquelle und ID | Stelle | Konkrete Änderung |', '| --- | --- | --- |', ...impacts.map((i) => `| [${cell(i.title)}](${i.url}) [${i.sourceId}] | ${cell(i.section)} | ${cell(i.what)} |`)].join('\n')
}

/** Ready-to-use answer generated from the complete inventory; no second lossy summary. */
export function completeAnswer(scan, url) {
  if (!scan.supported) return null
  return [`${scan.coverage.locations} Fundstellen in ${scan.coverage.affected} Originalquellen müssen geprüft bzw. angepasst werden (${scan.coverage.scanned} Quellen durchsucht):`,
    '', answerTable(scan.impacts), '',
    ...scan.unaffected.map((s) => `- Nicht betroffen: ${s.title} [${s.sourceId}]. ${s.reason}`), '',
    `${scan.coverage.unassigned.length} weitere Quellen ohne automatische Zuordnung sind ungeprüft. ${scan.coverage.limitation}`,
    ...scan.coverage.warnings.map((w) => `Prüfgrenze: ${w}`), '',
    `Die Fundstellen sind Prüfhilfen; vorbereitete Entwürfe werden separat freigegeben: ${url}`].join('\n')
}

/** Formal retention check against the source-derived inventory, never against fixture truth.
 * This catches omissions and lost identifiers, not arbitrary factual errors or negations. */
export function reviewAnswer(answer, scan) {
  const blocks = answer.split(/\n\s*\n|\n(?=\s*(?:[-*] |\d+[.)] |\|))/).map(normalized).filter(Boolean)
  const concepts = [
    ['vollständige Lieferung', /vollst.ndig|komplett/], ['Teillieferung', /teilliefer|lieferteil/],
    ['anteilige Verrechnung', /anteilig|anteil|proportional/], ['Warenwert', /warenwert/],
    ['Rundung', /rundung/], ['letzter Teil', /letzt/], ['Schlussrechnung', /schlussrechnung/],
    ['Finanzkauf', /finanzkauf/], ['Sperre', /gesperrt|sperre|nicht m.glich|keine teillieferung/],
    ['offene Entscheidung', /entscheidung noch offen|ungekl.rt|ausstehend/], ['Tourstopp', /stopp/],
    ['Montageposition', /montageposition/], ['Restzahlung', /restzahlung/], ['Teilrechnung', /teilrechnung/],
    ['Datum der Teilrechnung', /datum/], ['Kaufvertragsnummer', /kaufvertragsnummer|kv.?nr/],
    ['Feldtabelle', /feldtabelle/], ['Checkbox', /checkbox/], ['Positionen', /position/],
    ['Wunschtermin', /wunschtermin/], ['Warnung', /warnung/], ['Screenshot', /screenshot/],
    ['Änderungshistorie', /änderungshistorie/], ['Datenfluss', /datenfluss/],
  ]
  const missing = scan.impacts.flatMap((impact) => {
    const named = blocks.filter((b) => b.includes(normalized(impact.sourceId)) || b.includes(normalized(impact.title)))
    const section = normalized(impact.section)
    const quotes = [...impact.section.matchAll(/[„"]([^“"]+)[“"]/g)].map((m) => normalized(m[1]))
    const filename = section.match(/\b\S+\.(?:png|jpg|svg)\b/)?.[0]
    const number = section.match(/\b(?:\d+(?:\.\d+)*|blatt\s+\S+|folie\s+\d+|seite\s+\d+)\b/)?.[0]
    const located = named.filter((b) => b.includes(section) || (quotes.length && quotes.some((q) => b.includes(q))) || (filename && b.includes(filename)) || (number && new RegExp(`\\b${escaped(number)}\\b`).test(b)) || (/tabelle/.test(section) && /tabelle/.test(b)) || (/datenfluss|bild/.test(section) && /datenfluss|bild/.test(b)))
    const required = concepts.filter(([, re]) => re.test(normalized(impact.what)))
    const symbols = [...new Set(impact.what.match(/\b(?:[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+|TR|MOB-\d+)\b/g) ?? [])]
    const phrases = [...impact.what.matchAll(/[„"]([^“"]+)[“"]/g)].map((m) => m[1])
    const numbers = [...new Set(impact.what.match(/\b\d+(?:\.\d+)?\b/g) ?? [])]
    const retained = (b) => required.every(([, re]) => re.test(b)) && [...symbols, ...phrases].every((s) => b.includes(normalized(s))) && numbers.every((n) => new RegExp(`\\b${escaped(n)}\\b`).test(b))
    if (located.some(retained)) return []
    const best = located[0] ?? named[0] ?? ''
    return [{ ...impact, missing: [!named.length ? 'Originalquelle fehlt' : null, named.length && !located.length ? 'Fundstelle fehlt oder ist nicht eindeutig' : null, ...required.filter(([, re]) => !re.test(best)).map(([label]) => label), ...[...symbols, ...phrases].filter((s) => !best.includes(normalized(s))), ...numbers.filter((n) => !new RegExp(`\\b${escaped(n)}\\b`).test(best)).map((n) => `Wert ${n}`)].filter(Boolean) }]
  })
  return { supported: scan.supported, complete: scan.supported && missing.length === 0 && scan.impacts.length > 0, found: scan.impacts.length - missing.length, total: scan.impacts.length, missing, limitation: 'Formale Deckung der erkannten Quellen/Stellen und wichtigen Angaben. Kein allgemeines fachliches Gutachten; unbekannte Änderungen und falsche Verneinungen können damit nicht zuverlässig erkannt werden.' }
}
