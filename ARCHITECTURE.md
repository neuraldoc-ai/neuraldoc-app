# Architecture

neuraldoc is one Node.js process. It serves the React interface, a small REST API and an MCP endpoint, and keeps its state in a folder on disk. There is no database server and no background worker.

```
                    ┌──────────────────────────── container ─────────────────────────────┐
 browser ──/app/──► │  frontend/dist        React + TanStack Router + shadcn/ui           │
                    │                                                                     │
 browser ─/api/mcp► │  mcp/serve.mjs ──► mcp/handler.mjs ──► projects.mjs  (own project)  │
 agent ────/mcp───► │                                    └─► core.mjs      (showcase)     │
                    │                                                                     │
                    │  /data  projects, decisions, draft and Jev caches                   │
                    └──────────────┬──────────────────────────────┬───────────────────────┘
                                   │ read-only                    │ HTTPS, only on request
                              /projects (your Git repo + docs)    Jev, LLM provider
```

## Two modes, one interface

| Mode | Data | Model calls |
|---|---|---|
| **Showcase** | The fictional MOBIQ dataset from `datasets/` | none; prepared drafts are shown |
| **Own project** | An imported Git comparison plus a documentation folder | Jev for mapping, your LLM for drafting, both only on explicit click |

Without an active project the app shows the showcase. `NEURALDOC_MODE=showcase` locks it there and disables the import. Both modes use the same pages and components: [`features/docs/data.ts`](frontend/src/dashboard/features/docs/data.ts) exports the active dataset, and [`project.ts`](frontend/src/dashboard/features/docs/project.ts) installs an imported project before the first render. The interface never branches into a second copy of a page.

## Pipeline for your own project

1. **Import** ([`mcp/project-import.mjs`](mcp/project-import.mjs)). Verifies two Git revisions, reads only committed files with `git show`, collects the diffs and the documents. Secret-like file names, `.env`, `.git`, `node_modules`, build folders and symlinks are skipped. Limits are enforced here (250 code files, 40 documents, 8 MB of diffs).
2. **Code graph** ([`mcp/code-analysis.mjs`](mcp/code-analysis.mjs)). Tree-sitter (WASM) for Java, Kotlin, TypeScript/TSX and Pascal, the TypeScript compiler for symbol resolution, `pgsql-parser` for SQL. Unresolved or dynamic calls stay open instead of being guessed.
3. **Mapping** ([`mcp/semantic-mapping.mjs`](mcp/semantic-mapping.mjs), [`mcp/projects.mjs`](mcp/projects.mjs)). For each document, BM25 picks up to six changed files; Jev classifies the pair. A link is accepted only above probability 0.9 and confidence 0.8. Requests are fingerprinted and cached; a budget check runs before every call.
4. **Drafting** ([`mcp/drafting.mjs`](mcp/drafting.mjs), [`mcp/llm-providers.mjs`](mcp/llm-providers.mjs), [`mcp/draft-prompt.mjs`](mcp/draft-prompt.mjs)). Builds a writing context of at most 40 KB (diffs first), calls the configured provider and validates the JSON response and its evidence references. Invalid or incomplete responses are never stored. See [mcp/DRAFTING.md](mcp/DRAFTING.md).
5. **Review and export**. Decisions are stored per project. Approval requires a generated draft. The export is a ZIP with the approved documents and `neuraldoc-export.json` including the SHA-256 of each original.

## Showcase

[`mcp/core.mjs`](mcp/core.mjs), [`mcp/sources.mjs`](mcp/sources.mjs) and [`mcp/impact.mjs`](mcp/impact.mjs) read GitLab, Jira, Confluence, SharePoint and PostgreSQL data of the MOBIQ dataset and answer the three MCP tools from it. Prepared proposals come from [`showcase-data.ts`](frontend/src/dashboard/features/docs/showcase-data.ts), which Node 24 loads directly as TypeScript. The ground truth in `datasets/mobiq` is used only by tests, never by the MCP. Details: [docs/mobiq-showcase.md](docs/mobiq-showcase.md).

## HTTP surface

| Path | Purpose |
|---|---|
| `/app/*` | The interface (single-page app) |
| `/mcp` | MCP over JSON-RPC 2.0, Streamable HTTP with JSON responses |
| `/api/mcp/project`, `/import`, `/activate`, `/map`, `/export`, `/commit` | Own projects |
| `/api/mcp/drafts`, `/decisions`, `/changes/:id`, `/usage`, `/activity`, `/setup` | Drafts, decisions, statistics, configuration status |
| `/health/live` | Liveness probe used by the Docker healthcheck |

Write requests must come from the same origin or carry the MCP token. The server is meant for local use: there is no user management and the demo token is no protection on a public network.

## State

Everything lives below `NEURALDOC_STATE_DIR` (`/data` in Docker, `mcp/state/` otherwise): `projects/<id>/project.json`, `active.json`, decisions, write-back and MCP logs, and the Jev and draft caches. Deleting the folder resets the app. Busy locks for import, mapping and drafting are per process.

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
