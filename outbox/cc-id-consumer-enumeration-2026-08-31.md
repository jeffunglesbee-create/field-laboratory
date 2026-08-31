# Consumer enumeration for `regular_season_games.id`

**Date:** 2026-08-31
**For:** field-relay-nba#1 — Rule 39 step 1, "map every dependency, audit every consumer"

88 SQL statements touch the games tables. Only **11 use `id` as a lookup key**;
those are the entire breakage surface for an id-scheme change.

## Relay-side, keyed on `id`

| line | route / helper | how the id arrives |
|---|---|---|
| 5810 | `writeMLBSeriesResult` (cron helper) | derived in-process |
| 6980 · 6985 · 6996 | **`findGame`** | caller string, **three-tier resolve** |
| 7077 | `findSeries` | derived in-process |
| 10871 | `POST /admin/archive/backfill-went-to-ot` | admin-supplied |
| 11200 | `POST /archive/drama` | from a SELECT in the same request |
| 11311 · 11315 · 11320 | `POST /archive/drama-by-id` | **caller-supplied** |
| 11436 | `POST /archive/score-by-id` | **caller-supplied** |
| 12156 | `POST /archive/brief` | caller-supplied |

## The read path is already id-scheme-agnostic

`findGame` does not depend on the id scheme. It resolves in three tiers:

```js
SELECT * FROM postseason_games  WHERE id = ? OR (home||'_'||away||'_'||date) LIKE ?
SELECT * FROM regular_season_games WHERE id = ? OR (home||'_'||away||'_'||date) LIKE ?
// then, for an `espn:NNNNNN` string:
SELECT * FROM postseason_games  WHERE espn_event_id = ? LIMIT 1
SELECT * FROM regular_season_games WHERE espn_event_id = ? LIMIT 1
```

An exact id, a fuzzy name match, **and `espn_event_id`**. The main read helper
already treats the id as one of several keys rather than the key.

## The three caller-supplied routes read their id from a discovery endpoint

`/archive/drama-by-id` and `/archive/score-by-id` are fed by
`/archive/drama-missing` and `/archive/score-missing`, which return `id` in the
same run that posts it back. Read-then-write within minutes, not a durable
handle. `scripts/drama-backfill.mjs` does exactly this — `writeGameDrama(game.id, …)`
where `game` came from the discovery response — and so does the client's
`runDramaBackfillDiscovery`.

## No client constructs an archive id

Checked both client repos. Callers send `home`/`away` **names**; the relay
derives the id at `POST /archive/game`. The two `shortify`-shaped constructions
in `jubilant-bassoon/src/legacy/field.js` are internal render ids —
`_id: "mlb_"+hKey+"_"+aKey` (18941) and `stableId = "s_"+league+…` (19566) —
carrying different prefixes and never posted anywhere.

**So the drift is in the names callers send, not in an id any caller builds.**
That is also why an id-scheme change breaks no client construction: there is
none to break.

## Residual risk, stated rather than dismissed

1. **External callers I cannot see.** The series CC-CMD's stated reason for not
   backfilling — "an external caller could be holding a cached old-scheme id" —
   still applies to callers outside these three repos. This enumeration covers
   the relay, `jubilant-bassoon` and `field-laboratory`; it cannot cover an
   integration none of them reference.
2. **Existing duplicates stay duplicated.** Following the same no-backfill
   precedent, a fix changes future writes only. The three observed pairs remain
   until merged deliberately.
3. **`/admin/archive/backfill-went-to-ot`** takes an admin-supplied id and is the
   one route where a human could be pasting an id from an older listing.

## What this does and does not settle

Settles Rule 39 step 1 for the three repos in this session: the read path is
tolerant, the write-back routes take ids from same-run discovery, and no client
hard-codes the scheme.

Does **not** settle step 2 — confirming `(date, espn_event_id)` has zero
collisions among distinct real fixtures in live D1, the way `(series_key, round,
date)` was confirmed across 501 postseason rows. That needs a D1 query from
inside the relay, which this session cannot issue.
