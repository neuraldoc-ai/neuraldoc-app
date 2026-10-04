# Fähigkeiten jeder Einzelanbindung

Stand: 3. Oktober 2026. Zielbild für echte Anbindungen mit Abgleich zum Demo-Stand. Jede Quelle soll Ressourcen entdecken, ihre Struktur erklären, gezielte Abfragen erlauben und Daten mit Herkunft liefern. Die unten als geplant bezeichneten Funktionen sind noch nicht implementiert.

## Wer schreibt SQL und KQL?

Normalerweise schreibt der Coding-Agent die Abfrage anhand des Schemas, das er per MCP gelesen hat. Der Server führt sie mit der hinterlegten Identität aus und liefert Ergebnis oder einen konkreten Fehler. Query-Generierung im MCP selbst ist optional, würde bei Modellnutzung zusätzliche Kosten erzeugen und ist hier nicht implementiert. MCP-Prompts machen Abläufe wie „Datenfrage beantworten“ oder „Fehler seit Deployment untersuchen“ auswählbar.

## Quelle für Quelle

| Anbindung | Eigenständiger Nutzen | Nötige Fähigkeiten | Demo-Stand |
|---|---|---|---|
| GitLab | Implementierung und Code-Änderungen verstehen | Projekte/Refs entdecken, Repositorybaum, Dateien, Code-/Symbolsuche, Commits, MRs, Diffs, Ref-Vergleiche, Pipelines/Joblogs | MRs, Commits, Diffs und Code-/Dateizugriff implementiert; ein Projekt/Ref, keine Pipelines oder historischen Dateien |
| Jira | Anforderungen, Akzeptanzkriterien, Abhängigkeiten und offene Entscheidungen ermitteln | Projekte/Tickets/Kommentare/Links lesen, JQL, Status und Versionen, paginierte Treffer | Text-/Status-/Versionssuche und Ticketdetails implementiert; vollständige JQL-Semantik fehlt |
| Confluence | Beschriebenes Produktverhalten, Parameter und Architektur recherchieren | Bereiche/Hierarchie entdecken, CQL, Seiten/Tabellen/Anhänge lesen, Versionen vergleichen | Suche und Seitenlesen implementiert; Anhänge, Hierarchie und Historien-Tools fehlen |
| SharePoint | Word-/PDF-Doku und Excel-Parameterlisten samt Tabellen nutzen | Sites/Drives/Ordner entdecken, Dateisuche, Metadaten/Versionen, Inhaltsextraktion mit Abschnitts-/Blattbezug, Excel-Bereiche | Dateiliste, Inhaltssuche und vorliegende Extrakte implementiert; keine Live-API |
| Interne SQL-DBs | Speicherorte, geltende Parameter und tatsächliche Geschäftsfälle untersuchen | Verbindungen/DBs/Engine/Schemas entdecken; Tabellen/Views, Typen, PK/FK, Indizes/Kommentare; freie lesende SQL-Queries, Joins, CTEs, Aggregate, Parameter, Ausführungspläne | Eine PostgreSQL-Demo; Schema, freie parametrisierte SQL und Migrationen implementiert |
| Azure Monitor / Application Insights | Fehler, Latenzen und Abhängigkeiten über einen Zeitraum untersuchen | Subscriptions/Ressourcen/Log-Analytics-Workspaces entdecken; Tabellen/Spalten lesen; native KQL, Metriken, Activity Logs | Geplant; kein Azure-Tool und keine Verbindung |
| Azure Data Explorer / Fabric KQL | Ereignis- und Analysedaten untersuchen | Cluster/DBs/Tabellen/Schemas entdecken; Stichproben; native KQL gegen gewähltes Ziel mit Joins und Aggregaten | Geplant; keine Verbindung |

Azure ist nicht eine einzige Datenquelle: Azure SQL verwendet SQL, Log Analytics und Data Explorer verwenden KQL. Eine Anbindung, die Ressourcen auflistet, kann nicht automatisch deren Anwendungsdaten lesen. Dazu müssen die passenden Tools und Rechte existieren.

## Interne DBs: alle verbundenen Datenbanken nutzbar machen

Geplanter Tool-Vertrag für reale DBs:

| Tool | Eingabe | Ergebnis |
|---|---|---|
| `db_list_connections` | optional Engine/Umgebung | Nicht geheime IDs konfigurierter Verbindungen, Engine, Umgebung, Fähigkeiten |
| `db_list_databases` | `connection_id` | Tatsächlich sichtbare DBs |
| `db_list_schemas` | `connection_id`, `database` | Sichtbare Schemas |
| `db_describe` | `connection_id`, `database`, `schema`, optional Tabelle | Tabellen/Views, Spalten/Typen, Schlüssel, Beziehungen, Indizes, Kommentare |
| `db_query` | `connection_id`, `database`, `sql`, `params`, optional Limit | Spalten/Typen, Zeilen, Dauer, Kürzungsstatus und ausgeführtes Ziel |
| `db_explain` | Ziel, SQL und Parameter | Ausführungsplan, standardmäßig ohne ANALYZE |

PostgreSQL, SQL Server und MySQL brauchen jeweils ihren Engine-Adapter und SQL-Dialekt. Jede Query wählt explizit Verbindung und DB; der Agent muss keine freie Verbindungszeichenfolge übergeben. PostgreSQL-Joins zwischen DBs funktionieren nicht automatisch: Cross-DB-/Cross-Engine-Abfragen benötigen eingerichtete Föderation oder getrennte Queries mit anschließendem Zusammenführen. Die Demo hat bewusst keine Zielparameter, weil nur `mobiq` existiert.

„Alle Daten“ bedeutet zunächst, dass alle erlaubten Tabellen abfragbar sind. Eine Fachfrage muss nicht den ganzen DB-Dump in den Modellkontext laden: gezielte Felder und SQL-Aggregationen liefern die fachliche Antwort. Für ausdrücklich benötigte Vollauszüge ist ein separater paginierter Export mit Ziel, Umfang und Downloadartefakt vorgesehen, noch nicht implementiert.

## Azure/KQL: konkreter Ablauf

Geplante Fähigkeiten:

1. `azure_list_query_targets`: zugängliche Log-Analytics-Workspaces und ADX-Cluster/DBs mit stabiler Ziel-ID auflisten.
2. `azure_describe_tables(target_id, table?)`: vorhandene Tabellen und Spalten/Typen lesen.
3. `azure_kql_query(target_id, query, timespan, limit)`: native KQL ausführen; Spalten, Zeilen, Kürzungsstatus, Ziel/Zeitfenster und Dienstfehler liefern. Log Analytics und ADX brauchen getrennte API-Adapter.
4. Optional `azure_get_metrics` und `azure_get_activity_logs`: Metriken sowie Infrastruktur-/Deploymentereignisse lesen, getrennt von Anwendungslogs.

Ein Prompt `investigate(question, target, timespan)` lässt den Agenten zuerst Ziel und Schema lesen, dann KQL erzeugen, ausführen und erklären. Beispiel **nur nach bestätigtem Schema** für Application-Insights-Daten im Workspace:

```kusto
AppRequests
| where TimeGenerated > ago(24h)
| summarize Requests = count(), Failures = countif(Success == false), P95ms = percentile(DurationMs, 95) by bin(TimeGenerated, 1h)
| order by TimeGenerated asc
```

Das untersucht Requests, Fehler und Latenz; es belegt noch keine Ursache. Für „nach Deployment schlechter“ werden zusätzlich tatsächliche Deployments und Abhängigkeiten untersucht. Andere Tabellen brauchen andere Queries. Azure Resource Graph hat ebenfalls eine KQL-Abfragesprache, ist aber eine Ressourcenabfrage, keine Log-Analytics-Abfrage: als eigener Zieltyp behandeln.

Microsoft bietet bereits MCP-Funktionen für [Log Analytics: Workspaces, Tabellen und KQL](https://learn.microsoft.com/en-us/azure/developer/azure-mcp-server/tools/azure-monitor) und [Data Explorer: Datenbanken, Schema und Queries](https://learn.microsoft.com/en-us/azure/developer/azure-mcp-server/tools/azure-data-explorer). Unsere geplanten Toolnamen sind ein eigener Vertrag, keine behaupteten Namen der offiziellen Microsoft-Tools.

## Zugriff und Belege

Eine Verbindung verwendet die eingerichtete Identität. Der Quellendienst setzt Tabellen-, Zeilen-, Mandanten-, Workspace- und Ressourcenrechte durch; ein Prompt erweitert diese Rechte nicht. Reale DB-Abfragen verwenden eine echte Leserolle. Für Azure gelten Entra/RBAC-Rechte. DB-Schreibanweisungen und Kusto-Managementbefehle gehören in eigene Änderungsfunktionen.

Ergebnisse enthalten Quelle/Ziel, Query bzw. gelesenen Abschnitt, Version/Zeitfenster, Daten und Kürzungsstatus. „Kein Treffer“, „nicht verbunden“, „keine Berechtigung“ und „Query-Fehler“ sind unterschiedliche Ergebnisse. Code belegt implementiertes Verhalten; DB-Daten und Logs belegen beobachtete Fälle und Betrieb. Fehlende Datenfälle widerlegen keine Geschäftsregel.
