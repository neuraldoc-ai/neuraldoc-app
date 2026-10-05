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

## Two images, one interface

| Image | Data | Model calls |
|---|---|---|
| **App** (`docker build .`, default target) | Empty until you import an uploaded or cloned repository, optionally with separate documents. **Beispielprojekt laden** clones the MOBIQ sample ([mobiq-code](https://github.com/neuraldoc-ai/mobiq-code), [mobiq-docs](https://github.com/neuraldoc-ai/mobiq-docs)) like any other project. | Jev for the initial check, your LLM for drafting, both only on explicit click |
| **Showcase** (`--target showcase`, `NEURALDOC_MODE=showcase`) | The prepared MOBIQ example from the `datasets/` submodules | none; prepared drafts are shown, import is off |

The app image contains no sample data: without `datasets/`, [`vite.config.ts`](frontend/vite.config.ts) builds everything that belongs to the showcase from an empty stand-in, and the server loads the showcase modules (`core.mjs` and friends) only in showcase mode. Both use the same pages and components: [`features/docs/data.ts`](frontend/src/dashboard/features/docs/data.ts) exports the active dataset (empty, an imported project, or the showcase fixtures loaded as a separate chunk), and [`main.tsx`](frontend/src/dashboard/main.tsx) installs it before the pages load. Before the first import every data page shows the start screen ([`empty-start.tsx`](frontend/src/dashboard/features/docs/empty-start.tsx)). The interface never branches into a second copy of a page.

## Pipeline for your own project

1. **Upload** ([`upload.ts`](frontend/src/dashboard/features/docs/upload.ts), [`mcp/project-upload.mjs`](mcp/project-upload.mjs)). The browser reads a dropped or picked folder or ZIP, filters it with the shared rules in [`import-rules.mjs`](frontend/src/dashboard/features/docs/import-rules.mjs) (code and documents only; no `node_modules`, build output, lock files or secrets) and sends one ZIP: `repo/…`, `docs/…` and a manifest. A GitHub URL in the manifest is cloned on the server with `git clone --depth 300` over https only. Extraction rejects path traversal and oversized archives.
2. **Import** ([`mcp/project-import.mjs`](mcp/project-import.mjs), [`mcp/doc-text.mjs`](mcp/doc-text.mjs)). Classifies files again on the server. Without a documentation upload, READMEs, `docs/` folders and PDF/Office files in the repository count as documentation; licences, changelogs, templates and test fixtures do not. PDF (pdf.js), Word, Excel and PowerPoint (their XML) and Confluence pages in storage format become text. Documents are split at headings into sections of at most 6,000 characters; each section is an exact slice of the original, so the export can put approved text back. A cloned repository's history ([`mcp/git-history.mjs`](mcp/git-history.mjs)) is read from the newest tag on (without a tag: 90 days): commits, merge requests parsed from GitLab and GitHub merge messages, and every commit's diff (stored next to the project in `diffs.json`, the clone is deleted). Merges on the main line become features with the commits their branch brought in; other commits are grouped by ticket key; features that change no code are left out. Each commit gets a kind of change from its files (tests, fix, rename, database, parameter, UI, process), which decides the feature's nature.
3. **Code graph** ([`mcp/code-analysis.mjs`](mcp/code-analysis.mjs)). Tree-sitter (WASM) for Java, Kotlin, TypeScript/TSX and Pascal, the TypeScript compiler for symbol resolution, `pgsql-parser` for SQL. Unresolved or dynamic calls stay open instead of being guessed.
4. **Initial check** ([`mcp/projects.mjs`](mcp/projects.mjs), [`mcp/retrieval.mjs`](mcp/retrieval.mjs), [`mcp/semantic-mapping.mjs`](mcp/semantic-mapping.mjs)). The code is cut into excerpts of about 60 lines. For each section, BM25 picks up to six excerpts, at most two per file and at most one from tests or build scripts (they crowd out product code). Jev rates each pair as *contradicts*, *incomplete* (the code does something the section should mention), *consistent*, *unrelated* or *insufficient*. A verdict counts when it is the most likely one with at least 0.6 probability and 0.5 confidence; on real documents Jev rarely goes above 0.8, and a false hit costs one draft that usually answers "no change". Every section with a contradiction or omission becomes a proposal. Requests are fingerprinted and cached; a budget check runs before every call. A malformed Jev answer is retried once, then only that section is skipped. An identifier index, code-graph expansion and a second model check with quoted findings were measured and did not do better ([mcp/eval/README.md](mcp/eval/README.md)).
5. **Drafting** ([`mcp/drafting.mjs`](mcp/drafting.mjs), [`mcp/llm-providers.mjs`](mcp/llm-providers.mjs), [`mcp/draft-prompt.mjs`](mcp/draft-prompt.mjs)). Builds a writing context of at most 40 KB (the excerpts Jev found contradicting first, labelled with the verdict) and sends the section with line numbers. The model first lists findings, each with a literal quote from the section and from a code excerpt, then line edits (replace, insert after, delete) that fix exactly those. The server checks every quote, applies the edits to the exact section and rejects a draft without a verified finding, with overlapping or out-of-range edits, that changes more than 40 % of the lines, pastes source code from the evidence or switches between German and English. The model may also answer `needs_context` (a question) or `no_change` (the text is right). Invalid or incomplete responses are never stored. The showcase keeps the full-text format. See [mcp/DRAFTING.md](mcp/DRAFTING.md).
   [`mcp/project-features.mjs`](mcp/project-features.mjs) turns the features into the same changes the showcase has. A proposal belongs to the feature whose changed files overlap most with the code excerpts its section contradicts (the newest on a tie); findings no commit since the last release explains stay in „Weitere Abweichungen“. This is derived when the project is read, so a later check needs no re-import.
6. **Review and export**. Decisions are stored per project. Approval requires a generated draft. The export merges approved sections into their documents (PDF, Office and HTML as Markdown) and adds `neuraldoc-export.json` with the SHA-256 of each original.

## Showcase

[`mcp/core.mjs`](mcp/core.mjs), [`mcp/sources.mjs`](mcp/sources.mjs) and [`mcp/impact.mjs`](mcp/impact.mjs) read GitLab, Jira, Confluence, SharePoint and PostgreSQL data of the MOBIQ dataset and answer the three MCP tools from it. Prepared proposals come from [`showcase-data.ts`](frontend/src/dashboard/features/docs/showcase-data.ts), which Node 24 loads directly as TypeScript; [`mcp/showcase-init.mjs`](mcp/showcase-init.mjs) installs it into `data.ts` before these modules run. Words shared by both images (document types, change kinds) are in [`vocabulary.ts`](frontend/src/dashboard/features/docs/vocabulary.ts). The ground truth in `datasets/mobiq` is used only by tests, never by the MCP. Details: [docs/mobiq-showcase.md](docs/mobiq-showcase.md).

## HTTP surface

| Path | Purpose |
|---|---|
| `/app/*` | The interface (single-page app) |
| `/mcp` | MCP over JSON-RPC 2.0, Streamable HTTP with JSON responses |
| `/api/mcp/project`, `/import` (ZIP body), `/activate`, `/check`, `/export` | Own projects |
| `/api/mcp/project/source`, `/commit?sha=`, `/documents` | Repository with history, one commit's diffs and the full documents for the Daten page |
| `/api/mcp/db/connections`, `/connections/delete`, `/test`, `/query` | Own PostgreSQL connections ([`mcp/db-connections.mjs`](mcp/db-connections.mjs)): stored without returning the password, every query in a read-only transaction over the extended protocol (one statement), 15 s and 1,000 rows |
| `/api/mcp/drafts`, `/decisions`, `/changes/:id`, `/usage`, `/activity`, `/setup` | Drafts, decisions, statistics, configuration status |
| `/health/live` | Liveness probe used by the Docker healthcheck |

Write requests must come from the same origin or carry the MCP token. The server is meant for local use: there is no user management and the demo token is no protection on a public network.

## State

Everything lives below `NEURALDOC_STATE_DIR` (`/data` in Docker, `mcp/state/` otherwise): `projects/<id>/project.json` with code, document texts, sections and Git history (`diffs.json` next to it), `active.json`, `connections.json` (mode 600), decisions, MCP logs, and the Jev and draft caches. Uploads are unpacked into a temporary folder there and deleted right after the import. Deleting the folder resets the app. Busy locks for import, check and drafting are per process.

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
