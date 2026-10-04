# Capabilities of each connector

As of 3 October 2026. Target picture for real connections, compared with the demo. Each source should discover resources, explain their structure, allow targeted queries and return data with provenance. Functions marked as planned below are not implemented yet.

## Who writes SQL and KQL?

Normally the coding agent writes the query based on the schema it read via MCP. The server runs it with the configured identity and returns the result or a concrete error. Query generation inside the MCP itself is optional, would add costs when a model is used, and is not implemented here. MCP prompts make workflows such as "answer a data question" or "investigate errors since the deployment" selectable.

## Source by source

| Connector | Standalone use | Required capabilities | Demo status |
|---|---|---|---|
| GitLab | Understand implementation and code changes | Discover projects/refs, repository tree, files, code/symbol search, commits, MRs, diffs, ref comparisons, pipelines/job logs | MRs, commits, diffs and code/file access implemented; one project/ref, no pipelines or historical files |
| Jira | Find requirements, acceptance criteria, dependencies and open decisions | Read projects/tickets/comments/links, JQL, status and versions, paginated results | Text/status/version search and ticket details implemented; full JQL semantics missing |
| Confluence | Research documented product behaviour, parameters and architecture | Discover spaces/hierarchy, CQL, read pages/tables/attachments, compare versions | Search and page reading implemented; attachments, hierarchy and history tools missing |
| SharePoint | Use Word/PDF documentation and Excel parameter lists including tables | Discover sites/drives/folders, file search, metadata/versions, content extraction with section/sheet reference, Excel ranges | File list, content search and existing extracts implemented; no live API |
| Internal SQL databases | Investigate storage locations, effective parameters and actual business cases | Discover connections/DBs/engine/schemas; tables/views, types, PK/FK, indexes/comments; free read-only SQL queries, joins, CTEs, aggregates, parameters, execution plans | One PostgreSQL demo; schema, free parameterised SQL and migrations implemented |
| Azure Monitor / Application Insights | Investigate errors, latencies and dependencies over a period | Discover subscriptions/resources/Log Analytics workspaces; read tables/columns; native KQL, metrics, activity logs | Planned; no Azure tool and no connection |
| Azure Data Explorer / Fabric KQL | Investigate event and analytics data | Discover clusters/DBs/tables/schemas; samples; native KQL against a chosen target with joins and aggregates | Planned; no connection |

Azure is not a single data source: Azure SQL uses SQL, Log Analytics and Data Explorer use KQL. A connection that lists resources cannot automatically read their application data; that requires the matching tools and permissions.

## Internal databases: making every connected database usable

Planned tool contract for real databases:

| Tool | Input | Result |
|---|---|---|
| `db_list_connections` | optional engine/environment | Non-secret IDs of configured connections, engine, environment, capabilities |
| `db_list_databases` | `connection_id` | Databases actually visible |
| `db_list_schemas` | `connection_id`, `database` | Visible schemas |
| `db_describe` | `connection_id`, `database`, `schema`, optional table | Tables/views, columns/types, keys, relationships, indexes, comments |
| `db_query` | `connection_id`, `database`, `sql`, `params`, optional limit | Columns/types, rows, duration, truncation status and executed target |
| `db_explain` | target, SQL and parameters | Execution plan, by default without ANALYZE |

PostgreSQL, SQL Server and MySQL each need their own engine adapter and SQL dialect. Every query explicitly selects connection and database; the agent never passes a free connection string. PostgreSQL joins across databases do not work automatically: cross-database or cross-engine queries need configured federation or separate queries merged afterwards. The demo deliberately has no target parameters because only `mobiq` exists.

"All data" first means that every permitted table can be queried. A domain question does not need the whole database dump in the model context: targeted fields and SQL aggregations give the answer. A separate paginated export with target, scope and download artefact is planned for explicitly required full extracts, not implemented yet.

## Azure/KQL: concrete flow

Planned capabilities:

1. `azure_list_query_targets`: list accessible Log Analytics workspaces and ADX clusters/DBs with a stable target ID.
2. `azure_describe_tables(target_id, table?)`: read existing tables and columns/types.
3. `azure_kql_query(target_id, query, timespan, limit)`: run native KQL; return columns, rows, truncation status, target/time window and service errors. Log Analytics and ADX need separate API adapters.
4. Optionally `azure_get_metrics` and `azure_get_activity_logs`: read metrics and infrastructure/deployment events, separate from application logs.

A prompt `investigate(question, target, timespan)` makes the agent read target and schema first, then generate, run and explain KQL. Example, **only after the schema is confirmed**, for Application Insights data in a workspace:

```kusto
AppRequests
| where TimeGenerated > ago(24h)
| summarize Requests = count(), Failures = countif(Success == false), P95ms = percentile(DurationMs, 95) by bin(TimeGenerated, 1h)
| order by TimeGenerated asc
```

This investigates requests, failures and latency; it does not prove a cause yet. For "worse after the deployment", actual deployments and dependencies are investigated as well. Other tables need other queries. Azure Resource Graph also uses KQL, but it queries resources, not Log Analytics; treat it as a separate target type.

Microsoft already offers MCP functions for [Log Analytics: workspaces, tables and KQL](https://learn.microsoft.com/en-us/azure/developer/azure-mcp-server/tools/azure-monitor) and [Data Explorer: databases, schema and queries](https://learn.microsoft.com/en-us/azure/developer/azure-mcp-server/tools/azure-data-explorer). Our planned tool names are our own contract, not claimed names of the official Microsoft tools.

## Access and evidence

A connection uses the configured identity. The source service enforces table, row, tenant, workspace and resource permissions; a prompt never extends them. Real database queries use a genuine read-only role. Azure uses Entra/RBAC permissions. Database write statements and Kusto management commands belong in separate change functions.

Results include source/target, the query or section read, version/time window, data and truncation status. "No match", "not connected", "no permission" and "query error" are distinct results. Code proves implemented behaviour; database data and logs prove observed cases and operations. Missing data cases do not disprove a business rule.
