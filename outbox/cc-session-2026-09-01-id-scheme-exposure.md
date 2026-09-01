# The numeric-id key is unique-safe. That is not the same as safe to ship.

2026-09-01. Follows `75c0138` (the refined rule, verdict safe) and the CC-CMD
filed into field-relay-nba at `de2eb1a`.

## What the spec was missing

The 30-day sweep answered "would keying on a numeric event id ever merge two
different games". No, over that window. The CC-CMD was written on that basis.

The relay's id composition carries a correction that answers a different
question, and it was written after a change of exactly this shape shipped:

> "then self-heals" is true of the ID and false of the ROW, and the real cost is
> much larger than "exactly once" suggests. Measured: 55 duplicate groups across
> 2026-07-25..08-15, all MLS, all n=2 ... Because those imports carried
> FUTURE-dated fixtures, the old-scheme row was never the thing that got
> resolved: resolution wrote the new id and the old row was never touched again.
> It stays permanently unscored.

An id-scheme change does not only have to be unique. It has to cross the rows
that already exist. Every unscored, future-dated row carrying a numeric event id
is a row that will be rewritten under a new id and stranded under its old one.

**A backward sweep cannot see any of them.** The one that proved uniqueness
looked at 30 days of the past, which is where the finished rows are.

## The count that decides it

`scripts/probe-id-scheme-migration-exposure.mjs`, sweeping forward.

Exposed row: `home_score == null` **and** a numeric `espn_event_id`. A scored row
is not exposed — nothing writes to it again, so the id it holds is the id it
keeps. Counting scored rows would inflate the number with fixtures that are
already finished, which is the same conflation as treating every future-dated row
as a duplicate-in-waiting regardless of whether anything will touch it.

## The control day, which is the part worth arguing about

A forward sweep legitimately sees no scores. Every fixture ahead of today is
unplayed. So "zero scored rows" cannot distinguish

- the future has no results yet, correct and expected, from
- this probe is reading a field the payload does not carry,

and under the second reading **every forward row counts as exposed** and the
number is fabricated. It would also be a large, alarming number, which is the
worst property a fabricated number can have.

Yesterday resolves it. A past date must contain scored rows. If it does not,
`home_score` is not being read and the forward count is refused outright — the
probe exits non-zero and prints "the forward count below is NOT a result" rather
than a total.

This is the same three-state discipline as the collision probe's UNREADABLE
coverage state, and it exists here for a sharper reason: there, a broken read
produced a suspiciously round 0%. Here it would produce a plausible, actionable,
completely wrong number, and shipping would be blocked on a phantom.

## Verification

10/10 self-test. The runner was exercised against a local stub in all three
verdict states, because the self-test covers pure functions and the reporting
block is not one:

| stub | control day | verdict | reported | exit |
|---|---|---|---|---|
| 2 exposed among 6 forward rows | 2 rows, 2 scored | measured | `2 EXPOSED` | 0 |
| golf and null-id rows only | 2 rows, 2 scored | measured | `0 EXPOSED` | 0 |
| same rows, control scores stripped | 2 rows, **0 scored** | unreadable | refuses to report | 1 |

Row three is the control day having teeth: identical forward data, and the probe
declines to produce a number.

## What the two outcomes mean

**Zero exposed** — the numeric key strands nothing today, and this window is the
argument for shipping now rather than after the next bulk forward-schedule
import. That import is what produced the 55 groups.

**Non-zero** — ship only with a paired cleanup for the named rows, or wait. The
per-sport breakdown says which. MLS is the sport to watch: it is both the largest
share of rows with no numeric id at all and the sport all 55 stranded groups
belonged to.

## The run, and the probe being wrong about its own result

`outbox/id-scheme-migration-exposure-2026-09-01T02-41-20-876Z.txt`, run
`33461890000`-era dispatch. 21 days forward, control day 2026-08-30 with 48 rows
and 39 scored, so the field reads.

```
137 forward row(s), 5 EXPOSED
    MLB   5
```

And the probe concluded: *"Ship the numeric key only with a paired cleanup for
these rows."*

**That is the wrong instruction, and the per-day breakdown in the same artifact
disproves it.** All 5 are on 2026-08-31 — day 0, which is TODAY in ET (the run
stamped 02:41Z, 22:41 ET). Every one of the 21 genuinely future dates is zero.

Today's exposed rows are tonight's in-flight MLB games: seeded at first pitch,
resolving within hours on their own. The 2026-08-08 disaster was the opposite
shape — a bulk import of FUTURE fixtures that nothing was waiting to resolve,
which is why those 110 rows sat stranded for weeks instead of minutes.

Same count, opposite remedies. A cleanup written for rows that fix themselves
before the cleanup is finished is worse than useless: it makes the real signal, a
future backlog, indistinguishable from a routine evening.

### The fix, and its teeth

`shipAdvice` splits the two:

| today | future | advice |
|---|---|---|
| 0 | 0 | `clear` — ship now |
| >0 | 0 | `quiet-window` — deploy after the slate finalizes |
| any | >0 | `cleanup-required` — the 2026-08-08 shape |

The self-test asserts the two cannot collapse:

```js
check('COLLAPSING THE TWO WOULD HAVE GIVEN ONE ANSWER FOR BOTH',
  shipAdvice({ todayExposed: 5, futureExposed: 0 }) !==
  shipAdvice({ todayExposed: 0, futureExposed: 5 }))
```

15/15. Both advice paths exercised against a stub: 5-on-today yields
`quiet-window`, 6-on-future yields `cleanup-required`.

## The actual answer for the CC-CMD

**`quiet-window`.** There is no backlog. The numeric key can ship, and the only
requirement is that the deploy land when no game is in flight — a few hours'
patience rather than a paired cleanup. Waiting also has a cost the artifact
argues for: the exposure is zero today precisely because no bulk
forward-schedule import is pending, and the last one made 55 groups.

## Open

A re-dispatch, so the committed artifact carries the corrected advice rather than
the collapsed one. The current artifact's per-day table is right and its
conclusion is wrong — exactly the inherited-claim shape Rule 72 exists for, and
leaving it in the outbox for a later session to read would be filing the bug
rather than fixing it.
