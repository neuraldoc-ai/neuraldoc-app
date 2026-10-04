# Texterstellung mit Gemini Flash-Lite über Vertex AI

Der neue Generator formuliert Ersatztexte, neue Absätze mit Überschriften und Tabellenzeilen aus einem Schreibkontext. Er benötigt Originaltext, Zielgruppe, Einfügestelle und Belege. Er wählt keine Dokumente aus und gibt keine Änderung frei. Bei fehlenden Angaben kann er eine Rückfrage statt eines Textes zurückgeben.

**Überprüfung starten** bereitet die offenen Textstellen vor und öffnet danach den Dokumenteditor. Auf der Änderungsübersicht werden alle offenen Texte des Releases vorbereitet, bei einer einzelnen Änderung nur deren Texte. Eine Ladeansicht zeigt abgeschlossene Stellen; bis zu vier unterschiedliche Texte werden parallel angefragt. Identische gleichzeitige Anfragen teilen sich einen Modellaufruf. Vorhandene passende Texte kommen aus dem dauerhaften Cache. Bereits entschiedene Stellen und manuelle Aufgaben an Bildern oder Dateien werden ausgelassen. Bei Fehlern oder fehlendem Schreibkontext bleiben fertige Texte gespeichert; die Ladeansicht zeigt die betroffenen Stellen und bietet einen erneuten Versuch. Der zusätzliche Erstellen-Button im Editor entfällt.

Vorbereitete neue Texte aus `data.ts` werden nicht an das Modell geschickt. Der Adapter liest die Originalpfade der zugehörigen GitLab-Commits und die finalen Dateien aus `release/26.4`, dazu die vorhandene Doku und das Ticket. Die vorgeschlagenen Stellen und ihre Zuordnung zu den Features bleiben Demo-Daten. Weitere Projekte können den Generator mit dem unten beschriebenen eigenen JSON-Kontext verwenden; automatische Anbindung, Erkennung und Dashboard-Aufnahme fremder Features fehlen weiterhin.

## Einrichtung

Für `npm run dev` in `frontend/.env.local` setzen und Vite neu starten:

```dotenv
NEURALDOC_DRAFT_PROVIDER=vertex
GOOGLE_CLOUD_PROJECT=deine-projekt-id
GOOGLE_CLOUD_LOCATION=global
NEURALDOC_VERTEX_AUTH=api-key
NEURALDOC_VERTEX_MODE=express
VERTEX_API_KEY=hier-den-vorhandenen-vertex-key-eintragen
NEURALDOC_GEMINI_MODEL=gemini-2.5-flash-lite
```

Der Key kommt aus dem eigenen Google-Cloud-Projekt und muss Vertex AI aufrufen dürfen. Der Adapter verwendet den [Vertex-Express-Endpunkt](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/express-mode/api-reference) unter `aiplatform.googleapis.com`. Dort bestimmt der Key das Projekt für Abrechnung und Zugriff; die Projekt-ID im lokalen Kontext dokumentiert diese Zuordnung. Den Key nur in der ignorierten `frontend/.env.local` oder als Server-Umgebungsvariable ablegen.

Der Key wird nur im Node-Server gelesen. Niemals eine `VITE_` Variable für Zugangsdaten verwenden. Für den eigenständigen MCP-Server können die gleichen Werte aus einer lokalen Datei geladen werden:

```powershell
node --env-file=frontend/.env.local mcp/http.mjs
```

Voreinstellung für Vertex ist `gemini-2.5-flash-lite`, Thinking explizit aus (`thinkingBudget: 0`), höchstens 1.800 Ausgabetokens ; der Schreibkontext ist auf 40.000 Bytes begrenzt. Laut [Vertex-Preisliste](https://cloud.google.com/vertex-ai/generative-ai/pricing) kostet Text $0,10 je Million Eingabetokens und $0,40 je Million Ausgabetokens. Beispiel: 4.000 Eingabe- und 400 Ausgabetokens kosten ungefähr $0,00056. Das ist eine Rechnung. Der echte Einzeltest am 03.10.2026 für den Tourstopp-Text meldete 4.059 Eingabe- und 154 Ausgabetokens, entsprechend $0,0004675 nach diesen Listenpreisen. Thinking war ausgeschaltet. Der Test verwendete isolierten temporären Zustand und hat keine Dashboard-Entscheidung oder Dokumentquelle verändert.

Alternativ ist `gemini-3.5-flash-lite` mit minimalem Thinking freigeschaltet: global $0,30 Eingabe und $2,50 Ausgabe je Million Tokens, an nicht globalen Vertex-Endpunkten 10 % mehr. Es gibt keinen automatischen Fallback. Andere Modelle sind gesperrt. Preise sind Stand 03.10.2026; die zentralen Konstanten in `drafting.mjs` müssen bei Preisänderungen aktualisiert werden. Die Gemini Developer API bleibt nur bei explizitem `NEURALDOC_DRAFT_PROVIDER=gemini` und `GEMINI_API_KEY` nutzbar; Vertex-Anfragen übernehmen diesen Key nicht.

Erzeugte Texte werden mit ihrem Schreibkontext dauerhaft gespeichert. Bei unveränderten Quellen, Modell und Prompt wird exakt derselbe Text ohne Modellaufruf wiederverwendet, auch nach Neustarts und Deployments. Geänderte Belege ergeben einen neuen Cache-Schlüssel. Es gibt kein Tageslimit, keine Kostenreservierung und keinen zusätzlichen countTokens-Aufruf. Vom Modell gemeldete Tokens bleiben im Entwurf dokumentiert. Fehlerhafte oder unvollständige Antworten werden nicht gecacht; automatische Wiederholungen gibt es nicht.

Lokal liegen Cache und freigabefähige Texte im ignorierten Zustandsordner oder in `NEURALDOC_STATE_DIR`. In einem Container gehört dieser Ordner in ein dauerhaftes Volume. Identische Anfragen werden innerhalb eines Serverprozesses serialisiert. Browseranfragen müssen dieselbe Herkunft haben; externe Schreibkontexte benötigen den MCP-Token.

## Klarer Prompt und Prüfung

Der vollständige Systemprompt steht in [draft-prompt.mjs](draft-prompt.mjs). Er trennt Produktbelege von vorhandener Doku und Schreibauftrag. Ticketanforderungen dürfen ohne passenden Codebeleg nicht als umgesetzt beschrieben werden. Zahlen und Dialognamen dürfen nicht erfunden werden. Quelldaten sind keine Anweisungen an das Modell. Der Prompt übernimmt die gewünschte deutsche Schreibweise und die Zielgruppe des jeweiligen Dokuments.

Gemini liefert strukturiertes JSON. Der Server prüft Schema, referenzierte Beleg-IDs, Tabellenbreite, vorgegebene Überschriften und vollständige Antworten. Diese Prüfung bewertet Form und Verweise, keine allgemeine fachliche Wahrheit. Alle erzeugten Texte bekommen `Kurz prüfen`; sie werden aus der Demo-Trefferstatistik herausgenommen. Vorhandene Produktfragen bleiben offen. Eine Freigabe speichert den tatsächlich übernommenen Wortlaut. Bereits entschiedene Stellen werden nicht regeneriert. Eine Rückfrage oder ein Fehler lässt den bisherigen Text stehen.

Die Freigabe schreibt weiterhin nur ins lokale Entscheidungsprotokoll. Confluence-/SharePoint-Schreibzugriffe bleiben simuliert.

## MCP und eigener Schreibkontext

Normale `check_change`, `ask` und `ticket_context` Aufrufe starten keinen internen LLM-Aufruf. Ein ausdrücklicher Einzelauftrag zur Texterstellung kann über das bestehende Tool laufen:

```json
{"merge_request":"1287","draft_id":"p05"}
```

Der erzeugte Text bleibt anschließend im Dashboard prüfbar. `draft_id` ist nicht zusammen mit `answer` oder `source_id` verwendbar.

Projektneutraler Kontext für API oder CLI:

```json
{
  "change": {"id":"export-date", "title":"Exportdatum im Lagerbericht"},
  "document": {
    "id":"warehouse-manual", "title":"Lagerberichte",
    "type":"Nutzerhandbuch", "audience":"Lagerleitung", "section":"Export",
    "before":"Der Export verwendet das Tagesdatum.",
    "surrounding":"Klicken Sie auf Exportieren."
  },
  "target": {
    "id":"export-date-text", "op":"replace",
    "instruction":"Beschreibe das belegte Exportdatum."
  },
  "evidence": [{
    "id":"code:export", "source":"warehouse/export.ts (commit abcdef1)",
    "text":"const exportedAt = report.createdAt; return { exportedAt };"
  }]
}
```

```powershell
node --env-file=frontend/.env.local mcp/draft-cli.mjs kontext.json
```

HTTP: `POST /api/mcp/drafts/generate` mit `Authorization: Bearer <MCP-Token>` und JSON `{ "context": <Kontext> }`. Im Dashboard genügt `{ "id": "p05" }` aus derselben Herkunft. `GET /api/mcp/drafts` liefert nur passende erzeugte Texte für vorhandene Dashboard-Stellen. Eigene Kontexte werden als Entwürfe mit Belegverweisen und Kostenangaben zurückgegeben und lokal gecacht; sie werden nicht automatisch als neue Features in die Demo-Oberfläche übernommen.

## Verifikation

```powershell
node --test mcp/drafting.test.mjs mcp/impact.test.mjs mcp/prompts.test.mjs mcp/usage.test.mjs
```

Die automatischen Generator-Tests verwenden einen simulierten Google-Endpunkt. Sie prüfen fremde Schreibkontexte, Vertex- und Gemini-Anfrageformate, Trennung der Projekt-Caches, Modellkonfiguration, Cache, parallele Doppelanfragen, Persistenz ohne Tageslimit, fehlerhafte Antworten, Rückfragen, Originalpfade der Codebelege, dauerhafte Freigaben und Herkunftsprüfung. Sie messen keine reale Modellqualität. Zusätzlich wurde der oben beschriebene echte Vertex-Aufruf geprüft; ein einzelner plausibler Entwurf belegt keine allgemeine Textqualität.
