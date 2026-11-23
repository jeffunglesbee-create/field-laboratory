# Claude Code Command — grade BSD's published next-goal calls against FIELD's own goal timelines (counts only, rule fixed before the run)

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory owns the proof (LAB-FIRST-A); the ledger can be read only with a BSD token, see "What only the owner unblocks"
**Filed:** 2026-11-22 by CC, as the follow-on the census CC-CMD owes (Rule 87.4), from the census result
**Type:** A (measurement) — no feature, no surface, nothing shown or pushed (ADR-002 Rules A and F)
**Status:** DONE 2026-11-23. Run on field-relay-nba's runner (run 45263837691, artifact commit `e1f3a64`): 372 of 372 gradeable calls agree, 0 disagree, 0 not applicable, every premise counted held. Not an independent grade (below). Session doc: field-relay-nba `outbox/cc-session-2026-11-23-bsd-next-goal-grade.md`.

---

## Why this exists

`field-relay-nba/docs/CC-CMD-2026-11-22-bsd-next-goal-ledger-census.md` (DONE, run 45065701482, artifact `field-relay-nba/outbox/bsd-next-goal-census-latest.json`) counted how much of the vendor's
published next-goal ledger (`GET /api/v2/next-goal/calls/`, 1,746 calls 2026-08-05 to 2026-11-22) FIELD's own goal timelines (`bsd/{slug}/{id}/incidents.json` in R2) can grade:
**370 calls (21.2%)**, in nine leagues, 236 matches (hit 280, miss 90 by the vendor's `outcome`). For all 370 the nearest goal in FIELD's capture is at distance 0 from the ledger's
`resolved_minute`, so the join is clean. The probe before it (`field-relay-nba/docs/CC-CMD-2026-11-22-bsd-next-goal-probe.md`) reproduced the vendor's 73.6% from its own counts (73.43%) and found the gate open for the relay's token.
What nobody has measured: whether the vendor's `outcome` agrees with what FIELD's own record of the match says happened next.

## Related, read before filing (BUILD-ON-A)

Searched 2026-11-22 by content (`next-goal`, `next goal`, `next to score`, `nextgoal`) in this repo's `docs/`, `outbox/` and `scripts/`: no hit. `BSD_API_TOKEN` is referenced by no file in this repo's `.github/` or `scripts/`
(whether the repository's Actions secrets hold it cannot be read from a session). Nothing here undoes or works around a ruling or hold: no `src/` change anywhere, nothing pushed or displayed, the relay `src` hold (2026-11-24) and
the CFL VOID window are untouched.

## Premises, and the one command each (Rule 100)

Every premise below is COUNTED by the run (the artifact's `grade.premises` and `grade.byTag`), never assumed. G1, G2, G3 and the totals-1..n part of G4 make calls "not applicable" under a named reason when they fail. The minute diagnostics of G4, G5 and the G6 tags are tallies and tags: the call is still graded, and the reader sees whether the graded calls sit on captures where the premise failed.

| # | premise | what refutes it | answered by |
|---|---|---|---|
| G1 | a ledger row carries `side` and a whole-number `score_at_call`; the call's own `minute` (when it was made) is read only to be counted | a row without them | `premises.callsWithoutSideOrScore`, `premises.callsWithoutACallMinute` (not the "no minute" distance bucket, which is about the goal row) |
| G2 | goal rows carry the running `home_score` and `away_score` after the goal (measured on the committed real captures: 4 goal rows in `data/bsd-flow-finished-incidents.json`, none yet in the in-play one; the live run's captures are the test) | a goal row without both | `premises.distinctCapturesWithAGoalRowLackingAScore`, `callsOnCapturesWithAGoalRowLackingAScore` |
| G3 | `score_at_call` is the score immediately before the resolving goal | the capture's score before goal k+1 differs | `premises.callsWhoseScoreAtCallDisagreesWithTheCapture`, and `resolvedMinuteDistance` (agree/disagree by how far the resolving goal is from the ledger's `resolved_minute`) |
| G4 | the goals can be put in order by running total; clocks (minute and added time together) agree with that order | totals that are not 1..n; two goals at one clock; clocks out of total order | `premises.distinctCapturesWhoseTotalsAreNotOneToN`, `...WithTwoGoalsInOneMinute`, `...WhoseMinuteOrderIsNotTotalOrder` |
| G5 | a capture's full-time row (or, in play, its live row) and its goal list tell the same score; a capture that went past 90 minutes (an ET, live Extra time or PEN row) is not compared, because its full-time row is the score at 90 | the row's score differs from the last goal's | `premises.fullTimeScoreVersusLastGoal` and `premises.liveRowScoreVersusLastGoal` (per call and per distinct capture; `not evaluated (extra time)` is its own answer) |
| G6 | the capture belongs to the ledger's event; VAR and extra time do not disturb the goal list | the capture's own `event_id` differs; VAR rows or extra time present | tags `eventId`, `var`, `extraTime` in `byTag` (agree, disagree and not applicable under each) |

## The rule, fixed before the run (so the run cannot choose it) — version 2026-11-23.2

For each of the 370 gradeable calls: let k = `score_at_call.home + score_at_call.away`. FIELD's resolving goal is the goal whose running total is k + 1, with goals ordered by running total (never by position or minute); a capture with a goal row lacking a score, or whose totals are not 1..n, is not trusted (every call on it is not applicable). The capture's score before that goal must equal `score_at_call`, else not applicable. FIELD's side is the side whose running score rose by one (not `is_home`, whose agreement with the rise is tallied). FIELD's verdict is `hit` if that side equals the call's `side`, else `miss`. The call **agrees** when FIELD's verdict equals the ledger's `outcome`. Every call lands in exactly one place: agree, disagree, or one named not-applicable reason. A disagreement is a count and a named reason, never explained away (Rule 77).

What the artifact must let a reader tell apart (added after review; none of it changes who agrees): agree and disagree BY the distance from the resolving goal's minute to the ledger's `resolved_minute` (a stoppage-time goal carries the nominal minute, so a far distance on one is its own bucket), the agree and disagree of every stoppage-time resolving goal whatever the distance (`stoppageResolvingGoals`), the count of DISTINCT goals (several calls can sit on one goal), each not-applicable reason by capture state, and the premises above. The runner also checks that the core graded the census's own population: the same number of calls, of distinct captures, and of calls in each R2 directory. The artifact also states why agreement is not an independent grade (below). No grade of the vendor's probabilities, no Brier, no calibration: those need a rule of their own.

## Tasks

0. **Probe block (Rule 87.1).** Done in the same run: the artifact carries the census block (`census`) and G1 to G6 (`grade.premises`, `grade.byTag`). If G2 fails for most captures the grade is mostly not applicable and this document is re-filed with a different side rule, not patched.
1. **Built and proven able to fail (done 2026-11-23).** field-laboratory: `scripts/bsd-next-goal-grade-core.mjs` (pure), its check (22 scenarios, 200 assertions, including two hash-pinned real captures, generated calls with known answers and the second review's assertions) and mutation harness (430 mutations, all caught). field-relay-nba: `scripts/bsd-next-goal-grade.mjs` (the runner), its run check (22 scenarios, 126 assertions) and harness (162 mutations, all caught, with two controls that a copy changing nothing passes), and `.github/workflows/bsd-next-goal-grade.yml` (three jobs: `verify` with no secret; `grade` with the token and no write credential; `commit` with the write credential, no token and no laboratory code). The census's `collect()` was exported for reuse and its fetches were changed to a configurable timeout with redirects read as statuses (a stalled body hung the run on Node 22 with `redirect: 'error'`).
2. **Run** once, dispatched on main with `lab_ref` set to the reviewed laboratory SHA (a full 40-hex SHA is required). Coverage line with every denominator (Rule 91): `graded N of M gradeable calls`, where M is the census's gradeable count at run time (370 on 2026-11-22).
3. **Record** the result here, in HANDOFF and a session doc (Rule 67).

**Done condition (Rule 89):** `outbox/bsd-next-goal-grade-latest.json` in field-relay-nba exists with `reachedTarget` true, `grade.population` equal to `census.gradeable`, `grade.graded + grade.notApplicable.total` equal to `grade.population`, `grade.premises` present, and the workflow's `verify` job (both mutation harnesses) green. A population of zero is not a result; a population whose calls are all not applicable is, and says so.

## What the result will not say

That FIELD's captures and the vendor's ledger both come from BSD is the census's finding (every `resolved_minute` the census could test was the minute of a goal in FIELD's capture), so agreement here is **not an independent grade**: if the vendor computes `outcome` from the feed FIELD captured, agreement is expected and disagreement is the finding. The artifact says so in `note`. An independent reference (a second source's goal timeline) is out of scope and would be its own CC-CMD. Counts are per call, and calls are clustered on goals and on matches (`distinctGoals`), so a rate over calls overstates how much independent evidence there is.

## Unblocked 2026-11-23 (Rule 74)

1. **That the proof may run:** the owner said so ("Yes, run from relays runner").
2. **Where the ledger token lives:** the relay's runner. The laboratory holds the rule, the relay runs it. The core is `import()`ed into the grade step's process, which holds the token, so what limits it is stated in the workflow header: a full-SHA `lab_ref`, a tripwire on the core's source text, an artifact that is refused if the token is in it, and a grade job that holds no write credential (the commit is a separate job with no token and no laboratory code). It is a trust decision, not an isolation: code in the grade step can reach the token.

## Not in scope

The relay's capture of untracked leagues (1,355 of the 1,746 calls: `bsd-live-capture-path`), any surface, route, push or display of a next-goal read, the plan and renewal decisions, anything in `src/`.

## Result

**2026-11-23T20:56Z, run 45263837691** (`bsd-next-goal-grade.yml` at field-relay-nba `377f434`, laboratory at `59af6e89b53d422cdcf720205ffcb13f96a1853a`, rule version 2026-11-23.3; artifacts `outbox/bsd-next-goal-grade-2026-11-23T20-56-23-290Z.json` and `-latest.json`, committed by the run as `e1f3a64`). All three jobs green: `verify` (both mutation harnesses, the checks, on the runner, no secret), `grade` (11 BSD requests of 16, 249 relay reads, `stopped` null, `analysisError` null, `reachedTarget` true) and `commit`. The artifact records the core's sha256 (`3d428dc2...`) and the runner's three file hashes. Coverage line, verbatim:

> graded 372 of 372 gradeable calls (census: 372 gradeable of 1754) | agree 372, disagree 0, not applicable 0 | resolving goal at the ledger's resolved_minute for 372 of 372 graded | rule 2026-11-23.3

**FIELD's own record of the match names the same side as the vendor's ledger for every one of the 372 calls.** The ledger had grown to 1,754 calls (from 1,746 at the census) and the census's gradeable count to 372 (17 by a full-time capture, 355 by the resolving goal itself), on 238 matches in nine directories.

- The confusion matrix has both cells and nothing off the diagonal: ledger hit and FIELD hit 282, ledger miss and FIELD miss 90 (a miss is a call whose side the goal did not go to, so FIELD reading "the other side scored" 90 times is the check that the grader is not copying the ledger).
- All 372 resolve on a goal at exactly the ledger's `resolved_minute` (distance 0). 372 calls sit on 367 distinct goals, none with a disagreeing call. 13 resolving goals carry added time (stoppage), 26 are penalties and 13 are own goals; every one agrees, and `is_home` agrees with the score rise on all 372 (so the own-goal premise, which rested on one real row and the relay's contract, now rests on 13).
- By tag: 118 calls sit on captures with VAR rows (all agree), 1 on a capture that went to extra time (agrees), all 372 on captures whose own `event_id` is the ledger's.
- The premises held on every capture that was read: no call without a side, score or call minute; no goal row without a running score; no capture whose totals are not 1..n; no tie and no clock out of order. The full-time row's score equals the last goal's on 12 of 12 evaluable full-time captures (one extra-time capture is not compared). **One observation not explained:** on one in-play capture (2 calls) the live row's score differs from the last goal's (224 of 225 evaluable in-play captures match); those 2 calls agree anyway. The artifact holds counts only, so the capture is not named; finding it needs a run that keeps its id.

**What this does not say (Rule 73).** It is not an independent grade of the vendor: FIELD's captures and the vendor's ledger both come from BSD, the census had already found every `resolved_minute` to be a goal minute in the capture, and 372 of 372 agreement is what one feed read twice would give. It says the vendor's published ledger is internally consistent with the feed FIELD captured, on the 21.2% of its calls that fall in leagues FIELD captures (the other 1,265 have no capture). It says nothing about whether any call was a good prediction, nothing about the probabilities, and nothing about calls in untracked leagues. It is one snapshot (ledger newest-first, 20:56Z). An independent reference (a second source's goal timeline) is filed as `docs/CC-CMD-2026-11-23-bsd-next-goal-independent-reference.md` (FILED, not started); nothing here is owed to it.

## What the run showed about the process (Rule 77, for the record)

Two adversarial reviews (71 agents) ran before this run and found the first build unsafe: a vacuous harness, a zero-call grade that advanced latest, a vendor string that rewrote `Object.prototype`, a write credential beside the imported core, a stalled body that hung the run on Node 22, ties read from the nominal minute, a premise tally that mislabelled extra-time captures. All were fixed and pinned before the dispatch; the run needed no second attempt.

