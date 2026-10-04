# Company Brain

Der Index verbindet den gelieferten MOBIQ-Quell-Snapshot: Features, Jira-Tickets, Original-Commits und ihre Autoren, Dateien, deklarierte Funktionen, Produktmodule, Parameter, SQL-Tabellen, Views, Felder und Fremdschlüssel. Dokumente sind über die vorhandenen Dashboard-Vorschläge zugeordnet. Fachbereiche werden aus den Produktmodulen abgeleitet; tatsächliche Teamverantwortung ist nicht belegt.

`npm run brain:index` in `frontend/` erzeugt `source-graph.json` mit `mcp/build-brain.mjs`. Der Build verwendet GitLab-Diffs, den finalen Repository-Snapshot und die Schema-/Migrationsdateien. Er führt keinen Produktcode und keine SQL-Datenimporte aus. SQL-Jahrespartitionen werden als Vorlage dargestellt, nicht als abgefragte Laufzeitobjekte. Der Quell-Snapshot enthält zusätzliche Änderungen gegenüber den sieben Dashboard-Features.

Jede Beziehung enthält einen Herkunftsverweis und einen Textausschnitt. `belegt` bezeichnet eine direkt enthaltene Deklaration, Code-/SQL-Referenz oder Quellzuordnung. `abgeleitet` umfasst Modul-/Fachbereichszuordnungen sowie Namensbezüge zwischen Entitäten und Tabellen. `zugeordnet` bezeichnet Doku-Vorschläge. Funktionsaufrufe werden anhand sichtbarer Namen und Typdeklarationen statisch erfasst; es gibt keine vollständige Sprach-, Persistenz- oder Laufzeitanalyse. Eine Funktion, die im Commit-Diff erwähnt ist, wird nicht pauschal als vollständig geändert bezeichnet.

Das Netz ist die Hauptansicht und füllt die verfügbare Fensterfläche. Der Überblick fasst technische Zwischenschritte zusammen; alle Objekttypen lassen sich einblenden. Knoten werden per Kraftsimulation gruppiert, lassen sich verschieben und zeigen beim Darüberfahren ihre Nachbarn. Details und Belege erscheinen bei Auswahl als schließbare Überlagerung. Eine Großansicht und eine Minikarte erleichtern die Navigation. Mittelpunkt, Verbindungstiefe, Objekttypen und Belegfilter steuern den Ausschnitt. Mittelpunkt und ausgewählte Pfadobjekte bleiben sichtbar. Die Suche erfasst den gesamten Index. Die Pfadsuche verwendet Beziehungen in beide Richtungen und liefert einen kürzesten Beziehungspfad, keine kausale Ausführungsreihenfolge. Die Detailansicht zeigt alle direkten Beziehungen und ihre Belege.

Prüfung: `node --test mcp/brain.test.mjs` im Projektverzeichnis. Zusätzlich Frontend-TypeScript, ESLint und Vite-Build.

