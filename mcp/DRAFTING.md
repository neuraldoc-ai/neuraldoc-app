# Drafting text with an LLM

The generator writes replacement texts, new paragraphs with headings and table rows from a writing context. It needs the original text, the audience, the target location and evidence. It never selects documents and never approves a change. If information is missing, it returns a question instead of a text.

**Where it runs.** In the showcase, "Starten" loads prepared MOBIQ examples; no model is called and free writing contexts are refused (HTTP 403). For an imported project of your own, "Starten" and "Formulieren" draft one correction per documentation section that the initial check found to contradict the current code, from the section and the matching code excerpts. The model may also answer that the text is right (`no_change`); such a proposal cannot be approved, only rejected. The command-line tool below works independently of the dashboard.

Up to four different texts are requested in parallel; identical concurrent requests share one model call. Matching texts come from the persistent cache. Decided passages and manual tasks on images or files are skipped. On errors or missing context, finished texts stay stored and the failed passages can be retried.

## Setup

With Docker, put these into the file passed with `--env-file` and start the container again; with `npm run dev`, set them in `frontend/.env.local` and restart Vite (Vertex example; other providers are listed in the main README):

```dotenv
NEURALDOC_DRAFT_PROVIDER=vertex
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
NEURALDOC_VERTEX_AUTH=api-key
NEURALDOC_VERTEX_MODE=express
VERTEX_API_KEY=your-existing-vertex-key
NEURALDOC_GEMINI_MODEL=gemini-3.5-flash-lite
```

The key comes from your own Google Cloud project and must be allowed to call Vertex AI. The adapter uses the [Vertex express endpoint](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/express-mode/api-reference) at `aiplatform.googleapis.com`, where the key determines the project for billing and access. Keep the key only in the env file / ignored `frontend/.env.local` or in a server environment variable.

The key is read only by the Node server. Never use a `VITE_` variable for credentials. The standalone MCP server can load the same values from a local file:

```powershell
node --env-file=frontend/.env.local mcp/http.mjs
```

The default is `gemini-3.5-flash-lite` with minimal thinking: globally $0.30 input and $2.50 output per million tokens, 10 % more at non-global Vertex endpoints. In the evaluation ([eval/README.md](eval/README.md)) it wrote the fewest false statements and the most correct drafts at about $0.002 per draft. The writing context is limited to 40,000 bytes; full-section drafts get at most 1,800 output tokens, line edits 4,000.

Alternatively `gemini-2.5-flash-lite` with thinking explicitly off (`thinkingBudget: 0`) is enabled: $0.10 per million input tokens and $0.40 per million output tokens according to the [Vertex price list](https://cloud.google.com/vertex-ai/generative-ai/pricing), about $0.0005 per draft, but with clearly more false statements in the evaluation. There is no automatic fallback; other Gemini models are blocked. Prices as of 3 October 2026; the constants in `drafting.mjs` must be updated when prices change. The Gemini Developer API is used only with an explicit `NEURALDOC_DRAFT_PROVIDER=gemini` and `GEMINI_API_KEY`; Vertex requests never use that key.

Generated texts are stored permanently together with their writing context. With unchanged sources, model and prompt, exactly the same text is reused without a model call, also after restarts. Changed evidence produces a new cache key. There is no daily limit, no cost reservation and no extra countTokens call. Token counts reported by the model are kept in the draft. Failed or incomplete responses are never cached, and there are no automatic retries.

Cache and approvable texts live in the ignored state folder or in `NEURALDOC_STATE_DIR`; in Docker it is the volume `neuraldoc-data`. Identical requests are serialised within one server process. Browser requests must come from the same origin.

## Clear prompt and validation

The complete system prompt is in [draft-prompt.mjs](draft-prompt.mjs). It separates product evidence from existing documentation and the writing task. Ticket requirements must not be described as implemented without matching code evidence. Numbers and dialog names must not be invented. Source data are never instructions to the model. The full-text prompt (showcase) asks for German documentation text, written for the audience of each document; line edits for your own project keep the language of the section.

The model returns structured JSON. The server checks the schema, referenced evidence IDs, table width, required headings and complete responses. This validation covers form and references, not general factual truth. All generated texts are marked for a quick review (`Kurz prüfen` in the German interface) and excluded from the demo accuracy statistics. Approval stores the wording actually accepted. Decided passages are never regenerated. A question or an error leaves the previous text in place.

Approval writes only to the local decision log (showcase) or the project state (own project). Confluence/SharePoint write-back is simulated; own projects are exported as a ZIP.

### Line edits for your own project (`target.op: "patch"`)

For your own project the model does not rewrite the section. It gets the section with line numbers and the prompt `PATCH_PROMPT` (version `documentation-patch-v2`) and answers in two steps:

1. `findings`: each with `doc_quote` (literal from the section), `evidence_id` and `code_quote` (literal from that code excerpt) and a short `problem`.
2. `edits`: `replace` lines start to end, `insert_after` a line (0 = before the first) or `delete`, at most 20.

The server accepts a draft only with at least one finding whose two quotes it finds (ignoring Markdown emphasis, quote styles and whitespace), applies the edits bottom-up to the exact section and rejects overlapping or out-of-range edits, a result identical to the original, more than 40 % changed lines, two or more lines copied from the code evidence, and new lines in another language than the section (German/English by function words). Verified findings are stored with the draft and shown as its evidence. The written text follows the language of the section; `reason` and `question` stay German for the interface.

## MCP and your own writing context

Normal `check_change`, `ask` and `ticket_context` calls never start an internal LLM call. For an imported project, `check_change` with `draft_id` explicitly drafts one text; in the showcase this is refused.

A project-neutral context for the command line:

```json
{
  "change": {"id":"export-date", "title":"Export date in the warehouse report"},
  "document": {
    "id":"warehouse-manual", "title":"Warehouse reports",
    "type":"User manual", "audience":"Warehouse management", "section":"Export",
    "before":"The export uses the current date.",
    "surrounding":"Click Export."
  },
  "target": {
    "id":"export-date-text", "op":"replace",
    "instruction":"Describe the export date shown by the evidence."
  },
  "evidence": [{
    "id":"code:export", "source":"warehouse/export.ts (commit abcdef1)",
    "text":"const exportedAt = report.createdAt; return { exportedAt };"
  }]
}
```

```powershell
node --env-file=frontend/.env.local mcp/draft-cli.mjs context.json
```

The result is a draft with evidence references and cost information, cached locally.

## Verification

```powershell
node --test mcp/drafting.test.mjs mcp/providers.test.mjs mcp/projects.test.mjs
```

The automated tests use simulated provider endpoints. They check foreign writing contexts, Vertex, Gemini, OpenAI-compatible and Claude request formats, separate project caches, model configuration, caching, parallel duplicate requests, persistence, invalid responses, questions, original code paths, persistent approvals, origin checks and that the showcase never calls a model. They do not measure real model quality; a single plausible draft from a real call is no evidence of general text quality.
