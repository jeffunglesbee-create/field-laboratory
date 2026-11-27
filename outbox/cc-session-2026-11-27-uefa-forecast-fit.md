# CC session 2026-11-27 — UEFA forecast, Task 2: the pre-registered fit (in progress)

**Repo:** field-laboratory. **Spec:** `docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md`, Task 2. **Owner words:** "confirmed, pull-only" (2026-11-27), the Rule F scope this CC-CMD was waiting on: a modelled UEFA forecast, pull-only, drawn on request; Rule A (autonomous push) not cleared.
**Companion record:** `outbox/cc-session-2026-11-27-uefa-forecast-measure.md` (Task 0, Task 1 verified done by another session).

## HEAD progression (the EPL fit's order, mirrored)

| step | commit | what | state |
|---|---|---|---|
| 1 | `dc9fdce5` (2026-11-27T20:49:09Z) | **the rule, nothing fetched or fitted** (`outbox/forecast-fit-uefa-2026-11-27.mjs`); RULE block sha256 `6cf976ba8b895439894346c066c22ff752d2789b208cdccdb563ddae41118cf1`, 10,608 characters | committed |
| 2 | this commit | the data fetch: `scripts/uefa-fit-data.mjs` and `.github/workflows/uefa-fit-data.yml` (dispatch only; reads the relay's public `/context/date` for every day of two windows, keeps the three main UEFA labels; no model number) | committed here; the run and the two bundles follow |
| 3 | (later) | the fit and score code, added to the same file with the RULE block byte-identical, BEFORE the run | not started |
| 4 | (later) | the run's output | not started |
| 5 | (later) | an independent recompute and a break-it-on-purpose proof | not started |
| 6 | (later) | the verdict document and the CC-CMD status | not started |

## What was fixed first, and why it matters

The rule block fixes, before any UEFA model number exists: the model (the EPL's `table-v2` form, three constants refitted), the league-phase definition (mechanical, from the archive's own rows), the eligibility (both clubs on at least 3 league-phase matches), the folds (leave one competition out), the benchmarks (a base-rate forecast), six gating parts U1 to U6, and a NO FURTHER LOOK clause. It discloses what was and was not seen (row counts and date lists; ESPN completed-match counts; nine results from one served day; no tally and no model number) and what the data cannot say. Verify the hash at any time: `node outbox/forecast-fit-uefa-2026-11-27.mjs --print-rule-hash`.

## Errors, matter-of-fact

- The repo's tee audit failed the first commit of the workflow: its first step piped into `tee` without `pipefail`. Fixed (`shell: bash` and `set -o pipefail`) and recommitted; the audit now reads 0 unguarded.
- The repo's `check:history` rule refused a commit that staged `scripts/` source without an `outbox/` entry; this document is that entry.
