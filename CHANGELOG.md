# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- One pull request per change, named after the change and its ticket. The list of changes shows each change's pull request; the change page shows its state, what is missing and the next step (update, rebuild, reopen). The overview no longer has a pull request card; the target repositories are set on the Daten page.
- Company Brain: a click shows details and highlights the neighbours, a click on the canvas or Escape clears them, a double click makes a node the centre, nodes can be dragged; the view glides to a new section instead of being rebuilt.
- Documents are named by their title (the Confluence page, the first heading) instead of their file path.
- Links and file names in the documentation that point to files the repository does not have (any more): found without a model against every path of the repository, its history and its `.gitignore`; a renamed file gets its new path, a dead list entry is removed, a dead link keeps its text. Re-import a project to get it.
- Approved changes become GitHub pull requests, like Dependabot or Renovate: a GitHub App created from Einstellungen (pull requests by `<app>[bot]`) or a personal token; automatic after every approval or on a button; one pull request per repository or per document; labels, reviewers, drafts. Withdrawals rebuild the branch, merged pull requests publish their sections, commits by a person stop neuraldoc. Confluence pages in storage format (`.xml`, as in `mobiq-docs`) get the changed words in their XML. PDF and Office files and sections changed in the repository meanwhile are listed instead. The overview shows the pull requests and the target repository; the change page links each approved section to its pull request.
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
- Comment check (command line, `mcp/comment-check-cli.mjs`): comments and docstrings inside the code against the code they describe, with exact quotes, code evidence, a German reason and the corrected comment. Evaluated on 36 planted and 7 real wrong comments in ky, httpx, cobra, axios and linkding (`mcp/eval/comments-run.mjs`).

### Changed

- The initial check finds and corrects in one step per section: your LLM lists contradicted statements, removed names and missing list entries, each with a quote from the section and the code, a reason and its line edits; the server keeps only what it can verify; a second look drops context mistakes; Jev confirms each finding and every deletion. A completeness pass per document adds options, settings or fields the code defines and no document mentions. Default thinking level medium for `gemini-3.5-flash-lite`.
- Documents are split into one section per heading (code blocks are never cut); sections without prose are not checked. A document is one page in the editor.
- Corrections keep list markers, blank-line structure and code formatting of the original; replacements are cut down to the lines that change; whitespace-only changes are dropped.
- Makefile, Dockerfile, shell scripts and `.env.example` count as code.
- Changes from the Git history of an own project are described in plain German (what is different now, for whom, which parts) instead of showing commit subjects; their kind is Neue Funktion, Geändertes Verhalten, Fehlerbehebung or Intern, and the pages list the project's own documents instead of the showcase's doc types.
- The initial check weighs every single fact of a section before it reports, and long sections get the exact code lines behind their names and numbers; undocumented environment variables are found wherever the code reads them. On neuraldoc's own repository with ten planted mismatches it finds 8 instead of 6; the other benchmarks stay as they were, linkding improves from 50 to 67 %.
- Uploading a working folder or a ZIP of it: files its `.gitignore` excludes stay out, a ZIP is read as a stream and only kept entries are unpacked (a 135 MB ZIP with `node_modules` in about a second), and ZIPs made on Windows (backslash paths) are filtered correctly.
- For a repository imported by URL, the initial check reads the diffs since the last release without a model: a section that still states an old value or an old name gets the change as a hint, and if the proposal still states it, a question with the commit ("Gilt jetzt 0.5?"). A setting the code sets to different values in different places becomes a question ("Welcher Wert gilt?") instead of a guess. On neuraldoc's own repository with ten planted mismatches, imported with history: 10 of 10.
- Model answers of the check are cached by content in `check-cache/`, shared by all projects.
- Drafts for your own project are line edits on the numbered section with quoted findings. A draft needs at least one finding whose quotes appear in the section and in a code excerpt; untouched lines cannot be lost, and a draft that switches the section's language (German/English) is rejected.
- Default Gemini model for drafts is `gemini-3.5-flash-lite` (fewest false statements in the evaluation, about 0.002 USD per draft).
- The initial check passes at most one excerpt from tests or build scripts per section to Jev, retries a malformed Jev answer once and then skips only that section instead of failing the whole check.

- Repository renamed from `neuraldoc-dashboard` to `neuraldoc-app`.
- README rewritten around the Docker start.
- The import no longer takes local paths, Git revisions or component JSON, and no longer compares two commits.

### Security

- An uploaded folder or ZIP can no longer bring a `.git` folder (its config could make the history reader run commands); only a clone by URL has a history, and `git show` runs without external diff tools or text conversion.

## [0.1.0] - 2026-10-04

### Added

- One interface with two modes: the MOBIQ showcase and the import of your own Git repository and documentation.
- Company Brain: code graph for Java, Kotlin, TypeScript/TSX, Pascal and SQL.
- Document mapping with Jev, drafting with OpenAI, Claude, Gemini, Vertex AI or a local LLM, review and ZIP export.
- MCP server with `ticket_context`, `ask` and `check_change`.
