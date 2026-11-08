# Calibration data: last season's EPL results, and table-v1 replayed on them — session 2026-11-08

**Repo:** field-laboratory · **Branch:** main · **Started from:** `ae45a5a` · **Commissioned by:** the owner's "Calibrate", Sun 2026-11-08 14:45 ET, approving the one next step the previous report offered: *check whether last season's EPL results are fetchable, because a fit needs more than the 99 finished 2026-27 matches.*

**Governing document:** `docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md` (its Status already records the overconfidence on 2026-27; this adds the second sample there). Its ruling that changing the model needs a new `METHOD_TAG` and a `ModelRevised` stamp is why this session changes nothing: **no constant, no card, no tag.** Measurement only.

## Result

1. **Last season's results are fetchable.** openfootball serves 2025-26 (380 of 380 matches, HTTP 200, pinned by commit and sha256). They were not taken on trust: the final table they make equals ESPN's final 2025 table for 20 of 20 clubs on played, points, goals for and against, and all 380 fixtures agree with FPL's on date and both scores. The relay's own archive does not hold the season: 26 of 380 matches, all created in one batch on 2026-06-15.
2. **The overconfidence replicates, on a sample 7 times the size.** Over the 330 forecasts where both clubs had played 5 or more (against 47 in the 2026-27 record), table-v1 scores Brier 0.689; a uniform guess scores 0.667. Model minus uniform is +0.022 with a standard error of 0.030, so it is no better than knowing nothing and not provably worse. Its most likely outcome happened 46% of the time; it claimed 66%. When it gave the home side 80% or more, the home side won 55% (65 matches, mean forecast 87%).
3. **The model has signal; its probabilities are about 2.4 times too steep.** Regressing the home result on the log-odds of its home-win probability gives a slope of 0.41 ± 0.09 (calibrated is 1.00) and an intercept of −0.34 ± 0.12. The slope is above zero by 4.8 standard errors and below one by 6.9 (unrounded: 0.4124 ± 0.0855; the intercept is 2.9 standard errors below zero). At a forecast of 50% the fitted line gives 42%; the 0.4–0.6 bin saw 43% (n = 67).
4. **The engine behind these numbers is the one behind the earlier record.** Run on the 2026-27 snapshot, it prints the earlier record's five calibration bins to the digit. The compiled model equals a plain-JavaScript recomputation of its published constants on all 370 forecasts (maximum difference 0).
5. **Landed as outbox files only.** No constant, card, tag or test changed. The decision this informs is below, and it is the owner's.

## Sources, each probed by one command and pinned

| source | answer | used for |
|---|---|---|
| openfootball/england `2025-26/1-premierleague.txt` at commit `9ee7a0c3…` (repo HEAD when fetched) | 200, 51,782 B, sha256 `38c1de56…`; the pinned bytes equal the bytes served from `master` (`cmp`) | the scores and their order |
| vaastav/Fantasy-Premier-League `data/2025-26/fixtures.csv` and `teams.csv` at `d7b05b51…` | 200, 1,014,129 B and 1,744 B; 380 rows, 380 finished | the fixture-level check |
| relay `/espn-standings/soccer/eng.1/standings?season=2025` | 200, 69,451 B, sha256 `53b07157…`; 20 rows, 38 played each, no deductions | the final-table check, decoded by the card's own `Standings.fromString` |
| relay `/context/date/<d>`, every day 2025-08-15 to 2026-05-24 | 283 of 283 answered 200; 5 days carry EPL rows (05-09, 05-10, 05-13, 05-17, 05-24), 26 rows, all scored, all `created_at` 2026-06-15 | not a source: it holds 26 of 380 matches |
| football-data.co.uk `mmz4281/2526/E0.csv` | HTTP 000: the sandbox shell cannot reach it. Not tried on a runner | not used; it would add closing odds, so a model-against-market read of last season |
| openfootball `2024-25` and `2023-24` | 200, 30,316 B and 26,357 B; both use a different line format from 2025-26 | not parsed, not measured |
| footballcsv/england `2020s/2025-26/eng.1.csv` | 404 on the path I tried; I did not look for the repo's layout | not used |

**Licence and terms of these sources are not assessed here** (STANDARDS Rule 45). Flagged for a human before any of it is committed to this repo or feeds a shipped number. No source file is committed: the script reads files fetched from the pinned URLs and fails a check when a file's sha256 differs.

`gh api` on both repos answered 403 ("GitHub access to this repository is not enabled for this session"); `git ls-remote` and `raw.githubusercontent.com` worked, so the pin is the repo's HEAD at fetch, not the last commit touching the file.

## What was checked before any number counted

29 checks in the script, all green (`outbox/forecast-backtest-prior-season-2026-11-08.txt`, last line: `29 of 29 checks hold; coverage: 1 season (380 matches), 1 oracle snapshot (99 matches), 3 independent sources read`).

- **The file:** every non-blank line is a header, a date, a match or a scorer line; 380 matches and 20 clubs as the header says; each club 19 home and 19 away; each ordered pair once; 38 rounds of 10; all 114 date headers name their own weekday (a wrong year always fails this); dates never go backwards and run 2025-08-15 to 2026-05-24; no club plays twice on a date, so the order within a day cannot change a table.
- **Against ESPN:** the final table rebuilt from the results equals ESPN's club by club. Clubs are paired by their (played, points, GF, GA) tuple, not by name (20 distinct tuples), and the pairing is printed in the record to be read by eye. No club carries a deduction, so points rebuilt from results are the official points.
- **Against FPL:** joined by date and score, never by name. The two sources hold the same multiset of (date, home goals, away goals); all 380 fixtures pair one-to-one; the club mapping that falls out is a bijection over 20 clubs with no conflict and is read off by eye in the record (`Wolverhampton Wanderers -> Wolves`, `Tottenham Hotspur -> Spurs`, …).
- **The engine:** forecast first, result applied after. The pre-match table for every match is rebuilt separately from the first *i* results with the function that was checked against ESPN, and the engine's played-count agrees on 380 of 380.

## The replay

Each forecast is table-v1 (`build/Forecast.js`, compiled from the working tree at `ae45a5a` just before the run) from the table as it stood before that match. `pre` is the fewer matches either club had played. 10 matches get no forecast, and in every one a club had played nothing, which is when the model declines.

| set | n | Brier, model | Brier, uniform | model − uniform | top outcome claimed / happened |
|---|---|---|---|---|---|
| every forecast | 370 | 0.707 | 0.667 | +0.041 ± 0.030 | 67% / 46% |
| pre 1–4 | 40 | 0.860 | 0.667 | +0.193 ± 0.119 | 77% / 45% |
| pre 5–9 | 50 | 0.661 | 0.667 | −0.006 ± 0.086 | 71% / 56% |
| pre 10–19 | 100 | 0.634 | 0.667 | −0.032 ± 0.052 | 66% / 51% |
| pre 20–37 | 180 | 0.727 | 0.667 | +0.060 ± 0.040 | 64% / 41% |
| pre ≥ 5 (the earlier record's "GW6+") | 330 | 0.689 | 0.667 | +0.022 ± 0.030 | 66% / 46% |
| pre ≥ 8 (its "GW9+") | 300 | 0.685 | 0.667 | +0.019 ± 0.031 | 65% / 46% |

"± " is the standard error of the paired per-match difference. A constant forecast of the season's own outcome rates, an in-sample reference and not a rival, scores 0.655 on the pre ≥ 5 set. The season's outcomes: home 43%, draw 27%, away 30%.

Home-win probability against what happened, pre ≥ 5:

| model said | n | mean forecast | home won |
|---|---|---|---|
| 0–20% | 58 | 12% | 19% |
| 20–40% | 75 | 29% | 35% |
| 40–60% | 67 | 50% | 43% |
| 60–80% | 65 | 69% | 57% |
| 80–100% | 65 | 87% | 55% |

The same statistic on the 2026-27 snapshot (n = 49, pre ≥ 5) is slope 0.14 ± 0.16, intercept −0.02 ± 0.29. That is 0.27 below 2025-26's slope, 1.5 standard errors of that difference, and too small a sample to say more.

**Where it is worst.** The two ends of the season: the opening weeks (pre 1–4, +0.193) and the last 18 gameweeks (pre 20–37, +0.060), with the middle at or slightly under uniform. Every band's error bar overlaps its neighbours', so this is a pattern to test and not a result.

## Premises, each tested by one command first (Rule 100)

| premise | command that could have refuted it | decided |
|---|---|---|
| the relay's archive holds last season | one GET per day, 283 days | refuted: 26 of 380 matches |
| the scores are right | the final table against ESPN's; 380 fixtures against FPL's | held: 20 of 20, 380 of 380 |
| points rebuilt from results are the official points | the decoded ESPN rows' `Deductions` | held: 0 for all 20 |
| the order of two matches on one day cannot change a table | distinct (date, club) pairs | held: 760 of 760 |
| this engine is the engine behind the earlier record | the earlier script re-run on the snapshot, diffed with its committed record (empty diff); this engine's bins against that record's | held, to the digit |
| the compiled model is the shipped model | `npm run build` first; a plain-JS recomputation of the constants | held: maximum difference 0 on 370 |
| a calibration slope can be reported | two unrelated solvers on the same likelihood | held on 2025-26 (3.2e-8); **the first solver failed on the small sample, see Finding 1** |

## Mutation proof (Rule 90)

`outbox/forecast-backtest-prior-season-mutation-2026-11-08.mjs` breaks the data or the script seven ways and requires the *specific* checks written for each to go red, not merely exit 1 (a changed byte already fails the hash check, so the exit code alone proves nothing). Every anchor is asserted unique and applied. Output: `outbox/forecast-backtest-prior-season-mutation-2026-11-08.txt`: **7 of 7 caught, control clean, 0 broken anchors.** One score changed; a weekday name wrong; a matchday moved a week with its weekday kept; a match line deleted; a model constant wrong in the recomputation; the engine awarding 2 points for a win; the slope solver's residual given the wrong sign.

## Findings (not fixed beyond this script: Rule 69)

1. **A printed figure with no check on it was NaN, with 28 of 28 checks green.** The first slope solver took full Newton steps and diverged on the 49-match 2026-27 sample, where the slope is near zero. Found by reading the output. Fixed with a damped step; the oracle sample now has the same two-solver check and a finiteness check. Same shape as the failures Rule 90 records: the checks passed because none was aimed at that line.
2. **The pairing check was half inert.** It counted only openfootball's leftovers, so a match lost from the results still passed ("every one of 379 pairs"). The mutation proof's first run caught it (6 of 7). The check now requires both sides to pair completely; the second run is 7 of 7.
3. **The oracle is a one-time proof.** It needs the 87 daily payloads the earlier record was made from. They are not committed, and a re-fetch would now include matches played since, so its constants (99 matches, 89 forecasts) would no longer hold. The record carries the oracle's output; the snapshot lived in this session's scratch space.

## Not shown

- **A comparison with the market for last season.** None of the three sources carries odds. football-data.co.uk does, but the sandbox cannot reach it and its terms are unassessed.
- **Why the error sits where it does.** Rating noise in the opening weeks and a widening spread of ratings late would both produce it; neither is tested here.
- **Draws and away wins are not calibrated separately.** The slope is on the home-win probability, treated as a yes/no.
- **One season.** The 2026-27 hold-out is 49 matches at pre ≥ 5.

## Done condition

Met: an outbox record states which sources are fetchable (status, size, rows, hash), the replay with its denominators (380 parsed, 370 forecast, 330 at pre ≥ 5), the checks that make it believable, and the proof those checks can fail. Probe output: `outbox/forecast-backtest-prior-season-2026-11-08.txt`.

## The decision this leaves, and whose it is

One next step, not started: **fit the logistic scale and the home edge**, the two constants the slope and the intercept point at, on the 330 forecasts of 2025-26, and test them on this season's finished matches as an out-of-sample hold-out. Measurement only, printing Brier, slope and bins before and after; nothing ships. About 25 minutes. It needs the owner's go-ahead because a fitted value is a model change in waiting, and **shipping it as `table-v2` is a further approval**: a new `METHOD_TAG`, a `ModelRevised` stamp, the suite, a deploy. A prior weight on games played (for the opening weeks) is a structural change and a second decision; it is not in that fit.

## Reproduce

```
mkdir src && cd src
curl -sS -o openfootball-2025-26.txt https://raw.githubusercontent.com/openfootball/england/9ee7a0c351805c99cc334478a9bf04b7d0432fec/2025-26/1-premierleague.txt
curl -sS -o fpl-fixtures-2025-26.csv  https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/d7b05b51d137bfefef4b692386d18c610975b9b9/data/2025-26/fixtures.csv
curl -sS -o fpl-teams-2025-26.csv     https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/d7b05b51d137bfefef4b692386d18c610975b9b9/data/2025-26/teams.csv
curl -sS -o espn-final-2025.json      'https://field-relay-nba.jeffunglesbee.workers.dev/espn-standings/soccer/eng.1/standings?season=2025'
cd .. && npm run build && node outbox/forecast-backtest-prior-season-2026-11-08.mjs src
node outbox/forecast-backtest-prior-season-mutation-2026-11-08.mjs src <2026-27 season dir>
```

Without the second argument the script skips the oracle and says so in its last line. The ESPN file is the relay's answer today; if ESPN or the relay changes it, the hash check says so instead of the numbers drifting.
