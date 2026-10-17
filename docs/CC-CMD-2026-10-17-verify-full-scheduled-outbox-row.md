# Claude Code Command — verify-full's scheduled run fails a session row it cannot satisfy

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-17, by CC, from the field-relay-nba daily read of the dead-cron watch
**Confidence gate:** `npm run gate` must score >= 95 before any commit
**Status:** FILED, not started. Owner decision first: this changes what a gate row means.

---

## What was measured

`silently-dead-crons` carries `field-laboratory:.github/workflows/verify-full.yml`
as dead. Every scheduled run since its `red_since` failed at "Confidence gate
(>= 95)". The failing rows, from `docs/confidence-log.jsonl` (full-gate record
for each run's head sha):

| run | day | sha | score | failing rows |
| --- | --- | --- | --- | --- |
| 34839968312 | 09-14 | `9e1c9ac` | 500/530 | breaking each invariant makes a check fail; this session wrote its outbox |
| 35596988589 | 09-21 | `ebcc715` | 480/530 | decoders accept both real captures; breaking each invariant makes a check fail |
| 36424833372 | 09-28 | `c5e953f` | 490/530 | every governed commit paired source with outbox; breaking each invariant makes a check fail; this session wrote its outbox |
| 37318014470 | 10-05 | `cf90786` | 480/530 | every governed commit paired source with outbox; breaking each invariant makes a check fail; every gate row has teeth and is deterministic |
| 38262743658 | 10-12 | `106d7c4` | 500/530 | breaking each invariant makes a check fail; this session wrote its outbox |

Dispatched runs of the same workflow pass 530/530 (38998337325 at `53da77f`,
39044130530 at `dc63004`, both 2026-10-17).

## One row, two failures

"this session wrote its outbox" is `outboxToday` in `scripts/gate-checks.mjs`:
an outbox `.md` whose name contains `GATE_DAY` (`fieldDay()`, the Eastern
day) and is over 1,500 characters. The cron is `'0 6 * * 1'`, 02:00 ET on a
Monday, and the scheduled runs actually started later still: 11:47Z, 11:59Z, 12:54Z, 13:35Z and 14:25Z for the five runs
above (07:47 to 10:25 ET).
The row passes only if some session wrote a dated entry for that day between
midnight Eastern and the run's start.

The mutation row then fails on the same cause. The committed mutation baseline
for the 10-12 run (`ba24e09`, `outbox/mutation-baseline-latest.json`) reads
`failing: 1`, and the one failing expectation is
`node scripts/run-row.mjs "this session wrote its outbox"`. The harness's
"the unmutated tree passes every expectation" check re-runs it. So a scheduled
run with no dated entry loses 10 + 20 points from one cause, which is the
500/530 seen on 09-14 and 10-12.

The 09-21, 09-28 and 10-05 runs also failed other rows, since fixed. This
document covers only the row that recurs by construction.

## Prediction, so it can be checked

The next scheduled run is due Monday 2026-10-19 06:00 UTC. Unless an outbox
`.md` dated 2026-10-19 over 1,500 characters exists when it starts, it fails
both rows and scores 500/530 at most.

## The decision this needs

The row exists to catch a session that wrote code and no write-up. A scheduled
run is not a session. Options, for the owner:

1. Under `GITHUB_EVENT_NAME=schedule`, report the row as not applicable, a
   third state rather than a pass, and print that it was skipped and why. The
   mutation baseline then has to treat it the same way, or its baseline check
   still fails.
2. Keep the row and let the scheduled run stay red, and record verify-full as a
   declared detector in field-relay-nba's dead-cron baseline instead.
3. Something else the owner prefers.

Whatever is chosen must not turn a real miss into a pass. "Source changes
arrive with an outbox entry" is the row that judges commits, and it is not part
of this decision.

## Done conditions

1. The owner's choice is recorded under this heading.
2. If option 1: a self-test proves the row still fails for a dispatched or local
   run with no dated entry, and reports not-applicable only under `schedule`;
   a mutation removing the event check is caught; `npm run gate` >= 95.
3. One scheduled verify-full run after the change, read, with its score.
4. field-relay-nba's `docs/dead-cron-baseline.json` entry for verify-full is
   resolved or re-dated with that run as its reason.
