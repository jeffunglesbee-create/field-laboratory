# Session record: the UEFA replication of candidate U (2026-11-28)

**Status: IN PROGRESS.** Written before the rule's final commit (the rule names this file); the numbers and hashes of later steps are added by later commits to this file, and a later commit that changes a statement says so in its message. Rule 67: HEAD progression, what was built per commit, what was verified against what is staged, open carry-forwards.

## The owner's instruction and the five ideas it chose from

The owner asked "What novel thinking accomplishes the UEFA forecaster?", then "Explore #3 first. We want the full forecaster." (done: `outbox/cc-session-2026-11-28-uefa-prior-exploration.md`), then "Now 1 and 2" and, mid-turn, "Meant ideas 1 and 2". The five ideas were the assistant's answer in that conversation (not previously in the repo; recorded here so the rule's header can cite them):

1. **Backward holdout, read-only.** Freeze the constants at 1.34 / 1.97 / 0.18, commit a rule before any 2024-25 result is read, score U on the 2024-25 league phase (ESPN lists 189 + 189 + 153 completed events). About 234 forecasts.
2. **Sequential test.** The answer proposed ±ln 20 Wald boundaries between "no skill" and "the cross-validation effect". **This record states the change:** the rule uses a two-look group-sequential test instead (one-sided total alpha 0.05, Bonferroni 0.0125 / 0.0375), because a Wald test needs a point alternative and the project has measured the standard deviation of the paired difference at 0.212 and at 0.315, so an assumed one would make it overconfident or under-powered (rule, CHOICES MADE WITHOUT DATA).
3. **Give the model a prior** (explored first; not built; the prior-source decision is the owner's).
4. **Show the price where one exists** (an owner decision with a measured Odds API cost; not touched).
5. **Change the deliverable to league-phase stakes** (arithmetic classification; not touched).

The recommendation was "run ideas 1 and 2 as one pre-registered replication". The owner's instruction took that form.

## What this costs later candidates (stated before any data)

U scored on 2024-25 at Look 1 makes 2024-25 not blind for any later candidate (a prior, ClubElo, anything). If Look 1 does not cross, the 144 forward 2026-27 matches are scored at Look 2 and are spent too. If Look 1 crosses (BUILD or DO NOT BUILD), the forward matches stay unspent. The exploration record's clean-data budget (section 4) lists these two sets as the clean ones for a new candidate; this replication uses them for U.

## Order of the work, with the commands that tested each premise (Rule 100)

| premise | the one command that tried to refute it | result |
|---|---|---|
| A status rule of "every completed event is FULL_TIME" is safe | categorical census of the 2024-25 window (run 46095464139, counts only) | refuted: 4 / 5 / 7 completed events per competition are AET or PEN; the rule became version 2 |
| The forward window 2026-08-01 to 2026-11-26 holds only league-phase events on the three slugs | census (run 46098677826) | 90 / 90 / 72 events, all completed, all `league-phase`: the same counts as the frozen bundle's 252 |
| No league-phase match was played on 2026-11-27 or 2026-11-28 | census (run 46100707804) | no event on any of the three slugs on either day |
| The archive's frozen bundle can serve as a club-id reference | `node` over the frozen bundle | refuted: it carries club names, 37 raw names for 36 clubs in the Champions and Europa League (spelling variants), so the frozen check compares espn_event_id, scores and start times, never club ids |
| The frozen bundle's start times are one format | `node` over the 252 rows | all `dddd-dd-ddTdd:ddZ` |
| An implementation of U written from the rule text equals the earlier tooling's | the check script's known answers A and B | A: the frozen 2026-27 bundle gives n 90 and the earlier result's Brier U, Brier base, mean D and z to 1e-9; B: the 2025-26 rows give 234 eligible forecasts with outcome counts (122, 43, 69) and the same gaps as the earlier `prepare()` |

## Review

Three rounds of independent review, each by separate agents told to refute (not to approve), before any 2024-25 row was written to disk or printed: round 1 on version 1; round 2 (three lenses) on version 2; round 3 (three lenses: consistency and implementability, statistics and process, claims against the repo; 17, 13 and 13 findings) on version 3. Round 3's two blockers were a G3 that could not hold for the pinned frozen file and an unspecified stop-versus-verdict, both fixed in version 3, with an independent-recomputation loophole (a disagreement is now terminal for that look). Findings not adopted, with reasons: gating on a clustered standard error (a change of test, decided against; the size under dependence is stated instead, with a committed sensitivity script); restricting (g) and (j) at Look 2 to scorable rows (the repair-pending wait handles an irrelevant anomaly without a second rule).

## What the author has read of 2024-25 (the BLIND disclosure list)

Published aggregates and one standings line, as listed in the rule's SEEN. **No 2024-25 row has been opened by the author.** The only reads of the 2024-25 payloads are the collector's census run (counts of kinds in memory, nothing written). The session record lists every command that touches the bundle once it exists: none yet.

## Not asserted

That the ESPN data's licence allows this use (Rule 45: flagged for a human). That the matches are independent (they are not; the size under dependence is in the rule's POWER). That U is a good forecast: a pass says the table beats a table-free forecast on eligible matches.

## Carry-forwards

None deferred: every remaining step is a numbered task of the CC-CMD section "Replication 2026-11-28" (Rule 87).
