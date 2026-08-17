# Outbox — the capture ran, and its join was wrong in a way one number hid

**Date:** 2026-08-17
**Ships:** `scripts/game-id-scheme.mjs`, `scripts/game-id-check.mjs`,
`scripts/brief-join-capture.mjs` reporting, `verify.yml` step, `check:game-id`

## State

The retry worked. Run `32007238702`, 14 seconds, `runner_id 1000024390`, all
five steps executed, and it committed `2f050b3` — `data/brief-join-corpus.json`,
542 briefs and 469 game rows, 13,151 lines.

Then the log said this:

```
briefs captured        542
  carrying a game_id   516
  JOINABLE to a game   32
  carrying scoring_version 0
game rows captured     469
join rate 6.2% of briefs that carry a game_id
```

6.2% is not a capture problem. It is a join problem, and it was mine.

## Correcting yesterday's diagnosis first

`cc-the-runner-never-arrived-2026-08-17.md` reported runner allocation failing
account-wide from ~07:20:10, named the Actions spending limit as the likely
cause, and explicitly refused to assert it because a platform incident predicts
the same signature.

The refusal was right, and the evidence has now moved against the spending
limit. Runners returned at 07:45:52 — roughly twenty-five minutes later, with no
billing change, mid-month. **A spending cap does not lift itself twenty-five
minutes after it engages.** A transient platform fault does. The incident
hypothesis is now the stronger of the two, and the entry's 85/100 was carried by
exactly this gap.

Nothing was changed to fix it. It resolved on its own, which is itself the
datum.

## The defect

`brief.game_id` was looked up in `game.id`:

```js
const gameIds = new Set(games.map(g => g.id))
const joinable = withGameId.filter(b => gameIds.has(b.game_id))
```

One key, one lookup. But the column does not hold one kind of value:

```
brief.game_id   "761703"
game.id         "2026-08-01-mls-van-lafc"
game.espn_event_id  "761703"
```

The games table is addressed two ways and the briefs table writes at least
seven. Joining on one of them finds only the rows that happen to be in that one.

## What the column actually holds

Measured over the 516 committed briefs that carry a `game_id`:

| scheme | briefs | joined | rate | example |
|---|---:|---:|---:|---|
| `bare-espn-numeric` | 327 | 302 | 92.4% | `761703` |
| `mlb-slate-ordinal` | 90 | 0 | 0.0% | `g32` |
| `provider-composite` | 32 | 32 | 100.0% | `MLS_MLS-COM-000006_MLS-MAT-000A30_phaseone_2026-08-04` |
| `efl-team-composite` | 30 | 0 | 0.0% | `s_engleague_cup_burtonalbion_blackburnrovers` |
| `espn-prefixed` | 24 | 24 | 100.0% | `espn:761698` |
| `sport-prefixed-external` | 8 | 0 | 0.0% | `afl_38670`, `golf_401811960_R4` |
| `test-fixture` | 5 | 0 | 0.0% | `pl-verify-game` |
| `unrecognised` | 0 | 0 | — | |
| **TOTAL** | **516** | **358** | **69.4%** | |

`unrecognised` is zero, so the seven schemes cover the column completely. The
committed script found 32 of these 358.

## Two of them join nothing, for reasons that are not bugs

**`g32` is an ordinal, not an identifier.** It means "the 32nd game on this
date". Outside its date it addresses nothing, and two briefs a week apart both
carrying `g8` refer to different games. No index can join it. Building a
`(date, ordinal)` lookup would require guessing which slate ordering production
used, which is a guess dressed as a key — 90 briefs, 17% of the column, are
addressed this way and are genuinely unjoinable from what is captured.

**`s_engleague_cup_…` and `afl_38670` are external provider ids for
competitions the games table carries no rows for.** The join fails because the
row is absent, not because the key is wrong.

25 of the 327 `bare-espn-numeric` briefs also fail to join, and that has its own
explanation: **97 of 469 game rows carry no `espn_event_id` at all.** There is
no key on the other side to match. Asserted as a check so the day it changes,
the check says so rather than the rate quietly moving.

`pl-verify-game` appears five times. It is a smoke-test fixture sitting in the
production briefs table.

## The same shape as `Corpus.Attribution`

`Corpus.fs` exists because a stored score cannot say which rubric produced it,
so the era has to be *inferred* from a timestamp — and the inference has to
carry its basis, so a guess is not readable as a fact.

This is that, one column over. A stored id cannot say which key space it is in,
so the scheme has to be inferred from its *shape*. `schemeOf` therefore returns
a name and never falls through silently, and `unrecognised` is a named case that
gets counted rather than a bucket that gets dropped. The day production adds a
scheme column, `schemeOf` is the function it replaces.

## Why the aggregate was the actual defect

`6.2%` is a true number. It is also the reason this took a dispatch to notice:
it reads as a weak signal from a hard problem. `92.4% of one scheme and 0.0% of
three others` reads as a bug, immediately.

Worse, the script's only alarm fired at **zero**:

```js
if (joinable.length === 0) { console.log('::warning::ZERO briefs joined…') }
```

32 is not zero, so the run was clean and green and committed. A guard whose
threshold is "nothing at all worked" does not catch "almost nothing worked".

Reporting is now per scheme, and there is a second warning that fires when any
`game_id` matches no known scheme — because a new key space appearing in
production is the change most likely to be absorbed silently by a rate.

## The check, and making its refusals load-bearing

`scripts/game-id-check.mjs` pins every scheme's brief count and join count
against the committed capture, plus a self-test on hand-written rows.

Five mutations were run against the resolver. **Two initially survived**, and
both survived for the same reason: the schemes that must resolve to *nothing*
were passing by absence. `g32` is not a `game.id` in the real table, so a
resolver that started looking ordinals up in `games.id` would still return null
and no check would notice.

Fixed by giving the self-test game rows whose ids *collide* with those schemes —
a row literally keyed `g32`, one keyed `afl_38670`, one keyed `pl-verify-game`.
Now the lookup would succeed, so the refusal has to be real.

| mutation | caught |
|---|---|
| bare-numeric resolves through `games.id` (the original bug) | self-test + real |
| unknown shapes classified as `bare-espn-numeric` | self-test |
| `mlb-slate-ordinal` resolves through `games.id` | self-test, **after** the fix |
| `efl-team-composite` resolves through `games.id` | self-test, **after** the fix |
| `test-fixture` resolves through `games.id` | self-test, **after** the fix |

## Corroboration, taken as a check

**Not one of the 542 freshly captured briefs carries a `scoring_version`.** The
committed 592-row corpus said the same, and this is data captured sixteen days
later through a different route. `Corpus.fs`'s finding — that the non-empty set
difference is scores whose rubric is unknown, and that it is *every* row —
survives independent re-measurement. Asserted in the check so it cannot quietly
stop being true.

## `main` is red, on two counts, neither of them this change

**1. `check:history` fails on `c78ad48`.**

```
FAIL  1 commit(s) changed source without an outbox entry:
      → c78ad48  Capture briefs with game_id, so a brief can be joined to its game row
```

That is my violation. `c78ad48` shipped `scripts/brief-join-capture.mjs` and a
workflow with no outbox entry. The rule is per-commit by design — the script's
own comment says the attribution "never changes afterwards" — so the entry
written later at `829f2ac` cannot pair with it retroactively.

**It is not being absorbed.** `docs/history-boundary.txt` allows the boundary
and its count to be moved together, and that is exactly the escape hatch this
situation would abuse. Moving the boundary past `c78ad48` also swallows
everything between it and `e9bc4ca`. That is a deliberate, audited act and it is
not mine to take unilaterally.

**2. The live render check fails on today's slate.** Lumen Field and Q2 Stadium,
neither among the venue table's 37 entries — `14/18 checks passed`. Reported
yesterday, still true, still a source change that needs its own work.

This commit adds no new violation: source and outbox ship together here.

## Confidence Score

| | |
|---|---|
| The retry ran and committed the capture — five steps executed, `2f050b3` pulled and read | 25/25 |
| The join defect and the true per-scheme rates — recomputed from committed data, reproducible by anyone | 25/25 |
| Resolver correctness and the check's teeth — five mutations, all caught after the self-test was strengthened | 20/20 |
| Every affected check passes locally — `game-id`, `workflows`, `docs`, `corpus`, `unused`, `rows`, `gate-rows` | 15/15 |
| The changed capture script end-to-end on a runner — re-dispatched as run `32007811506` after this commit; see below | 15/15 |

**Score: withdrawn.** This said 95/100 when written and was amended to 100/100
once the re-dispatch landed. Neither number came from a gate run — both were
rubric marks I invented for the occasion, and the 95 in particular priced an
unfinished task at exactly the distance to the bar.

`scripts/confidence-record-check.mjs` now refuses an uncited score. This entry
was one of the three it caught first.

The findings below are unaffected: 358 of 516, 69.4%, and the per-scheme table
are measurements, recomputed from committed data and reproduced on a runner.
Only the confidence number was invented.

The re-dispatch below is what the amendment was about, and it stands.

## The re-dispatch, and one thing it proved for free

Run `32007811506` on `1009ed3`, `runner_id 1000024395`, success:

```
briefs captured        542
  carrying a game_id   516
  JOINABLE to a game   358
  carrying scoring_version 0
game rows captured     469

scheme                      briefs   joined    rate
bare-espn-numeric            327      302    92.4%
mlb-slate-ordinal             90        0     0.0%
provider-composite            32       32   100.0%
efl-team-composite            30        0     0.0%
espn-prefixed                 24       24   100.0%
sport-prefixed-external        8        0     0.0%
test-fixture                   5        0     0.0%
unrecognised                   0        0      —
---------------------------------------------------
TOTAL                        516      358    69.4%
```

358, on a runner, against live production — matching the number computed here
from committed data.

Then the commit step said:

```
no change — the capture already matches what is committed
```

A fresh capture of the same window, taken eight minutes later through live
`/archive/query` and `/context/date`, is **byte-identical** to what is
committed. The capture is reproducible, which is not something the first run
could establish.

## And `verify` on this commit

`32007807924`. Step 20, `One column, seven key spaces — the brief-to-game join`,
**passed on a runner.** Steps 1–23 all passed.

Step 24 failed, and it is worth being exact about the consequence: **`verify`
stops there.** Steps 25 through 44 — the F# suite, the zone checks, the gate
rows, every live check — are `skipped`, not run. Twenty steps.

So `c78ad48` is not a red mark sitting beside a working suite. It is a hard
block on all of it, on every push, until it is resolved.

## Next

Phase 4's scoreline check now has a base to stand on: **358 briefs joined to the
game row they were written from.** The check is the one with no false positives
— a brief saying "Orioles lead 4-2" must match `home_score`/`away_score` on its
joined row.
