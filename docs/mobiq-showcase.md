# The MOBIQ showcase

The showcase uses **MOBIQ**, a fictional ERP vendor for furniture and kitchen retail (Musterhaus Software GmbH). It has a release with 35 commits, Jira tickets, merge requests, a PostgreSQL database and Confluence and SharePoint documentation that is partly outdated. All companies, people and contents are fictional.

## Repositories

The dataset lives in four repositories, included as Git submodules under `datasets/`:

| Submodule | Contents |
| --- | --- |
| [`mobiq`](https://github.com/neuraldoc-ai/mobiq) | Generator, GitLab and Jira API responses, solution (`ground-truth.json`) |
| [`mobiq-code`](https://github.com/neuraldoc-ai/mobiq-code) | The code repository with branches, merges and a tag (pinned to `ad176b2` on `release/26.4`) |
| [`mobiq-docs`](https://github.com/neuraldoc-ai/mobiq-docs) | Confluence pages and SharePoint files |
| [`mobiq-db`](https://github.com/neuraldoc-ai/mobiq-db) | PostgreSQL scripts and `docker compose` |

The Docker image contains `mobiq/data`, `mobiq-docs` and `mobiq-db`. `mobiq-code` is only needed to rebuild the code graph.

The code reads the data in the original layout (`gitlab/…`, `repo/…`, `postgres/…`); [`mcp/dataset.mjs`](../mcp/dataset.mjs) and [`frontend/vite.config.ts`](../frontend/vite.config.ts) map it to the repositories. To regenerate the dataset, run `node generate.mjs && node publish.mjs` in the `mobiq` repository.

## Company Brain

The Company Brain indexes Java, Kotlin, TypeScript/TSX and Pascal with tree-sitter and SQL with the PostgreSQL parser. Java calls are resolved by package, import and receiver type; TypeScript uses the compiler's symbol resolution. Missing or ambiguous targets stay open. Module assignments from paths are marked as derived.

Jev adds the remaining module assignments and rates document–code pairs. An old document can match changed code even though the behaviour it describes is outdated. Model links are shown as derived in the graph; their origin and uncertain suggestions are listed in the details.

## Rebuilding the graph

In the `frontend` folder:

| Command | What it does | Cost |
| --- | --- | --- |
| `npm run brain:index` | Builds the code graph offline | free |
| `npm run brain:map` | Calls Jev for module and document mapping; unchanged requests come from the cache | paid, capped by `NEURALDOC_JEV_BUDGET_USD` |
| `npm run brain:test` | Tests the graph builder | free |
| `npm run brain:evaluate` | Checks 13 manually labelled pairs with Jev | paid |
| `npm run brain:report` | Writes [MAPPING_REPORT.md](../MAPPING_REPORT.md) | free |

The key is `TYPESAFE_API_KEY` in `frontend/.env.local`. Jev runs with the pinned model `jev-1.13.0` ([TypeSafe API](https://docs.typesafe.ai/api)). Caches and raw reports in `mcp/state/` are ignored by Git; stale results are not loaded when the input changes.
