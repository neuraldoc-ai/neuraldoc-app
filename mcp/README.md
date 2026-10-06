# neuraldoc MCP

Optional [text drafting with an LLM](DRAFTING.md) is connected: draft individual open passages in the editor, or pass your own writing contexts via API/CLI. Without an API key the existing demo checks keep working. Normal MCP calls never trigger internal drafting.

Three tools for the development team's coding agent (Claude Code, Cursor, VS Code). neuraldoc reads GitLab, Jira, Confluence and SharePoint itself and returns only what the answer needs. The idea comes from kapa.ai (answers from the docs with sources) and executor.sh (one endpoint, central credentials, few tokens). The difference: neuraldoc checks the documentation against the code.

| Tool | When | What comes back |
|---|---|---|
| `ticket_context` | before coding, with a Jira ticket | ticket, the change it builds on, rules and parameters from the code, documentation status, code locations, open points, who approves later |
| `ask` | for a domain question | short quotes with sources, each marked "correct", "outdated" (with what the code does), "incomplete" or "updated" |
| `check_change` | when the feature is done (MR, branch, ticket or commits) | the complete list of sources found with original names, locations and required change, plus prepared drafts, questions, manual work and **one link** to review and approve |

For an imported project of your own, `ask` and `ticket_context` search the uploaded code and documents, and `check_change` returns the result of the initial check; see the main README.

## Completeness before brevity

The source check for partial deliveries reads all 33 Confluence pages and all seven extracted SharePoint files, including training material, service descriptions, screenshots, spreadsheets and PDF slides. Parameters and code rules are read from the final files of the release, not from intermediate states in commit diffs. Every change item carries the original name, source ID, location and code evidence. The test reference is never loaded by the MCP; it stays an external test reference.

The 19 prepared dashboard drafts are separate from the source check. An additionally found passage is a review aid, not a finished or automatically approved draft. Unassigned sources count as unchecked. The additional detector uses explicitly limited, deterministic domain rules for partial deliveries; it is not a general semantic analysis of arbitrary ERP changes. Other change types use the prepared dashboard drafts and state this limit.

Code evidence and business requirements stay distinguishable: revenue date and open-item assignment of the partial invoice come from the Jira comment on MOB-4812; the code excerpt proves the partial invoice with TR. Both pieces of evidence are returned and shown in full when loaded on demand. Prepared documentation drafts are labelled as such and never presented as a direct code excerpt.

By default the full facts are returned once as text. `format: "structured"` adds the data model for user interfaces; the dashboard requests this mode explicitly. `details: true` returns draft texts in full. With `source_id` the agent loads only the original source it needs, including the full extracted text and code excerpts; this call creates no new MR comment:

```json
{"merge_request":"1287","source_id":"01MOBIQ004822DOC16"}
```

The source list comes as a ready-to-use answer table with one row per finding and a separate column for the concrete change. For a documentation review task, the agent checks its draft answer with `check_change` and `answer` before replying. The call rates gaps and additionally returns a fully completed, formally checked answer built from the source inventory, to be used unchanged. This avoids lossy re-summarising. Domain questions and ticket preparation need no full documentation check. The check uses only the list derived from sources and code, never the test reference, and creates no MR comment. The check is formal: it does not replace an expert review and, for example, does not reliably detect wrong negations. A third-party client can still ignore the result; what counts is its actual final answer.

```json
{"merge_request":"1287","answer":"Your own answer before replying …"}
```

This follows [Executor's principle of targeted discovery and retrieval](https://executor.sh/): a small tool surface and details on demand. neuraldoc does not run arbitrary agent scripts; the three domain tools stay as they are.

## Flow

1. The agent calls `check_change` and gives the user the link (`/app/aenderungen/<id>`).
2. If enabled, neuraldoc posts the same link as a comment on the merge request.
3. On that page a person reviews the drafts and accepts, edits or rejects them. Who approves depends on the document type (Dashboard → MCP → "Wer gibt frei"); development may approve technical documentation itself.
4. neuraldoc writes every accepted passage back to Confluence or SharePoint with a new version number. In the demo this is only logged.

## Starting

| Start | Endpoint |
|---|---|
| `docker run -p 8080:8080 neuraldoc` | `http://localhost:8080/mcp` (same server as the app) |
| `pnpm dev` in `frontend/` | `http://localhost:5173/mcp` (runs inside the Vite server, app page at `/app/mcp`) |
| `pnpm mcp` in `frontend/` | `http://localhost:8787/mcp` (standalone) |
| `node mcp/stdio.mjs` | stdio, for clients that start the server themselves |

Token: random per installation (stored as `mcp-token` in the state directory and shown on the MCP page), or set `NEURALDOC_MCP_TOKEN`. The public showcase (`NEURALDOC_MODE=showcase`) uses the demo token `nd_demo_mobiq_2b7f9c41e8`. Links point to the host of the request; with stdio to `NEURALDOC_APP_URL` (default `http://localhost:5173`).

With Docker, use port 8080 instead of 5173.

```
claude mcp add --transport http neuraldoc http://localhost:5173/mcp --header "Authorization: Bearer <token from the MCP page>"
codex mcp add neuraldoc -- node <path>/mcp/stdio.mjs
```

## Selectable workflows

Besides the three tools, the server offers three MCP prompts via `prompts/list` and `prompts/get` (showcase only). Fetching a prompt runs no tool yet: the client receives the task for its agent.

| Claude Code | Argument | Workflow |
|---|---|---|
| `/neuraldoc:ticket_context MOB-4844` | `ticket` | prepare a ticket |
| `/neuraldoc:ask` | `question` | answer a product question with sources |
| `/neuraldoc:check_change !1287` | `change` | check an MR or Jira ticket for documentation impact |

`/mcp__neuraldoc__ticket_context`, `/mcp__neuraldoc__ask` and `/mcp__neuraldoc__check_change` also work in Claude Code. Enter multi-part questions through the client's argument input; the CLI splits inline arguments at spaces. The `check_change` prompt accepts MR numbers or MOB tickets; the tool additionally supports branches and commits.

References: [Claude Code MCP prompts](https://code.claude.com/docs/en/mcp#use-mcp-prompts-as-commands), [Codex slash commands and skills](https://learn.chatgpt.com/docs/reference/slash-commands).

## Structure

- `core.mjs`: the three tools, approval rules, decisions, write-back, and a log with tokens (answer versus the raw data neuraldoc read for it; four characters per token).
- `sources.mjs`: GitLab, Jira, Confluence and SharePoint from the sample dataset (submodules in `datasets/`, paths via `dataset.mjs`), plus BM25 search and where each document lives. Real connections need API loaders as well as suitable domain rules and validation for the product at hand; the demo rules do not cover that in general.
- `impact.mjs`: original sources, rule-based findings and code evidence; no dependency on the ground truth. `impact.test.mjs` checks completeness, new sources, changed parameters and on-demand loading.
- `project-upload.mjs`, `project-import.mjs`, `doc-text.mjs`, `projects.mjs`, `project-mcp.mjs`: upload or clone, text extraction, initial check and review of your own repository and documents.
- `log.mjs`: one log line per event on stdout/stderr (`docker logs`).
- Changes, documents, drafts and the audience filter come from `frontend/src/dashboard/features/docs/showcase-data.ts` (through `data.ts`) and `logic.ts`, exactly what the app shows. Node 24 loads the `.ts` files directly.
- `handler.mjs`: MCP over JSON-RPC 2.0, Streamable HTTP with JSON responses (no SSE), session ID via `Mcp-Session-Id`; plus `/api/mcp/*` for the dashboard. Decisions in the dashboard go to `/api/mcp/decisions` so the agent sees the current state.
- State (rules, decisions, write-backs, MR comments, log, imported projects) lives in `mcp/state/`, or in Docker in the volume `neuraldoc-data` (`/data`). Deleting it resets everything.
