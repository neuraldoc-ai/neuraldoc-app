# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Docker image with healthcheck, non-root user and volume `/data`; start with `docker build -t neuraldoc .` and `docker run`.
- Import of your own projects from a read-only folder `/projects` inside the container.
- CI for tests, build, lint and a Docker smoke test.
- `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, guides under `docs/`.

### Changed

- Repository renamed from `neuraldoc-dashboard` to `neuraldoc-app`.
- README rewritten around the Docker start.

## [0.1.0] - 2026-10-04

### Added

- One interface with two modes: the MOBIQ showcase and the import of your own Git repository and documentation.
- Company Brain: code graph for Java, Kotlin, TypeScript/TSX, Pascal and SQL.
- Document mapping with Jev, drafting with OpenAI, Claude, Gemini, Vertex AI or a local LLM, review and ZIP export.
- MCP server with `ticket_context`, `ask` and `check_change`.
