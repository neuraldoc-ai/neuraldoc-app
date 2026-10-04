# Evaluating the initial check

How well does the initial check find documentation that no longer matches the code, and how good are the corrections it drafts? This folder measures that on four benchmarks with real Jev and LLM calls. The product never reads anything from here.

## Benchmarks

| Benchmark | Language | Documentation | Code | Expected changes |
|---|---|---|---|---|
| `mobiq` | Java, Kotlin, TS, Pascal, SQL; German docs | MOBIQ 26.3: 33 Confluence pages + 7 files | MOBIQ release 26.4 (`datasets/mobiq-code`) | 62 from `datasets/mobiq/data/ground-truth.json` (one new-page item has no section and is left out) |
| `httpx` | Python | `encode/httpx` 0.27.2 (`README.md`, `docs/**`) | 0.28.1 | 8 |
| `zx` | TypeScript CLI | `google/zx` 8.3.0 (`README.md`, `docs/*.md`) | 8.5.0 | 16 |
| `cobra` | Go | `spf13/cobra` v1.8.1 (`README.md`, `site/content/**`) | v1.10.1 | 6 |

The open-source benchmarks follow real project history: documentation of the older tag, code of the newer one. Ground truth is the set of documentation changes the maintainers made between the two tags *that the newer code supports*. Each was read in the diff and checked against the code. Typos, prompt prefixes, sponsor lists, link moves and changes the code cannot decide (distribution channels, CI examples) are left out; the `notes` field of each file lists them. Every item names its section (`anchor`, a literal string of the old document) and the code files it depends on (`files`). The repositories are cloned on first use into `mcp/state/eval/src` and checked out by commit.

The repository is uploaded at the new version without its own documentation, the old documentation as a separate upload, exactly as a browser would send it.

## What is measured

| Level | Metric |
|---|---|
| Retrieval (free) | recall@6 / @12: does a section's candidate list contain a file its expected changes depend on; MRR |
| Document | recall of documents with a `must` (or any) expected change; precision of reported documents |
| Item | an item is found when the section holding it is reported; section precision = reported sections with at least one expected item |
| Draft | LLM judge per draft and expected item: covered / partial / missing, false statements, unnecessary changes. A draft is *correct* if it covers at least one item without a false statement, or, in a section without expected changes, if it answers `no_change`. Item coverage counts covered as 1, partial as 0.5 over all expected items (end to end) |
| Cost and time | Jev input tokens and USD, model USD per draft (cached answers counted at their original cost), summed Jev response time |

The judge (`judge.mjs`, `gemini-2.5-flash`, temperature 0, cached) sees the section, the changed lines, the expected items and the code excerpts the writer saw. It was calibrated against 28 hand labels in `labels.json` (labelled by the coding agent, not yet reviewed by a person): exact agreement 82 %, covered-or-partial vs. missing 93 %, false statement yes/no 9 of 11. All five disagreements are one step apart. The judge does not penalise a draft that switches the language of a section; the product now rejects those itself.

## How to run

```powershell
# free: retrieval only, BM25 with and without the cap on test/script excerpts
node --use-system-ca mcp/eval/retrieval.mjs
# real Jev (about 0.03 USD for all four benchmarks), plus drafts and judge (about 0.15 USD)
node --use-system-ca --env-file=frontend/.env.local mcp/eval/run.mjs [--bench mobiq,httpx,zx,cobra] [--drafts] [--judge] [--draft-model gemini-3.5-flash-lite]
node mcp/eval/table.mjs --markdown   # latest report per variant and benchmark
node mcp/eval/sweep.mjs              # Jev thresholds on the cached answers, free
node mcp/eval/calibrate.mjs          # judge vs. hand labels, free
node mcp/eval/costs.mjs              # everything spent so far, from the caches
```

Reports are written to `mcp/state/eval` (git-ignored) together with all caches, so a repeated run costs nothing. The variants that lost (hybrid and graph retrieval, model findings in the check, full-text drafts) are in commit `be7355f`; check it out to reproduce their rows.

## Results (4 October 2026)

### Finding the sections

Jev, six excerpts per section, thresholds 0.6/0.5. Item recall / section precision; document recall of `must` changes in brackets.

| Variant | MOBIQ | httpx | zx | cobra | Check cost (all four) |
|---|---|---|---|---|---|
| BM25 (baseline) | 89 / 96 (85) | 75 / 18 (50) | 94 / 75 (100) | 100 / 38 | 0.028 USD |
| **BM25 + at most one test/script excerpt** | **89 / 96 (85)** | **75 / 19 (50)** | **94 / 67 (100)** | **100 / 38** | 0.028 USD |
| Hybrid (identifier index, resource keys → code, per-heading queries) | 89 / 96 (85) | 75 / 18 (100) | 75 / 71 (0) | 100 / 42 | 0.029 USD |
| Hybrid + code-graph neighbours | 84 / 100 (81) | 75 / 18 (100) | 69 / 67 (0) | 100 / 42 | 0.029 USD |
| BM25 + Jev + model findings with checked quotes (gemini-2.5-flash, prompt v3) | 87 / 96 | 75 / 19 | 94 / 67 | 100 / 38 | 0.24 USD |
| same, prompt v4 (old/new value contrast check) | 74 / 95 | 75 / 21 | 94 / 67 | 100 / 45 | 0.24 USD |
| Hybrid + Jev + findings (gemini-2.5-flash-lite, prompt v1) | 89 / 96 | 75 / 17 | 94 / 75 | 67 / 50 | 0.06 USD |

Retrieval alone: the cap on test and script excerpts raises zx recall@6 from 63 % to 100 % and changes nothing elsewhere (recall@12 is 100 % on three benchmarks and 88 % on httpx). The identifier index raised MRR on MOBIQ and httpx but lost zx's only `must` item; graph neighbours lost recall twice. Jev thresholds were swept offline: no setting brings httpx section precision above 33 %.

### Drafting the correction

All on the reported sections of the BM25 + cap check. Correct drafts / drafts; drafts with false statements (statements); item coverage.

| Variant | MOBIQ | httpx | zx | cobra | USD per draft |
|---|---|---|---|---|---|
| Full section, prompt v7, gemini-2.5-flash-lite (baseline) | 8/24 · 3 (8) · 18 % | 0/16 · 0 · 6 % (13 rejected, one translated to German) | 0/9 · 0 · 0 % | 0/13 · 1 (1) · 0 % | 0.0003 |
| Line edits (patch v1), 2.5-flash-lite | 7/24 · 3 (12) · 22 % | 0/16 · 1 (1) · 0 % | 0/9 · 3 (4) · 9 % | 0/13 · 0 · 0 % | 0.0005 |
| Patch v1 + model findings from the check (2.5-flash) | 12/21 · 2 (2) · 40 % | 0/14 · 1 (2) · 6 % | 1/9 · 3 (4) · 13 % | 0/11 · 1 (1) · 0 % | 0.0005 + 0.003 check |
| Patch v2 (quoted findings, then edits), 2.5-flash-lite | 8/24 · 6 (14) · 26 % | 2/16 · 0 · 31 % | 0/9 · 2 (6) · 9 % | 0/13 · 6 (10) · 8 % | 0.0006 |
| **Patch v2, gemini-3.5-flash-lite** | **14/24 · 1 (2) · 31 %** | **9/16 · 0 · 13 %** | **3/9 · 0 · 3 %** | **8/13 · 0 · 0 %** | 0.002 |
| Patch v3 (additions encouraged), 3.5-flash-lite | 10/24 · 2 (7) · 31 % | 8/16 · 0 · 13 % | 3/9 · 0 · 3 % | 8/13 · 0 · 0 % | 0.002 |

Built in: BM25 with the test/script cap, Jev with one retry per malformed answer, and patch v2 drafts with `gemini-3.5-flash-lite`. It writes the fewest false statements and the most correct drafts, and it answers `no_change` on most sections that did not need a change (httpx 10, cobra 13). On MOBIQ all 21 drafts are in sections with an expected change; on httpx only 1 of its 6 drafts is (zx: 1 of 1, cobra: no draft).

## Limits

- The open-source ground truth is small (30 items) and was curated by one reviewer (the coding agent) from the maintainers' diffs. Documentation that was already wrong and that maintainers never fixed counts as a false report. A manual review of the extra httpx reports found mostly real false alarms (nitpicks about example values, ordering, unlisted parameters) and one borderline real issue.
- Each variant ran once. Jev and the models are not perfectly deterministic, so differences of one or two drafts are within noise.
- Retrieval recall is measured at file level; a hit in the right file may still be the wrong excerpt.
- On open-source code the check reports two to five times more sections than the maintainers changed (section precision 19 to 67 %). The drafting step filters most of them with `no_change`, but the reviewer still sees the proposals.
- Missing features (the zx and cobra items are mostly additions) are rarely drafted: item coverage 0 to 13 % outside MOBIQ.
- Code graph and identifier index are measured only on these four benchmarks; Python and Go have no parser here, so graph expansion is a no-op there.
- The language guard knows German and English only.

Spent on these measurements: 1.43 USD in cached answers plus roughly 0.1 USD in failed calls that were not cached (`node mcp/eval/costs.mjs`).
