import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const graph = read('frontend/src/dashboard/features/docs/brain/source-graph.json')
const evaluation = read('mcp/state/jev-evaluation-report.json')
const caches = ['mcp/state/jev-cache.json', 'mcp/state/jev-evaluation-cache.json'].flatMap((p) => Object.values(read(p)))
const tokens = caches.reduce((s, c) => s + c.response.usage.input_tokens, 0)
const times = caches.map((c) => c.elapsedMs).sort((a, b) => a - b)
const semantic = graph.edges.filter((e) => e.kind === 'semantic')
const summary = evaluation.summary
const report = `# Komponenten-Mapping: Test am MOBIQ-Beispiel

Stand: ${graph.metadata.semantic.createdAt}. Modell: ${graph.metadata.semantic.model}.

## Technischer Graph

- ${graph.metadata.analysis.files.length} Code-Dateien: Java, Kotlin, TSX und Pascal, alle ohne Parserfehler.
- ${graph.metadata.analysis.sql.length} SQL-Dateien mit PostgreSQL AST geparst. Kein Produktcode oder SQL ausgeführt.
- ${graph.nodes.filter((n) => n.type === 'function').length} explizite Funktionen/Methoden/Konstruktoren; ${graph.edges.filter((e) => e.kind === 'calls').length} auflösbare statische Aufrufverbindungen.
- ${graph.metadata.analysis.unresolvedCalls.length} Aufrufe bleiben ohne eindeutiges Ziel. Der Ausschnitt enthält keine vollständigen Projekte/Abhängigkeiten. Java-Auflösung berücksichtigt Paket, explizite Imports, deklarierte Empfängertypen und Argumentanzahl; sie ersetzt keinen Java-Compiler. Kotlin und Pascal sind geparst, ihre Aufrufe bleiben mangels Typauflösung offen. Keine Analyse von DI, Reflection oder Laufzeitbindung.
- Fachmodule aus Paket-/Verzeichnispfaden sind konfigurierte, abgeleitete Zuordnungen. Ein unpassender Pfad wird nicht automatisch zu „Plattform“.
- ORM-/Tabellenbeziehungen aus Namensgleichheit bleiben abgeleitet; SQL-AST und Fremdschlüssel werden separat belegt.

## Jev im Use Case

- ${graph.metadata.semantic.subjects} Objekte geprüft: Dokumente, Tabellen/Views und Dateien ohne klare Pfadzuordnung.
- ${semantic.length} Modellverbindungen übernommen: ${semantic.filter((e) => e.target.startsWith('m:')).length} fachliche Modulzuordnungen und ${semantic.filter((e) => e.target.startsWith('file:')).length} Dokument-Code-Verbindungen.
- ${graph.metadata.semantic.deferred.length} Objekte ohne übernommene Modulzuordnung. Niedrig bewertete Dokument-Code-Vorschläge stehen in den Objektdetails zur Prüfung.
- Mehrere Fachmodule sind möglich. Leere Dokumente erzeugen keine Modellverbindung. Alte Dokumentation darf trotz Verhaltenswiderspruch zum aktuellen Code derselben Komponente zugeordnet werden.
- Jede Modellverbindung bleibt „abgeleitet“, mit Modell, Wahrscheinlichkeit, Zeitstempel, Ausschnitt und Request-Fingerprint. Der Belegfilter entfernt sie. Wahrscheinlichkeiten sind keine empirisch gemessene Genauigkeit.
- Kandidaten für Dokument-Code-Mapping werden aus vorhandenen Doku-Vorschlägen/Quell-Commits und deren geänderten Dateien gewonnen; maximal 16 pro Dokument. Damit ist die Suche auf diese Kandidaten begrenzt und nicht vollständig für beliebige bislang unverbundene Komponenten.
- Inhaltsbasierter lokaler Cache, versioniertes Modell, validierte Antworten und Budgetprüfung. „brain:index“/Frontend-Aufrufe machen keine bezahlten API-Aufrufe. Nur „brain:map“ und „brain:evaluate“ rufen Jev ausdrücklich auf.

## Kleine manuelle Prüfung

${evaluation.note}

- Richtige Klassenentscheidungen: ${summary.choiceCorrect}/${summary.total}.
- Mit konservativer Übernahmeschwelle: ${summary.acceptedTruePositive}/${summary.positives} passende Paare übernommen; ${summary.positives - summary.acceptedTruePositive} passende Paare bleiben zur Prüfung offen.
- Falsch übernommene unpassende/inhaltlose Paare: ${summary.acceptedFalsePositive}.
- Die Schwellen sind eine Prüfregel, nicht mit diesem kleinen Sample kalibriert. Ergebnisse dürfen nicht als allgemeine 100-%-Genauigkeit ausgegeben werden.

| Dokument | Code | Erwartet | Jev | Übernommen |
| --- | --- | --- | --- | --- |
${evaluation.cases.map((c) => `| ${c.doc} | ${path.basename(c.file)} | ${c.expected} | ${c.answer.choice} (${(c.answer.probabilities[c.answer.choice] * 100).toFixed(0)} %) | ${c.accepted ? 'ja' : 'nein'} |`).join('\n')}

## Verbrauch und Wiederholung

Alle bisher erhaltenen Antworten in den beiden lokalen Caches (einschließlich Entwicklungsdurchläufen): ${caches.length} API-Antworten, ${tokens} Input-Tokens, ca. ${(tokens * 0.042 / 1e6).toFixed(6)} USD. Geschätzt nach [Jev-Preismodell](https://docs.typesafe.ai/models), keine Abrechnungsauskunft. Latenz der erhaltenen Antworten: Median ${times[Math.floor(times.length / 2)]} ms, P95 ${times[Math.floor(times.length * 0.95)]} ms. Fehlgeschlagene Requests ohne Usage sind darin nicht enthalten.

Im Ordner frontend:

\`\`\`powershell
npm run brain:index     # offline, vorhandene passende Modellresultate verwenden
npm run brain:map       # Jev explizit ausführen; unveränderte Requests aus Cache
npm run brain:evaluate  # die 13 beschrifteten Fälle prüfen
npm run brain:test      # lokale Parser-, Graph- und API-Vertragstests, keine Modellkosten
npm run brain:report    # diesen Bericht aus den lokalen Resultaten erzeugen
\`\`\`

TYPESAFE_API_KEY liegt ausschließlich in frontend/.env.local (ignoriert), niemals in VITE_* Variablen. NEURALDOC_JEV_BUDGET_USD begrenzt den Zuordnungslauf (Standard 0,25 USD; maximal 1 USD pro Lauf). Cache und Rohberichte liegen unter mcp/state/ (ignoriert). Der Graph enthält lediglich Entscheidungen und Herkunft, keine Zugangsdaten. Node benutzt den Windows-System-Zertifikatsspeicher, TLS-Prüfung bleibt aktiv.

API-Vertrag: [TypeSafe API](https://docs.typesafe.ai/api). Parser: [Tree-sitter](https://github.com/tree-sitter/tree-sitter), [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [PostgreSQL Parser](https://github.com/constructive-io/pgsql-parser).
`
fs.writeFileSync(path.join(root, 'MAPPING_REPORT.md'), report)
console.log(JSON.stringify({ subjects: graph.metadata.semantic.subjects, semanticEdges: semantic.length, documentCodeEdges: semantic.filter((e) => e.target.startsWith('file:')).length, deferred: graph.metadata.semantic.deferred.length, apiResponses: caches.length, inputTokens: tokens, estimatedUsd: tokens * 0.042 / 1e6, evaluation: summary }))
