# Company Brain

The index connects the supplied MOBIQ source snapshot: features, Jira tickets, original commits and their authors, files, declared functions, product modules, parameters, SQL tables, views, columns and foreign keys. Documents are linked through the existing dashboard proposals. Departments are derived from the product modules; actual team ownership is not evidenced.

`pnpm brain:index` in `frontend/` builds `source-graph.json` with `mcp/build-brain.mjs`. The build uses GitLab diffs, the final repository snapshot and the schema/migration files. It never executes product code or imports SQL data. Yearly SQL partitions are shown as a template, not as queried runtime objects. The source snapshot contains more changes than the seven dashboard features.

Every relationship carries a source reference and a text excerpt. `belegt` (evidenced) means a directly contained declaration, code/SQL reference or source assignment. `abgeleitet` (derived) covers module/department assignments and name matches between entities and tables. `zugeordnet` (assigned) marks documentation proposals. Function calls are captured statically from visible names and type declarations; there is no complete language, persistence or runtime analysis. A function mentioned in a commit diff is not automatically treated as fully changed.

The network is the main view and fills the available window. The overview condenses technical intermediate steps; every object type can be shown. Nodes are grouped by a force simulation and can be dragged; a double click opens details and evidence in a side panel. The centre, connection depth, object types and evidence filter control the visible section. The centre and selected path objects always stay visible. Search covers the entire index. Path search follows relationships in both directions and returns a shortest relationship path, not a causal execution order. The detail view lists all direct relationships and their evidence.

Checks: `node --test mcp/brain.test.mjs` in the project folder, plus frontend TypeScript, ESLint and the Vite build.
