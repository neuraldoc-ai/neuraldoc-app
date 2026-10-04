# Komponenten-Mapping: Test am MOBIQ-Beispiel

Stand: 2026-10-04T08:12:50.589Z. Modell: jev-1.13.0.

## Technischer Graph

- 33 Code-Dateien: Java, Kotlin, TSX und Pascal, alle ohne Parserfehler.
- 11 SQL-Dateien mit PostgreSQL AST geparst. Kein Produktcode oder SQL ausgeführt.
- 49 explizite Funktionen/Methoden/Konstruktoren; 16 auflösbare statische Aufrufverbindungen.
- 165 Aufrufe bleiben ohne eindeutiges Ziel. Der Ausschnitt enthält keine vollständigen Projekte/Abhängigkeiten. Java-Auflösung berücksichtigt Paket, explizite Imports, deklarierte Empfängertypen und Argumentanzahl; sie ersetzt keinen Java-Compiler. Kotlin und Pascal sind geparst, ihre Aufrufe bleiben mangels Typauflösung offen. Keine Analyse von DI, Reflection oder Laufzeitbindung.
- Fachmodule aus Paket-/Verzeichnispfaden sind konfigurierte, abgeleitete Zuordnungen. Ein unpassender Pfad wird nicht automatisch zu „Plattform“.
- ORM-/Tabellenbeziehungen aus Namensgleichheit bleiben abgeleitet; SQL-AST und Fremdschlüssel werden separat belegt.

## Jev im Use Case

- 42 Objekte geprüft: Dokumente, Tabellen/Views und Dateien ohne klare Pfadzuordnung.
- 50 Modellverbindungen übernommen: 34 fachliche Modulzuordnungen und 16 Dokument-Code-Verbindungen.
- 8 Objekte ohne übernommene Modulzuordnung. Niedrig bewertete Dokument-Code-Vorschläge stehen in den Objektdetails zur Prüfung.
- Mehrere Fachmodule sind möglich. Leere Dokumente erzeugen keine Modellverbindung. Alte Dokumentation darf trotz Verhaltenswiderspruch zum aktuellen Code derselben Komponente zugeordnet werden.
- Jede Modellverbindung bleibt „abgeleitet“, mit Modell, Wahrscheinlichkeit, Zeitstempel, Ausschnitt und Request-Fingerprint. Der Belegfilter entfernt sie. Wahrscheinlichkeiten sind keine empirisch gemessene Genauigkeit.
- Kandidaten für Dokument-Code-Mapping werden aus vorhandenen Doku-Vorschlägen/Quell-Commits und deren geänderten Dateien gewonnen; maximal 16 pro Dokument. Damit ist die Suche auf diese Kandidaten begrenzt und nicht vollständig für beliebige bislang unverbundene Komponenten.
- Inhaltsbasierter lokaler Cache, versioniertes Modell, validierte Antworten und Budgetprüfung. „brain:index“/Frontend-Aufrufe machen keine bezahlten API-Aufrufe. Nur „brain:map“ und „brain:evaluate“ rufen Jev ausdrücklich auf.

## Kleine manuelle Prüfung

13 manuell beschriftete Fälle aus demselben Beispieldatensatz; sechs positive, sechs negative und ein Fall ohne Dokumentinhalt. Keine repräsentative oder unabhängige Qualitätsmessung.

- Richtige Klassenentscheidungen: 13/13.
- Mit konservativer Übernahmeschwelle: 4/6 passende Paare übernommen; 2 passende Paare bleiben zur Prüfung offen.
- Falsch übernommene unpassende/inhaltlose Paare: 0.
- Die Schwellen sind eine Prüfregel, nicht mit diesem kleinen Sample kalibriert. Ergebnisse dürfen nicht als allgemeine 100-%-Genauigkeit ausgegeben werden.

| Dokument | Code | Erwartet | Jev | Übernommen |
| --- | --- | --- | --- | --- |
| doc:nh-kaufvertrag | Kaufvertrag.java | relevant | relevant (100 %) | ja |
| doc:nh-kaufvertrag | TeillieferungService.java | relevant | relevant (60 %) | nein |
| doc:nh-tour | TourPruefung.java | relevant | relevant (79 %) | nein |
| doc:nh-kasse | GutscheinService.java | relevant | relevant (100 %) | ja |
| doc:nh-fibu | GutscheinBuchung.java | relevant | relevant (100 %) | ja |
| doc:td-kasse | Tagesabschluss.java | relevant | relevant (100 %) | ja |
| doc:nh-kasse | TourPruefung.java | unrelated | unrelated (100 %) | nein |
| doc:nh-tour | GutscheinService.java | unrelated | unrelated (99 %) | nein |
| doc:nh-kaufvertrag | VorlagenKonvertieren.java | unrelated | unrelated (100 %) | nein |
| doc:td-fibu | TeillieferungService.java | unrelated | unrelated (100 %) | nein |
| doc:td-kasse | LieferungAufteilen.tsx | unrelated | unrelated (100 %) | nein |
| doc:dlg-kaufvertrag | Fahrzeug.tsx | unrelated | unrelated (100 %) | nein |
| doc:dlg-fahrzeug | Fahrzeug.tsx | insufficient | insufficient (98 %) | nein |

## Verbrauch und Wiederholung

Alle bisher erhaltenen Antworten in den beiden lokalen Caches (einschließlich Entwicklungsdurchläufen): 139 API-Antworten, 324993 Input-Tokens, ca. 0.013650 USD. Geschätzt nach [Jev-Preismodell](https://docs.typesafe.ai/models), keine Abrechnungsauskunft. Latenz der erhaltenen Antworten: Median 259 ms, P95 375 ms. Fehlgeschlagene Requests ohne Usage sind darin nicht enthalten.

Im Ordner frontend:

```powershell
npm run brain:index     # offline, vorhandene passende Modellresultate verwenden
npm run brain:map       # Jev explizit ausführen; unveränderte Requests aus Cache
npm run brain:evaluate  # die 13 beschrifteten Fälle prüfen
npm run brain:test      # lokale Parser-, Graph- und API-Vertragstests, keine Modellkosten
npm run brain:report    # diesen Bericht aus den lokalen Resultaten erzeugen
```

TYPESAFE_API_KEY liegt ausschließlich in frontend/.env.local (ignoriert), niemals in VITE_* Variablen. NEURALDOC_JEV_BUDGET_USD begrenzt den Zuordnungslauf (Standard 0,25 USD; maximal 1 USD pro Lauf). Cache und Rohberichte liegen unter mcp/state/ (ignoriert). Der Graph enthält lediglich Entscheidungen und Herkunft, keine Zugangsdaten. Node benutzt den Windows-System-Zertifikatsspeicher, TLS-Prüfung bleibt aktiv.

API-Vertrag: [TypeSafe API](https://docs.typesafe.ai/api). Parser: [Tree-sitter](https://github.com/tree-sitter/tree-sitter), [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [PostgreSQL Parser](https://github.com/constructive-io/pgsql-parser).
