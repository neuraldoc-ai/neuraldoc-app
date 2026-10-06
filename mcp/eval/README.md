# Evaluating the initial check

How well does the initial check find documentation that no longer matches the code, and how good are the corrections it proposes? This folder measures that on eight benchmarks with real LLM and Jev calls. The product never reads anything from here.

## Benchmarks

| Benchmark | Case | Documentation | Code | Expected changes |
|---|---|---|---|---|
| `chalk` | tiny library, the README is the only documentation, imported inside the repository | `chalk/chalk` v5.3.0 `readme.md` plus three planted outdated statements from chalk's own older API | v6.0.1 | 9 |
| `ky` | small TypeScript library with one long README (45 KB, 35 sections) | `sindresorhus/ky` v2.0.0 `readme.md` | v2.1.0 | 14 |
| `axios` | documentation in its own repository | `axios/axios-docs` (English pages, last content change February 2026) | `axios/axios` v1.20.0 (August 2026) | 12 |
| `linkding` | Django web app with database migrations and a documentation site in `docs/` | `sissbruecker/linkding` v1.44.0 (`README.md`, `docs/src/content/docs/*`) | v1.47.0 | 12 |
| `mobiq` | German ERP sample: Java, Kotlin, TS, Pascal, SQL; Confluence pages, Word, Excel, PDF | MOBIQ 26.3: 33 Confluence pages + 7 files | MOBIQ release 26.4 (`datasets/mobiq-code`) | 62 from `datasets/mobiq/data/ground-truth.json` |
| `httpx` | Python | `encode/httpx` 0.27.2 (`README.md`, `docs/**`) | 0.28.1 | 8 |
| `zx` | TypeScript CLI | `google/zx` 8.3.0 (`README.md`, `docs/*.md`) | 8.5.0 | 16 |
| `cobra` | Go | `spf13/cobra` v1.8.1 (`README.md`, `site/content/**`) | v1.10.1 | 6 |

The open-source benchmarks follow real project history: documentation of the older tag, code of the newer one. Ground truth is the set of documentation changes the maintainers made between the two tags *that the newer code supports*, each read in the diff and checked against the code. Typos, prompt prefixes, sponsor lists, link moves and changes the code cannot decide (distribution channels, CI examples, security advice) are left out; the `notes` field of each file lists them. `axios` compares a documentation repository the maintainers stopped updating with the current code: its items are option lists and statements the code contradicts, curated by reading `lib/` and `index.d.ts`. `linkding` includes one gap the maintainers never fixed (bundle fields from migration 0054 missing in `api.md`). Every item names its section (`anchor`, a literal string of the old document) and the code files it depends on (`files`).

Three options of a benchmark file shape the upload: `docsInRepo` (old documentation inside the repository, the README-only case), `docs.repo` (documentation from its own repository) and `mutations` (planted changes: an exact text in the old documentation replaced by an outdated statement, each with its own item). The repositories are cloned on first use into `mcp/state/eval/src` and checked out by tag or commit; the code is uploaded without its own new documentation, exactly as a browser would send it.

## What is measured

| Level | Metric |
|---|---|
| Item | An item is found when its section is reported, or when a reported section of the same document adds the item's key name (the completeness pass inserts missing entries where the document's list is, not at the maintainers' anchor). Recall for `must` items and for all; section precision = reported sections with at least one expected item (low where the code shows drift the maintainers never fixed). |
| Judge | `judge.mjs` (`judgeFindings`, `gemini-2.5-flash`, thinking budget 2048, temperature 0, cached) sees the section, the corrected section, the findings with their cited code, the expected items and the excerpts. Per item: covered / partial / missing (coverage: covered 1, partial 0.5). Per finding: correct / trivial / unproven / wrong. False statements in changed lines. |
| Cost | LLM USD of the check (first pass, second look, completeness), Jev USD, judge USD. Cached answers cost nothing and are counted as cached. |

The judge is lenient: it rated every finding of these runs correct, including findings a person rejects. Precision below is therefore reported from hand review, the judge only for item coverage.

## How to run

```powershell
# real LLM and Jev calls plus the judge; identical requests come from the caches
node --use-system-ca --env-file=frontend/.env.local mcp/eval/run.mjs [--bench chalk,ky,axios,linkding,mobiq] [--model gemini-3.5-flash-lite] [--no-judge] [--no-veto] [--label name]
# free: retrieval of the October 4 variants
node --use-system-ca mcp/eval/retrieval.mjs [--bench mobiq,httpx,zx,cobra] [--strategies cap,nocap]
```

Reports are written to `mcp/state/eval` (git-ignored) together with all caches: `check-cache/` holds the model answers (content-addressed, shared across runs), `judge/` the judge answers. A repeated run costs nothing; a changed prompt or code makes new requests. `table.mjs`, `sweep.mjs`, `calibrate.mjs` and `costs.mjs` read the reports of the October 4 check (commit `2433c97`).

## Results (5 October 2026): the section check

`gemini-3.5-flash-lite` (thinking level medium), second look on, Jev as second opinion, completeness pass per document. Item recall must / all; judge coverage all; findings; hand review.

| Benchmark | Sections checked | Recall must / all | Section precision | Coverage (judge) | Findings | Hand review | LLM cost of one full check |
|---|---|---|---|---|---|---|---|
| chalk (README only) | 11 of 13 | 86 / 89 % | 100 % | 56 % | 5 | 5 of 5 correct | about 0.14 USD |
| ky (long README) | 34 of 35 | 100 / 71 % | 83 % | 43 % | 9 | 9 of 9 correct | about 0.36 USD |
| axios (separate docs repo) | 28 of 30 | 100 / 92 % | 25 % | 50 % | 21 | sample of 6 correct, 15 option entries checked against `index.d.ts` | about 0.25 USD |
| linkding (Django, database) | 65 of 67 | 40 / 50 % | 43 % | 21 % | 12 | sample of 3 correct: two wrong defaults and an auth keyword the maintainers never fixed | about 0.6 USD |
| mobiq (German, Office, DB) | 47 of 51 | 83 / 79 % | 100 % | 44 % | 34 | sample of 12 correct | about 0.6 USD |
| neuraldoc-app (own docs, no ground truth) | 68 of 69 | – | – | – | 8 | 4 correct, 4 trivial, 0 wrong | about 0.9 USD |

Section precision against the ground truth is low on axios and linkding because the check reports real drift the maintainers never documented: `axios.query`, `postForm`/`putForm`/`patchForm`, `formSerializer.maxDepth`; linkding's `LD_SINGLEFILE_TIMEOUT_SEC` default (code 120, docs 60), `OIDC_RP_SCOPES` default (`openid email profile`, docs `oidc email profile`), the `Bearer` keyword for API tokens. Each was checked in the code.

Compared with the Jev-only check of October 4 (below), on the README-only case that started this work: the old check sent both README sections to drafting, and the model answered "no change" for both (0 findings); the section check finds 5 of the 7 must items with correct one-line edits. On MOBIQ, item recall went from 89 to 79 %, section precision from 96 to 100 %, coverage of the expected changes by the proposed text from 31 to 44 %.

What changed the numbers (each measured on these benchmarks):

| Change | Effect |
|---|---|
| One section per heading instead of 6,000-character slices | the README case went from 2 to 11 checked sections |
| Thinking level medium for `gemini-3.5-flash-lite` (minimal and low produced no thought tokens at all) | chalk: from 1 to 5 correct findings |
| Three passes in the prompt (statements, lists, names that are gone) and "do report everything the code proves" | missing list entries found (chalk modifiers, ky retry methods) |
| Names mentioned in the section looked up in an identifier index ("nicht im Code") | removed names found and verified by the server |
| Completeness pass per document with one decision per candidate | axios from 0 to 92 % item recall, linkding from 25 to 50 % |
| Files named in a section first | architecture and setup sections see the files they describe |
| Second look on section findings | own docs: 7 of 7 wrong findings dropped (2 of 10 correct ones too); no loss on chalk, ky, mobiq. On completeness entries it rejected correct missing options (axios 92 → 0 %), so it is not used there. |
| `gemini-2.5-flash` (thinking budget 1024) instead | same recall on chalk, cheaper, but 3 of 12 findings wrong and 3 trivial; not the default |

Known limits: architecture prose about internal flows (which function calls which) is checked only against a few excerpts and can pass although outdated; a removed name can live in an uploaded dependency folder (`vendor`), which is why a deletion needs Jev's confirmation; the judge does not detect trivial or context-wrong findings.

Spent on these measurements: about 5 USD in model calls (most of it during prompt iterations, each of which invalidates the cache) and 0.6 USD for the judge.

## neuraldoc on itself, with ten planted mismatches (6 October 2026)

`self-run.mjs` imports this repository as a GitHub clone would bring it (tracked and new files, no submodules, without `benchmarks/`) and plants the ten mismatches of `benchmarks/self.json`, each of a different kind: five where the documentation was edited to a wrong statement (a number, a tool name that does not exist, a time window, a file mode, a behaviour), five where the code changed and the documentation stayed (a default, a row limit, a clone depth, a renamed environment variable, a new undocumented one). An item counts when a finding quotes the stale statement or adds the missing name. Every other finding was read by hand.

```powershell
node --use-system-ca --env-file=frontend/.env.local mcp/eval/self-run.mjs [--label name] [--clean] [--history]
node --env-file=frontend/.env.local mcp/eval/section-why.mjs "README › Configuration"   # what one section saw and answered, from the cache
```

| Variant | Planted found | Other findings: correct / false alarm | Other benchmarks (must / all) |
|---|---|---|---|
| section check of 5 October | 6 of 10 | 2 / 4 | unchanged |
| plus exact places for names and numbers | 7 | 3 / 7 | – |
| plus a list of every fact before the findings, for every section | 9 | 6 / 4 | chalk 71 / 78 %, ky 83 / 64 %, mobiq 63 / 61 %: worse |
| **final:** exact places and fact list only for sections that state many values; other sections keep the prompt of 5 October word for word | **8** (best of the runs: 9) | 5 / 3 | chalk 86 / 89 %, ky 100 / 71 %, axios 100 / 92 %, mobiq 83 / 79 % (all as before), linkding 60 / 67 % (before 40 / 50 %) |

Confusion matrix of the final run, per documentation section (71 checked): 7 sections with a planted mismatch reported, 2 not reported, 3 sections without a planted mismatch reported (one of them real drift: environment variables missing in `mcp/README.md`), 59 correctly left alone. Per finding: 17 findings, 14 correct (9 on planted mismatches, 5 on real drift such as undocumented environment variables), 3 false alarms (a ratio read the wrong way round, a security rule about `VITE_` keys read as contradicted by public `VITE_` settings, an evaluation-only variable proposed for the product documentation).

The two misses: the Jev budget default was changed in one of three places that set it (`.env.example` and an older mapping script still say 0.25), so the model took the wrong place as the reference; "answers are not cached" names nothing the code has and its evidence is spread over several files, so it was found in two of six runs. What did not work and is not used: the fact list on every section (it crowded out missing entries on tables of fields and terms), and a coarse fact list (one entry per table row checked whether a name exists, not its default). `NEURALDOC_CHECK_STATEMENTS=on|off` forces the fact list for experiments. Spent on these runs: about 7 USD.

**Values and the history** (`mcp/change-facts.mjs`, no model). With `--history` the repository comes as a clone by URL would: the documentation mutations are part of the release tagged `v1.0`, every code mutation is a commit after it (field `commit` in `self.json`). The diffs show 4 changes (Jev budget 0.25 → 0.5, rows 1000 → 500, clone depth 300 → 50, `NEURALDOC_GIT_TOKEN` → `NEURALDOC_GITHUB_TOKEN`); sections that still state them get the change as a hint.

| Variant | Planted found | Questions to the reviewer | LLM cost |
|---|---|---|---|
| upload without history, value conflicts as questions | 9 of 10 (the Jev budget as a question) | 3, all on the Jev budget | 0.77 USD |
| with history, hints only | 8 (the model saw the Jev budget, the second look dropped it) | 0 | 0.86 USD |
| **with history, a hint the proposal still states becomes a question** | **10** ("not cached" found by chance this time) | 6: Jev budget in README (planted), rows in README (real, missed by the model), Jev budget in three places about the mapping run (where 0.25 is still the mapping's own default), the depth example in this architecture text | 0.47 USD (rest cached) |

## Comments inside the code (6 October 2026)

`mcp/comment-check.mjs` checks comments and docstrings against the code next to them. Ground truth is in `benchmarks/comments.json`:

| Set | What | Items |
|---|---|---|
| planted | wrong comments planted into copies of ky v2.1.0 (`source/`), httpx 0.28.1, cobra v1.10.1, axios v1.20.0 (`lib/`), linkding v1.47.0 (`bookmarks/`): wrong defaults, units, inverted rules, swapped order, stale names, wrong parameters; 30 provable in the same file, 6 only with code from another file | 36 |
| real | a wrong comment in the released code: linkding's `parse_timestamp` says milliseconds where the code starts with seconds | 1 |
| history | comments cobra's maintainers fixed later in commits that changed only comments (found by `mine-comment-fixes.mjs`); the check runs on the parent commit | 6 |

```powershell
node --use-system-ca --env-file=frontend/.env.local mcp/eval/comments-run.mjs [--repo ky,httpx] [--label name] [--dry]
node --use-system-ca --env-file=frontend/.env.local mcp/eval/comments-history.mjs
node --env-file=frontend/.env.local mcp/eval/comments-why.mjs ky-7,httpx-3   # the model's verdict for a missed item, from the cache
```

An item is found when a reported finding lies in its comment block. Everything else the check reports was read by hand.

| Variant (`gemini-3.5-flash-lite`, thinking medium) | Planted found | Other findings | Cost of a full run |
|---|---|---|---|
| one prompt, windows of 450 lines, second look | 28 of 36 | 38, about 35 correct | 1.4 USD |
| plus a verdict for every comment block first (checklist) | 29 | 31 | 1.5 USD |
| plus windows of 200 lines | 30 | 35 | 0.9 USD (larger files only) |
| plus findings-only prompt, union of both; signals next to their comment | **32 (89 %)**, real item found | 44, **39 correct (89 %)**, 5 wrong or debatable | 3.3 USD |
| history (cobra, real later fixes) | 3 of 6 found, 1 more found but rejected by the second look | – | 0.9 USD |

What the parts contribute:

| Part | Effect |
|---|---|
| Related code: definitions of names in the comment, places that use a documented option or field, definitions of called functions, then BM25 excerpts | the cross-file items (defaults in `normalize.ts`, `codes.is_error`) became findable; BM25 alone filled the budget with unrelated excerpts |
| Free signals without a model: documented parameters missing in the signature, Go doc comments naming another function, names in comments that no code line has | found real rot before any model call: axios `@param config` on `dispatchRequest(_config)`, a "FormData" doc comment above `getGlobal()`, cobra `CommandDisplayNameAnnoation` |
| Server verification: the quote must be inside a comment, the evidence must be code lines (not comments), the correction must still be a comment and change more than whitespace | evidence quotes the model attributed to the wrong excerpt are looked up in all files; a "//" comment the model retyped as " * " is still located |
| Second look | removes interpretations and intent comments ("this function does not modify the flags"); it also removed about one correct finding in five, which is why it keeps library names when the code imports another library |

Correct findings in the released code of these projects, each checked by hand: httpx `_CookieCompatResponse` documented as wrapping a `Request`, the transport docstring's `response.stream.read()` (the stream has no `read`), "Requires `pip install brotlipy`" while the code imports `brotli`/`brotlicffi`, "ASCII bytestrings" for `str` components; cobra's Markdown, reST and YAML generators copying "the file `cmd-sub-third.1`" from the man page generator, `ParsedFlags()` for `ParseFlags()`, `Eq` "unsupported types will panic" (only arrays, maps, slices and channels do); axios `@param {string}` for objects, arrays and booleans in `toFormData`, `@returns` on functions without a return value, "afterRedirects" for `beforeRedirects`, `isStandardBrowserEnv` for `hasStandardBrowserEnv`; linkding "Use URLField" above a `CharField`, the dev and prod settings both saying "Start from development settings".

On neuraldoc's own code (`mcp/`, `frontend/src/`, 168 windows, 2.0 USD, `comment-check-cli.mjs . --under mcp/,frontend/src/`): 10 findings, 7 correct and fixed (a log helper documented to log the cause, a ticket format `#128` the regular expression does not match, "two" editors where there are three, the `edited` field also set on a plain approval, a stale return description), 3 wrong (comments that explain why rather than what).

Spent on the comment experiments, including all prompt variants: 11.7 USD in 1,946 model calls.

Misses and limits: reasoning over several branches (ky: "413 is never retried" while a retry timing header makes it retry), code that runs only on another platform (cobra's `command_win.go`), regular expression semantics (axios: protocol-relative URLs). A doc comment that stands above the wrong function is found, but the proposed fix rewrites or deletes it instead of moving it. Spelling-level name findings (`requestURL` for `requestedURL`) are correct but trivial.

## Earlier results (4 October 2026): Jev check with separate drafts

The check below rated sections with Jev only and drafted corrections in a second step; the variants are in commits `be7355f` and `2433c97`.


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

### Limits of the October 4 measurement

- The open-source ground truth is small (30 items) and was curated by one reviewer (the coding agent) from the maintainers' diffs. Documentation that was already wrong and that maintainers never fixed counts as a false report. A manual review of the extra httpx reports found mostly real false alarms (nitpicks about example values, ordering, unlisted parameters) and one borderline real issue.
- Each variant ran once. Jev and the models are not perfectly deterministic, so differences of one or two drafts are within noise.
- Retrieval recall is measured at file level; a hit in the right file may still be the wrong excerpt.
- On open-source code the check reports two to five times more sections than the maintainers changed (section precision 19 to 67 %). The drafting step filters most of them with `no_change`, but the reviewer still sees the proposals.
- Missing features (the zx and cobra items are mostly additions) are rarely drafted: item coverage 0 to 13 % outside MOBIQ.
- Code graph and identifier index are measured only on these four benchmarks; Python and Go have no parser here, so graph expansion is a no-op there.
- The language guard knows German and English only.

Spent on these measurements: 1.43 USD in cached answers plus roughly 0.1 USD in failed calls that were not cached (`node mcp/eval/costs.mjs`).
