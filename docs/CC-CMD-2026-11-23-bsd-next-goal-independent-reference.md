# Claude Code Command — grade BSD's published next-goal calls against a goal timeline that does not come from BSD

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory owns the proof (LAB-FIRST-A); the ledger needs `BSD_API_TOKEN`, so it runs from field-relay-nba's runner exactly as the previous grade did (the owner's arrangement of 2026-11-23)
**Filed:** 2026-11-23 by CC, on the owner's "Yes" to the offer in the previous grade's result
**Type:** A (measurement) — no feature, no surface, nothing shown or pushed (ADR-002 Rules A and F), nothing under `src/`
**Status:** FILED 2026-11-23, not started. Starting it is the owner's call: it is a second verdict on the vendor, and the previous proof's two adversarial reviews (71 agents) cost more than the owner's weekly usage allows to repeat, so this one is scoped to build with one targeted review, below.

---

## Why this exists

The previous proof (`docs/CC-CMD-2026-11-22-bsd-next-goal-grade-against-field-timelines.md`, DONE, run 45263837691) found **372 of 372** gradeable calls agree with FIELD's own goal timelines, and said what that is worth: FIELD's captures and the vendor's ledger both come from BSD, so agreement is one feed read twice. It could not say whether the vendor's `outcome` is **true**. This asks that: for the same calls, does a goal timeline from a different vendor name the same side for the goal that followed the call?

## Related, read before filing (BUILD-ON-A)

Searched 2026-11-23 by content (`scoringPlays`, `keyEvents`, `goal timeline`, `second source`, `independent reference`, `espn summary`) in `docs/` of both repos: nothing grades the ledger against another source. What exists and bears on it:

- field-relay-nba `src/index.js`: a generic `/espn-summary/*` proxy (`site.web.api.espn.com/apis/site/v2/*`, 25 s cache), `ESPN_API_BASE`, and a soccer summary read that uses `summaryData.keyEvents` with `e.type.type === 'goal'`, `e.clock.displayValue`, `e.text`, `e.ownGoal`, `e.penaltyKick` (read from the source 2026-11-23; **no committed capture of a soccer `keyEvents` payload was found, so its shape is a premise below, not a fact**).
- field-relay-nba `src/index.js` league registry: FIELD's R2 directory names are its keys (`epl`, `mls`, `ucl`, `eflchamp`, `laliga`, ...), each with an `espnLeague` (`eng.1`, `usa.1`, `uefa.champions`, `eng.2`, `esp.1`, ...) and a `bsdLeagueId`. No join from a BSD match to an ESPN match was found in the files read. Two documents the search turned up, field-relay-nba `docs/CC-CMD-2026-06-23-espn-event-id-schema.md` and `docs/CC-CMD-2026-07-04-drama-score-then-eventid-backfill.md`, are about ESPN event ids and were NOT read for a BSD-to-ESPN mapping: Task 0 reads them first (BUILD-ON-A) and E2 probes the join regardless. All nine R2 directories (`epl`, `mls`, `ucl`, `eflchamp`, `laliga`, `europa`, `seriea`, `bundesliga`, `ligue1`) have an `espnLeague` in the registry (`eng.1`, `usa.1`, `uefa.champions`, `eng.2`, `esp.1`, `uefa.europa`, `ita.1`, `ger.1`, `fra.1`), checked 2026-11-23.
- field-relay-nba `docs/CC-CMD-2026-08-08-espn-site-api-403-p0.md`, quoted in the relay's source comments: ESPN's edge returned 403 to Cloudflare Worker egress, while a bare fetch from a GitHub runner succeeds. **This must run on a runner, not in the Worker.**
- Holds respected: relay `src` is untouched; the CFL window and `v2-games-bsd-cache` hold are not involved; ESPN calls follow Rule 78 (identify the limit, cache, bound the count).

## Premises, and the one command each (Rule 100)

None of these is measured yet. Task 0 answers each with one command on a runner and writes the counts into the first artifact.

| # | premise | what refutes it | answered by |
|---|---|---|---|
| E1 | ESPN publishes, for a finished soccer match in these leagues, a goal list with the scoring side (home or away, or a team id comparable to the competitor ids), a clock, and an own-goal flag | a `keyEvents` payload with goal rows that carry no team, or no goal rows | one `summary?event=` read per league, counts of goal rows with and without a team |
| E2 | a BSD match can be joined to its ESPN match by league, date and team names, without ambiguity | two ESPN matches or none for a BSD match; names that do not normalise | scoreboard per (league, date) for the matches the ledger touches, counts of 0, 1, 2+ joins |
| E3 | an own goal is credited the same way by both sources (to the side that benefits) | ESPN credits it to the player's own team in the goal's `team` | the 13 own-goal resolving goals of the last run, source against source |
| E4 | ESPN's goal list for a match has as many goals as its final score, and its clocks put the goals in one order | a count that differs from the score; two goals at one clock | counts per match |
| E5 | ESPN is **independent enough to be able to disagree** with BSD at all | zero disagreements between ESPN's and FIELD's BSD capture's goal lists on the matches both have | step A of the rule below: source against source, before any call is graded |

E5 is the one that decides what the result is worth: if the two feeds never differ, the second source adds nothing and the document says so.

## The rule, fixed before the run

**Step A, source against source (no ledger).** For every match in R2 that the join reaches, compare ESPN's goal list with FIELD's BSD capture: same number of goals, same order of sides, same minutes within 1. Counts only: matches compared, identical, different in number, in order, in minute.

**Step B, the ledger against ESPN.** For each of the 372-class calls (the census's gradeable calls, taken at run time) on a match the join reaches: k = the total of `score_at_call`; ESPN's resolving goal is its (k + 1)th goal in clock order; ESPN's side is that goal's scoring side (an own goal credited to the beneficiary, per E3); FIELD-independent verdict is `hit` if that side equals the call's `side`, else `miss`; the call **agrees** when the verdict equals the ledger's `outcome`. The join must also hold: ESPN's score before that goal equals `score_at_call`, else not applicable. Every call lands in agree, disagree or one named not-applicable reason, including "the match has no ESPN timeline". Agree and disagree are tallied by league, by whether ESPN and BSD's capture agree on that goal (from step A), and by distance between ESPN's goal minute and the ledger's `resolved_minute`.
A disagreement is a count and a named reason, never explained away (Rule 77). No probability is graded.

## Tasks

0. **Probe block (Rule 87.1).** First read the two ESPN-id documents named above for a BSD-to-ESPN mapping and the 403 document for the egress finding. Then, on a runner, one workflow, no token: for each of the nine R2 leagues, one scoreboard and one summary read of a recently finished match; write the shapes (field names, a count of goal rows with and without a team, whether an own goal is flagged) to `outbox/` as a structured manifest (Rule 89), with the HTTP statuses and the cache headers. If E1 fails (no scoring side), stop: this CC-CMD is re-filed against api-sports.io (FIELD's V2 source, a different vendor, needs a key: Rule 78 applies), not patched.
1. **Build in the laboratory** (pure, imports nothing, returns counts, like the previous core): the join (E2) and the reference grade (step B) as a pure module with a check on synthetic ESPN-shaped payloads written from the Task 0 manifest, and a mutation harness written before the check is trusted (Rule 90). Reuse, do not copy, the previous core's discipline: every call placed once, vendor strings never used as object keys without a prototype-free map. The runner side lives in field-relay-nba, reuses the census's `collect()` for the ledger and R2, and fetches ESPN with a timeout and a redirect-as-status read (the 2026-11-23 stall finding applies to every fetch).
2. **Review once, targeted, by the author's own mutation work plus ONE independent reader** of the join and the rule against the Task 0 manifest — not two multi-agent rounds. The previous round found the damage in the premises and in the harness, so the one reader is told to attack those two.
3. **Run** once from field-relay-nba's runner (the previous workflow's three-job shape: `verify` with no secret, a job with the token and no write credential, a commit job), with `lab_ref` a full SHA. Coverage line with every denominator (Rule 91): `graded N of M gradeable calls, T of 238 matches with an ESPN timeline`.
4. **Record** the result here, in HANDOFF and a session doc (Rule 67).

**Done condition (Rule 89):** an artifact in field-relay-nba `outbox/` with `reachedTarget` true, E1 to E5 counts present, step A's table, agree and disagree and every not-applicable reason summing to the population, and the `verify` job's checks and mutation harnesses green.

## Budget (Rule 78)

ESPN is unauthenticated, from a GitHub runner. One scoreboard read per (league, date) that the ledger's gradeable calls touch (an upper bound of about 120) and one summary read per matched match (at most 238), each cached within the run, spaced, with a 429 or 403 stopping the run. The vendor (BSD) side is the previous run's 11 requests.

## What the result will not say

Different vendors are not proof of independent origin: ESPN and BSD may license one provider's feed. Step A is the evidence either way (E5), and the artifact reports it beside the grade. A match ESPN does not cover is not graded, so the result is about the calls on matches both sources have. It says nothing about the probabilities or about whether a call was a good prediction.

## What only the owner unblocks (Rule 74)

Starting it. Unblocked when the owner says to run it; verify with the Task 0 manifest in `outbox/` (E1 to E5 counts present). No new secret is needed; the ledger side uses the arrangement already approved for the previous proof.

## Not in scope

The relay's capture of untracked leagues (1,265 of the 1,754 calls: `bsd-live-capture-path`), any surface, route, push or display of a next-goal read, anything in `src/`, the plan and renewal decisions.
