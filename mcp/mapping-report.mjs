import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const graph = read('frontend/src/dashboard/features/docs/brain/source-graph.json')
const evaluation = read('mcp/state/jev-evaluation-report.json')
const caches = ['mcp/state/jev-cache.json', 'mcp/state/jev-evaluation-cache.json'].flatMap((p) => Object.values(read(p)))
const tokens = caches.reduce((s, c) => s + c.response.usage.input_tokens, 0)
const times = caches.map((c) => c.elapsedMs).sort((a, b) => a - b)
const semantic = graph.edges.filter((e) => e.kind === 'semantic')
const summary = evaluation.summary
const fence = '```'
const report = `# Component mapping: test on the MOBIQ example

As of: ${graph.metadata.semantic.createdAt}. Model: ${graph.metadata.semantic.model}.

## Technical graph

- ${graph.metadata.analysis.files.length} code files: Java, Kotlin, TSX and Pascal, all without parser errors.
- ${graph.metadata.analysis.sql.length} SQL files parsed with the PostgreSQL AST. No product code or SQL executed.
- ${graph.nodes.filter((n) => n.type === 'function').length} explicit functions/methods/constructors; ${graph.edges.filter((e) => e.kind === 'calls').length} resolvable static call links.
- ${graph.metadata.analysis.unresolvedCalls.length} calls remain without a unique target. The excerpt contains no complete projects/dependencies. Java resolution uses package, explicit imports, declared receiver types and argument count; it does not replace a Java compiler. Kotlin and Pascal are parsed, but their calls stay open for lack of type resolution. No analysis of DI, reflection or runtime binding.
- Business modules from package/directory paths are configured, derived assignments. A non-matching path does not automatically become "platform".
- ORM/table relationships from name matches stay derived; SQL AST and foreign keys are evidenced separately.

## Jev in this use case

- ${graph.metadata.semantic.subjects} objects checked: documents, tables/views and files without a clear path assignment.
- ${semantic.length} model links accepted: ${semantic.filter((e) => e.target.startsWith('m:')).length} business module assignments and ${semantic.filter((e) => e.target.startsWith('file:')).length} document–code links.
- ${graph.metadata.semantic.deferred.length} objects without an accepted module assignment. Low-rated document–code suggestions are listed in the object details for review.
- Several business modules are possible. Empty documents produce no model link. Old documentation may be assigned to the same component even if its behaviour contradicts the current code.
- Every model link stays "derived", with model, probability, timestamp, excerpt and request fingerprint. The evidence filter removes them. Probabilities are not an empirically measured accuracy.
- Candidates for document–code mapping come from existing documentation proposals/source commits and their changed files; at most 16 per document. The search is therefore limited to these candidates and not complete for arbitrary unconnected components.
- Content-based local cache, versioned model, validated responses and budget check. "brain:index" and frontend calls make no paid API calls. Only "brain:map" and "brain:evaluate" call Jev explicitly.

## Small manual check

${summary.total} manually labelled cases from the same sample dataset, ${summary.positives} of them positive; the others are negative or have no document content. Not a representative or independent quality measurement.

- Correct class decisions: ${summary.choiceCorrect}/${summary.total}.
- With the conservative acceptance threshold: ${summary.acceptedTruePositive}/${summary.positives} matching pairs accepted; ${summary.positives - summary.acceptedTruePositive} matching pairs stay open for review.
- Wrongly accepted non-matching/empty pairs: ${summary.acceptedFalsePositive}.
- The thresholds are a review rule, not calibrated on this small sample. Results must not be presented as general 100 % accuracy.

| Document | Code | Expected | Jev | Accepted |
| --- | --- | --- | --- | --- |
${evaluation.cases.map((c) => `| ${c.doc} | ${path.basename(c.file)} | ${c.expected} | ${c.answer.choice} (${(c.answer.probabilities[c.answer.choice] * 100).toFixed(0)} %) | ${c.accepted ? 'yes' : 'no'} |`).join('\n')}

## Usage and reproduction

All responses received so far in the two local caches (including development runs): ${caches.length} API responses, ${tokens} input tokens, about ${(tokens * 0.042 / 1e6).toFixed(6)} USD. Estimated from the [Jev pricing](https://docs.typesafe.ai/models), not a billing statement. Latency of the received responses: median ${times[Math.floor(times.length / 2)]} ms, P95 ${times[Math.floor(times.length * 0.95)]} ms. Failed requests without usage are not included.

In the frontend folder:

${fence}powershell
npm run brain:index     # offline, uses existing matching model results
npm run brain:map       # runs Jev explicitly; unchanged requests come from the cache
npm run brain:evaluate  # checks the labelled cases
npm run brain:test      # local parser, graph and API contract tests, no model costs
npm run brain:report    # writes this report from the local results
${fence}

TYPESAFE_API_KEY lives only in frontend/.env.local (ignored), never in VITE_* variables. NEURALDOC_JEV_BUDGET_USD limits the mapping run (default 0.25 USD; at most 1 USD per run). Cache and raw reports live in mcp/state/ (ignored). The graph contains only decisions and provenance, no credentials. Node uses the operating system's certificate store; TLS verification stays enabled.

API contract: [TypeSafe API](https://docs.typesafe.ai/api). Parsers: [Tree-sitter](https://github.com/tree-sitter/tree-sitter), [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [PostgreSQL parser](https://github.com/constructive-io/pgsql-parser).
`
fs.writeFileSync(path.join(root, 'MAPPING_REPORT.md'), report)
console.log(JSON.stringify({ subjects: graph.metadata.semantic.subjects, semanticEdges: semantic.length, documentCodeEdges: semantic.filter((e) => e.target.startsWith('file:')).length, deferred: graph.metadata.semantic.deferred.length, apiResponses: caches.length, inputTokens: tokens, estimatedUsd: tokens * 0.042 / 1e6, evaluation: summary }))
