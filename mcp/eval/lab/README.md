# Detection lab (10–11 October 2026)

Experiments on how to find outdated documentation cheaply: Jev (TypeSafe System One, about 0.04 USD per million
input tokens) as detector, local LLMs instead of Gemini, and a code↔documentation entity graph for changes. All
scripts reuse the benchmarks of `mcp/eval` and write their caches and reports to `mcp/state/eval/lab` (git-ignored).
Gemini was not used; it comes last, as the reference.

| Script | What it measures |
|---|---|
| `jev-detect.mjs` | Jev alone on the initial check, three ways to ask (per excerpt, per section, per statement), thresholds swept offline |
| `llm-check.mjs` | the section check with any model, optionally only on Jev's sections and with Jev's doubtful statements as `suspects` |
| `combine.mjs` | union and intersection of an LLM run and a Jev run, offline |
| `misses.mjs` | per missed item: was the code in the prompt (judgement miss) or not (retrieval miss) |
| `impact.mjs` | change mode on MOBIQ's eight 26.4 changes (ground-truth.json), document level |
| `bench26.mjs` | change mode on the 23 commits of `mobiq/bench-26.5` against the clean 26.4 documentation |

## Initial check (documentation vs. current code)

Item recall must / all, section precision. Gemini = `gemini-3.5-flash-lite` section check of 5 October (cached).
Local = Qwen3.5-9B Q4_K_M in llama.cpp on the laptop GPU (RTX 3500 Ada, 12 GB), thinking budget 2048 tokens.

| | MOBIQ | chalk | ky | axios |
|---|---|---|---|---|
| Gemini section check (about 0.14–0.6 USD) | 83 / 79 · 100 % | 86 / 89 · 100 % | 100 / 71 · 83 % | 100 / 92 · 25 % |
| Local 9B section check (0 USD, 8–26 min) | 69 / 68 · 100 % | 43 / 44 · 100 % | 17 / 14 · 50 % | 100 / 100 · 50 % |
| Jev per excerpt, k = 6, p ≥ 0.6 (≤ 0.01 USD) | 88 / 87 · 97 % | 71 / 67 · 57 % | 83 / 93 · 53 % | 100 / 100 · 13 % |
| Jev per statement, p ≥ 0.8 | 92 / 87 · 91 % | 71 / 78 · 57 % | 67 / 79 · 55 % | 100 / 100 · 13 % |
| **Local 9B ∪ Jev per excerpt, k = 14, p ≥ 0.8** | **83 / 81 · 100 %** | **86 / 89 · 71 %** | 50 / 50 · 56 % | 100 / 100 · 22 % |

- On MOBIQ (German business documentation) Jev alone finds more than Gemini; on the open-source libraries it flags far
  too much (httpx 3–9 %, axios 10–25 % precision), so it is a cheap filter there, not a judge.
- Every miss of the local model on MOBIQ had the right code in its prompt (`misses.mjs`): retrieval is not the
  bottleneck of the initial check, the model's judgement is. An entity graph does not help here.
- Qwen3.6-35B-A3B (MoE, experts partly in RAM) took 1.5–3.5 min per call on this laptop; a full check would take
  about 90 minutes. Unthrottled thinking made the 9B model think past Node's 300 s response timeout; a thinking budget
  of 2048 tokens fixed it.

## Change mode (which documents does a commit make outdated?)

`bench26.mjs`, 23 commits / 19 cases on the clean 26.4 documentation (38 documents): value and range changes, a
label rename, rules without and with a stale comment, a new rule, Kotlin, Delphi and template changes, an interface
rename with migration, a fact repeated in six documents, and five quiet commits (refactoring, tests, a fix that
restores documented behaviour, a revert, unused code behind a "feat" message). Document level, must / all recall.

| | must / all | precision | quiet commits silent | cost |
|---|---|---|---|---|
| Entity graph ∪ BM25 (candidates) | 97 / 95 | 13 % | 0 / 5 | 0 |
| + Jev, p ≥ 0.5 | 97 / 92 | 51 % | 4 / 5 | 0.007 USD |
| + Jev, p ≥ 0.7 | 87 / 85 | 66 % | 4 / 5 | 0.007 USD |
| + Jev, p ≥ 0.7, rules (release notes, unused code) | 87 / 85 | 75 % | 4 / 5 | 0.004 USD |
| same without commit messages, p ≥ 0.6 | 87 / 82 | 78 % | 5 / 5 | 0.004 USD |

What made the difference:
- The enclosing element of each changed line (nearest less-indented lines: the YAML key above `standard: 25`, the
  JSON object, the method signature). Without it, a one-line YAML change carries no name: graph recall without commit
  messages went from 32 % to 87 %, with Jev from 58 % to 87 %.
- Two generic rules: release notes of a shipped version are never edited by a later change, and a type or function
  that the change adds and nothing references (`git grep -w`) is not visible to readers.
- Commit messages help recall but mislead on purpose-made cases ("feat: … WhatsApp" with unused code).

On MOBIQ's eight real 26.4 changes (`impact.mjs`, feature level, 39 commits) the same pipeline found 82–84 % of the
expected documents at 90–93 % precision and never flagged a document the ground truth marks as not affected.
