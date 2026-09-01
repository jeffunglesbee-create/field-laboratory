# The fix and the instrument share a blind spot

2026-09-01. Written before the sweep runs, so its prediction is on record.

## The finding

`relay-duplicate-fixture-watch.mjs` is what closes field-relay-nba#1, and its
grouping opens:

```js
const k = g?.espn_event_id
if (k === null || k === undefined || k === '') continue
```

A row with no event id is skipped. The numeric-id upsert key shipped for that
issue (relay `d253209`) is numeric-only. **Both skip the same 197 rows** — 18.2%
of the 30-day window, 177 of them MLS.

So after that deploy the watcher sweeps `/context/date`, finds no duplicated
event id, and closes the issue, while any duplicate among those 197 remains
invisible to the thing that just declared victory. **The fix succeeding and the
instrument being blind produce identical output.**

The class is not hypothetical. `CC-CMD-2026-08-08` measured **55 duplicate
groups, 110 rows, all MLS** — found by querying D1 directly, which is the one
method the watcher does not use.

And the issue's own three reported pairs are all numeric — `401857186`,
`401857187`, MLS `761769` — so the shipped fix resolves everything that was
reported. The issue reports what the instrument can see, which is why the
residual has no advocate.

## The doubleheader problem, which is the real design work

Two real games between the same teams on one date are not a duplicate. Two
discriminators exist, and **on the rows that matter most both are absent**:
`start_time` is null on exactly the 15 rows that carry no `espn_event_id` in the
committed capture.

So `classifyPair` has three outcomes, not two:

| evidence | reading |
|---|---|
| two differing non-null event ids | `distinct` — a doubleheader |
| one event id shared by both | `duplicate` — the known bug |
| two start times, differing | `distinct` |
| two start times, identical | `duplicate` |
| neither, on at least one side | `indistinguishable` |

Calling the last case `duplicate` invents a bug; calling it `distinct` invents a
doubleheader. Both would be answering the question this probe exists to ask.

## The verdict this produces

- `clean` — no duplicates by identity anywhere, including the blind rows. The
  shared blind spot is empty, and closing #1 on the watcher is honest.
- `covered` — duplicates exist and the watcher sees every one. Same conclusion.
- `blind-spot` — at least one group it cannot see. Closing #1 on a clean watcher
  run would be an artifact of where we were looking, and Rule 87 (4) requires a
  second CC-CMD written before the first closes.

Doubleheaders alone read `clean`; a `distinct` group is not a defect and must not
fail the sweep.

## Verification

15/15 self-test. The runner was exercised against a stub in all three verdicts,
because the self-test covers pure functions and the reporting block is not one:
a `blind` fixture pair yields `blind-spot` with 1 invisible group, a shared-id
pair yields `covered` with 0, and a two-event-id doubleheader yields `clean` with
0 non-distinct groups.

## Prediction, recorded before the run

`blind-spot`, on the MLS rows. If it comes back `clean` or `covered` then the
residual named in the CC-CMD is real but empty over this window, #1 can close
honestly on the watcher, and this document is the record of a concern that
measurement dismissed.
