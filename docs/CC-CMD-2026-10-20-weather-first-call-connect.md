# Claude Code Command — weather-live-check's first calls have no retry, and a cold connect fails on runners

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-20 by CC, split out of `docs/CC-CMD-2026-10-17-weather-live-http-outage.md`
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** PARTIAL: TASK 0 DONE 2026-10-27 (`outbox/cc-session-2026-10-27-weather-first-call-task0.md`): neither failed sentinel run was a first-call connect failure, and 13 of 13 weather steps are green since the retry (7 days of the 14). Task 1 not triggered; closes on the 14-day count at 2026-11-03, or runs if a first-call failure appears.

---

## What was measured

`outbox/cc-session-2026-10-20-weather-live-every-call.md`, "The retry pause".
On GitHub-hosted runners on 2026-10-20, Open-Meteo calls failed with
`UND_ERR_CONNECT_TIMEOUT` when the call needed a NEW connection: the request
around the 101st, and the first calls after an idle gap. A warm connection
answered. The venue loop now retries an unanswered venue once, immediately,
and in 3 of 3 flagless runs that recovered every venue (run 39466968801).

Not covered: **the first calls** (the Fenway reading, the out-of-range-latitude
probe) and the sign-flipped probe. They are asked once. In run 39466968801's
30 s arm, run 1, the first two calls failed to connect. Without the flag
(drift-sentinel), that is a red run. The sentinel's weather step failed 2 of
its last 30 runs with 45 venues (2026-10-06 → 2026-10-20). Whether those were
this shape was not read.

## Task 0 — probe

1. `git log --oneline -5`.
2. For the 2 failed sentinel runs, read the "Venue table and Open-Meteo,
   checked live" step's annotations and record which call failed.
3. After this lands, count the sentinel's weather-step outcomes over 14 days
   with the 109-venue table and the immediate retry. If it is 0 failures, this
   CC-CMD may close with that count as its artifact and no code.

## Task 1 — only if Task 0 shows first-call failures

Give the first call and the two probes the same single immediate retry the
venue loop has, through `call`. Report the reason as `…, twice` the same way.
Self-test: a first call refused once and answering on the retry, with no flag:
exit 0. Mutation: remove the retry; that case must go red.

## Done conditions

1. Task 0.2's finding, and the 14-day count, in `outbox/`.
2. If Task 1 ran: its self-test case and mutation, and `npm run gate` >= 95.
