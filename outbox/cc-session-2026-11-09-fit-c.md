# Session 2026-11-09 — candidate C (one draw share) tested on a fresh season under a rule fixed first: SHIP

**Verdict: SHIP `table-v2`.** The pre-registered rule passes on all seven of its parts. When this document was committed
`src/` had not changed; the commits that put `table-v2` into `src` are listed at the bottom as they land.

Owner order: "Go" (Mon 2026-11-09 06:43 ET). Test candidate C on 2024-25 (a season no number had been read from) and on
this season's frozen 100-match bundle, under a rule committed before any 2024-25 model number; if the rule says SHIP, ship
it as `table-v2` without asking again; if not, stop and report. The rule said SHIP.

HEAD progression: `1f11470` → `3ff1763` (the rule, nothing fitted) → `1984c1b` (2024-25 as data) → `6409bdc` (tooling,
before the run) → `5430377` (the run's output) → `9b0afae` (independent recompute and break-it-on-purpose proof) → the
commit carrying this document.

## What C is

The same rating as table-v1 (points per game + 0.25 × goal difference per game + 0.10 × goals for per game). A home edge
of +0.42 added to the rating gap, a logistic scale of 1.14, and **one draw share of 0.27 for every match** (table-v1's
draw share fell with the gap: 0.28 × exp(−|gap| / 1.10)). Three constants, fitted by maximum likelihood on 2025-26's 330
forecasts (both clubs on 5+ games) and rounded to two decimals: 0.422 ± 0.172, 1.144 ± 0.223, 0.273 ± 0.025.

Why C: `outbox/cc-session-2026-11-08-fit.md` found the draw share the larger defect (table-v1 predicted 15% draws, 27%
happened, and draws were as common where the model saw a wide gap as a narrow one) and noted a constant share as a post
hoc observation, not pre-registered and not scored against anything. This session is that test.

## The rule, and how each part came out

Fixed in `outbox/forecast-fit-c-2026-11-09.mjs` and committed in `3ff1763` (rule block sha256
`36d98f5df1f891265024b15b3921e3a8369b4b144bac9a24a36d2eeb7b5ca13f`, 9,289 characters). "No further look": had any part
failed there was to be no second pass over 2024-25, no refit and no alternative candidate.

| rule | requirement | measured | |
|---|---|---|---|
| N1 | 2024-25, 330 forecasts (both clubs on 5+ games): Brier below table-v1's, paired z ≤ −2.0 | 0.6000 against 0.6524, difference −0.052 ± 0.018, z −2.93 | pass |
| N2 | same set: Brier below the base-rate forecast (0.421 / 0.273 / 0.306, the shares of the 330 training matches), z ≤ −1.645 | 0.6000 against 0.6528, z −4.41 | pass |
| N3 | same set: home-win slope within 1.96 SE of 1 | 1.18 ± 0.21 (table-v1's: 0.44 ± 0.08) | pass |
| N4 | opening weeks (both clubs on 1–4 games), 2024-25 and 2026-27: C's mean Brier no worse than table-v1's | 0.604 against 0.725; 0.682 against 0.908 (n 40 each) | pass |
| N5 | this season, 50 forecasts: C beats table-v1, z < 0 (a tripwire; its outcome was known when written, z −1.98) | 0.6502 against 0.7392, z −1.98 | pass |
| N6 | the fit on 2025-26 is well posed | two solvers 4.0e-13 apart in log loss, \|gradient\| ≤ 3.9e-6, Hessian positive definite, no constant on a bound | pass |
| N7 | every integrity check holds | 63 of 63 | pass |

Shipped constants are exactly the rounded 2025-26 values (home +0.42, scale 1.14, draw share 0.27). Nothing was re-tuned.

## Reported, not gating

| measure | value |
|---|---|
| C against a uniform guess, 2024-25 rule set | Brier 0.6000 against 0.6667, z −4.62 |
| log loss, 2024-25 rule set | C 1.000, table-v1 1.106, base rate 1.078 |
| draws, 2024-25 rule set | C predicts 27% on average, 24% happened (binomial SE 2.3 points); table-v1 predicts 14% |
| every forecastable 2024-25 match (n 370) | C 0.6004 against table-v1 0.6602, z −3.44 |
| reverse fold: C fitted on 2024-25 alone | home 0.259 ± 0.145, scale 1.015 ± 0.166, draw share 0.236 ± 0.023; scored on 2025-26's 330 (rounded) 0.6267 against table-v1's 0.6890, z −4.24 |
| the two seasons' constants | differ by 0.7, 0.5 and 1.1 combined standard errors (arithmetic on the printed values) |
| pooled constants, 660 forecasts (what a later revision would start from; not what ships) | home 0.334 ± 0.110, scale 1.070 ± 0.133, draw share 0.255 ± 0.017 |

## What these data cannot say

1. **The 2024-25 test looks backward.** The constants were fitted on the later season. No 2024-25 outcome entered the
   fit, so it is a held-out season, but it is not a forecast of the future. The forward evidence is this season's 50
   forecasts, and 50 is too few to say anything about calibration.
2. **This season C beats table-v1 and does not beat the base rate.** Brier 0.6502 against 0.6375, z +0.32; its home-win
   slope on those 50 is 0.25 ± 0.39 (1.92 standard errors below 1). N3 is judged on 2024-25 only.
3. **Opening weeks are still weak.** This season's 40 opening-week matches: C 0.682 against a uniform guess's 0.667
   (z +0.30). N4 asked for "no worse than table-v1" and C is better by 0.226; it did not ask for "better than a guess".
4. **The z's treat 330 matches as independent, and clubs appear in many of them.** Not tested here. N2's margin (z −4.41
   against −1.645) is wide; N1's (−2.93 against −2.0) is narrower.
5. **The ratings have no early-season shrinkage.** A model that depends on games played is a second decision and is not
   part of this one.

## How the numbers were checked

- **2024-25 data** (`outbox/forecast-season-2024-25-2026-11-09.txt`, 25 of 25): the final table the results make equals
  ESPN's (20 of 20 clubs on played, points, goals for, goals against, no deductions); FPL's 380 fixtures pair one-to-one
  with openfootball's by date and score (380 of 380, 20 of 20 clubs mapped, no conflict); every date names its own weekday
  (380 of 380). Re-parsed independently in Python (12 of 12) and 21 of 21 deliberate breaks of the sources, parser and bundle
  were caught.
- **The model.** The parametrised model equals the compiled F# model on all 830 forecasts of the three seasons (max
  difference 0). It reproduces the earlier records: 0.689 / 1.153 on 330, 0.860 / 1.715 on the opening weeks, the five
  calibration bins of the 99-match record. The cross-validated and this-season numbers equal those the rule block quoted
  before the run.
- **Independent recompute** (`outbox/forecast-fit-c-crosscheck-2026-11-09.py`, `fit` mode, 16 of 16): re-derives all 370
  forecastable 2024-25 forecasts' features from the bundle, refits C by BFGS from two starts (the JavaScript uses
  Nelder-Mead and coordinate descent; both land on 0.4222 / 1.1439 / 0.2727), rescores, refits the five folds, finds the
  slopes with an analytic Hessian, and rewrites N1–N6 from the rule's text. Its coverage line says the 2025-26 and 2026-27
  features were taken from the JavaScript's dump (tied to committed records by the reproduction checks above).
- **Break-it-on-purpose** (`outbox/forecast-fit-c-mutation-2026-11-09.mjs`, 35 of 35): the model function, table engine,
  rating weights, log loss, fit objective, optimiser, cross-validation, base rate, rounding, set definitions, paired z, both
  slope solvers, six rule-block edits (each changes its hash), the rule table, the wiring from the checks to the last line,
  both data bundles, and six breaks in the Python file. Two (the wiring) are caught by a harness invariant and not by any
  check inside the script; the output says so. The first run was 34 of 35.
- **The chain.** The script that ran is blob `6a5b8d2`, equal to the committed one; its rule block hashes to the value
  committed in `3ff1763`, and the first line of the run's output prints it.

## What was and was not blind

- **Known when the rule was fixed** (stated in the rule block): 2025-26's cross-validated numbers; this season's 50-forecast
  numbers with C (Brier 0.6502, z −1.98 against table-v1, z +0.32 against the base rate, slope 0.25 ± 0.39, 22% draws),
  which is why N5 is a tripwire and carries no weight as evidence. For 2024-25: no model number, home/draw share, tally or
  score had been computed; the raw files were fetched, the opening-day fixture was read, the 16 lines with no half-time
  score were shown (those printed were 0-0), and the ESPN payload was decoded (20 clubs × 38 played, GF = GA = 1115).
- **Disclosed afterwards**, in the data commit (`1984c1b`): while checking the ESPN payload's layout I printed one club's
  record (Liverpool 25-9-4). It is one final record and not a model number; a reader should still know.
- **Changed after the verdict was read:** only the Python recompute's robustness (a null in the dump is read as NaN, and an
  exception prints the checks already recorded). Found by mutation 18 of the proof. Its output on the real dump is
  byte-identical before and after.
- **Not changed after the verdict was read:** the rule, the thresholds, the candidate, the constants, the fitting code.

## Files

| file | what |
|---|---|
| `outbox/forecast-fit-c-2026-11-09.mjs` and `.txt` | the pre-registered script and its unedited output (last line `VERDICT: SHIP …`) |
| `outbox/forecast-season-2024-25-2026-11-09.{mjs,json,txt}` | the 2024-25 season as data (bundle sha256 `1e3dfc3e…`), with its checks |
| `outbox/forecast-fit-c-crosscheck-2026-11-09.{py,txt}` | the independent recompute (`data` and `fit` modes) and its output |
| `outbox/forecast-fit-c-mutation-2026-11-09.{mjs,txt}` | the break-it-on-purpose proof for the verdict stage |

## Integration state (Rule 65)

Verdict stage only: nothing is produced for the relay or the client, and nothing is read from them except the frozen
hold-out bundle. The `table-v2` change in `src` and its integration proof are recorded below when they land.
