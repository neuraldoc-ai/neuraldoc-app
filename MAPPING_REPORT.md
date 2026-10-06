# Component mapping: test on the MOBIQ example

As of: 2026-10-04T08:12:50.589Z. Model: jev-1.13.0.

## Technical graph

- 33 code files: Java, Kotlin, TSX and Pascal, all without parser errors.
- 11 SQL files parsed with the PostgreSQL AST. No product code or SQL executed.
- 49 explicit functions/methods/constructors; 16 resolvable static call links.
- 165 calls remain without a unique target. The excerpt contains no complete projects/dependencies. Java resolution uses package, explicit imports, declared receiver types and argument count; it does not replace a Java compiler. Kotlin and Pascal are parsed, but their calls stay open for lack of type resolution. No analysis of DI, reflection or runtime binding.
- Business modules from package/directory paths are configured, derived assignments. A non-matching path does not automatically become "platform".
- ORM/table relationships from name matches stay derived; SQL AST and foreign keys are evidenced separately.

## Jev in this use case

- 42 objects checked: documents, tables/views and files without a clear path assignment.
- 50 model links accepted: 34 business module assignments and 16 document–code links.
- 8 objects without an accepted module assignment. Low-rated document–code suggestions are listed in the object details for review.
- Several business modules are possible. Empty documents produce no model link. Old documentation may be assigned to the same component even if its behaviour contradicts the current code.
- Every model link stays "derived", with model, probability, timestamp, excerpt and request fingerprint. The evidence filter removes them. Probabilities are not an empirically measured accuracy.
- Candidates for document–code mapping come from existing documentation proposals/source commits and their changed files; at most 16 per document. The search is therefore limited to these candidates and not complete for arbitrary unconnected components.
- Content-based local cache, versioned model, validated responses and budget check. "brain:index" and frontend calls make no paid API calls. Only "brain:map" and "brain:evaluate" call Jev explicitly.

## Small manual check

13 manually labelled cases from the same sample dataset, 6 of them positive; the others are negative or have no document content. Not a representative or independent quality measurement.

- Correct class decisions: 13/13.
- With the conservative acceptance threshold: 4/6 matching pairs accepted; 2 matching pairs stay open for review.
- Wrongly accepted non-matching/empty pairs: 0.
- The thresholds are a review rule, not calibrated on this small sample. Results must not be presented as general 100 % accuracy.

| Document | Code | Expected | Jev | Accepted |
| --- | --- | --- | --- | --- |
| doc:nh-kaufvertrag | Kaufvertrag.java | relevant | relevant (100 %) | yes |
| doc:nh-kaufvertrag | TeillieferungService.java | relevant | relevant (60 %) | no |
| doc:nh-tour | TourPruefung.java | relevant | relevant (79 %) | no |
| doc:nh-kasse | GutscheinService.java | relevant | relevant (100 %) | yes |
| doc:nh-fibu | GutscheinBuchung.java | relevant | relevant (100 %) | yes |
| doc:td-kasse | Tagesabschluss.java | relevant | relevant (100 %) | yes |
| doc:nh-kasse | TourPruefung.java | unrelated | unrelated (100 %) | no |
| doc:nh-tour | GutscheinService.java | unrelated | unrelated (99 %) | no |
| doc:nh-kaufvertrag | VorlagenKonvertieren.java | unrelated | unrelated (100 %) | no |
| doc:td-fibu | TeillieferungService.java | unrelated | unrelated (100 %) | no |
| doc:td-kasse | LieferungAufteilen.tsx | unrelated | unrelated (100 %) | no |
| doc:dlg-kaufvertrag | Fahrzeug.tsx | unrelated | unrelated (100 %) | no |
| doc:dlg-fahrzeug | Fahrzeug.tsx | insufficient | insufficient (98 %) | no |

## Usage and reproduction

All responses received so far in the two local caches (including development runs): 139 API responses, 324993 input tokens, about 0.013650 USD. Estimated from the [Jev pricing](https://docs.typesafe.ai/models), not a billing statement. Latency of the received responses: median 259 ms, P95 375 ms. Failed requests without usage are not included.

In the frontend folder:

```powershell
pnpm brain:index     # offline, uses existing matching model results
pnpm brain:map       # runs Jev explicitly; unchanged requests come from the cache
pnpm brain:evaluate  # checks the labelled cases
pnpm brain:test      # local parser, graph and API contract tests, no model costs
pnpm brain:report    # writes this report from the local results
```

TYPESAFE_API_KEY lives only in frontend/.env.local (ignored), never in VITE_* variables. NEURALDOC_JEV_BUDGET_USD limits the mapping run (default 0.25 USD; at most 1 USD per run). Cache and raw reports live in mcp/state/ (ignored). The graph contains only decisions and provenance, no credentials. Node uses the operating system's certificate store; TLS verification stays enabled.

API contract: [TypeSafe API](https://docs.typesafe.ai/api). Parsers: [Tree-sitter](https://github.com/tree-sitter/tree-sitter), [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [PostgreSQL parser](https://github.com/constructive-io/pgsql-parser).
