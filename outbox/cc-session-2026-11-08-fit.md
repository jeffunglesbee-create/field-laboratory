# Session 2026-11-08 — the fit: table-v1 refitted under a rule fixed first, and not shipped

**Verdict: DO NOT SHIP.** Nothing in `src/` changed. Rules R1–R5 hold; R6 (the fit is well posed) fails for the
candidate the selection rule picked, so the pre-registered rule says no.

Owner order: "Fit, further approval confirmed" (Sun 2026-11-08 15:42 ET), after
`outbox/cc-session-2026-11-08-calibrate-prior-season.md` found table-v1's probabilities about 2.4 times too steep on
last season. I read it as (a) fit now, and (b) ship a `table-v2` only if the fit passes an out-of-sample rule fixed before
any candidate's number is read. I said so to the owner in that sentence, with an off-ramp ("if you meant the fit only,
say so"), and the owner did not retract it. The rule did not pass, so reading (b) never mattered.

HEAD progression: `ad22828` → `6363ad8` (the rule and the hold-out, nothing fitted) → the commit carrying this document.

## The rule, and how each part came out

Fixed in `outbox/forecast-fit-2026-11-08.mjs` and committed in `6363ad8` before the first fit. Two candidates, fitted by
maximum likelihood on last season's 330 forecasts (both clubs on 5 or more games): **A** = home edge and logistic scale;
**B** = A plus the draw share's base and decay. B is chosen over A only if its 5-fold cross-validated log loss is lower by
a paired z of −2.0 or better. The chosen candidate's constants are rounded to two decimals before it is scored.

| rule | requirement | measured | |
|---|---|---|---|
| R1 | this season, 50 matches with both clubs on 5+ games: Brier below table-v1's, paired z ≤ −1.645 | 0.649 against 0.739, z −1.96 | pass |
| R2 | last season, cross-validated: Brier below a uniform guess, paired z ≤ −2.0 | 0.631 against 0.667, z −2.58, n 330 | pass |
| R3 | last season, cross-validated: Brier below table-v1's, paired z ≤ −3.0 | 0.631 against 0.689, z −3.40, n 330 | pass |
| R4 | opening weeks (both clubs on 1–4 games), each season: no worse than table-v1 | 0.681 against 0.860 (last season, n 40); 0.681 against 0.908 (this season, n 40) | pass |
| R5 | cross-validated home-win slope within 1.96 SE of 1 | 0.98 ± 0.21 | pass |
| R6 | the fit is well posed: two solvers agree, gradient vanishes, Hessian positive definite, no constant on a bound | B's draw decay is 63 ± 644 and the bound for it is 20 | **FAIL** |
| R7 | every integrity check holds | 39 of 40; the one red is B's well-posedness check, which is R6's fact counted again | **FAIL** (same cause) |

Selection: B beat A by z −2.91 (cross-validated log loss 1.047 against 1.124; table-v1 1.153), so S = B. B's constants:
home 0.428 ± 0.184, scale 1.147 ± 0.227, draw base 0.276 ± 0.044, draw decay 63.1 ± 644. Rounded, 0.43 / 1.15 / 0.28 /
63.09; the rounded decay is not a constant anyone would ship.

## What the data say

1. **The draw share is the larger defect, not the steepness.** table-v1 predicts a draw 15% of the time on average; 27%
   happened (330 matches). By the model's own gap (thirds, narrowest first) it predicts 23% / 15% / 8% and draws happened
   25% / 30% / 26%: draws are as common where the model sees a wide gap as a narrow one. Of the 39.74 log-loss units B
   recovers in-sample, A (scale and home edge only) recovers 12.07; the other 27.67 come from the draw constants.
2. **The steepness is real too.** A's scale is 1.105 ± 0.203 against the declared 0.55, about 2.0 times, and the
   cross-validated slope of S's home-win probability is 0.98 where table-v1's is 0.41.
3. **The draw decay is unidentified, not run away.** Re-fitting the other three constants at each fixed decay (training
   only, post hoc): decay 1.1 (table-v1's) costs 13.17 log-loss units more than the best, 2 costs 3.99, 5 costs 0.60, 10
   costs 0.13, and anything from 20 up costs 0.02 or less. The best is 63; 63 and 1,000,000 print as 340.89 and 340.90.
4. **A constant draw share (post hoc, not one of the two pre-registered candidates)** has cross-validated log loss 1.045
   against B's 1.047 (difference −0.003 ± 0.002, z −1.61) and A's 1.124 (z −2.96). Its constants, from the profile row at
   decay 1,000,000: home 0.42, scale 1.14, draw share 0.27. It is shown to say where the evidence points. It is not a
   verdict, and this season's matches were not scored against it.

## What the hold-out cannot say

Fifty matches from ten matchweeks. R1's z of −1.96 clears the pre-registered −1.645 and the interval is wide (Brier
difference −0.090 ± 0.046). The home-win slope on those 50 is 0.26 ± 0.39 for S and 0.15 ± 0.16 for table-v1: too few to
say whether S is calibrated there, and both are below 1. Why is untested; one hypothesis is that ratings from 5–9
games discriminate poorly. The opening-week Brier of S (0.681) is still above a uniform guess's 0.667 in both seasons.

## How the numbers were checked

- **Data.** This season's 100 finished EPL matches (relay archive, 87 day payloads, fetched 15:45–15:47 ET) agree with
  ESPN's current table (20 of 20 clubs equal on played, points, goals for, goals against), with the relay's FPL fixtures (100
  of 100 paired by date and score, 20 of 20 clubs mapped, no conflict) and with openfootball's 45 scored lines (45 of 45).
  Output: `outbox/forecast-fit-bundle-check-2026-11-08.txt` (32 of 32). Re-fetching the standings and FPL routes after the
  run returned the same byte counts (68,898 and 346,305).
- **Model.** The parametrised model at table-v1's constants equals the compiled F# model on all 460 forecasts of both
  seasons (max difference 0). It reproduces the earlier records: 0.689 / 1.153 on 330, 0.860 / 1.715 on the 40 opening
  weeks, and the five calibration bins of the 99-match record to the digit.
- **Fit.** Two unrelated solvers agree to 1e-12 in log loss; the gradient is below 1e-5. A second implementation in Python
  (`outbox/forecast-fit-crosscheck-2026-11-08.py`, scipy) recomputes the objective, both fits, the cross-validation, the
  selection z, every score the rule uses and the slope: 14 of 14 agree (`…-crosscheck-2026-11-08.txt`).
- **Mutation.** `outbox/forecast-fit-mutation-2026-11-08.mjs` breaks the data or the code 16 ways and requires the specific
  checks to go red: 16 of 16 caught (`…-mutation-2026-11-08.txt`). The first run caught 15; the miss is below.
- **The rule block did not move.** The header rule and the `RULE`/`decide`/tests block hash the same in `6363ad8` and
  in the committed file:
  `sed -n '/^\/\/ THE SHIP RULE/,/^\/\/ DATA\./p' | sha256sum` → `120bafe65e36772a…`;
  `sed -n '/^const RULE = {/,/^\/\/ -* the model, as a function of its constants/p' | sha256sum` → `5e55a529ca5fc903…`.

## Premises, each tried against one command (Rule 100)

| premise | the command | result |
|---|---|---|
| FPL's `finished` flag means played | count `finished`, `finished_provisional` and both-scores in `/fpl/fixtures` | 90 / 100 / 100: **refuted** for matchweek 10, whose 10 matches are provisional with scores. The first data run was red on it; the criterion is now provisional-with-scores |
| "Man United" and "Man Utd" are one club | pair archive against FPL by date and score; compare archive counts with ESPN's played | 20 clubs map to 20 FPL ids, no conflict; the count equals ESPN's for 20 of 20 only with the two spellings joined (8 rows through 10-25, 2 from 10-31) |
| `build/` matches `src/` | `npm run build`, re-run the committed prior-season script, diff against its record | `build/Desk.js` was older than `src/Desk.fs`; after the rebuild the output is identical to the committed record |
| two solvers agreeing verifies the fit | mutate the objective (Brier for log loss) and run the harness | **refuted**: every JavaScript check stayed green and only the Python recomputation went red, which is why it is in the record |
| B's decay has no finite optimum | the profile above | it has one (63) and it is unidentified. My status line to the owner said "no finite best value"; that was imprecise |
| the hold-out is disjoint from training | first hold-out date against last training date | holds (check in the output) |

## Defects in my own work, found and fixed

1. The FPL criterion above (the script's, not the data's).
2. The Python recomputation crashed instead of failing when the script produced NaN (JSON turns NaN into null), so the
   mutation "hold-out scored with table-v1's constants" was not caught by the check written for it. It now maps null back
   to NaN. Second run: 16 of 16.
3. R7 includes each candidate's well-posedness check, so an ill-posed candidate that was *not* selected would veto too. It
   did not matter here, because B was selected, and the rule block is frozen. Recorded rather than patched.
4. The script was changed after the pre-registration commit, all additively: 48 lines added, 13 removed. The removed lines are the
   usage text, the table-v1 oracle check (extended from Brier to log loss and the opening weeks), `fit()` and
   `cvPredict()` signatures (a base-constants argument defaulting to the old behaviour), and two check names. Added: the
   cross-validation leakage guard, the recount of the four match sets, the post-hoc profile and the feature dump. The numbers in
   FITS / SCORES / CALIBRATION / RULE are identical before and after.

## Reproduce

```
npm run build
S=<dir holding openfootball-2025-26.txt, fpl-fixtures-2025-26.csv, fpl-teams-2025-26.csv, espn-final-2025.json>   # recipe: forecast-backtest-prior-season-2026-11-08.mjs header
node outbox/forecast-fit-2026-11-08.mjs $S outbox/forecast-fit-holdout-2026-11-08.json --dump-features=/tmp/features.json
python3 -I outbox/forecast-fit-crosscheck-2026-11-08.py /tmp/features.json
node outbox/forecast-fit-mutation-2026-11-08.mjs $S outbox/forecast-fit-holdout-2026-11-08.json
```

The hold-out bundle (`outbox/forecast-fit-holdout-2026-11-08.json`, sha256 `074a2512…`) was built from these fetches
(no credentials; all three answered 200 when re-checked):
`for D in 2026-08-14 … 2026-11-08: curl -sS $RELAY/context/date/$D -o season/$D.json` (87 files), `$RELAY/espn-standings/soccer/eng.1/standings`,
`$RELAY/fpl/fixtures`, and openfootball `9ee7a0c351805c99cc334478a9bf04b7d0432fec/2026-27/1-premierleague.txt`, then
`node outbox/forecast-fit-2026-11-08.mjs $S <raw dir> --bundle-only --write-bundle=<path>`. `$RELAY` is
`https://field-relay-nba.jeffunglesbee.workers.dev`.

## Flag for a human (Rule 45)

The bundle commits dates, scores and counts that came from the relay's archive, ESPN's standings, FPL's fixtures and
openfootball's file. Nothing here assesses the terms those sources are published under. Flagged for a human to read.

## Not started, and what it needs

The finding points at a third candidate, a constant draw share (home, scale, one draw share: three constants). It was
not pre-registered, and this season's 50 matches have already been read for B, which makes them a weak test of something so close to B. A fair
test needs a season no number has been read from: **2024-25**.

- **What:** fit C on 2025-26's 330; score it on 2024-25 (both clubs on 5+ games) and on this season's matches; ship as
  `table-v2` only if a rule written and committed before any 2024-25 number is read passes.
- **Needs from the owner:** a go. It is a new candidate and a new rule, outside what "Fit, further approval confirmed" covered.
- **Unblocks:** three sources for 2024-25 (openfootball at a pinned commit, ESPN's final table via `?season=2024` on the relay,
  FPL's fixtures) read the way 2025-26's were, then the same checks.
- **Done condition:** a committed record whose last line is `VERDICT: SHIP` or `VERDICT: DO NOT SHIP` with the rule named, from
  a script whose rule block hashes the same in the commit that preceded the first 2024-25 number.
- **If SHIP:** a new `METHOD_TAG`, a `ModelRevised` stamp, `Suite.fs` pins re-derived independently, the render check and live
  probe strings, a full local run of the verify steps, deploy, and a wiring proof on the deployed page.
