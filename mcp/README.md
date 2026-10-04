# neuraldoc MCP

Die optionale [Texterstellung mit Gemini Flash-Lite](DRAFTING.md) ist angeschlossen: einzelne offene Stellen im Editor formulieren oder eigene Schreibkontexte über API/CLI übergeben. Ohne API-Key funktionieren die bestehenden Demo-Prüfungen weiterhin. Normale MCP-Aufrufe lösen keine interne Texterstellung aus.

Drei Werkzeuge für den Coding-Agenten der Entwicklung (Claude Code, Cursor, VS Code). neuraldoc liest GitLab, Jira, Confluence und SharePoint selbst und gibt dem Agenten nur das zurück, was die Antwort braucht. Die Idee kommt von kapa.ai (Antworten aus der Doku mit Quelle) und executor.sh (ein Endpunkt, Zugangsdaten zentral, wenige Tokens). Der Unterschied: neuraldoc prüft die Doku gegen den Code.

| Werkzeug | Wann | Was zurückkommt |
|---|---|---|
| `ticket_context` | vor dem Programmieren, mit einem Jira-Ticket | Ticket, die Änderung, auf der es aufbaut, Regeln und Parameter aus dem Code, Doku-Stand mit Status, Code-Stellen, offene Punkte, wer später freigibt |
| `ask` | bei einer Fachfrage | kurze Zitate mit Quelle, je Fundstelle „stimmt“, „veraltet“ (mit dem, was der Code tut), „unvollständig“ oder „aktualisiert“ |
| `check_change` | wenn das Feature fertig ist (MR, Branch, Ticket oder Commits) | vollständige gefundene Quellenliste mit Originalnamen, Stellen und Änderungsinhalt, zusätzlich vorbereitete Entwürfe, Rückfragen, Handarbeit und **ein Link** zum Prüfen und Freigeben |

## Vollständigkeit vor Kürze

Die Quellenprüfung für Teillieferungen liest alle 33 Confluence-Seiten und alle sieben extrahierten SharePoint-Dateien. Sie berücksichtigt auch Schulungen, Leistungsbeschreibungen, Screenshots, Tabellenblätter und PDF-Folien. Parameter und Code-Regeln werden aus den finalen Dateien des Release-Standes gelesen, nicht aus alten Zwischenständen der Commit-Diffs. Jeder Änderungspunkt besitzt Originalnamen, Quellen-ID, Fundstelle und Codebelege. Testreferenz wird vom MCP nicht geladen; sie bleibt eine externe Testreferenz.

Die 19 vorbereiteten Dashboard-Entwürfe sind von der Quellenprüfung getrennt. Eine zusätzlich gefundene Stelle ist eine Prüfhilfe und kein fertiger oder automatisch freigegebener Entwurf. Nicht zugeordnete Quellen gelten als ungeprüft. Der zusätzliche Detektor verwendet ausdrücklich begrenzte, deterministische Fachregeln für Teillieferung; er ist keine allgemeine semantische Analyse beliebiger ERP-Änderungen. Andere Änderungsarten nutzen weiterhin die vorbereiteten Dashboard-Entwürfe und weisen diese Grenze aus.

Codebelege und fachliche Anforderungen bleiben unterscheidbar: Erlösdatum und OP-Zuordnung der Teilrechnung stammen aus dem Jira-Kommentar zu MOB-4812; der Codeausschnitt belegt die Teilrechnung mit TR. Beide Belege werden mitgeliefert und beim gezielten Nachladen ungekürzt gezeigt. Vorbereitete Doku-Entwürfe sind entsprechend beschriftet und werden nicht als direkter Codeausschnitt ausgegeben.

Der Standard liefert die vollständigen Fakten als Text einmal. `format: "structured"` ergänzt das Datenmodell für Oberflächen; das Dashboard fordert diesen Modus ausdrücklich an. `details: true` liefert Entwurfstexte ungekürzt. Mit `source_id` lädt der Agent nur die benötigte Originalquelle samt ungekürztem extrahiertem Text und Codeausschnitten nach; dieser Abruf erzeugt keinen neuen MR-Kommentar:

```json
{"merge_request":"1287","source_id":"01MOBIQ004822DOC16"}
```

Die Quellenliste kommt als direkt nutzbare Antworttabelle, mit einer Zeile je Fundstelle und einer eigenen Spalte für die konkrete Änderung. Bei einem Doku-Prüfauftrag prüft der Agent seinen Entwurf mit `check_change` und `answer` vor der Ausgabe. Der Abruf bewertet Lücken und liefert zusätzlich eine vollständig ergänzte, formal geprüfte Antwort aus dem Quelleninventar zum unveränderten Übernehmen. Dadurch müssen Ergänzungen nicht erneut verlustbehaftet zusammengefasst werden. Fachfragen und Ticketvorbereitung benötigen keine Doku-Gesamtprüfung. Die Prüfung verwendet ausschließlich die aus Quellen/Code abgeleitete Liste und keine Testreferenz. Auch dieser Abruf erzeugt keinen MR-Kommentar. Die Prüfung ist formal: Sie ersetzt kein fachliches Gutachten und erkennt beispielsweise falsche Verneinungen nicht zuverlässig. Ein fremder Client kann die Übernahme weiterhin missachten; entscheidend ist deshalb immer dessen tatsächliche Schlussantwort.

```json
{"merge_request":"1287","answer":"Die eigene Antwort vor der Ausgabe …"}
```

Das übernimmt [Executors Prinzip der gezielten Entdeckung und Abfrage](https://executor.sh/): eine kleine Werkzeugoberfläche und Details auf Abruf. neuraldoc führt dabei keine beliebigen Agentenskripte aus; die drei fachlichen Werkzeuge bleiben erhalten.

## Ablauf

1. Der Agent ruft `check_change` auf und gibt dem Nutzer den Link (`/app/aenderungen/<id>`).
2. Ist es eingeschaltet, setzt neuraldoc denselben Link als Kommentar in den Merge-Request.
3. Auf der Seite prüft eine Person die Entwürfe und übernimmt, passt an oder verwirft sie. Wer freigibt, hängt von der Doku-Art ab (Dashboard → MCP → „Wer gibt frei“); technische Doku darf die Entwicklung selbst freigeben.
4. Jede übernommene Stelle schreibt neuraldoc nach Confluence oder SharePoint zurück, mit neuer Versionsnummer. In der Demo wird das nur protokolliert.

## Starten

| Start | Endpunkt |
|---|---|
| `npm run dev` in `frontend/` | `http://localhost:5174/mcp` (läuft im Vite-Server mit, Dashboard unter `/app/mcp`) |
| `npm run mcp` in `frontend/` | `http://localhost:8787/mcp` (eigenständig) |
| `node mcp/stdio.mjs` | stdio, für Clients, die den Server selbst starten |

Token: `Authorization: Bearer nd_demo_mobiq_2b7f9c41e8` (oder `NEURALDOC_MCP_TOKEN` setzen). Links zeigen auf den Host der Anfrage; bei stdio auf `NEURALDOC_APP_URL` (Standard `http://localhost:5174`).

```
claude mcp add --transport http neuraldoc http://localhost:5174/mcp --header "Authorization: Bearer nd_demo_mobiq_2b7f9c41e8"
codex mcp add neuraldoc -- node <pfad>/mcp/stdio.mjs
```


## Auswählbare Abläufe

Neben den drei Tools bietet der Server drei MCP-Prompts über `prompts/list` und `prompts/get`. Ihr Abruf führt noch kein Tool aus: Der Client erhält den Arbeitsauftrag für seinen Agenten.

| Claude Code | Argument | Ablauf |
|---|---|---|
| `/neuraldoc:ticket_context MOB-4844` | `ticket` | Ticket vorbereiten |
| `/neuraldoc:ask` | `question` | Produktfrage mit Quellen beantworten |
| `/neuraldoc:check_change !1287` | `change` | MR oder Jira-Ticket auf Doku-Auswirkungen prüfen |

Auch `/mcp__neuraldoc__ticket_context`, `/mcp__neuraldoc__ask` und `/mcp__neuraldoc__check_change` funktionieren in Claude Code. Mehrteilige Fragen über die Argumenteingabe des Clients angeben; die CLI zerlegt inline angegebene Argumente nach Leerzeichen. Der Prompt `check_change` akzeptiert MR-Nummern oder MOB-Tickets; das Tool unterstützt zusätzlich Branches und Commits.

Für Codex liegt der Skill unter [`.agents/skills/neuraldoc`](../.agents/skills/neuraldoc/SKILL.md). Auf diesem Rechner ist er zusätzlich unter `~/.codex/skills/neuraldoc` installiert. Per `$neuraldoc` oder über den Skill-Eintrag im Slash-Menü auswählen, etwa `$neuraldoc MR !1287 prüfen`. Ein neuer Thread bzw. Neustart kann zum Neuladen nötig sein.


Referenzen: [Claude Code MCP-Prompts](https://code.claude.com/docs/en/mcp#use-mcp-prompts-as-commands), [Codex Slash-Befehle und Skills](https://learn.chatgpt.com/docs/reference/slash-commands).

## Aufbau

- `core.mjs`: die drei Werkzeuge, Freigaberegeln, Entscheidungen, Zurückschreiben, Protokoll mit Tokens (Antwort gegen die Rohdaten, die neuraldoc dafür gelesen hat; vier Zeichen je Token).
- `sources.mjs`: GitLab, Jira, Confluence und SharePoint aus dem Beispieldatensatz (Submodule unter `datasets/`, Pfade über `dataset.mjs`), dazu die BM25-Suche und wo jedes Dokument liegt. Echte Anbindungen benötigen API-Loader sowie passende Fachregeln und Validierung auf dem jeweiligen Produkt; die Demo-Regeln decken das nicht allgemein ab.
- `impact.mjs`: Originalquellen, regelbasierte Fundstellen und Codebelege; keine Ground-Truth-Abhängigkeit. `impact.test.mjs` prüft Vollständigkeit, neue Quellen, geänderte Parameter und gezieltes Nachladen.
- Änderungen, Dokumente, Entwürfe und der Zielgruppen-Filter kommen aus `frontend/src/dashboard/features/docs/data.ts` und `logic.ts`, also genau dem, was das Dashboard zeigt. Node 24 lädt die `.ts`-Dateien direkt.
- `handler.mjs`: MCP über JSON-RPC 2.0, Streamable HTTP mit JSON-Antworten (ohne SSE), Session-ID per `Mcp-Session-Id`; dazu `/api/mcp/*` für das Dashboard. Entscheidungen im Dashboard gehen an `/api/mcp/decisions`, damit der Agent den Stand sieht.
- Zustand (Regeln, Entscheidungen, Zurückgeschriebenes, MR-Kommentare, Protokoll) liegt in `mcp/state/`. Löschen setzt alles zurück.
