# Session 2026-11-09 — candidate C (one draw share) tested on a fresh season under a rule fixed first: SHIP

**Verdict: SHIP `table-v2`, and it is shipped.** The pre-registered rule passes on all seven of its parts. This document was
first committed with `src/` unchanged (`9ba4c9f`); Phase B, below, records the commits that put `table-v2` into `src`, the
deploy, and the proof that the deployed page serves it.

Owner order: "Go" (Mon 2026-11-09 06:43 ET). Test candidate C on 2024-25 (a season no number had been read from) and on
this season's frozen 100-match bundle, under a rule committed before any 2024-25 model number; if the rule says SHIP, ship
it as `table-v2` without asking again; if not, stop and report. The rule said SHIP.

HEAD progression: `1f11470` → `3ff1763` (the rule, nothing fitted) → `1984c1b` (2024-25 as data) → `6409bdc` (tooling,
before the run) → `5430377` (the run's output) → `9b0afae` (independent recompute and break-it-on-purpose proof) → `9ba4c9f` (this document
and the CC-CMD status) → `46398f2` (`table-v2` in `src`) → `17d28eb` (eight mutation entries) → `87b6bbb`, `32b2d1d`,
`a18e26a` (a venue row, a separate concern: see Phase B) → the commit carrying Phase B.

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
| `outbox/forecast-table-v2-oracle-2026-11-09.{mjs,txt}` | Phase B: the compiled model against the declared one (`46398f2`) |
| `outbox/forecast-fit-c-at-table-v2-build-2026-11-09.txt` | Phase B: the pre-registered script run against the table-v2 build (`46398f2`) |
| `outbox/forecast-model-mutation-2026-11-09.txt` | Phase B: the eight model mutations, both runs unedited (`17d28eb`) |
| `outbox/forecast-deployed-wiring-2026-11-09.{mjs,json,png,txt}` | Phase B: the wiring proof on the deployed page. `-first-run.*` and `-before-deploy.*` are the two NOT-WIRED runs, kept |
| `outbox/forecast-deployed-wiring-needle-mutation-2026-11-09.{mjs,txt}` | Phase B: the corrected needle going absent on eight wrong-constant builds |

## Phase B — `table-v2` in `src`, deployed, and what proves it

| step | commit or run | artifact |
|---|---|---|
| `table-v2` into `src`: the three constants, `METHOD` and `METHOD_TAG`, and the pins that state them | `46398f2` | suite 366 → 367, all held. `outbox/forecast-table-v2-oracle-2026-11-09.{mjs,txt}`: the compiled F# model equals the model the fit declared on 21,136 inputs (1,130 real pairs, 20,006 synthetic), max difference 1.1e-16, the draw component exactly 0.27 on every one, 14 deliberately wrong twins caught, 35 of 35 checks. Its last line says 2025-26 is not replayed (the raw files are not in the repository) |
| the mutation table gains the model's constants | `17d28eb` | 8 entries. Run before a nine-decimal pin existed, home 0.43 and scale 1.15 SURVIVED ("Nothing defends this claim"); after it all 8 are caught, 9 of 9 with the unmutated control (`outbox/forecast-model-mutation-2026-11-09.txt`, both runs unedited) |
| verify on that push | run 42621717589, RED | step "Render check against the LIVE slate": `the venue table covers at least one venue on this slate` failed on 2026-11-09's slate (11 recorded indoor arenas, Manadon Sports Hub, U.S. Bank Stadium). It predates table-v2: live-check on the page deployed from `41a5cf2` failed the same four lines (runs 42611575822, 42613880170) |
| the venue row, a separate concern with its own commits | `87b6bbb`, `32b2d1d`, `a18e26a` | `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, `outbox/venue-us-bank-stadium-2026-11-09.md`. The deploy gate was not overridden: `deploy.yml` skipped the red commit (run 42622489104) and ran after verify went green |
| verify, green | run 42631741258 on `a18e26a` | step #95 "Render check against the LIVE slate" `success`; its log holds `PASS  the venue table covers at least one venue on this slate` and `24/24 checks passed` |
| deploy | run 42632774675 (`workflow_run`) | the live `/version.txt` read `a18e26a2ad8fc53a6c200bf5509a9401d467810d` |
| wiring proof on the deployed page | `outbox/forecast-deployed-wiring-2026-11-09.{mjs,json,png,txt}` | `WIRED`, 11 of 11 checks, probed 2026-11-09T14:19:12Z |

**What the wiring proof checked, and what it did not.** The script (a dated copy of the 2026-11-08 one; its header lists
the four differences) fetches five served files and compares each byte for byte with a fresh local build of the pushed
commit, reads `/version.txt`, then renders the deployed page pinned to the committed 2026-10-10 capture and the 2026-11-08
table with the browser clock fixed, and reads the six EPL cards. Result: the version equals the pushed sha; five of five
files are identical; six of six EPL cards carry the node; five read `model table-v2 — A n% · draw 27% · B n%` and one (Man
United v Spurs) says `no forecast: not in the standings table: Man United`, as it did in the 2026-11-08 proof. Arsenal v
Leeds reads 62 / 27 / 11 and Chelsea v Bournemouth 46 / 27 / 27, the two lines worked in plain JavaScript from the committed
table before the page was met (table-v1 printed 92 / 5 / 3 and 57 / 19 / 25 for the same two); one request for the table;
no page errors. It shows that the deployed build is the pushed commit and that its card draws the table-v2 line. It shows
nothing about the model: the page is pinned, so the numbers are hindsight by construction, and a real forecast on a real
card cannot exist before 2026-11-21.

## Found on the way

1. **The model's constants had no mutation entry.** Fixed in `17d28eb`. The card pins round to a whole percent, so a home
   edge of 0.43 or a scale of 1.15 moved no digit; a pin to nine decimals now fails on either.
2. **The pre-registered fit script reads DO NOT SHIP against the table-v2 build, by design.** Run unedited against this build
   (`outbox/forecast-fit-c-at-table-v2-build-2026-11-09.txt`) it prints 61 of 63 checks and `VERDICT: DO NOT SHIP. N7 an
   integrity check failed`. Both failed checks compare table-v1's constants with the compiled model, which is table-v2 now:
   the script's own check of its parametrised model (max difference 3.18e-1 on 830 forecasts), and its precondition that the
   prior-season script runs with no red check (25 of 26 hold; the one red check there, read on 2026-11-09 by running that script
   on the same sources, is "the compiled model equals a plain-JS recomputation of its published constants … on all 370
   forecasts", and those constants are table-v1's). A `diff` of the two outputs is five lines: those two checks, the line
   printing the 3.18e-1, the count, and the verdict; every other line equals the record of `5430377`.
   Run from a checkout of `9ba4c9f` (built there; the last commit with table-v1 in `src`) its output is byte-identical to
   `outbox/forecast-fit-c-2026-11-09.txt`, sha256 `385f9266b668221a8c86d00be994284da193a52cf5082e879a91d673823d364e`, and ends
   `VERDICT: SHIP`. The script is the record of a verdict at a commit, not a gate to re-run on later trees; no workflow, script
   or npm script references it.
3. **The store cannot stamp a model change.** 30 rows from 2026-10-04, no method column, `ModelNote: undefined`; the evidence
   and the done condition are in `docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md` ("The store cannot stamp a model
   change"). The fix is a schema decision and the owner's; nothing was changed here.
4. **The first verify of these commits went red on something that was not these commits:** the venue-table coverage gap,
   which the 2026-10-20 CC-CMD made loud on purpose when the table covers nothing on a slate. Cause and the fix (one
   hand-accepted row, labelled as accepted by the session and not by the owner or the sourcing rule, for the owner to confirm
   or revert): `docs/CC-CMD-2026-11-09-venue-review-remainder.md`.
5. **The wiring script's first run against the deployed page said NOT-WIRED, and the cause was the script.** The method
   sentence's needle expected `table-v2: ppg …` as one string, but the source builds it as `METHOD_TAG + ": ppg …"`, so the
   compiled file never holds it contiguously. Every other check passed on that run, including the byte comparison of the five
   served files and the exact card lines. The corrected needle (the second half of the sentence) goes absent on eight
   wrong-constant copies of the compiled model, and the old needle is shown absent from the build it was wrong about
   (`outbox/forecast-deployed-wiring-needle-mutation-2026-11-09.{mjs,txt}`: 8 of 8 caught, control holds). Both runs are
   kept (`-first-run.*`).
6. **My CC-CMD for the venue remainder stated a premise I had not tested.** It said the archive holds no game at Manadon Sports
   Hub until the tie is played (its premise table and Task 3, section 6 of `outbox/venue-us-bank-stadium-2026-11-09.md`, and a
   comment above the Suite check in `src/Suite.fs`). Task 3's own unblock query refutes it: it returns `regular, FA Cup, 1`, and
   the row is a scheduled fixture (`created_at` 2026-11-09 10:00:40, kickoff 19:30Z, no score). Corrected in the CC-CMD (a
   premise row marked refuted, Task 3 marked unblocked, with the query and the row quoted) and in the evidence document
   (regenerated; its 11-case controls harness re-run, 11 of 11 caught). The `src/Suite.fs` comment still says it: a comment-only
   change would cost a verify and a deploy, so it is a named part of Task 3's done condition and goes in the first commit that
   touches that block.
7. **Step 0 of Task 4 is measured: 0 of 60 days would have gone red** under the 485-row table (1 of 60 without the U.S. Bank
   Stadium row, the day verify did go red; two days rest on a single row: 2026-09-28 and 2026-11-09). Record, rows, generator and
   selftest are `outbox/venue-red-days-2026-11-09.{md,mjs}`, `outbox/venue-red-days-rows-2026-11-09.json` and
   `outbox/venue-red-days-selftest-2026-11-09.txt` (31 of 31 doctored inputs caught). The selftest's first run reported three
   cases as WRONG CAUSE: my doctored edits changed a venue count without its game count, so a consistency check rejected them
   before the check they were aimed at. Fixed so each edit reaches its target; a rejection for the wrong reason is not a catch.

## After the ship (docs and outbox only, no CI)

`820b148` records table-v2 shipped and proven on the deployed page. `1e7d7fd` records Task 1 of the venue remainder done (verify run
42631741258). The commit carrying this paragraph adds the Step 0 measurement, corrects item 6 and regenerates the evidence document.
None touches `src/`, `scripts/` or a workflow, so none runs verify or deploy.

## Task 2 of the venue remainder: measured and stopped

Owner's go: "Task 2 approved" (Mon 2026-11-09 10:43 ET), with the CC-CMD's recommended fix (read the Wikipedia summary whole). Full record:
`outbox/venue-lead-whole-2026-11-09.md`. The CC-CMD's stop rule ("if the widening produces wrong roofs for any row, do not commit, report verbatim and stop") applied.

HEAD progression: `268140d`, then `0d3875c` (the fix), `76d6b45` (the runner's commit), `a6f99c2` (the restore and the evidence), then the commit carrying this section.

| Commit | What | CI |
|---|---|---|
| `0d3875c` | `summaryAnswer` reads the extract whole, cache kind `wp-summary`; self-test 57 to 62; two registered mutations, both caught; the probe record | verify 42650313057 green, deploy 42651467822 green |
| `76d6b45` | the runner's re-run of `source` (run 42651498788, dispatched 16:07:12Z, 35 minutes): results 374 accepted / 68 review, was 372 / 70 | none: the workflow commits to main with no verify; it left `check:venue-sourced` red (4 of 6) from 16:42:03Z |
| `a6f99c2` | scripts, results and cache restored to `268140d` / `0d3875c` byte for byte; probe, diff tool (15 controls), diff and the 383 extracts kept | verify 42658229991 green (started 16:47:01Z), guards green, deploy 42659204732 green |

The red window on main was about 5 minutes, and no verify run started in it (verify runs listed by start time: 16:00:18Z, then 16:47:01Z).

**Verified.** 442 of 442 rows compared by name; `lat`, `lon`, `zone`, `qid`, `agreeing` and `via` equal on all 442, so only the lead changed. 4 rows changed status or roof:
U.S. Bank Stadium (to dome) and Parken Stadium (to retractable) are right; Center Parc Stadium (open to dome, its paragraph says "an outdoor stadium" and names the Georgia Dome it replaced)
and Joan C. Edwards Stadium (open to dome on "indoor suites", the only "indoor" in the full article) are not safe. The text class differs for exactly those 4 of 383 rows with an extract.
**Controls (Rule 90).** The probe's self-test is 10 checks, five mutations each red; the diff tool's is 15, eleven mutations each red. One of my own mutation runs printed a result
for a mutation whose anchor had failed (a stale temp file from the run before): the harness line has to assert its anchor, as the rule says, and it was rerun with the right one.
**Not done.** Step 6, the hand-row deletion, the mutation re-anchoring and Step 7 (`calibrate`, which reads coordinates only and could not have tested a roof change): none ran, by the stop rule.

**Premise corrections (Rule 100).** The CC-CMD's "9 stubs, 8 accepted as open" reproduces at 14 characters or fewer, but the boundary was untested: at any length 19 leads carry no verb (18 accepted as open,
17 of those cut) and 14 more end like a name. The estimate "about 10 minutes" for the runner was wrong by 3.5 times; the job log is not readable from here, so the cause is not known.

**Found on the way.**
8. `venue-source.yml` commits its results to main with no verify. Any `source` run whose accepted rows differ from the table leaves `check:venue-sourced` red until the table is regenerated and pushed. It was
   5 minutes here because the restore was ready; a run left overnight would have left main red overnight. Recorded, not changed: it is the workflow's design and the owner's to alter.
9. This sandbox cannot reach Wikipedia (the proxy answers 403 on CONNECT) and WebFetch refuses `en.wikipedia.org/api/rest_v1`, so no summary could be read here. A page the search returned (the article itself) could be.

**Open.** The owner chose option 3 ("Option 3", 12:16 ET); the section below is where it stands. No carry-forward exists apart from the owner's two decisions already open (the U.S. Bank hand row, the forecast store schema).

## Option 3 of Task 2: the infobox probe (run, and the decision to build)

Owner's ruling: "Option 3" (Mon 2026-11-09 12:16 ET), a second structured source for the roof: the infobox Roof field. The option as I wrote it said it was unmeasured and needed a runner probe first, so the
probe is Step A and whether anything is built is decided from its output. The CC-CMD (`docs/CC-CMD-2026-11-09-venue-review-remainder.md`, "Option 3 — the infobox Roof field") holds the five go/no-go
criteria, written before any data exists, and the Step A done condition.

HEAD progression: `035a20a`, `b247c68` (the probe), `9fd5d2e` and `8d13933` (the effect tool and the Step A assertions), `86bd5f0` (the runner's data commit), `af7db7f` (the record of Step A and the decision to build), `968ee51` (Step B commit 1: the reader moved out of the probe; verify run 42678114036, success), `0827a1f` (Step B commit 2: the rule; verify run 42682452654 and deploy run 42683398510, both success), `1621efb` and `c6d10d3` (the old-vs-new diff tool and its stub boundary; guards green), `ef499a2` (the runner's data commit, run 42682560865), `3429152` (the table write; verify run 42689207143 success, deploy run 42690116309 success), then the commit carrying this record.

| What | State |
|---|---|
| `scripts/venue-infobox.mjs` (508 lines) | read-only probe: for each article the roof rule reads, MediaWiki's own parse tree of section 0 (`action=parse&prop=parsetree`), read with a real XML parser; records every Infobox template, every parameter name, every parameter whose name contains "roof", the revision, the visible categories (hidden ones counted), and the whole tree of five controls. 36 self-test checks, one of them a trimmed copy of the real U.S. Bank tree |
| `scripts/mutation-check.mjs` | 15 entries `venue-infobox-*`; `--anchors`: checked 1219 of 1222 mutation anchors, 0 stale (the 3 unchecked were there before) |
| `.github/workflows/venue-source.yml` | mode `infobox`; writes only `outbox/venue-infobox-probe.json` and `.txt`, so the results, the cache and the table are not touched and a run cannot leave `check:venue-sourced` red |
| `package.json`, `package-lock.json` | `@xmldom/xmldom` 0.9.12, exact-pinned devDependency: +1 line and +11 lines, nothing else moved |

**Each mutation is red by the check meant to catch it** (a copy of the script with the anchor asserted once and applied, the self-test run, the failing check named; 15 read from the registry, 0 not red by a name; artifact `outbox/venue-infobox-mutation-2026-11-09.txt`, command `node outbox/venue-infobox-mutation-2026-11-09.mjs`):

| Mutation | Check that goes red |
|---|---|
| `roof-match-case` | a capitalised Roof and a roof_type are both recorded |
| `first-infobox-only` | two Infobox templates: both are read, and the roof is the second one's |
| `root-not-checked` | an HTML error page, which is well-formed XML, is a failure and says its root; and the bad-tree check |
| `ref-text-kept`, `nested-values-dropped` | the nested template and reference check |
| `parse-error-swallowed` | a truncated tree is a failure, not "no infobox"; a mismatched tag is a failure |
| `parser-errors-dropped` | a raw `&nbsp;` is read but the parser error is recorded |
| `retry-after-ignored`, `429-not-retried` | a 429 is retried after the server's Retry-After, and both attempts are recorded |
| `hidden-categories-listed`, `redirect-not-followed`, `continuation-ignored` | the redirect and continuation merge check, and the run check |
| `unread-articles-pass` | an article that was not fetched makes the verdict a failure that says "1 of 2" |
| `denominator-is-the-answered` | the report names its denominators |
| `title-after-wiki-first` | six checks, among them the title derivation and the report |

**Premise corrections (Rule 100).** (1) I recalled the template as `Infobox stadium`; the parse tree of U.S. Bank Stadium reads `Infobox venue`. The probe assumes no name: it reads every top-level template whose title
starts with Infobox and counts them. (2) The escaping of the XML is inferred and not seen: the fetch tool I read the tree through decodes entities itself, so a literal `<close></ref></close>` came back that no parser
would accept. The runner commits the raw trees of five controls, and the done condition names the string to look for. (3) "Skylight", U.S. Bank's value, is free text by the template's own documentation
("the roof type of the venue if indoors/covered (e.g. retractable, domed, translucent)"), so what a value means is a measurement and not a lookup: criterion 2.

(4) The first version of criterion 2 named "retractable" as a keyword `classifyRoof` trusts; its pattern is `retractable[- ]roof|roof that retracts`, so the bare word the template's documentation uses as its
example is not a witness (`classifyRoof("Retractable")` measured as "open"). (5) The first version of criterion 4 said the control reproduces 442 of 442 rows; 384 of the 442 have a roof stage and the other 58
are refused at the point stage (measured: 384 of 384 reproduce roof, basis and status from the committed cache). Both were corrected in the CC-CMD before the probe ran, so no data had been seen.

**The instrument for criterion 4**, built while the commit was verifying: `outbox/venue-infobox-effect-2026-11-09.mjs` replays the roof stage from the cache around the real `decideRoof`, adds the witness as one
more positive source, and lists every row whose status or roof would change, the agreement with the lead and Wikidata, and the joining test for each value that is not a witness. Its self-test and its mutations
(`outbox/venue-infobox-effect-mutation-2026-11-09.txt`) are each red by a named check, and it reads the categories as a witness too (`--source categories`), as a measurement. One mutation survived the first version of the tool and showed a clause of the joining test to be redundant; the
clause was removed and a fixture added for the case it had been standing in for, which is Rule 90 doing its work on a tool and not on the product.

**Found on the way.**
10. Two mutations crashed the self-test with a TypeError instead of failing a named check (the check dereferenced a null the mutation had produced). The exit code was red, so the registry would have counted them
    caught; by name they were not. The check is null-safe now, and the by-name run above is what showed it (Rule 90).
11. `npm audit` reports 2 critical, `solid-js` (a direct dependency) through `seroval`, re-measured today. Neither is from this change and `package.json` has no other line moved: untouched (Rule 69), the owner's to rule on.
12. The fetch tool (Exa) reaches Wikipedia's Action API while the sandbox proxy refuses Wikipedia and WebFetch refuses `rest_v1`. It returns a COPY of the source, which is why the one thing it cannot settle (the escape state) is
    left to the runner's raw trees.

13. The effect tool's first real run printed "probe none (control only)": `parseArgs` dropped the probe file when no `--join` or `--source` flag was given (`i !== ji + 1` with `ji = -1` removes index 0). The
    self-test never called `main`, so 36 checks were green while the command line was wrong. `parseArgs` is exported with regression checks now, and a mutation puts the old line back and is red by name (21 mutations,
    0 not red by a name, `outbox/venue-infobox-effect-mutation-2026-11-09.txt`). Rule 90: a self-test that does not run its entry point has not tested the entry point.
14. The probe's per-article record keeps the attempt count and the summed request time, not each attempt's status nor the wait between attempts. Of the 39.5 minutes (about 7 predicted), the recorded request times
    (194 s) and the one-second gaps (about 442 s) leave 28.6 minutes unaccounted; 37 articles needed exactly one retry, about 47 s each. That fits `retryWait` waiting a Retry-After (its own comment records 429 on this
    API), and it is inference: the statuses were in memory (`getRecorded` has them) and were not kept. A measurement that has run is not re-run to record a cause it was not built to record.
15. The text read for criterion 4 is the text the probe parsed: the Action API, read through the Exa tool, returned revision ids 1384136752 (Wembley), 1383882110 (Johan Cruyff Arena) and 1384547710 (U.S. Bank), each
    equal to the probe's recorded `revid`. Checked by id and not assumed.
16. Allegiant Stadium and SoFi Stadium are dome by their leads ("a multi-purpose indoor stadium", cache `wp-lead|`), and their infoboxes say `[[Skylight]]`; with U.S. Bank's, that is the evidence the joining test counts.

17. Step B commit 2 changes `scripts/venue-infobox-read.mjs` and the probe's `readArticle`, so the extraction checker (`outbox/venue-infobox-read-extraction-check-2026-11-09.mjs`), which read both from the working tree,
    would have reported DIFFERENT on any later run. It reads them at `968ee51` now, and its output is byte-for-byte the committed section of `outbox/venue-infobox-read-extraction-2026-11-09.txt`: a proof about a move must not
    depend on what is edited after it.
18. A mutation of `answerText` that deletes its "no parse tree" guard crashes the probe's `readArticle` (`text.slice` of undefined) before any named check can fail, so by name it is "CRASH", not caught. The registered mutation
    keeps the guard's meaning and changes what the answer becomes (an empty `<root/>` article), which fails the named check: `venue-infobox-answer-no-parsetree-reads-as-article`.
19. Wikidata's roof (P5624) is null on all 387 cached `wd-roof|` answers, so Wikidata names no roof for any row and the wikidata-against-infobox disagreement path has no real row. It is covered by the self-test and two of
    its mutations, and by nothing in the data.
20. `lookupPlus` over the 442 candidates, from the committed cache with every entry's age set to now and `fetch` a counting stub: 0 requests, the same decision as the committed results on 442 of 442 (384 accepted). The
    runner fill therefore asks Wikipedia for the infobox of each article and nothing else; the oldest cache entry is 18.7 days against a 30-day lifetime.
21. The old-vs-new diff tool defined "stub lead" from the data (10 characters or fewer, which finds the CC-CMD's 9 rows) when the CC-CMD's own definition already existed: "9 of 442 are 14 characters or fewer, 8 accepted as open" (`outbox/venue-lead-whole-2026-11-09.md`, probe criterion A). Both find the same 9 rows in the committed results (measured at each boundary 10 to 14; the count rises to 11 only at 15), but a definition is read from where it was made. Found after `1621efb` was pushed, corrected in `c6d10d3`; the tool now also fails the run if one of the 8 was not accepted as open before.
22. The first mutation run of that tool left 1 of 16 not red: no self-test case could tell "U.S. Bank plus 8 others" from another split of the 9 (`stub-rows-count-unchecked`). A case was added; 17 of 17 are red by a named check (Rule 90).
23. My first check that the hand row's deletion removed exactly lines 299 to 324 printed no verdict: `diff` reported the cut as lines 300 to 325 (the two blank lines are identical), so comparing its removed lines with 299 to 324 could never match. The exact check compares the script's output with the original under `sed '299,324d'`, byte for byte, and the script refuses and leaves the file untouched in five broken layouts (row missing, a non-comment line in the block, a second row, no blank line before the generated block, the block's first line changed).
24. My draft of the commit message for the table write cited `a18e26a` as the commit that added the hand row. A pickaxe on the row's text says `32b2d1d` added it and `a18e26a` added its four mutation entries; corrected before committing (Rule 100: the claim was checked by the one command that could refute it).
25. What the runner's agreement with the offline replay shows: the run produced exactly the three changes the replay predicted, so no failed or different request moved a row. It does not show the three roofs are right; that rests on their articles, read at the revision the probe parsed (Step A).
26. The post-deploy `live-check` on `3429152` (run 42690276129, after the deploy) failed in attempt 1 (job 129407885849, 20:09:51Z to 20:10:39Z) at step 7, `Build (the venue table this check derives its expectation from)`: `dotnet tool restore` and a plain `npm run build`, there so that `render-check` can import `build/Venues.js` (`.github/workflows/live-check.yml` lines 98 to 107). Steps 8 to 17 (the stamp check, every check of the deployed page, the commit of the measured widths) were skipped, so the page was not looked at. Attempt 2 (job 129409113140, 20:12:01Z to 20:13:35Z) on the same commit ran all of them and passed, so the run's conclusion is success. Attempt 1's log has 68 ` error FSHARP` lines. 44 are `internal error: Object reference not set to an instance of an object. (code 193)`, the first one printed is `./build/fable_modules/Thoth.Json.10.5.1/Types.fs(33,1): (37,6)`, and the other 24 carry codes 72 (9), 752 (4), 39 (4), 1129 (4), 41 (2) and 1 (1). By file: 29 in Thoth.Json's sources (Decode 22, Extra 4, Encode 2, Types 1) and 39 in nine `src` files (Scoreline 8, Desk 8, Program 7, Journalism 7, Fixtures 3, Suite 2, Stamina 2, Scoreboard 1, Lineups 1). After them: `Extra.fs(1,1): error EXCEPTION: Cannot find user entity Thoth.Json.ExtraCoders`, a Fable stack trace, `Compilation failed`, exit 1. The image, SDK and compiler were the same in attempt 1, attempt 2 and the green `live-check` of `0827a1f`, read from each log: ubuntu-26.04 image 20261101.186.1, .NET SDK 10.0.403, Fable 5.13.0. My first reading of it, "all inside the Thoth.Json package, none in our files", counted only `./build/` paths and was wrong (39 of the 68 are in our files); and "unexplained" was wrong too, once the existing CC-CMD was searched for (BUILD-ON-A).
27. What this occurrence adds to `docs/CC-CMD-2026-11-03-fable-compiler-crash.md`, by count against the log of its signature row (job 125844142720, run 41614410302, `Build` of mutation shard 1): the same codes 72 (9 lines), 752 (4), 41 (2) and 1 (1), and 44 lines of code 193 against 43. This one adds 4 lines of code 39 and 4 of code 1129, both about `ExtraCoders`, and the `Cannot find user entity` line; none of the three is in that log or in job 125809151719, the other log the CC-CMD cites. Code 39 for `ExtraCoders` is listed in `outbox/fable-crash-upstream-report.md`; code 1129 and the entity line are in neither that report nor the CC-CMD. Whether they mark a different failure or the same one with a different consequence is not known, and a pass on attempt 2 does not say. The bounded repeat (`scripts/build-steady.mjs`) is used by `verify-full.yml` (line 170) and the mutation-shard action (line 54) only (`grep` over `.github`); `verify.yml` (254), `deploy.yml` (169) and `live-check.yml` (107) run a plain `npm run build`. Of the 5 builds of this tree that I know of (the sandbox's, `verify`'s, `deploy`'s and the two attempts) 1 crashed; the number of plain builds those three steps have run, the denominator of a rate, was not counted. That CC-CMD rules not to widen the repeat, so no workflow was changed and the occurrence is counted there; whether these steps get the repeat is the owner's call.

**State.** Done: Step B is built, run on a runner and written to the table, and Task 2's Done-when is met (the proofs and the manifest are below). The probe ran as run 42668700914 (the runner's commit `86bd5f0`); Step A's done condition is met (15 of 15, `outbox/venue-infobox-stepa-2026-11-09.txt`). Criteria 1 to 5 say go (the verdicts are
in the CC-CMD under Task 2; the effect outputs are `outbox/venue-infobox-effect-2026-11-09*.txt`): the infobox would move 2 rows, 3 with the one joined term, and disagrees with none of the 13 rows the lead or Wikidata
decides. The categories are measured beside it and not built (the owner's word is needed).

| Step B | State |
|---|---|
| commit 1, `968ee51` | the parse-tree reader (`parseUrl`, `flatOf`, `readTree`) is `scripts/venue-infobox-read.mjs`; identity against the old probe: 60 of 62 lost lines held verbatim, 2 declared header edits, 0 undeclared (`outbox/venue-infobox-read-extraction-2026-11-09.txt`) |
| commit 2, `0827a1f`: `scripts/venue-infobox-read.mjs` | + `answerText` (the API error and no-parse-tree failures, shared with the probe's `readArticle`) and `roofValuesOf` (the flat value of every roof parameter of every infobox: `[]` when there is none, `{ ok: false }` when the answer cannot be read) |
| `scripts/venue-source.mjs` | `decideRoof(wikidata, lead, body, field = [])`; `ROOF_FIELD_TERMS` (`[[skylight]]` is a dome, the evidence in its comment); `roofOf` exported and reading `wp-infobox|title` (`gapMs` is its one option); `wp-infobox` in `CACHE_KINDS`; self-test 57 to 80 checks |
| `scripts/mutation-check.mjs` | 24 entries: 22 `venue-source-roof-field-*`, 2 `venue-infobox-answer-*`; `--anchors`: checked 1243 of 1246, 0 stale |
| the runner fill, run 42682560865, its commit `ef499a2` | `venue-source.yml` mode `source` on `data/venue-source-candidates.json`, head `0827a1f`; 37.3 minutes in the fetch step; 442 sourced: 375 accepted and 67 in review (372 and 70 before) |
| the table write, `3429152` | `src/Venues.fs`: the U.S. Bank hand row and its comment out (26 lines), the 375 generated rows in (4 added, 27 deleted); the diff, the comparison and the U.S. Bank proof beside it in `outbox/` |

| Proof | Artifact | Result |
|---|---|---|
| each new mutation is red by a named check, after a control run of the unmutated copy | `outbox/venue-source-roof-field-mutation-2026-11-09.txt`; `outbox/venue-infobox-mutation-2026-11-09.txt` | control 80 PASS 0 FAIL; 22 of 22 and 17 of 17 red by a name, 0 not; the registry's own runner on the 24 ids: 25 of 25 |
| nothing that does not use the infobox changed | `outbox/venue-infobox-rule-differential-2026-11-09.txt` | `decideRoof` against its text at `968ee51`: 144 of 144 inputs identical with the argument left out and with `[]`; `readArticle`: 13 of 13 answers identical, record and kept texts; broken on purpose it reports 24 and 2 differences |
| the real `roofOf`, end to end and offline, is the measured prediction | `outbox/venue-infobox-rule-replay-2026-11-09.txt` | 384 of 384 rows identical to the effect tool's prediction (roof, basis, lead, status); control 384 of 384; 0 requests; 3 rows change (Johan Cruijff Arena review to retractable, U.S. Bank Stadium review to dome, Wembley Stadium review to retractable) and no other; the rule's reader reads the five raw control trees as the probe recorded, 5 of 5; broken on purpose (the field not passed, the term removed, the cache key changed) it fails each time |
| the runner's results against the committed ones, row by row | `outbox/venue-infobox-source-diff-2026-11-09.txt`; the tool's mutations: `outbox/venue-infobox-source-diff-mutation-2026-11-09.txt` | AS PREDICTED: 442 of 442 compared; exactly Johan Cruijff Arena, U.S. Bank Stadium and Wembley Stadium changed, each review to accepted; 0 moved, 0 basis-only; the 8 stub-lead rows named, all accepted and open before and after; the tool's self-test 22 of 22, 17 of 17 mutations red by name |
| the rule's reads against the probe's | `outbox/venue-infobox-rule-cache-compare-2026-11-09.txt` | EQUAL on 381 of 381 articles; 0 unanswered, 0 different, 0 extra |
| the table is the artifact it is generated from | `npm run check:venue-sourced` | 6 of 6 locally; verify run 42689207143: success |
| U.S. Bank's row is the generated one, and its four mutations are red on it | `outbox/venue-us-bank-generated-row-2026-11-09.txt` | row at line 648 inside the markers at 300 and 679, its anchor occurs once; `--anchors` 0 stale; 4 of 4 red by name in the real tree |

Answered by the runner fill (these were the open questions of the earlier text): Wikipedia served the rule's own requests, an answer for all 381 articles and 0 unanswered (`outbox/venue-infobox-rule-cache-compare-2026-11-09.txt`; a failed request is never cached, so a missing entry would have shown). Not measured, and not claimable: how many of the 381 requests were throttled or retried. The rule, like the probe (item 14), keeps no per-request status; the fetch step took 37.3 minutes against the probe's 39.5, which fits the same inferred cause (waiting on a Retry-After) and proves nothing about it.

**Manifest (Rule 87).**

| | |
|---|---|
| Step B commits on `main` | `968ee51` the reader, `0827a1f` the rule, `1621efb` and `c6d10d3` the diff tool, `ef499a2` the runner's data commit, `3429152` the table write, and the commit carrying this record |
| Runner | run 42682560865 (job 129380718613), `success`, 19:21:30Z to 19:59:07Z |
| Verify | `0827a1f`: run 42682452654, success. `3429152`: run 42689207143, success |
| Guards | `0827a1f` 42682449746, `1621efb` 42684089013, `c6d10d3` 42684524556, `3429152` 42689207080: all success |
| Deploy | `0827a1f`: run 42683398510, success. `3429152`: run 42690116309, success |
| Live-check | `0827a1f`: run 42683554851, success. `3429152`: run 42690276129, attempt 1 failure (step 7, the Build: items 26 and 27), attempt 2 success, so the run's conclusion is success |
| Every run on `3429152` | 6 of 6 listed (`gh api` `actions/runs` filtered by the SHA, `total_count` 6): guards 42689207080 success, verify 42689207143 success, deploy 42690116309 success, status 42690116025 skipped and 42690275952 success, live-check 42690276129 success (attempt 2) |
| Done condition, the probe output | `node outbox/venue-infobox-source-diff-2026-11-09.mjs c6d10d3 ef499a2` printed `AS PREDICTED: exactly the 3 rows changed, as predicted, and nothing else moved; the 8 stub-lead rows are named above` and exited 0. `node outbox/venue-infobox-rule-cache-compare-2026-11-09.mjs` printed `EQUAL: the rule read the probe's roof values on 381 of 381 articles`. `npm run check:venue-sourced` printed `6/6 checks passed`. `node scripts/mutation-check.mjs --anchors` printed `checked 1243 of 1246 mutation anchors; 0 stale`. The four ids printed PASS on each, `5/5 checks passed`. `grep -c 'at "U.S. Bank Stadium"' src/Venues.fs` prints 1. `node build/VerifyMain.js`: `369/369 checks held` |
| Genuine residual | None from Step B. The owner's, not deferred work: whether a partial roof is a class of its own, whether to build on the categories, the forecast store's schema, and whether the plain `npm run build` in `live-check`, `verify` and `deploy` gets the bounded repeat (item 27). Not started, and needing the owner's go: Task 3 and Task 4 Step 1 |

## Integration state (Rule 65)

- **Relay contract:** none produced or changed. The relay is untouched.
- **Consumer:** `CardForecast.fs` prints `Forecast.METHOD_TAG` in the card line. The lab page serves `build/Forecast.js`,
  `build/CardForecast.js`, `build/Scoreboard.js`, `build/Standings.js` and `data/standings-eng1-2026-11-08.json`, the five
  files the proof compares.
- **Status:** VERIFIED on the deployed page with pinned data and a fixed clock (`WIRED`, 11 of 11). STAGED: a real forecast on
  a real card. Blocked by: no EPL card can be `Scheduled` with its kickoff ahead before 2026-11-21T12:30Z. Unblocked when: the
  scheduled task fires at 2026-11-21T11:05Z; it applies `^model table-v2 — …`. Verify: `gh workflow run
  forecast-live-probe.yml -f date=2026-11-21`, then `outbox/forecast-live-manifest-2026-11-21*.json` must read
  `verdict: "PASS"` with `numbers` of 1 or more (the full condition is in `outbox/cc-session-2026-11-08-epl-forecast-on-cards.md`,
  "STAGED").
- **Known mismatches:** none found between the model line and the table it reads. The store's missing method column is a gap
  in the record, not a mismatch.
