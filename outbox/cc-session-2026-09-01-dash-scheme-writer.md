# Task 1: is the dash-scheme MLS writer stale, or still running?

2026-09-01. `CC-CMD-2026-09-01-mls-dual-writer-duplicate` Task 1, which is a
probe rather than a fix because the write path was genuinely not known.

## What was open

The relay has exactly one `INSERT INTO regular_season_games`, at
`POST /archive/game`, and its id is `` `${sport}_${date}_${idTail}` `` —
underscore-separated, which cannot produce `2026-08-30-mls-stl-dal`. Three
explanations remained:

1. a write path outside `/archive/game` reaches D1;
2. the rows predate the current scheme and are stale;
3. an external caller composes the fields into this shape.

## The discriminator is the spread, not the age

`created_at` separates stale from live, and `/context/date` serves it — so this
question needs no credential and never touches `/d1/execute`.

**Age alone cannot answer it.** A live writer that seeded a month ago also looks
old on the rows it wrote then. What separates the two is whether the stamps
CLUSTER: one instant across rows for games spanning weeks is an import that ran
once and stopped; stamps tracking each game's date is something still writing.

Two additional signals make `live-writer` reachable on weaker evidence, because
a false "stale" is the expensive error — it closes an investigation into a
writer that is still producing duplicates:

- more than three distinct `created_at` days, or
- any stamp written AFTER the game it covers.

## What one committed capture already showed

`data/context-2026-08-29.json`, 78 rows:

```
15 dash rows       created_at  2026-06-30 17:13:24   (all fifteen, one instant)
63 composite rows  created_at  2026-08-29 10:01:05   (the game day)
```

Games on 2026-08-29, written on 2026-06-30 — a forward-schedule import two
months ahead. `CC-CMD-2026-08-08` measured the same shape and named the instant:
*"created_at clusters at 2026-06-30 19:27 for the name-scheme rows … Two bulk
schedule imports either side of this change, not a per-game seed racing a
per-game resolution."* Same day, a different hour.

One capture is a copy, so it is a strong hypothesis and not the answer. The
sweep is the answer.

## Verification

11/11 self-test. The runner was exercised against a stub in all four verdicts,
because the self-test covers pure functions and the reporting block is not one:
one fixed stamp yields `stale-bulk`, per-game stamps yield `live-writer`, dash
rows with no stamp yield `unreadable`, and no dash rows at all yields
`not-observable`.

`unreadable` is not a formality. Zero rows carrying a stamp would otherwise
compute as zero distinct stamps, which is the tightest possible cluster and
would read as the strongest possible `stale-bulk` — a measurement of the probe,
published as a measurement of the relay.

## If it returns stale-bulk

Task 1 says report and stop. Stale rows are a bounded cleanup with its own spec,
not a code change: no relay code is at fault and nothing new is being written.
The 51 duplicate pairs would then be a data-repair job against rows nobody is
adding to, which is a materially different and smaller problem than a live
dual-writer.
