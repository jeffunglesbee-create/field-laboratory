# CC session — 2026-11-03 — the Drama backfill stored a refused read as a score, and the check that holds the fix

CC-CMD: `docs/CC-CMD-2026-11-03-drama-backfill-error-is-not-a-score.md` in field-relay-nba (script fix `961092d8`, reset `46dcb17c`, filing `66212686`). Here: the check and its mutants (LAB-FIRST-A: new checks land in the laboratory; the relay keeps the script).
HEAD: `221d808` → this commit · Branch: main.

## Why

The owner's list of what could not be verified on 2026-11-02 named "the Drama backfill 403". Measured: relay run 41235124610 (scheduled, 2026-10-31T19:37:51Z) was refused once by ESPN's side for Bayern v Dortmund, the first ESPN request of the run, and the script's `catch` wrote `drama_peak = 0` for it. The relay writes `WHERE drama_peak IS NULL` and lists only NULL rows, so that 0 can never be replaced. D1 today: `drama_peak` 0, `drama_arc` `null`, beside five Bundesliga rows of the same day that hold 52 to 70. The same request answers 200 today (427,492 bytes). Why the refusal happened is not established; what made it permanent is.

## What changed here

| file | what it is |
|---|---|
| `scripts/check-drama-backfill.py` | runs the relay's `scripts/drama-backfill.mjs` and `scripts/reset-drama-refused-read.mjs` UNMODIFIED against a local copy of the relay routes they call (missing-queue list, the guarded write, the ESPN proxy passing an upstream status through, `/d1/execute`, the two recompute posts). 8 scenarios, 88 checks |
| `scripts/mutate-drama-backfill.py` | Rule 90: 15 mutants of the backfill script and 4 of the reset, each on a copy in a temporary tree (`src/` linked), each required to turn the named scenarios red |
| `.github/workflows/verify.yml` | new job `drama-backfill` (own job, relay main checked out unpinned at `.relay-src`, node 22, python 3.11) |

## Verified, and what was not

| claim | status | evidence |
|---|---|---|
| a refused read (403, 429, 500, 503, dropped connection, body that is not JSON) writes nothing, is fetched once, and is scored by the next run | **VERIFIED** locally | check 88/88 on the fixed script, scenarios `refused_read` (36 checks) and `next_run_scores_it` |
| only a 404 or 410 stores the 0 mark, through the soccer, MLB and WNBA readers | **VERIFIED** locally | scenario `absent_event` |
| the check can be made to fail | **VERIFIED** locally | on the ORIGINAL script it is red with the 10-31 failure reproduced: `('...e4001', 0, None, 'stored')`; and 19 of 19 mutants caught, 59 s |
| the reset touches nothing unless the row is exactly the stored refusal, ESPN answers now, one row changes, and the row reads back NULL | **VERIFIED** locally | scenario `reset_row` and R01 to R04 |
| the workflows are valid | **VERIFIED** | `actionlint` exit 0 on `verify.yml` and on the relay's `reset-drama-refused-read.yml` |
| a missing ESPN event is a 404 through the relay | **MEASURED**, probe 2026-11-03 | `/espn-summary/sports/soccer/fifa.world/summary?event=1` and the MLB path both answered 404, body `espn-summary returned 404` |
| the reset on the real row, and the scoring run after it | **NOT YET** | see the relay CC-CMD's "Observed" |
| a scheduled run that meets a refusal leaves the game NULL | **NOT OBSERVED** | the stand-in proves the script; no real refusal has happened since the fix |
| the AFL reader | **NOT HELD** | it fetches ESPN directly; no scenario reaches it. It raises the same status error, and its failures are deferred by the same rule |

## Seen, not fixed (Rule 69)

- 35 other rows with `drama_peak = 0` in sports the script scores (MLB 30, WNBA 3, AFL 2): the stored 0 is the same for an unsupported sport, an empty reading, an AFL no-match and an error, so nothing proves them wrong. Listed in the relay CC-CMD.
- Serie A is soccer and `classifySport` returns `other` for it (100 rows at 0). Carried forward.
- A push to the relay alone does not run this job; the next laboratory push reads relay main.
