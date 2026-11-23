# Claude Code Command — grade BSD's published next-goal calls against FIELD's own goal timelines (counts only, rule fixed before the run)

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory owns the proof (LAB-FIRST-A); the ledger can be read only with a BSD token, see "What only the owner unblocks"
**Filed:** 2026-11-22 by CC, as the follow-on the census CC-CMD owes (Rule 87.4), from the census result
**Type:** A (measurement) — no feature, no surface, nothing shown or pushed (ADR-002 Rules A and F)
**Status:** IN PROGRESS 2026-11-23. Unblocked by the owner ("Yes, run from relays runner", 2026-11-23): the proof may run, from field-relay-nba's runner. The grader, its checks and the runner are built and were adversarially reviewed (45 agents, 2026-11-23) before the first run; rule version 2026-11-23.2 below. Not yet run on the vendor's ledger.

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

Every premise below is COUNTED by the run (the artifact's `grade.premises` and `grade.byTag`), never assumed; a premise that fails shows as calls "not applicable" under a named reason, not as a wrong grade.

| # | premise | what refutes it | answered by |
|---|---|---|---|
| G1 | a ledger row carries `side` and a whole-number `score_at_call`; `minute` is read only to be counted | a row without them | `premises.callsWithoutSideOrScore`, `premises.callsWithoutAMinute` |
| G2 | goal rows carry the running `home_score` and `away_score` after the goal (measured on two committed captures, 4 and 3 goal rows; the 246 live captures are the test) | a goal row without both | `premises.distinctCapturesWithAGoalRowLackingAScore`, `callsOnCapturesWithAGoalRowLackingAScore` |
| G3 | `score_at_call` is the score immediately before the resolving goal | the capture's score before goal k+1 differs | `premises.callsWhoseScoreAtCallDisagreesWithTheCapture`, and `resolvedMinuteDistance` (agree/disagree by how far the resolving goal is from the ledger's `resolved_minute`) |
| G4 | the goals can be put in order by running total; minutes agree with that order | totals that are not 1..n; two goals in one minute; minutes out of total order | `premises.distinctCapturesWhoseTotalsAreNotOneToN`, `...WithTwoGoalsInOneMinute`, `...WhoseMinuteOrderIsNotTotalOrder` |
| G5 | a capture's full-time row and its goal list tell the same score | the full-time row's score differs from the last goal's | `premises.fullTimeScoreVersusLastGoal` (per call and per distinct capture) |
| G6 | the capture belongs to the ledger's event; VAR and extra time do not disturb the goal list | the capture's own `event_id` differs; VAR rows or extra time present | tags `eventId`, `var`, `extraTime` in `byTag` (agree, disagree and not applicable under each) |

## The rule, fixed before the run (so the run cannot choose it) — version 2026-11-23.2

For each of the 370 gradeable calls: let k = `score_at_call.home + score_at_call.away`. FIELD's resolving goal is the goal whose running total is k + 1, with goals ordered by running total (never by position or minute); a capture with a goal row lacking a score, or whose totals are not 1..n, is not trusted (every call on it is not applicable). The capture's score before that goal must equal `score_at_call`, else not applicable. FIELD's side is the side whose running score rose by one (not `is_home`, whose agreement with the rise is tallied). FIELD's verdict is `hit` if that side equals the call's `side`, else `miss`. The call **agrees** when FIELD's verdict equals the ledger's `outcome`. Every call lands in exactly one place: agree, disagree, or one named not-applicable reason. A disagreement is a count and a named reason, never explained away (Rule 77).

What the artifact must let a reader tell apart (added after review; none of it changes who agrees): agree and disagree BY the distance from the resolving goal's minute to the ledger's `resolved_minute` (a stoppage-time goal carries the nominal minute, so a far distance on one is its own bucket), the count of DISTINCT goals (several calls can sit on one goal), each not-applicable reason by capture state, and the premises above. The artifact also states why agreement is not an independent grade (below). No grade of the vendor's probabilities, no Brier, no calibration: those need a rule of their own.

## Tasks

0. **Probe block (Rule 87.1).** Done in the same run: the artifact carries the census block (`census`) and G1 to G6 (`grade.premises`, `grade.byTag`). If G2 fails for most captures the grade is mostly not applicable and this document is re-filed with a different side rule, not patched.
1. **Built and proven able to fail (done 2026-11-23).** field-laboratory: `scripts/bsd-next-goal-grade-core.mjs` (pure), its check (18 scenarios, 134 assertions, including two hash-pinned real captures and generated calls with known answers) and mutation harness (225 mutations, all caught). field-relay-nba: `scripts/bsd-next-goal-grade.mjs` (the runner), its run check (20 scenarios, 96 assertions) and harness (137 mutations, all caught, with two controls that a copy changing nothing passes), and `.github/workflows/bsd-next-goal-grade.yml` (two jobs: `verify` with no secret, then `grade`). The census's `collect()` was exported for reuse and its fetches were changed to a configurable timeout with redirects read as statuses (a stalled body hung the run on Node 22 with `redirect: 'error'`).
2. **Run** once, dispatched on main with `lab_ref` set to the reviewed laboratory SHA (a full 40-hex SHA is required). Coverage line with every denominator (Rule 91): `graded N of 370 gradeable calls`.
3. **Record** the result here, in HANDOFF and a session doc (Rule 67).

**Done condition (Rule 89):** `outbox/bsd-next-goal-grade-latest.json` in field-relay-nba exists with `reachedTarget` true, `grade.population` equal to `census.gradeable`, `grade.graded + grade.notApplicable.total` equal to `grade.population`, the premise counts present, and the workflow's `verify` job (both mutation harnesses) green.

## What the result will not say

That FIELD's captures and the vendor's ledger both come from BSD is the census's finding (370 of 370 `resolved_minute` values are goal minutes in FIELD's capture), so agreement here is **not an independent grade**: if the vendor computes `outcome` from the feed FIELD captured, agreement is expected and disagreement is the finding. The artifact says so in `note`. An independent reference (a second source's goal timeline) is out of scope and would be its own CC-CMD. Counts are per call, and calls are clustered on goals and on matches (`distinctGoals`), so a rate over calls overstates how much independent evidence there is.

## Unblocked 2026-11-23 (Rule 74)

1. **That the proof may run:** the owner said so ("Yes, run from relays runner").
2. **Where the ledger token lives:** the relay's runner. The laboratory holds the rule, the relay runs it. The core is `import()`ed into the runner's process, which holds the token, so what limits it is stated in the workflow header: a full-SHA `lab_ref`, a tripwire on the core's source text, an artifact that is refused if the token is in it. It is a trust decision, not an isolation.

## Not in scope

The relay's capture of untracked leagues (1,355 of the 1,746 calls: `bsd-live-capture-path`), any surface, route, push or display of a next-goal read, the plan and renewal decisions, anything in `src/`.
