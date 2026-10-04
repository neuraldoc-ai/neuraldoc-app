<p align="center">
  <img src="docs/images/logo.png" width="96" height="96" alt="neuraldoc logo"/>
</p>

<h1 align="center">neuraldoc</h1>

<p align="center">
  <b>Keep product documentation in step with the code.</b><br/>
  When the code changes, neuraldoc finds the documents that became outdated and drafts evidence-backed updates. A person approves every change.
</p>

<p align="center">
  <a href="https://github.com/neuraldoc-ai/neuraldoc-app/actions/workflows/ci.yml"><img src="https://github.com/neuraldoc-ai/neuraldoc-app/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue" alt="License: MIT"/></a>
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 24"/>
  <img src="https://img.shields.io/badge/MCP-server-6e56cf" alt="MCP server"/>
  <img src="https://img.shields.io/badge/UI-German-555" alt="UI language: German"/>
</p>

<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="ARCHITECTURE.md">Architecture</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

Code changes every sprint, the manual, the dialog descriptions and the parameter lists do not. neuraldoc reads a code change, works out which documents now describe the wrong behaviour, and proposes the exact text change with the code that proves it.

- **Runs on your machine.** One Docker container: interface, API and MCP server. Your repository is mounted read-only and never modified.
- **Every proposal has evidence.** Each text change links to the commit and the code lines it is based on. If the evidence is missing, neuraldoc asks a question instead of guessing.
- **A person decides.** Nothing is published automatically. You accept, edit or reject each proposal and export the approved texts.
- **Bring your own model.** OpenAI, Claude, Gemini, Vertex AI or a local LLM via any OpenAI-compatible server.

<p align="center">
  <img src="docs/images/review.png" alt="neuraldoc review view: an outdated sentence in a user manual, struck through in red, with the proposed replacement in green and the buttons accept, edit and reject" width="900"/>
</p>
<p align="center">
  <em>Reviewing a proposal. The old sentence is struck through, the new one is green, the evidence (commit <code>d71c5e8</code>) is one click away.</em>
</p>

---

## Get started

**Requires:** [Git](https://git-scm.com/downloads) and [Docker](https://docs.docker.com/get-docker/). Nothing else on your machine.

```bash
git clone --recursive https://github.com/neuraldoc-ai/neuraldoc-app.git
cd neuraldoc-app
docker build -t neuraldoc .
docker run -p 8080:8080 -v neuraldoc-data:/data neuraldoc
```

Open **http://localhost:8080/app/**. You see the showcase: a fictional ERP vendor (MOBIQ) with a release, 35 commits and outdated documentation. No keys, no costs, no model calls.

> **Windows:** clone with `git -c core.autocrlf=false clone --recursive …` so the sample code keeps its line endings.

### Check your own project

```bash
cp .env.example .env              # Windows: Copy-Item .env.example .env
# put your keys into .env (see Configuration)
mkdir projects                    # put your Git repository and docs folder in here

docker run -p 8080:8080 --env-file .env \
  -v neuraldoc-data:/data \
  -v "$(pwd)/projects:/projects:ro" \
  neuraldoc
```

In the app: **Übersicht → Eigenes Projekt**, enter `/projects/<your-repo>` and `/projects/<your-docs>`. Then:

1. **Mit Jev zuordnen** maps every document to the changed code files.
2. **Starten** lets your LLM draft one update per affected document.
3. Review, accept or edit, then **Freigaben exportieren** downloads a ZIP with the approved documents.

On Windows PowerShell write `-v "${PWD}/projects:/projects:ro"`, or any absolute folder such as `-v C:\Projekte:/projects:ro`.

---

## See it in action

<table>
  <tr>
    <td width="50%"><img src="docs/images/overview.png" alt="Overview: six features of release 26.4 with open documentation proposals, sorted by the number of open proposals"/></td>
    <td width="50%"><img src="docs/images/change.png" alt="One feature: the business process before and after the change, and the affected document types"/></td>
  </tr>
  <tr>
    <td><b>Overview.</b> Commits are grouped into features; each feature lists the documents it affects.</td>
    <td><b>One change.</b> The process before and after, and which kinds of documentation need an update.</td>
  </tr>
  <tr>
    <td><img src="docs/images/brain.png" alt="Company Brain: a graph of features, modules, code files, tables and documents"/></td>
    <td><img src="docs/images/review.png" alt="Review view with the proposed text change"/></td>
  </tr>
  <tr>
    <td><b>Company Brain.</b> Code, database, modules and documents in one graph. Solid edges are proven by the code, dashed ones are derived.</td>
    <td><b>Review.</b> Accept, edit or reject each passage. Approved wording is stored exactly as accepted.</td>
  </tr>
</table>

---

## How it works

```
your Git repo ──► code graph ──► Jev mapping ──► LLM draft ──► your review ──► ZIP export
 (read-only)      tree-sitter     which docs     text change    accept/edit     approved
                  + SQL AST       are affected   + evidence     /reject         documents
```

| Step | What happens | Cost |
|---|---|---|
| **Import** | Reads the committed files of two Git revisions (default `HEAD~1` → `HEAD`) and your documentation folder. | free, local |
| **Code graph** | Parses Java, Kotlin, TypeScript/TSX, Pascal (tree-sitter) and SQL (PostgreSQL parser) into files, functions, calls and tables. | free, local |
| **Mapping** | [Jev](https://docs.typesafe.ai/api) rates each document against the changed code. Only confident links are accepted; uncertain ones stay open. | paid, capped by budget |
| **Drafting** | Your LLM rewrites each affected document from the diffs. The response is validated against a JSON contract and its evidence IDs. | paid or local |
| **Review & export** | You decide. The export contains the approved texts plus the SHA-256 of every original. | free, local |

Every link in the graph is marked as **proven** (read from the code) or **derived** (from a model), so you always know what was found and what was guessed. Details: [ARCHITECTURE.md](ARCHITECTURE.md).

### For coding agents (MCP)

The same container serves an MCP endpoint at `http://localhost:8080/mcp` with three tools: `ticket_context` (before coding), `ask` (domain questions with sources) and `check_change` (documentation impact of a finished change).

```bash
claude mcp add --transport http neuraldoc http://localhost:8080/mcp \
  --header "Authorization: Bearer nd_demo_mobiq_2b7f9c41e8"
```

Tools, prompts and token handling: [mcp/README.md](mcp/README.md).

---

## Configuration

All settings are environment variables, passed with `--env-file .env`. The template is [.env.example](.env.example).

| Variable | Purpose | Default |
|---|---|---|
| `TYPESAFE_API_KEY` | Jev, maps documents to code. Required for your own projects. | none |
| `NEURALDOC_JEV_BUDGET_USD` | Spending cap per mapping run (max 1 USD) | `0.25` |
| `NEURALDOC_DRAFT_PROVIDER` | `openai`, `anthropic`, `gemini`, `vertex` or `local` | none |
| `NEURALDOC_LLM_MODEL` | Model used for drafting | provider default |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Key for the chosen provider | none |
| `NEURALDOC_LLM_BASE_URL` | OpenAI-compatible server for `local` (Ollama, LM Studio, vLLM) | none |
| `NEURALDOC_MODE` | `showcase` disables the import and all model calls | empty |
| `NEURALDOC_MCP_TOKEN` | Bearer token for the MCP endpoint | demo token |
| `PORT` | Port inside the container | `8080` |

| Provider | `NEURALDOC_DRAFT_PROVIDER` | Example model |
|---|---|---|
| OpenAI | `openai` | `gpt-4.1-mini` |
| Claude | `anthropic` | `claude-haiku-4-5` |
| Gemini | `gemini` | `gemini-2.5-flash-lite` |
| Vertex AI | `vertex` | `gemini-2.5-flash-lite` |
| Local | `local` | `qwen2.5:7b` |

A local LLM on the same computer is reached from the container at `http://host.docker.internal:11434/v1` (Ollama), not `127.0.0.1`. On Linux add `--add-host host.docker.internal:host-gateway`. Provider details, cost rates and validation: [docs/llm-providers.md](docs/llm-providers.md).

---

## Privacy

- **Your repository stays where it is.** It is mounted read-only; neuraldoc reads committed files and writes nothing back.
- **What leaves your machine:** document text and code excerpts go to Jev (TypeSafe API) when you click *Mit Jev zuordnen*, and to your LLM provider when you draft. With a local LLM, only the Jev request leaves your machine.
- **Showcase mode** makes no external calls at all.
- **No telemetry**, no analytics, no tracking. Keys are read at runtime and never written to the image, the caches or the export.
- Projects, decisions and caches live in the Docker volume `neuraldoc-data`. `docker volume rm neuraldoc-data` deletes everything.

neuraldoc is built for local use by one person or a small team. There is no user management; do not expose it on a public network.

---

## Limits

This is an early release. Known limits:

- Up to 250 code files (100 KB each), 40 documents (8,000 characters each), 100 commits and 8 MB of diffs per import.
- Documents: Markdown, MDX, plain text, RST and HTML (HTML is exported as text).
- Deep analysis for Java, Kotlin, TypeScript/TSX, Pascal and SQL; other languages are imported as plain sources.
- A draft replaces a whole document; there is no section-level mapping yet. Drafts are written in German.
- Jev sees at most six changed files per document. There is no measured accuracy for your own projects yet.
- Jira, Confluence and SharePoint are connected only in the showcase, not for your own projects.

---

## Troubleshooting

<details>
<summary><b>The showcase is empty or the build fails with missing <code>datasets/</code> files</b></summary>

The sample data are Git submodules. Run `git submodule update --init` in the cloned folder and build again.
</details>

<details>
<summary><b>Import says the path is not a Git repository</b></summary>

Inside Docker the paths start with `/projects/`, not with your local path. Enter the root folder of the repository (the one containing `.git`), and make sure it has at least two commits.
</details>

<details>
<summary><b>Certificate errors during <code>docker build</code> or when calling Jev / the LLM</b></summary>

A company proxy is replacing TLS certificates. Add its root certificate to the image (for example append it to `/etc/ssl/certs/ca-certificates.crt` in a derived Dockerfile) and set `NODE_EXTRA_CA_CERTS` to the PEM file.
</details>

<details>
<summary><b>Port 8080 is already in use</b></summary>

Map another host port: `docker run -p 9090:8080 …` and open `http://localhost:9090/app/`.
</details>

<details>
<summary><b>Changed keys have no effect</b></summary>

Environment variables are read at start. Stop the container and run it again; the volume keeps your data. The **Architektur** page shows whether Jev and the LLM are configured.
</details>

---

## Development

Without Docker you need Node.js 24:

```bash
cd frontend
npm ci
npm run dev            # http://localhost:5174/app/, with hot reload
npm test               # backend tests, Jev and LLM mocked, no costs
npm run build          # type check and production build
```

Keys for development go into `frontend/.env.local` (template: `frontend/.env.example`). Project layout, data flow and how the showcase is built: [ARCHITECTURE.md](ARCHITECTURE.md). The MOBIQ sample dataset: [docs/mobiq-showcase.md](docs/mobiq-showcase.md).

---

## Learn more

- [ARCHITECTURE.md](ARCHITECTURE.md): modules, data flow, state and the two modes
- [mcp/README.md](mcp/README.md): MCP tools and prompts for coding agents
- [mcp/DRAFTING.md](mcp/DRAFTING.md): how drafts are generated, validated and cached
- [mcp/CONNECTORS.md](mcp/CONNECTORS.md): target picture for Jira, Confluence, SharePoint, SQL and Azure connectors
- [docs/llm-providers.md](docs/llm-providers.md): provider setup, costs and local models
- [docs/mobiq-showcase.md](docs/mobiq-showcase.md): the fictional MOBIQ dataset and its maintenance
- [MAPPING_REPORT.md](MAPPING_REPORT.md): component mapping test on the showcase
- [CHANGELOG.md](CHANGELOG.md)

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the test commands and what makes a good pull request. Please report security issues privately as described in [SECURITY.md](SECURITY.md). This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Delschad Jankir. The interface is based on an MIT-licensed template; its notice is in [frontend/LICENSE-DASHBOARD](frontend/LICENSE-DASHBOARD). Companies, people and contents in the showcase are fictional.
