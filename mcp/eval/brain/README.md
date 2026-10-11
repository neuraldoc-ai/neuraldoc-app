# Code brain lab (11 October 2026)

Which code does each documentation section describe? This lab measures ways to answer that for any codebase. The winner runs in the import as [`mcp/code-brain.mjs`](../../code-brain.mjs). Everything here reads from `mcp/state/eval` (git-ignored) and never feeds the product, except the 15 weights that were copied into `LINK_WEIGHTS`.

## Ground truth without anyone who knows the answer

`mine.mjs` takes the links from the maintainers' own history. A commit that changes a documentation section together with one to five product files links that section to those files. The rules:

- Only commits from the four years before the snapshot count, and only sections and files that still exist in it.
- Noise is left out: commit messages such as chore, release, bump, revert, typo or format; tests, build files, CI and the documentation site's own code.
- *Strict* keeps only commits that changed at most two sections and three files.

The mapping sees one snapshot without its history. Nobody who wrote the code or the documentation chose the links, which is why the newly added repositories have no curated ground truth of their own.

The ground truth is incomplete and noisy. It knows only the files a commit happened to change with the section, and a sweeping commit links unrelated sections. Absolute numbers are therefore low; the comparison between methods on the same ground truth is what counts. Precision is measured separately by a blind judge (below).

Dev and test split. Methods, signals and weights were built and fitted only on the nine **dev** repositories. The six **test** repositories were cloned for this lab and scored with frozen code and weights: once in the first test run, and again after the final clean-up of the code.

| Repository | Split | Language | Architecture | Sections with ground truth (strict) |
|---|---|---|---|---|
| ky v2.1.0 | dev | TypeScript | library, README only | 16 (11) |
| zx 8.5.0 | dev | TypeScript | CLI, docs folder | 14 (10) |
| httpx 0.28.1 | dev | Python | library, mkdocs | 18 (13) |
| cobra v1.10.1 | dev | Go | library, site | 11 (8) |
| linkding v1.47.0 | dev | Python, TS | Django web app | 15 (12) |
| graphhopper 11.1 | dev | Java | multi-module Maven, routing engine | 17 (10) |
| textual v8.2.8 | dev | Python | framework, mkdocs | 159 (90) |
| detekt v2.0.0-alpha.6 | dev | Kotlin | multi-module Gradle, rule sets | 8 (5) |
| immich v3.3.1 | dev | TS, Dart, Python | monorepo: server, web, mobile, ML service | 53 (38) |
| okhttp parent-5.5.0 | test | Kotlin, Java | multi-module Gradle | 10 (6) |
| fiber v3.5.0 | test | Go | framework with middleware packages | 209 (109) |
| trpc v11.21.0 | test | TypeScript | pnpm monorepo, docs site | 66 (41) |
| testcontainers-java 2.0.5 | test | Java | one module per technology | 109 (62) |
| flask 3.1.3 | test | Python | framework, reStructuredText docs | 32 (19) |
| spring-modulith 2.2.0-M2 | test | Java | modular monolith toolkit, AsciiDoc | 24 (14) |

`translate.mjs` adds German documentation for English code. Gemini 2.5 Flash-Lite translated the documentation of httpx, flask and testcontainers-java. Code blocks, code spans, names and links stay unchanged, and section ids stay the same, so the same ground truth applies.

```powershell
node mcp/eval/brain/mine.mjs                                   # ground truth for every repository (clones in mcp/state/eval/src)
node mcp/eval/brain/run.mjs --strict [--split test] [--methods today-retrieval,product] [--lang de] [--show 5]
node mcp/eval/brain/fit.mjs --strict --no-emb                  # weights on dev, leave-one-repository-out, threshold table
node mcp/eval/brain/clean.mjs [--split test] [--examples]      # clean-up against the maintainers' later fixes
node --use-system-ca --env-file=frontend/.env.local mcp/eval/brain/judge.mjs   # blind precision judge (Gemini)
```

Embedding methods (`sig-emb*`, `learned`) need a local llama.cpp server with Qwen3-Embedding-0.6B on port 8091 (see `embed.mjs`). Gemini calls go through `llm.mjs`: they are cached and counted in `ledger.json`, and refused past the budget.

## Results: the mapping

Metrics per section: hit@k means a linked file is among the first k product files. Also r10 (share of linked files in the top 10) and MRR. Each repository is averaged first and counts once.

**Held-out test repositories, strict ground truth (251 sections):**

| | hit@1 | hit@3 | hit@5 | r10 | MRR | hit@3 per repository |
|---|---|---|---|---|---|---|
| today's retrieval of the initial check | 45 % | 63 % | 71 % | 70 % | 57 % | okhttp 33 · fiber 78 · trpc 46 · testcontainers 73 · flask 68 · spring-modulith 79 |
| BM25 alone | 46 % | 62 % | 72 % | 70 % | 57 % | |
| local embedding alone (Qwen3-Embedding-0.6B) | 44 % | 63 % | 72 % | 70 % | 57 % | |
| **code brain (product)** | **53 %** | **74 %** | **80 %** | **74 %** | **64 %** | okhttp 33 · fiber 83 · trpc 71 · testcontainers 81 · flask 74 · spring-modulith 100 |
| code brain + embedding as eighth signal | 52 % | 72 % | 81 % | 76 % | 64 % | |

On all test sections (loose ground truth): today 55 / 70 / 77 % (hit@1 / 3 / 5), the code brain 57 / 78 / 85 %, MRR 65 → 69 %.

**Dev repositories, strict (197 sections).** Weights scored leave-one-repository-out, so each repository was scored with weights fitted on the other eight.

| | hit@1 | hit@3 | hit@5 | MRR |
|---|---|---|---|---|
| today's retrieval | 52 % | 66 % | 73 % | 61 % |
| hand-weighted fusion of the signals | 48 % | 63 % | 70 % | 58 % |
| embedding alone | 49 % | 72 % | 83 % | 63 % |
| learned fusion without embedding (product) | 54 % | 68 % | 76 % | 64 % |
| learned fusion with embedding | 59 % | 74 % | 81 % | 69 % |

Single signals on dev, hit@3, loose: BM25 65 %, definitions 50 %, tests leading to the tested file 51 %, document path 24 %, imports and modules 17 %, named files almost never fire. None is enough alone. Fitted weights combine them; hand weights made things worse.

**German documentation, English code** (strict, product):

| | English hit@3 / MRR | German hit@3 / MRR |
|---|---|---|
| testcontainers-java + flask (test) | 77 % / 63 % | 79 % / 69 % |
| httpx (dev) | 77 % / 68 % | 77 % / 63 % |
| today's retrieval on the two test repositories | 71 % / 57 % | 70 % / 56 % |

The strongest signals are names, paths and imports, and they do not change with the language of the prose. The multilingual embedding raised httpx in German to 92 % hit@3; on the test repositories it added nothing.

**Precision, judged blind** (`judge.mjs`, Gemini 2.5 Flash-Lite with a thinking budget of 1,024). The sample was 20 sections with prose per test repository, chosen evenly over the documentation rather than from the ground truth. The judge saw the product's links (share ≥ 0.1), as many files from today's retrieval, all merged and shuffled. For each file it saw path, defined names and best excerpt.

| | links | describes | takes part | unrelated |
|---|---|---|---|---|
| code brain | 143 | 76 % | 9 % | 15 % |
| today's retrieval (same number of files) | 143 | 67 % | 16 % | 17 % |

**Which links to keep** (dev, leave-one-repository-out; precision is a lower bound against the incomplete ground truth):

| softmax share | files per section | sections with a link | precision ≥ | right file kept |
|---|---|---|---|---|
| 0.05 | 2.8 | 100 % | 30 % | 64 % |
| **0.1 (product)** | 1.6 | 95 % | 39 % | 55 % |
| 0.2 | 1.0 | 80 % | 47 % | 45 % |
| 0.5 | 0.4 | 38 % | 74 % | 28 % |

Between 0.03 and 0.1 the product keeps up to four more files per section as weak links for change impact.

## What did not work

| Idea | Result |
|---|---|
| Gemini 2.5 Flash-Lite picks the files from the top 12 (path, names, best excerpt) | httpx and linkding strict: hit@1 56 → 48 %, MRR 70 → 65 %. The picks were plausible but unreliable ("event hooks" → `mkdocs.yml`), 0.017 USD for 25 sections. Not pursued. |
| Hubness correction of the embedding (CSLS: minus each file's mean best cosine) | hit@3 72 → 69 %: the linked files are often central files themselves |
| Embedding as default | best single signal on dev, no gain on test. The product needs no model, and a 1,500-file import would need an embedding model in the container. Kept as an option in the lab (`learned`). |
| Brain links as extra excerpts for the initial check | On all eight benchmarks of `mcp/eval`, the code file of an expected change was already among the check's excerpts in 86–100 % of the items, and the boost changed nothing. It would only change every prompt (and the cached answers), so it was left out. The brain's value is the map itself: change impact, clean-up, navigation. |
| Fixed hand weights | worse than BM25 alone on the large repositories |

## Results: clean-up

`clean.mjs` uses the newest release at least a year before the snapshot.

- *Undocumented:* the brain lists interface names no document mentions. They count as found when the maintainers documented them by the snapshot.
- *Dead mentions:* the brain lists names the documentation writes like code that no code file contains. They count as confirmed when the maintainers removed them by the snapshot.

| | undocumented, later documented: in the top 50 / anywhere in the list | dead mentions: listed / removed later |
|---|---|---|
| dev (9 repositories) | 17 / 79 (in file order, top 50: 1) | 1,128 without the filters, 675 with them / 57 |
| test (6 repositories) | 14 / 70 | 882 / 19 |

Both lists are candidates, not findings. Maintainers document few names a year, and many listed names are internal or belong to other tools: Werkzeug in the Flask documentation, JVM flags, example variables. The coverage prior (a file whose options are mostly documented is where a gap matters) made no measurable difference against plain fan-in: 31 against 30 found in the top 50. Removed names still need a confirmation before a deletion is proposed, as the initial check does with Jev.

## Costs

0.134 USD in Gemini calls for the whole lab: translation 0.073, reranking 0.017, judge 0.044. The local embedding server ran for a few minutes on the laptop GPU. The product mapping itself costs nothing and takes 0.4 s (flask, 102 files) to 7 s (immich, 1,868 files, 400 sections).

## Limits

- Ground truth from co-changes only knows files that were changed together with a section. Sections like "Install" or the README introduction pick up version bumps.
- okhttp (6 strict sections) and detekt (5) are too small to read on their own.
- Definitions come from language-neutral patterns, not from a parser per language: a declaration in an unusual syntax can be missed.
- The weights were fitted on English documentation of open-source projects; German documentation was tested only as translations.
