# Architecture

neuraldoc is one Node.js process. It serves the React interface, a small REST API and an MCP endpoint, and keeps its state in a folder on disk. There is no database server and no background worker.

```
                    ┌──────────────────────────── container ──────────────────────────────┐
 browser ──/app/──► │  frontend/dist        React + TanStack Router + shadcn/ui           │
                    │                                                                     │
 browser ─/api/mcp► │  mcp/serve.mjs ──► mcp/handler.mjs ──► projects.mjs  (own project)  │
 agent ────/mcp───► │                                    └─► core.mjs      (showcase)     │
                    │                                                                     │
                    │  /data  projects, decisions, draft and Jev caches                   │
                    └──────────────────────────────────┬──────────────────────────────────┘
                                                       │ HTTPS, only on request
                                          Jev, LLM provider, GitHub (clone by URL)
```

## Two modes, one interface

| Mode | Data | Model calls |
|---|---|---|
| **Showcase** | The fictional MOBIQ dataset from `datasets/` | none; prepared drafts are shown |
| **Own project** | An uploaded or cloned repository, optionally with separate documents | Jev for the initial check, your LLM for drafting, both only on explicit click |

Without an active project the app shows the showcase. `NEURALDOC_MODE=showcase` locks it there and disables the import. Both modes use the same pages and components: [`features/docs/data.ts`](frontend/src/dashboard/features/docs/data.ts) exports the active dataset, and [`project.ts`](frontend/src/dashboard/features/docs/project.ts) installs an imported project before the first render. The interface never branches into a second copy of a page.

## Pipeline for your own project

1. **Upload** ([`upload.ts`](frontend/src/dashboard/features/docs/upload.ts), [`mcp/project-upload.mjs`](mcp/project-upload.mjs)). The browser reads a dropped or picked folder or ZIP, filters it with the shared rules in [`import-rules.mjs`](frontend/src/dashboard/features/docs/import-rules.mjs) (code and documents only; no `node_modules`, build output, lock files or secrets) and sends one ZIP: `repo/…`, `docs/…` and a manifest. A GitHub URL in the manifest is cloned on the server with `git clone --depth 1` over https only. Extraction rejects path traversal and oversized archives.
2. **Import** ([`mcp/project-import.mjs`](mcp/project-import.mjs), [`mcp/doc-text.mjs`](mcp/doc-text.mjs)). Classifies files again on the server. Without a documentation upload, READMEs, `docs/` folders and PDF/Office files in the repository count as documentation; licences, changelogs, templates and test fixtures do not. PDF (pdf.js), Word, Excel and PowerPoint (their XML) become text. Documents are split at headings into sections of at most 6,000 characters; each section is an exact slice of the original, so the export can put approved text back.
3. **Code graph** ([`mcp/code-analysis.mjs`](mcp/code-analysis.mjs)). Tree-sitter (WASM) for Java, Kotlin, TypeScript/TSX and Pascal, the TypeScript compiler for symbol resolution, `pgsql-parser` for SQL. Unresolved or dynamic calls stay open instead of being guessed.
4. **Initial check** ([`mcp/projects.mjs`](mcp/projects.mjs), [`mcp/semantic-mapping.mjs`](mcp/semantic-mapping.mjs)). The code is cut into excerpts of about 60 lines. For each section, BM25 picks up to six excerpts (at most two per file); Jev rates each pair as *contradicts*, *incomplete* (the code does something the section should mention), *consistent*, *unrelated* or *insufficient*. A verdict counts when it is the most likely one with at least 0.6 probability and 0.5 confidence; on real documents Jev rarely goes above 0.8, and a false hit only costs one draft that may answer "no change". Every section with a contradiction or omission becomes a proposal. Requests are fingerprinted and cached; a budget check runs before every call.
5. **Drafting** ([`mcp/drafting.mjs`](mcp/drafting.mjs), [`mcp/llm-providers.mjs`](mcp/llm-providers.mjs), [`mcp/draft-prompt.mjs`](mcp/draft-prompt.mjs)). Builds a writing context of at most 40 KB (contradicting excerpts first), calls the configured provider and validates the JSON response and its evidence references. The model may answer `draft`, `needs_context` (a question) or `no_change` (the text is right). A correction must keep at least 60 % of the section's lines unchanged and may not paste source code from the evidence; otherwise it is rejected. Invalid or incomplete responses are never stored. See [mcp/DRAFTING.md](mcp/DRAFTING.md).
6. **Review and export**. Decisions are stored per project. Approval requires a generated draft. The export merges approved sections into their documents (PDF, Office and HTML as Markdown) and adds `neuraldoc-export.json` with the SHA-256 of each original.

## Showcase

[`mcp/core.mjs`](mcp/core.mjs), [`mcp/sources.mjs`](mcp/sources.mjs) and [`mcp/impact.mjs`](mcp/impact.mjs) read GitLab, Jira, Confluence, SharePoint and PostgreSQL data of the MOBIQ dataset and answer the three MCP tools from it. Prepared proposals come from [`showcase-data.ts`](frontend/src/dashboard/features/docs/showcase-data.ts), which Node 24 loads directly as TypeScript. The ground truth in `datasets/mobiq` is used only by tests, never by the MCP. Details: [docs/mobiq-showcase.md](docs/mobiq-showcase.md).

## HTTP surface

| Path | Purpose |
|---|---|
| `/app/*` | The interface (single-page app) |
| `/mcp` | MCP over JSON-RPC 2.0, Streamable HTTP with JSON responses |
| `/api/mcp/project`, `/import` (ZIP body), `/activate`, `/check`, `/export` | Own projects |
| `/api/mcp/drafts`, `/decisions`, `/changes/:id`, `/usage`, `/activity`, `/setup` | Drafts, decisions, statistics, configuration status |
| `/health/live` | Liveness probe used by the Docker healthcheck |

Write requests must come from the same origin or carry the MCP token. The server is meant for local use: there is no user management and the demo token is no protection on a public network.

## State

Everything lives below `NEURALDOC_STATE_DIR` (`/data` in Docker, `mcp/state/` otherwise): `projects/<id>/project.json` with code, document texts and sections, `active.json`, decisions, MCP logs, and the Jev and draft caches. Uploads are unpacked into a temporary folder there and deleted right after the import. Deleting the folder resets the app. Busy locks for import, check and drafting are per process.

## Logging

[`mcp/log.mjs`](mcp/log.mjs) writes one line per event to stdout/stderr, so `docker logs` and Docker Desktop show it: start and configuration (Jev key and LLM provider present or missing), uploads and clones, import results, check progress and costs, drafts, every write request and every failed request with its cause. Programming errors are logged with their stack. Keys, document text and code never appear in the log.

## Repository layout

```
├── Dockerfile               two-stage build: interface on the build platform, slim runtime with Git
├── frontend/                React app, Vite config, npm scripts
│   └── src/dashboard/
│       ├── features/docs/   overview, changes, editor, evidence, MCP page, project import
│       ├── features/docs/brain/   Company Brain graph (React Flow)
│       ├── features/architecture/ architecture and local-start page
│       └── components/ui/   shadcn/ui components
├── mcp/                     Node server: HTTP, MCP, import, mapping, drafting, tests (*.test.mjs)
├── datasets/                MOBIQ submodules (showcase data)
└── docs/                    guides and README images
```

## Adding a language

Code analysis is in [`mcp/code-analysis.mjs`](mcp/code-analysis.mjs). A new language needs a tree-sitter WASM grammar (the project uses `@lumis-sh/wasm-*` packages), the queries for functions and calls, and the file extension in the importer's `CODE` pattern. Add a fixture to [`mcp/code-analysis.test.mjs`](mcp/code-analysis.test.mjs). Without call resolution, files of that language are still imported as sources.
