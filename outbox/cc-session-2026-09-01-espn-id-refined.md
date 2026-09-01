# espn_event_id: the refined rule, and how much of the archive it reaches

2026-09-01. Follows `a5641f8`, which returned UNSAFE on the proposal as filed in
field-relay-nba#1.

## What the first sweep actually said

Thirty days, 1085 rows, 13 collision groups. Ten were the same fixture under two
spellings — the duplicate bug, and merging them is the fix. Three were different
fixtures, and all three were golf:

    golf_401811960   R3 + R4, Rocket Classic
    golf_401811962   R3 + R4, FedEx St. Jude Championship
    golf_401811963   R1 + R2, BMW Championship

`golf_NNNNNNNNN` is a per-tournament synthetic key. Two rounds of one tournament
are two archive rows under it. Every group that was safe carried a bare numeric
ESPN event id.

So the refinement writes itself: the proposal is not "key on espn_event_id", it
is "key on it when it is one". `isEspnId` is that scope, stated once, and
`verdictForNumeric` is the same question restricted to it.

A group with a non-numeric id is out of scope, not forgiven. Those rows keep the
name-derived id they have today, so a change that never touches them cannot
cause a collision among them.

## Why coverage is now reported alongside the verdict

A rule that is safe over the rows it addresses, and silent on the rest, is a
partial fix. The size of the remainder is the decision, not a footnote.

On the one committed capture available offline, the file `data/context-2026-08-29.json`
holds 78 rows and 63 carry an event id. The 15 that do not are every MLS row that
day, ids of the shape `2026-08-29-mls-stl-dal` — a non-ESPN feed. The relay
documents the same condition itself for the MLB secondary path, which writes
`espnEventId: null` on purpose rather than fabricate one.

The sweep now measures this over the full window and breaks the gap down by
sport, so the answer is a number rather than an extrapolation from one day.

## The defect this exercise found in the probe itself

Running the file against a local stub that answered HTTP 200 with an empty slate
on every date produced:

    2 date(s) observed, 0 row(s), 0 collision group(s)
    VERDICT: safe

Two dates observed. Zero fixtures examined. Verdict: safe.

`datesObserved` counts payloads that parsed. Only a row count says whether any
fixture was ever looked at, and the two had been collapsed into one — the same
shape as every other defect this session, where the collapsed state never fails.

Both verdicts now require `rowsSeen` and throw if it is omitted. Defaulting it
would have restored the hole in exactly the shape that hides it: a caller that
forgot to pass it, getting a pass anyway.

Coverage reporting carries the same discipline. Rows returned with not one
carrying the field reads as UNREADABLE, not as a confident 0% — that reading is
a measurement of the probe published as a measurement of the relay.

## How integral is the field, measured

Nothing keys on it. `grep -rn "UNIQUE"` over the relay source returns nothing;
the column is nullable, non-unique and unindexed in both archive tables.

58 references — 53 in the relay's main worker, 5 in its analytics engine — plus
7 client-side and 3 here. Every read falls into one of two buckets:

- **Silently degrades.** The cron debrief block is skipped when the archive
  lookup misses; the pre-game brief is not written; ESPN summary context is
  absent when `sourceId` resolves to null.
- **Has a fallback.** `briefId` falls through to the archive id; the brief join
  has three tiers and this is the second; `matchV2Game` falls to normalized name
  equality; `findGame` reaches it only as its third tier.

Nothing hard-breaks. Writes use `COALESCE(excluded.espn_event_id, espn_event_id)`
in both upsert paths, so a null write can never erase an id already stored.

The field is a join key to ESPN. It is load-bearing for enrichment and carries no
identity, which is precisely why the original proposal was wrong: it promoted a
nullable, non-unique, partially-covered enrichment key into a primary one.

## Verification

27/27 self-test. The runner was exercised end to end against a local stub in
three configurations, because the self-test covers pure functions and the
reporting block is not one:

| stub | original verdict | refined verdict | exit |
|---|---|---|---|
| empty slate on every date | not-observable | not-observable | 0 |
| numeric same-fixture + `golf_` different-fixture | unsafe | safe | 0 |
| the same collision renumbered numeric | unsafe | unsafe | 1 |

Row two is the filter having teeth on the real observed shape. Row three is the
filter not forgiving a collision inside its own scope.

## Open

The live sweep. Dispatch of the probe workflow at 30 days answers two things at
once: whether any numeric id is shared by two different games, and what fraction
of rows a numeric key could ever address.
