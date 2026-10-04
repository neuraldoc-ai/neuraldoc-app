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
- CI for tests, build, lint and a Docker smoke test.
- `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, guides under `docs/`.

### Changed

- Repository renamed from `neuraldoc-dashboard` to `neuraldoc-app`.
- README rewritten around the Docker start.
- The import no longer takes local paths, Git revisions or component JSON, and no longer compares two commits.

## [0.1.0] - 2026-10-04

### Added

- One interface with two modes: the MOBIQ showcase and the import of your own Git repository and documentation.
- Company Brain: code graph for Java, Kotlin, TypeScript/TSX, Pascal and SQL.
- Document mapping with Jev, drafting with OpenAI, Claude, Gemini, Vertex AI or a local LLM, review and ZIP export.
- MCP server with `ticket_context`, `ask` and `check_change`.
