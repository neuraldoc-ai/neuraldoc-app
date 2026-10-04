# neuraldoc Dashboard

One dashboard, two modes:

- **Showcase**: prepared MOBIQ sample data (fictional). No keys, no model calls; decisions stay in the browser tab.
- **Your own project**: import a local Git repository and a documentation folder. Jev finds the affected documents, an LLM of your choice drafts the changes, you approve them and download the approved texts as a ZIP.

Both use the same interface. Without an imported project the dashboard starts in showcase mode. The user interface is in German.

## Quick start

Install Node.js 24 and Git. The MOBIQ sample data are Git submodules, so clone with `--recursive` (on Windows without line-ending conversion, otherwise code files differ from the dataset):

```powershell
git -c core.autocrlf=false clone --recursive https://github.com/neuraldoc-ai/neuraldoc-dashboard.git
# already cloned: git submodule update --init
```

In the `frontend` folder:

```powershell
npm ci
npm run dev            # showcase + import of your own projects
npm run dev:showcase   # showcase only, import disabled
```

Dashboard: http://localhost:5174/app/ · MCP: http://localhost:5174/mcp

For your own projects, set up keys once:

```powershell
Copy-Item .env.example .env.local   # macOS/Linux: cp .env.example .env.local
# Edit .env.local: set TYPESAFE_API_KEY (Jev) and one LLM provider, then restart.
```

## Check your own project

1. Overview → **Eigenes Projekt** (own project): enter the absolute path to the Git root folder and to the documentation folder. By default `HEAD~1` → `HEAD` is compared; other revisions can be set. The import is local and free.
2. **Mit Jev zuordnen** (map with Jev): Jev checks every document against the changed code files (paid; budget `NEURALDOC_JEV_BUDGET_USD`, default 0.25 USD).
3. **Starten** / **Formulieren** (start / draft): the LLM writes one draft per affected document from the diffs (paid). If evidence is missing, it asks a question instead.
4. Review, accept or reject. **Freigaben exportieren** (export approvals) downloads a ZIP with the approved documents and a `neuraldoc-export.json` (including the SHA-256 of each original).

neuraldoc changes neither the repository nor the documentation folder. Only committed files of the selected revision are read. Projects, decisions and caches are stored in `mcp/state/projects/` (or `NEURALDOC_STATE_DIR`) and ignored by Git.

**Limits of this version**

- Up to 250 code files (100 KB each), 40 documents (8,000 characters each), 100 commits, 8 MB of diffs. Documents: Markdown, MDX, text, RST, HTML (HTML is exported as text).
- AST analysis for Java, Kotlin, TypeScript/TSX, Pascal and SQL; other languages are imported as sources only. SQL relationships are limited.
- Jev sees at most six changed files per document, truncated to 3,500 characters. Further files are logged as omitted.
- A draft replaces the whole document; there is no section mapping. Drafts are written in German. There is no measured accuracy for your own projects.
- Jira, Confluence and SharePoint are not connected for your own projects.
- Meant for local use only: paths can be chosen freely and there is no user management. Write actions require the same origin or the MCP token; the demo token is no access protection for a public network.
- Concurrent runs are locked per server process, not across processes.

## Tests

`npm test` in the `frontend` folder runs all backend tests. Jev and the LLM are mocked (through the real clients and validators); nothing is billed. The project tests create a temporary Git repository. `npm run build` checks types and builds the interface.

## Production and Docker

Locally: `npm run build; npm run start` (port 8080, loads `.env.local`); showcase only: `npm run start:showcase`.

```powershell
docker build -t neuraldoc-dashboard .
# Showcase:
docker run -p 8080:8080 -e NEURALDOC_MODE=showcase neuraldoc-dashboard
# Your own project: keys at runtime, state in a volume, sources mounted read-only.
docker run -p 8080:8080 --env-file frontend/.env.local -v neuraldoc-data:/data -v C:\Projects\shop:/import/shop:ro -v C:\Projects\shop-docs:/import/docs:ro neuraldoc-dashboard
```

Inside the container, enter the paths `/import/shop` and `/import/docs` in the import dialog. Keys are never copied into the image. `VITE_LANDING_URL` sets the website link at build time.

## Architecture and LLM providers

The **Architektur** page explains the flow and, under **Lokal starten**, shows whether Jev and the LLM provider are configured (configuration only, no paid connection test). Jev (`TYPESAFE_API_KEY`) is required for your own projects and remains an external API even with a local LLM.

| Provider | NEURALDOC_DRAFT_PROVIDER | Key / server | Example model |
| --- | --- | --- | --- |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4.1-mini` |
| Claude | `anthropic` (alias `claude`) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` |
| Local | `local` | `NEURALDOC_LLM_BASE_URL`, optionally `NEURALDOC_LLM_API_KEY` | `qwen2.5:7b` |
| Gemini | `gemini` | `GEMINI_API_KEY` | `gemini-2.5-flash-lite` |
| Vertex AI | `vertex` | `VERTEX_API_KEY`, `GOOGLE_CLOUD_PROJECT`, location and mode | `gemini-2.5-flash-lite` |

`NEURALDOC_LLM_MODEL` selects the model. The existing Gemini setting `NEURALDOC_GEMINI_MODEL` still works. For Google, the Flash-Lite models remain enabled; for OpenAI/Claude the chosen model must support the JSON schema contract. Every response is additionally validated locally for the text operation and valid evidence references. Aborted, refused or invalid responses are never stored as drafts. There is no automatic provider fallback.

Local models use an OpenAI-compatible `/v1` URL, for example `http://127.0.0.1:11434/v1` (Ollama) or `http://127.0.0.1:1234/v1` (LM Studio). The model must be loaded on that server first. If JSON schema is not supported, set `NEURALDOC_LLM_FORMAT=json_object` explicitly. Model quality and output reliability need to be checked separately with your own sources.

API contracts: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility).

Set keys only in `.env.local` or server environment variables, never with a `VITE_` prefix. The status API `/api/mcp/setup` only reports whether keys are present. Restart the Node server after configuration changes. Provider, model and local endpoint determine the cache identity; keys are never stored in draft caches.

Costs of new cloud providers stay unknown without configured rates. Optionally set `NEURALDOC_LLM_INPUT_USD_PER_MILLION` and `NEURALDOC_LLM_OUTPUT_USD_PER_MILLION`. For a local LLM only API fees are reported (0 USD); power and hardware costs are not included.

## MOBIQ dataset

The showcase uses the fictional evaluation dataset MOBIQ from four repositories, included under `datasets/`:

| Submodule | Contents |
| --- | --- |
| [`mobiq`](https://github.com/neuraldoc-ai/mobiq) | Generator, GitLab and Jira API responses, solution (`ground-truth.json`) |
| [`mobiq-code`](https://github.com/neuraldoc-ai/mobiq-code) | The code repository with branches, merges and a tag (pinned to the dataset state `df9f414` on `release/26.4`) |
| [`mobiq-docs`](https://github.com/neuraldoc-ai/mobiq-docs) | Confluence pages and SharePoint files |
| [`mobiq-db`](https://github.com/neuraldoc-ai/mobiq-db) | PostgreSQL scripts and `docker compose` |

Code reads the data in the original layout (`gitlab/…`, `repo/…`, `postgres/…`); `mcp/dataset.mjs` and `vite.config.ts` map it to the repositories. To regenerate, run `node generate.mjs && node publish.mjs` in the `mobiq` repository.

## Maintaining the MOBIQ showcase

The Company Brain indexes Java, Kotlin, TypeScript/TSX and Pascal with Tree-sitter and SQL with the PostgreSQL parser. Java calls are resolved in the snapshot by package, import and receiver type; TypeScript uses the compiler's symbol resolution. Missing or ambiguous targets stay open. Business module assignments are marked separately as derived.

Jev adds the remaining business assignments and rates document–code pairs for documentation impact. An old document can match changed code even though the behaviour it describes is outdated. Model links are shown as derived in the graph; their origin and uncertain suggestions are listed in the details.

In the `frontend` folder: `npm run brain:index` builds the graph offline. `npm run brain:map` explicitly calls Jev; unchanged requests come from the local cache. The server-side key is `TYPESAFE_API_KEY` in `frontend/.env.local`, without a `VITE_` prefix. Default budget: 0.25 USD per mapping run, configurable with `NEURALDOC_JEV_BUDGET_USD` (at most 1 USD). Caches and raw reports in `mcp/state/` are ignored; stale results are not loaded when the input changes. Without matching local results the graph remains technically usable.

`npm run brain:test` tests without model costs. `npm run brain:evaluate` checks 13 manually labelled pairs with Jev. `npm run brain:report` writes the [test report](MAPPING_REPORT.md). The [TypeSafe API](https://docs.typesafe.ai/api) is used with the pinned model `jev-1.13.0`. Normal page views and frontend builds never cause model costs.

## License

MIT, see [LICENSE](LICENSE). The interface is based on an MIT-licensed template; its notice is in [frontend/LICENSE-DASHBOARD](frontend/LICENSE-DASHBOARD).
