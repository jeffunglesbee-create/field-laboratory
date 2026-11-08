# The EPL forecast on the card — session 2026-11-08

**Repo:** field-laboratory · **Branch:** main · **Commissioned by:** the owner's "Next approved", Sun 2026-11-08 11:27 ET, approving the one next step of the previous report: *build the EPL forecast onto the lab's EPL cards from `Forecast.fs`; cards with no market price show the model alone, labelled by provenance.*

**Governing document:** `docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md`. Its rulings, which this work was built to and which are enforced in code rather than promised here: Rule F is cleared for a modelled forecast and Rule A is not (pull only); a difference from the market is never rendered as an edge; agreement is as visible as disagreement; show both numbers, labelled by provenance, and let the reader subtract; model-only is the dominant state.

## Result

1. An EPL card that is `Scheduled` with its kickoff still ahead now carries one line under the market line: `model table-v1 — Arsenal 94% · draw 4% · Spurs 2%`. A card that should carry one and cannot says why, by name, in one of seven sentences. Every other card is unchanged.
2. The wiring is proved on the page pinned to the 2026-10-10 capture at a fixed clock: 38 of 38 render checks, one committed screenshot (`outbox/forecast-card-pinned.png`). **That screenshot is wiring proof only.** The committed table is 2026-11-08 and the fixtures are 2026-10-10, so each forecast in it is made from a table that already contains its own result. The same proof was then taken from the DEPLOYED page (d9554f3): `outbox/forecast-deployed-wiring-2026-11-08.json`, verdict `WIRED`, with the same caveat.
3. The line has **not yet been seen on a live card**, and none can exist before 2026-11-21 (premise 3 below). The live proof is STAGED with its unblock criteria further down, and a one-shot scheduled task runs the probe that morning.
4. The model is a declared prior and it is overconfident against the market. At GW6 onward (n = 47) its Brier score is 0.752 against the market's 0.572 and a uniform guess's 0.667. The card prints the number and where it came from; it prints no accuracy claim. The numbers and their limits are under "The model's record so far".
5. Landed on `main` as `91c17b4` (the feature), `f8df1b7` (its checks) and `d9554f3` (a fix: the first push went red at `check:exit-drains`, see Landing). On `d9554f3`: `verify`, `guards`, `deploy` and `verify-full` (1,194 mutations) are green, and `/version.txt` on the deployed page reads that sha. One post-deploy `live-check` step is red for a reason that predates this work (Landing, last paragraph).

## What a reader sees

One line, in the market line's own layout, headed by the model that produced it:

| state | line |
|---|---|
| a number | `model table-v1 — Chelsea 57% · draw 19% · Bournemouth 25%` |
| a refusal | `model table-v1 — no forecast: not in the standings table: Man United` |
| waiting | `model table-v1 — standings loading` |

The refusals are `standings loading`, `standings unavailable (<reason, cut at 80 characters>)`, `not in the standings table: <clubs>`, `points deduction carried by <clubs>`, `no match played yet by <clubs>`, `kickoff time not served`, and `the model declined this fixture`. The club-not-in-table refusal is not hypothetical: the archive spelled Manchester United "Man United" until 2026-10-31 and "Man Utd" since (finding 2).

The line is drawn only while it is not hindsight: an EPL card, `Scheduled`, kickoff ahead of now. A Final card and a card past kickoff draw nothing. The node carries `data-forecast` (the state as one word) and `data-method` (the full statement, `table-v1: ppg + 0.25*gdpg + 0.10*gfpg, home +0.30`) so a number is never on a card without its model beside it.

## How each ruling is held

| ruling | where it is enforced | what fails if it is broken |
|---|---|---|
| Rule A not cleared: pull only | `scripts/check-forecast-pull-only.mjs` reads the five forecast source files for a timer, a second effect, any push or notification word, and a table request more than once per slate | the guard; 12 mutation entries (7 against the guard, 5 against its detectors) |
| a difference from the market is never an edge | `CardForecast.lineFor` has no parameter that carries a market price, so a rendering built on divergence does not compile without changing its signature; the guard bans market fields in the decision and the words for a gap in the wording | the guard, a Suite check, the render check's banned-vocabulary check |
| agreement as visible as disagreement | nothing in the line depends on the market: the same fixture draws the same text with or without a price | a Suite check; render scenario G, which routes the odds to null and compares the numbers byte for byte |
| model-only is the dominant state | a card with no market price shows the model line alone (scenario G, priced control beside it) | scenario G |
| render the number only | three probabilities and a tag; no simulation, no rating, no gap | the Suite's pinned text |

## What was built

**Commit 1, the feature** (`src/`, `data/`, `index.html`, this document):

- `src/Standings.fs` (new): `Standings.fromString`, a strict decoder for the relay's `/espn-standings/soccer/eng.1/standings` body. A missing stat, a non-whole count, two rows answering to one club name, and an empty table are each an `Error` with a path, never a zero.
- `src/CardForecast.fs` (new): `TableState` (`Pending | Loaded | Unavailable`), `Refusal`, `CardLine`, `lineFor now game state table`, `text`, `kind`. Exact-name join against the table; no alias map (Rule 60, Rule 64).
- `src/Forecast.fs`: `joined`, `modelOf` and `METHOD_TAG` added. `METHOD` is byte-identical to what it was.
- `src/Scoreboard.fs`: the forecast node, an EPL-only child after the win-probability line, written by one `createEffect`. `src/Program.fs`: one request for the standings per slate, only when the slate has an EPL card; a pinned page reads `data/standings-eng1-2026-11-08.json` and a live page reads the relay, and neither falls back to the other.
- `src/Fixtures.fs`, `src/Suite.fs` (27 new checks in the group "Card forecasts", 338 to 365 in all), `src/Laboratory.fsproj`, `index.html` (`.desk-card__forecast`, empty = no space).
- `data/standings-eng1-2026-11-08.json` (68,894 bytes, sha256 `4eebdf2a77497111bea9f4fc748e9d9bf87ab29e863ee0232d0ac75a5f8e4a7b`) and its entry in `data/PROVENANCE.md`.

**Commit 2, the checks that keep it true** (`scripts/`, `.github/`, `package.json`, `outbox/`):

- `scripts/forecast-render-check.mjs`: 38 checks in nine scenarios on a real browser. A: the pinned slate at 09:00Z (nodes on the six EPL cards only, Final draws nothing, a flip to Scheduled draws a number or a named refusal, a flip back removes it, banned vocabulary, the market line untouched, one standings request, same origin only). B: the clock moved past the first kickoff. C: a slate with no EPL card spends no request. D: standings 503. E: a 200 that is not a table. F: a held request resolves into a number with no reload. G: no market price. H: the unpinned page, routed. I: a failed live table is a refusal and the committed table is not requested to cover for it.
- `scripts/check-forecast-pull-only.mjs` (self-test 44, live 22), `scripts/forecast-live-probe.mjs` (self-test 25) with `.github/workflows/forecast-live-probe.yml`, 55 `forecast-*` entries in `scripts/mutation-check.mjs`, `verify.yml` steps, `package.json` (`check:forecast-pull-only`, `check:forecast`, `check:forecast-live`).

## Premises, each tested by one command (Rule 100)

All four come from `outbox/forecast-premises-2026-11-08.mjs`; its output is `outbox/forecast-premises-2026-11-08.txt`. Data fetched 2026-11-08 between 16:33Z and 16:36Z, live relay, EPL regular season to date.

| premise | what refuted or confirmed it | decided |
|---|---|---|
| the served table holds a match the moment it ends | `gamesPlayed` equals the archive's finished count for 20 of 20 clubs (99 finished rows in 87 daily payloads) | a Final card carries no forecast |
| an unscored row reads as Scheduled while in play | Man Utd v Aston Villa, start 16:30Z, no score: `Desk.gameStateAt` at 17:15Z, 45 minutes in, answers `Scheduled` | `Scheduled` alone cannot gate the line; kickoff must be ahead |
| a live card can exist before the break ends | earliest kickoff after 2026-11-08T17:15Z in `/fpl/fixtures` is gameweek 11, 2026-11-21T12:30:00Z (280 of 380 fixtures are ahead) | the live proof is staged until 2026-11-21 |
| a day's rows exist hours before kickoff | 100 of 100 EPL rows were created on their own date between 10:00 and 10:03Z; creation to kickoff is 1.47 h at the shortest and 3.99 h at the median | the live probe runs at 11:05Z on 2026-11-21 |

The standings route (`/espn-standings/soccer/eng.1/standings`) answered HTTP/2 200 with `access-control-allow-origin: *` and `cache-control: public, max-age=900` at 2026-11-08T16:33Z, 20 entries, `gamesPlayed` 9 or 10, values as floats (`10.0`). The decoder rejects a non-whole count and reads the float.

The committed 2026-10-10 capture prices all six of its EPL cards, so the "no market price" state has no committed card to show it. Scenario G proves it by routing `opening_odds` to null on the same page and comparing the numbers.

## The model's record so far

`outbox/forecast-backtest-2026-11-08.mjs` replays the 99 finished EPL matches of 2026-27 through the compiled model, each forecast made from the table as it stood before that match, and scores it against the market line as the card draws it. Output: `outbox/forecast-backtest-2026-11-08.txt`. An independent JavaScript recomputation of the model agrees with the compiled one on 89 fixtures with a maximum difference of zero.

| matches with both a model and a market number | n | Brier, model | Brier, market | log loss, model | log loss, market |
|---|---|---|---|---|---|
| all | 83 | 0.818 | 0.605 | 1.477 | 1.010 |
| both clubs have played 5 or more (GW6 on) | 47 | 0.752 | 0.572 | 1.289 | 0.965 |
| both clubs have played 8 or more | 19 | 0.591 | 0.571 | 1.047 | 0.965 |

A uniform guess scores 0.667 on every set. The model's mean top probability is 70% at GW6 on, the market's 49%. The model's home-win probability against what happened, GW6 on: predicted 7% on average, home won 50% (n = 12); predicted 71%, won 36% (n = 11); predicted 88%, won 80% (n = 10).

Limits. These are 47 and 19 matches of one season, and the constants were declared before the season and not fitted to it, so this is an out-of-sample read of declared priors and it has the noise of a small sample. The direction is not small: worse than a uniform guess at GW6 on, close to the market once every club has eight games. The model's early-season ratings come from few matches, and that is where it is worst.

What this means on the card. The CC-CMD warned that a model shown beside the market only when it disagrees makes every glance read "FIELD thinks the market is wrong". The card is not conditional on disagreement, but an overconfident model disagrees with the market by a mean of 21.9 points on the home probability at GW6 on (the pinned screenshot shows Arsenal 92% beside the market's 67%, with the hindsight caveat above). The card says nothing about that gap and this document does. Whether to calibrate before showing it is the owner's call; this session did not change the model, which would need a new `METHOD_TAG` and a `ModelRevised` stamp.

## Findings (not fixed here: Rule 69)

1. **An unscored row reads as Scheduled for as long as it has no score.** Man Utd v Aston Villa showed `Scheduled 2026-11-08T16:30Z` 45 minutes into play. The forecast line is unaffected (it checks the kickoff), the card's own status line is not. Whether the lab should have live scores for soccer is the owner's earlier question, and this is its first concrete case. No open CC-CMD covers it (searched `docs/CC-CMD-*.md` for `gameStateAt`, "unscored", "Scheduled while").
2. **Archive spelling drift.** ESPN's `shortDisplayName` for Manchester United is "Man Utd" from 2026-10-31 and "Man United" in 8 older rows, including the committed 2026-10-10 capture. A Scheduled card carrying the old spelling is refused by name, which render scenario A pins on `Man United v Spurs`; today every such card is Final, so nothing is drawn. The client has no alias map on purpose: the relay owns names. Not covered by an open CC-CMD.
3. **A stale comment in `src/Program.fs`** (`RELAY_DATE`) says the sandbox cannot reach `*.workers.dev`. On 2026-11-08 the sandbox's Chromium loaded the deployed page (`/version.txt`, HTTP 200) and `curl` through the agent proxy read the relay. Not edited.
4. **The CC-CMD's `Paired` type and `whyNoMarket` (Rule 99) are Phase 2 and not built.** A card with no market price shows the model line and says nothing about why there is no price.
5. **The CC-CMD's Status said `src/Forecast.fs` was 268 lines.** True on 2026-10-04, false now. The count is removed from the Status instead of replaced.
6. **No command runs `verify.yml`'s steps before a push.** `check:exit-drains` is a `verify.yml` step and is in none of the pre-commit hook, `scripts/gate-checks.mjs`, `scripts/confidence.mjs` or `docs/gate-rows.txt` (`grep -c exit-drains` returns 0 for the first three; the rows file has no line naming it). This session's three new scripts therefore reached CI without it having run, and the first push went red (Landing, push 1). A failing step also hides every step after it: 38 `run:` steps, all four forecast steps among them, were skipped. Searched `docs/*.md` and `outbox/*.md` by content for a CC-CMD that covers running the job's steps locally ("every step of verify", "verify steps locally", "steps CI skipped"): none. Candidate, not built: a script that executes the `run:` blocks of `verify.yml` in order, which is what was done by hand for the 38 (`outbox/forecast-verify-steps-local-2026-11-08.txt`).

## Verified, and STAGED

Verified before the first commit, by command:

| what | result |
|---|---|
| F# Suite | 365 of 365 (338 checks counted in `src/Suite.fs` at HEAD before this work) |
| render check, fresh build, browser path set | 38 of 38; `outbox/forecast-card-pinned.png` written by that run |
| pull-only guard | self-test 44 of 44; live 22 of 22; coverage printed: 5 of 5 forecast sources, with what is not scanned |
| render check self-test / live probe self-test | 12 of 12 / 25 of 25 |
| mutation | 55 of 55 `forecast-*` entries caught, 0 survived (`outbox/forecast-mutation-2026-11-08.json`) |
| from-scratch rebuild | same build digest as the incremental one (`2cee36178917803e` both) |
| local gate, the 22 rows other than mutation (`node scripts/run-row.mjs "<row>"`, one at a time on the final tree) | 22 of 22 pass, 0 to 47 seconds each. Two things failed first and only because this container's clone was shallow (50 commits): the history row (`1 pre-rule commit, declared 39`) and the history half of `check:citations`. After `git fetch --unshallow` (2,904 commits) the history row reads 39 of 39 and every citation check passes. |
| every step of `verify.yml`, locally | NOT run before the first push: no command does it (Finding 6), and the first push went red. After it, the 38 `run:` steps that red run skipped were run locally: 38 of 38 pass (`outbox/forecast-verify-steps-local-2026-11-08.txt`, coverage stated in its header). CI's own run of them is the record. |
| the mutation row, locally | not run (about 5.4 hours); `verify-full` runs the whole table on the pushed tree and its run id is recorded in the landing section |

The mutation run found 4 survivors the first time (a missing away club not named, a case-insensitive join, an away deduction unchecked, an unclipped refusal), each a claim the Suite did not defend. Six Suite checks and four mutation entries now defend them and the home-side twins. The first run's baseline was red for the render check because the browser path was unset; 12 records from it did not count and were re-run with a green baseline (16 superseded records are listed in the JSON).

**STAGED: the forecast on a live card.**

- *What is staged.* A real forecast on a real `Scheduled` EPL card, on the deployed page, with the table the relay serves that day.
- *What blocks it.* No EPL card can be `Scheduled` with a kickoff ahead before 2026-11-21T12:30Z (premise 3).
- *What unblocks it.* The archive creates a day's rows at about 10:00Z (premise 4). A run at 11:05Z on 2026-11-21 sees the whole matchday with the first kickoff 85 minutes ahead.
- *How it is checked.* `gh workflow run forecast-live-probe.yml -f date=2026-11-21`. It commits `outbox/forecast-live-manifest-2026-11-21*.json` and `outbox/forecast-live-*.png`. The done condition is that manifest reading `verdict: "PASS"`, `numbers` of 1 or more, `standingsRequests: 1`, `standingsStatuses: [200]`, `errors: []`, and at least one entry of `cards` with `kind: "model"` whose `text` matches `^model table-v1 — (.+) (\d+)% · draw (\d+)% · (.+) (\d+)%$`. `NOTHING-TO-JUDGE` and `WIRED-NO-FORECAST` are not passes.
- *If it says NOTHING-TO-JUDGE before 12:29Z.* The archive had not made the rows: read `/context/date/2026-11-21` for EPL rows before explaining anything, and re-dispatch.

## Out of scope, and whose it is

The D1 record (the owner's decision on `forecast-run.yml`'s write gate is still open), Phase 2's `Paired` type and change record, an upcoming-fixtures surface, and any change to the model. The client is untouched (LAB-FIRST-A).

## Reproduce

```
npm run build && node build/VerifyMain.js                       # 365 of 365
node scripts/serve.mjs &                                         # then:
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/forecast-render-check.mjs   # 38 of 38
npm run check:forecast-pull-only && npm run check:forecast-live
node scripts/mutation-check.mjs --ids "$(grep -o 'id: "forecast-[a-z0-9-]*"' scripts/mutation-check.mjs | cut -d'"' -f2 | paste -sd, -)"
npm run check:exit-drains                                        # 63 of 63 (budget 63); 66 is the red run
```

## Landing

### Push 1: 2026-11-08 17:50Z, `5df5314..f8df1b7` on `main` (91c17b4 the feature, f8df1b7 the checks). `verify` RED.

- `guards` (run 42506920196): success.
- `verify` (run 42506920189): failed at 17:55Z in its step "No check script kills itself mid-write" (`npm run check:exit-drains`): `early report exits: 66 (ratchet, budget 63)`.
- **Cause, from the check's own list.** It names `scripts/check-forecast-pull-only.mjs:208`, `scripts/forecast-live-probe.mjs:170` and `scripts/forecast-render-check.mjs:115`. Each ended its `--self-test` block with `process.exit(summarize() === 0 ? 0 : 1)` and had the live half after it, which is what the ratchet counts (`docs/CC-CMD-2026-10-11-process-exit-drops-the-annotation.md`). 63 already budgeted plus these 3 is 66.
- **Why it was not caught before the push.** Finding 6. The checks run beforehand were the Suite, the new scripts, the 22 non-mutation gate rows and the pre-commit hook; this step is in none of them.
- **Fix.** The three lines became `finish(summarize())`. The budget stays 63: a ratchet that rises to fit a new script is not one. Nothing falls through into the live half: after each self-test block the only top-level statements are definitions and the `!SELF_TEST`-guarded live block (listed per file with `awk` before the edit). A failing self-test still exits 1: a mutated copy of each script, one passing check made false, exited 1 with exactly one FAIL (43/44, 24/25, 11/12); the copies were deleted. Then `check:exit-drains` 63 of 63 (4 of 4 checks) and the three self-tests 44/44, 25/25, 12/12.
- **What the red run hid.** 38 `run:` steps skipped, all four forecast steps among them. Run locally before the second push, 38 of 38 pass: `outbox/forecast-verify-steps-local-2026-11-08.txt`.

### Push 2: 2026-11-08 18:02Z, `d055c11..d9554f3` on `main`. `verify` GREEN, deployed.

d9554f3 is the fix, rebased onto three bot commits that landed while it was being made (`932d67b`, `16fe4e9`, `d055c11`, all status or sentinel refreshes).

| what | run | result |
|---|---|---|
| `verify` | 42507928169, 18:02:17Z to 18:08:22Z | success: 102 steps passed, 1 skipped (the screenshot upload that runs only on failure) |
| `guards` | 42507928166 | success |
| `deploy` | 42508436121 | success by 18:09:06Z. `/version.txt` reads `d9554f312008e7f06acb54a9f458179648dd555c`, the pushed sha |

**The line on the deployed page** (`outbox/forecast-deployed-wiring-2026-11-08.{mjs,json,png}`, verdict `WIRED`, exit 0). Coverage, as the manifest prints it: *6 of 6 EPL cards on the page carry the forecast node; 5 served files compared with the local build; 1 pinned page, 1 clock.* Five of the six draw a model line, one draws a named refusal (`Man United v Spurs`: "not in the standings table: Man United", the Finding 2 case). The five served files are byte-identical to the local build (sha256 in the manifest) and contain the new strings. All ten checks in the script were made to fail on purpose before the pass was trusted: a wrong sha, a needle absent from its file, and a one-byte change to a local build file each failed the check meant for them, and seven checks failed under a mutated copy of the script with exactly that check and no other red. The scratch version of the script had one needle in the wrong file (`table-v1` looked for in `build/CardForecast.js`, where it printed `false`; it is declared in `build/Forecast.js`, which is where the needle sits now).

**This is wiring and not a forecast.** The page is pinned to the 2026-10-10 capture with the clock fixed at that morning, and the table is the 2026-11-08 one, so the numbers are hindsight. They also show the model's overconfidence plainly, which the record above predicted: `Sunderland v Brighton` reads market 31 / 28 / 42 and model 3 / 5 / 93; `Arsenal v Leeds` market 67 / 21 / 12 and model 92 / 5 / 3; `Aston Villa v Brentford` market 35 / 27 / 38 and model 36 / 27 / 37. The card prints both and no difference between them, as the ruling requires. Whether to calibrate table-v1 is the owner's decision and was not started.

**The live probe, run once on a runner now** (run 42508763916, `workflow_dispatch` on `main`, 0.7 minutes): `outbox/forecast-live-manifest-2026-11-08.json` reads `verdict: "NOTHING-TO-JUDGE"`, `reasons: ["no EPL card is Scheduled with its kickoff ahead"]`, `deployed` = d9554f3, `standingsRequests: 1`, `standingsStatuses: [200]`, `errors: []`. The job is red by design: only `PASS` leaves it green. What it did establish on the live path: the runner reached the deployed page and the relay, the page asked for the table once, the relay answered 200, and the commit-back works (`0f9d791`). It also observed the kickoff guard on a real row: `Man Utd v Aston Villa`, `Scheduled 2026-11-08T16:30Z` with the probe at 18:12Z, drew nothing (`kind: "none"`), as did the four Final cards. A card that is Scheduled with its kickoff ahead does not exist before 2026-11-21, so `PASS` is still STAGED (section above).

**The mutation row on the pushed tree: GREEN.** `verify-full` run 42508482057 on d9554f3, dispatched 18:08:40Z, success in 41.3 minutes: the gate job and all 8 mutation shards (31.0 to 40.6 minutes each). The gate committed its own record back (`fd4c6af`, `e5aa790`). `outbox/mutation-baseline-latest.json` reads 92 baseline commands over 1,194 mutations, 0 failing; the previous record (2026-11-06, on 1f05aa4) read 88 and 1,139, a difference of 4 and 55, and 55 is the number of `forecast-*` entries added here. `docs/confidence-log.jsonl` for d9554f3: mode full, 530 of 530 earned, total 100, 2,387 seconds. `"dirty": true` is on every recent record of this workflow (bf487aa, 8b1ee44, 1f05aa4 and this one), so it is how a runner records itself and not a finding.

**The 2026-11-21 run**: scheduled task `trig_0177NdbPiNCxsGMgVaQWmk6q`, one shot at 2026-11-21T11:05:00Z, runs on automatic approval. Its prompt is the STAGED section's criteria plus: after a FAIL, run every `verify.yml` step the fix touches before pushing.

**Not caused by this change, found while reading the deploy's runs**: the post-deploy `live-check` run 42508515549 on d9554f3 is red at "A finished game shows the brief written after it finished": `Milan @ Genoa` (Serie A) shows a `game_live` brief on a Final card; 14 other final games pass, the EPL ones among them. The same step failed in three runs before this work reached the page: 42387767654 (7d6ed4a), 42410306002 (39686ee), 42426463552 (6a21570), all on 2026-11-07. No `docs/CC-CMD-*.md` mentions `brief-phase-live-check`; the outbox files that name this check are `outbox/cc-the-recap-on-a-finished-game-2026-08-29.md` and `outbox/cc-the-phase-rule-verified-live-2026-08-29.md` (neither read for this). Not touched here (Rule 69).
