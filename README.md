# neuraldoc Dashboard

Ein Dashboard, zwei Betriebsarten:

- **Showcase**: vorbereitete MOBIQ-Beispieldaten (erfunden). Keine Keys, keine Modellaufrufe, Entscheidungen bleiben im Browser-Tab.
- **Eigenes Projekt**: ein lokales Git-Repository und einen Doku-Ordner importieren. Jev findet die betroffenen Dokumente, ein austauschbares LLM formuliert Entwürfe, du gibst frei und lädst die freigegebenen Texte als ZIP herunter.

Beide nutzen dieselbe Oberfläche. Ohne importiertes Projekt startet das Dashboard im Showcase.

## Schnellstart

Node.js 24 und Git installieren. Die MOBIQ-Beispieldaten sind Git-Submodule, deshalb mit `--recursive` klonen (Windows: ohne Zeilenende-Umwandlung, sonst weichen Code-Dateien vom Datensatz ab):

```powershell
git -c core.autocrlf=false clone --recursive https://github.com/neuraldoc-ai/neuraldoc-dashboard.git
# bereits geklont: git submodule update --init
```

Im Ordner `frontend`:

```powershell
npm ci
npm run dev            # Showcase + Import eigener Projekte
npm run dev:showcase   # nur Showcase, Import ausgeschaltet
```

Dashboard: http://localhost:5174/app/ · MCP: http://localhost:5174/mcp

Für eigene Projekte zusätzlich Keys einrichten (einmalig):

```powershell
Copy-Item .env.example .env.local   # macOS/Linux: cp .env.example .env.local
# .env.local bearbeiten: TYPESAFE_API_KEY (Jev) + einen LLM-Anbieter setzen, dann neu starten.
```

## Eigenes Projekt prüfen

1. Übersicht → **Eigenes Projekt**: absoluten Pfad zum Git-Stammordner und zum Doku-Ordner angeben. Verglichen wird standardmäßig `HEAD~1` → `HEAD`; andere Stände sind einstellbar. Der Import ist lokal und kostenlos.
2. **Mit Jev zuordnen**: Jev prüft jedes Dokument gegen die geänderten Code-Dateien (kostenpflichtig, Budget `NEURALDOC_JEV_BUDGET_USD`, Standard 0,25 USD).
3. **Starten** bzw. **Formulieren**: das LLM schreibt pro betroffenem Dokument einen Entwurf aus den Diffs (kostenpflichtig). Fehlen Belege, stellt es eine Rückfrage.
4. Prüfen, übernehmen oder verwerfen. **Freigaben exportieren** lädt ein ZIP mit den freigegebenen Dokumenten und einer `neuraldoc-export.json` (mit SHA-256 des Originals).

neuraldoc verändert weder Repository noch Doku-Ordner. Gelesen werden nur committete Dateien des gewählten Git-Stands. Projekte, Entscheidungen und Caches liegen unter `mcp/state/projects/` (bzw. `NEURALDOC_STATE_DIR`) und sind Git-ignoriert.

**Grenzen dieser Version**

- Bis 250 Code-Dateien (je 100 KB), 40 Dokumente (je 8.000 Zeichen), 100 Commits, 8 MB Diffs. Dokumente: Markdown, MDX, Text, RST, HTML (HTML wird als Text exportiert).
- AST-Analyse für Java, Kotlin, TypeScript/TSX, Pascal und SQL; andere Sprachen nur als Quelle. SQL-Beziehungen sind begrenzt.
- Jev sieht je Dokument höchstens sechs geänderte Dateien, gekürzt auf 3.500 Zeichen. Weitere Dateien werden als ausgelassen protokolliert.
- Ein Entwurf ersetzt das ganze Dokument; kein Abschnitts-Mapping. Für eigene Projekte gibt es keine gemessene Trefferquote.
- Jira, Confluence und SharePoint sind für eigene Projekte nicht angebunden.
- Nur für lokale Nutzung gedacht: Pfade sind frei wählbar, es gibt keine Benutzerverwaltung. Schreibaktionen verlangen dieselbe Herkunft oder den MCP-Token; der Demo-Token ist kein Zugriffsschutz für ein öffentliches Netz.
- Gleichzeitige Läufe sind pro Serverprozess gesperrt, nicht prozessübergreifend.

## Tests

`npm test` im Ordner `frontend` führt alle Backend-Tests aus. Jev und LLM sind dabei gemockt (über die echten Clients und Validatoren); es wird nichts bezahlt. Die Projekttests legen ein temporäres Git-Repository an. `npm run build` prüft Typen und baut die Oberfläche.

## Produktion und Docker

Lokal: `npm run build; npm run start` (Port 8080, lädt `.env.local`), nur Showcase: `npm run start:showcase`.

```powershell
docker build -t neuraldoc-dashboard .
# Showcase:
docker run -p 8080:8080 -e NEURALDOC_MODE=showcase neuraldoc-dashboard
# Eigenes Projekt: Keys zur Laufzeit, State im Volume, Quellen schreibgeschützt eingebunden.
docker run -p 8080:8080 --env-file frontend/.env.local -v neuraldoc-data:/data -v C:Projekteshop:/import/shop:ro -v C:Projekteshop-docs:/import/docs:ro neuraldoc-dashboard
```

Im Container im Importdialog die Pfade `/import/shop` und `/import/docs` angeben. Keys werden nicht ins Image kopiert. `VITE_LANDING_URL` setzt beim Build den Link zur Website.

Kein Remote und keine automatische Veröffentlichung sind eingerichtet.

## Architektur und LLM-Anbieter

Die Seite **Architektur** erklärt den Ablauf und zeigt unter **Lokal starten**, ob Jev und der LLM-Anbieter eingerichtet sind (nur Konfiguration, kein bezahlter Verbindungstest). Jev (`TYPESAFE_API_KEY`) ist für eigene Projekte Pflicht und bleibt auch mit lokalem LLM eine externe API.

| Anbieter | NEURALDOC_DRAFT_PROVIDER | Schlüssel / Server | Beispielmodell |
| --- | --- | --- | --- |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4.1-mini` |
| Claude | `anthropic` (Alias `claude`) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` |
| Lokal | `local` | `NEURALDOC_LLM_BASE_URL`, optional `NEURALDOC_LLM_API_KEY` | `qwen2.5:7b` |
| Gemini | `gemini` | `GEMINI_API_KEY` | `gemini-2.5-flash-lite` |
| Vertex AI | `vertex` | `VERTEX_API_KEY`, `GOOGLE_CLOUD_PROJECT`, Standort und Modus | `gemini-2.5-flash-lite` |

`NEURALDOC_LLM_MODEL` wählt das Modell. Die bestehende Gemini-Konfiguration mit `NEURALDOC_GEMINI_MODEL` funktioniert weiterhin. Für Google bleiben die bisherigen Flash-Lite-Modelle freigeschaltet; für OpenAI/Claude muss das gewählte Modell den verwendeten JSON-Schema-Vertrag unterstützen. Alle Antworten werden zusätzlich lokal auf Textoperation und gültige Belegverweise geprüft. Abgebrochene, abgelehnte oder ungültige Antworten werden nicht als Entwurf gespeichert. Kein automatischer Anbieterwechsel.

Für lokale Modelle dient eine OpenAI-kompatible `/v1`-URL, beispielsweise `http://127.0.0.1:11434/v1` (Ollama) oder `http://127.0.0.1:1234/v1` (LM Studio). Das Modell muss vorher auf dem jeweiligen Server geladen sein. Bei fehlender JSON-Schema-Unterstützung ausdrücklich `NEURALDOC_LLM_FORMAT=json_object` setzen. Modellqualität und Ausgabezuverlässigkeit sind separat mit eigenen Quellen zu prüfen.

API-Verträge: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Ollama-Kompatibilität](https://docs.ollama.com/api/openai-compatibility).

Keys ausschließlich in `.env.local` oder Server-Umgebungsvariablen setzen, ohne `VITE_`-Präfix. Die neue Status-API `/api/mcp/setup` gibt nur die Anwesenheit der Schlüssel zurück. Nach Konfigurationsänderungen den Node-Server neu starten. Provider, Modell und lokaler Endpoint bestimmen die Cache-Identität; Keys werden nicht in Entwurfcaches gespeichert.

Kosten neuer Cloud-Anbieter bleiben ohne konfigurierte Tarife unbekannt. Optional `NEURALDOC_LLM_INPUT_USD_PER_MILLION` und `NEURALDOC_LLM_OUTPUT_USD_PER_MILLION` setzen. Beim lokalen LLM werden nur die API-Gebühren mit 0 USD angegeben, Strom-/Hardwarekosten sind nicht enthalten.

## MOBIQ-Datensatz

Der Showcase nutzt den erfundenen Evaluationsdatensatz MOBIQ aus vier Repositories, eingebunden unter `datasets/`:

| Submodul | Inhalt |
| --- | --- |
| `mobiq` | Generator, GitLab- und Jira-API-Antworten, Lösung (`ground-truth.json`) |
| `mobiq-code` | Das Code-Repository mit Branches, Merges und Tag (gepinnt auf `release/26.4`) |
| `mobiq-docs` | Confluence-Seiten und SharePoint-Dateien |
| `mobiq-db` | PostgreSQL-Skripte und `docker compose` |

Code liest die Daten im ursprünglichen Layout (`gitlab/…`, `repo/…`, `postgres/…`); `mcp/dataset.mjs` und `vite.config.ts` bilden das auf die Repositories ab. Neu erzeugen im Repository `mobiq`: `node generate.mjs && node publish.mjs`.

## MOBIQ-Showcase pflegen

Der Company Brain indexiert Java, Kotlin, TypeScript/TSX und Pascal mit Tree-sitter sowie SQL mit dem PostgreSQL-Parser. Java-Aufrufe werden im vorhandenen Snapshot anhand von Paket, Import und Empfängertyp aufgelöst; TypeScript verwendet die Compiler-Symbolauflösung. Fehlende oder mehrdeutige Ziele bleiben offen. Fachliche Modulzuordnungen sind separat als abgeleitet gekennzeichnet.

Jev ergänzt fachliche Restzuordnungen und bewertet Dokument-Code-Paare für Doku-Auswirkungen. Ein altes Dokument kann zum geänderten Code passen, obwohl sein beschriebenes Verhalten veraltet ist. Im Graphen sind Modellverbindungen abgeleitet; Herkunft und unsichere Vorschläge stehen in den Details.

Im Ordner `frontend`: `npm run brain:index` baut den Graphen offline. `npm run brain:map` ruft Jev ausdrücklich auf, unveränderte Requests kommen aus dem lokalen Cache. Der serverseitige Key heißt `TYPESAFE_API_KEY` in `frontend/.env.local`; kein `VITE_`-Präfix. Standardbudget: 0,25 USD pro Mapping-Lauf, mit `NEURALDOC_JEV_BUDGET_USD` konfigurierbar (höchstens 1 USD). Cache/Rohberichte unter `mcp/state/` sind ignoriert; veraltete Ergebnisse werden bei geändertem Eingabekontext nicht geladen. Ohne passende lokale Ergebnisse bleibt der Graph technisch nutzbar.

`npm run brain:test` testet ohne Modellkosten. `npm run brain:evaluate` prüft 13 manuell beschriftete Paare mit Jev. `npm run brain:report` schreibt den [Testbericht](MAPPING_REPORT.md). Die [TypeSafe API](https://docs.typesafe.ai/api) wird mit dem festen Modell `jev-1.13.0` verwendet. Normale Seitenaufrufe und Frontend-Builds lösen keine Modellkosten aus.

## Lizenz

MIT, siehe [LICENSE](LICENSE). Die Oberfläche baut auf einer MIT-lizenzierten Vorlage auf; deren Hinweis steht in [frontend/LICENSE-DASHBOARD](frontend/LICENSE-DASHBOARD).
