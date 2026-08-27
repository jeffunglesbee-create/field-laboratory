# closing-odds promoted, on the criterion that measures what it names

**Closed:** `CC-CMD-2026-08-21-closing-odds-capture (surviving ask)` — moved from
`ASKS` to `LANDED` in `scripts/cc-cmd-followup.mjs`.

**Evidence:** drift-sentinel run
[33035197618](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33035197618),
2026-08-27T03:03:32Z.

```
LANDED     CC-CMD-2026-08-21-closing-odds-capture (surviving ask)
           probe: /context/date/2026-08-26
```

## The criterion that failed, and the one that replaced it

The first check-in asked for **two consecutive runs**. Runs `32923712900` and
`32972020175` both read LANDED — and both probed `/context/date/2026-08-25`.
`cc-cmd-followup.mjs` uses `yesterdayUTC()`; the 01:30Z and 12:00Z runs resolve
to the same yesterday, and `opening_odds` freeze at capture. Two reads of a
frozen snapshot is one observation. The criterion's name and its measurement
disagreed — the defect class this session has now found under a dozen different
labels (`outbox/2026-08-26-two-runs-is-one-observation.md`, `d4d4628`).

Corrected criterion: **two distinct probe DATES**. 2026-08-25 from runs 51 and
52, 2026-08-26 from run 53. That is the second sample.

## Two premises in the check-in that did not survive checking

1. **"the ~02:30Z sentinel run."** The cron is `30 1 * * *` and `0 12 * * *`.
   Runs 49 and 51 fired at 02:34 and 02:42 — GitHub delaying a 01:30 cron by
   about an hour. An observation of drift had been promoted to a fact about the
   timetable. Today's 01:30 run was 93 minutes late and had not fired by 03:03,
   so waiting on it was waiting on something that might never arrive; run 53 was
   dispatched manually and reads the same `yesterdayUTC()` the schedule would
   have.

2. **"the self-test looks entries up across BOTH lists now."** True of the
   soccer ask (line 548, `[...ASKS, ...LANDED].find`), and its own comment says
   why. The closing-odds lookup was still `ASKS.find` (line 487). Promoting the
   entry without touching it would have left `co` undefined and thrown — or
   worse, on a different shape, silently stopped exercising eight checks at the
   moment they started mattering. The check-in said to confirm rather than
   assume, and confirming is what found it. Now fixed the same way, with the
   same reasoning recorded at the call site.

## What changed

- The entry moved to `LANDED`, `landed:` renamed to `holds:`, with `landedOn:
  '2026-08-27'` and `landedIn: 'drift-sentinel run 33035197618, probing
  /context/date/2026-08-26'`.
- The three states are unchanged, which is what makes it safe on the fatal list:
  `null` for a slate with no soccer game, so an off-day is never a regression.
- The self-test lookup spans both lists and calls `landed ?? holds`.
- Self-test 50/50, including the two negative-control checks for this entry and
  all six behavioural ones. `no ask appears in both the open and landed lists`
  still passes.

## Also observed, and deliberately NOT promoted

Run 53 read `LANDED` for `CC-CMD-2026-08-25-spread-price-capture` as well —
its first LANDED reading ever, on `/context/date/2026-08-26`. That is **one**
observation, on the first date the relay could possibly have served
`homePrice`/`awayPrice` (it began 2026-08-26, `b3aae99`). Promoting it now would
repeat exactly the mistake this write-up is about. It stays in `ASKS` until a
second distinct probe date reads LANDED; a follow-up is scheduled rather than
left to memory.

Run 53 also recorded `both=13 notseq=0 moved=7 unmoved=6` and closed the
standing `closing_odds is not a closing line` issue — 13 of 13 games a real
open/close sequence, against run 52's `both prices: 0`.
