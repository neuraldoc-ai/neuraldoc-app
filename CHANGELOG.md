# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Docker image with healthcheck, non-root user and volume `/data`; start with `docker build -t neuraldoc .` and `docker run`.
- Import of your own projects in the browser: drag and drop a folder or ZIP, or paste a GitHub URL. Documentation is optional; without it, READMEs, `docs/` and PDF/Office files in the repository are checked.
- PDF, Word, Excel and PowerPoint documents; long documents are split into sections.
- Initial check: every documentation section against the current code, as if the last release had just shipped. Confident contradictions become proposals.
- Drafts can answer "no change needed". Corrections that drop most of a section or paste source code are rejected.
- Initial check also reports omissions (code behaviour the documentation does not mention).
- Container logs for start, configuration, imports, checks, drafts and every error (`docker logs`).
- Keys and model in the app (Einstellungen): Jev, OpenAI, Claude, Gemini, Vertex AI or a local LLM. Stored in `/data/settings.json`, applied without a restart, never returned to the browser; `--env-file` still works as a fallback.
- Einstellungen page in the sidebar: profile (name, company, role) shown in the sidebar and on approvals, keys and model, GitHub token for private repositories.
- Each installation gets its own random MCP token; only the public showcase keeps the demo token.
- Sidebar links to the GitHub repository unless `VITE_LANDING_URL` is set. The overview leads to the settings when the Jev key is missing.
- The app starts empty and contains no sample data; a start screen offers your own project or **Beispielprojekt laden**, which clones `mobiq-code` and `mobiq-docs` from GitHub and imports them like any project. The app image builds without submodules.
- The prepared MOBIQ showcase is its own image: `docker build --target showcase`.
- Confluence pages in storage format (`.xml`) are read as documentation.
- Einstellungen → Zurücksetzen: delete all projects, or everything including profile and keys.
- CI for tests, build, lint and a Docker smoke test.
- `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, guides under `docs/`.
- Git history for repositories imported by URL: commits since the last tag are grouped into features (merge requests, ticket keys). Overview, Änderungen and the change page look like the showcase for your own project: features with kind, commits, affected doc types and proposals; findings no commit explains are listed as „Weitere Abweichungen“.
- Daten for your own project: code editor with history, merge requests and diffs; documents as neuraldoc read them (Markdown rendered); the repository's SQL files as a read-only database in the browser.
- Tables in Confluence pages, HTML, Word and Excel are imported as Markdown tables (before: one cell per line) and shown as tables in the editor. Re-import a project to get them.
- Own PostgreSQL connections (Daten → Datenbank verbinden): local or remote, single fields or a connection URL, SSL modes, schema, connection test. Read-only transactions, 15 s and 1,000 rows per query; the password never leaves the server.
- Evaluation of the initial check in `mcp/eval`: MOBIQ plus three open-source benchmarks from real project history (httpx, zx, cobra), item-level scoring, a calibrated LLM judge for drafts, cost and time per variant.

- Change view for your own project: the section reads as it will read, only the words that change are marked (one line instead of an old and a new line under each other), every change is numbered and explained below with the code that shows it; single changes can be unticked before accepting. Documents render as Markdown (lists, tables, code blocks, links, badges, notes).
- The initial check runs in the background with a progress display; `GET /api/mcp/project/check` reports phase and progress.
- Evaluation benchmarks for a README-only library (chalk), a long README (ky), a separate documentation repository (axios-docs) and a Django app with database (linkding); planted outdated statements per benchmark (`mutations`).
- MCP `check_change` lists every change of a proposal with its reason and evidence.

### Changed

- The initial check finds and corrects in one step per section: your LLM lists contradicted statements, removed names and missing list entries, each with a quote from the section and the code, a reason and its line edits; the server keeps only what it can verify; a second look drops context mistakes; Jev confirms each finding and every deletion. A completeness pass per document adds options, settings or fields the code defines and no document mentions. Default thinking level medium for `gemini-3.5-flash-lite`.
- Documents are split into one section per heading (code blocks are never cut); sections without prose are not checked. A document is one page in the editor.
- Corrections keep list markers, blank-line structure and code formatting of the original; replacements are cut down to the lines that change; whitespace-only changes are dropped.
- Makefile, Dockerfile, shell scripts and `.env.example` count as code.
- Model answers of the check are cached by content in `check-cache/`, shared by all projects.
- Drafts for your own project are line edits on the numbered section with quoted findings. A draft needs at least one finding whose quotes appear in the section and in a code excerpt; untouched lines cannot be lost, and a draft that switches the section's language (German/English) is rejected.
- Default Gemini model for drafts is `gemini-3.5-flash-lite` (fewest false statements in the evaluation, about 0.002 USD per draft).
- The initial check passes at most one excerpt from tests or build scripts per section to Jev, retries a malformed Jev answer once and then skips only that section instead of failing the whole check.

- Repository renamed from `neuraldoc-dashboard` to `neuraldoc-app`.
- README rewritten around the Docker start.
- The import no longer takes local paths, Git revisions or component JSON, and no longer compares two commits.

## [0.1.0] - 2026-10-04

### Added

- One interface with two modes: the MOBIQ showcase and the import of your own Git repository and documentation.
- Company Brain: code graph for Java, Kotlin, TypeScript/TSX, Pascal and SQL.
- Document mapping with Jev, drafting with OpenAI, Claude, Gemini, Vertex AI or a local LLM, review and ZIP export.
- MCP server with `ticket_context`, `ask` and `check_change`.
