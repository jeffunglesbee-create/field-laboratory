# The relay serves one fixture twice, and it started on 2026-08-30

**Date:** 2026-08-31
**Scope:** `scripts/relay-duplicate-fixture-watch.mjs` (new),
`.github/workflows/drift-sentinel.yml`

I have counted this three times today in three different checks and never told
the relay. That is the failure this session keeps finding one level up: a finding
computed, printed, and acted on by nobody.

## The finding

`GET /context/date/2026-08-30` returned three fixtures as two rows each:

```
espn:401857186   Lynx @ Dream               |  Minnesota Lynx @ Atlanta Dream
espn:401857187   Sparks @ Storm             |  Los Angeles Sparks @ Seattle Storm
MLS 761769       Dallas @ St. Louis (final) |  a "Scheduled — no start time" stub
```

**Every pair shares one `espn_event_id`.** The relay holds a unique fixture key
on both rows and wrote two anyway.

## The mechanism, in the relay's own words

The archive id is `SPORT_DATE_HOME_AWAY`. `src/index.js` already documents the
hazard one field over:

> the archive-write sites send `sport: gm.league`, so this label both lands in
> the archive `sport` column and forms the archive id prefix. **A drifting label
> splits one competition across two id namespaces.**

A drifting *team name* splits one fixture the same way. `Dallas` and `FC Dallas`
are one club and two ids.

The route itself is innocent — `SELECT * FROM regular_season_games WHERE date = ?`,
no join, no dedup. The duplicates are rows in D1.

## It is new, which is what makes it worth a ticket

Every committed capture in this repo, scanned by event id:

```
4 day(s) of games across 88 row(s); 0 day(s) carry a duplicated espn_event_id
  data/context-2026-05-15.json          2 rows
  data/context-2026-08-29.json         78 rows
  data/context-briefs-fixture.json      6 rows
  data/games-2026-08-09.json
```

And this repo's own drift log dates the change to the day:

```
2026-08-29 16:35 | 78 games | WNBA:2     <- 2 fixtures, 2 rows
2026-08-30 16:30 | 43 games | WNBA:4     <- 2 fixtures, 4 rows
```

Zero across three months of captures including the 78-row day before, then three
on 2026-08-30. This is a regression with a date, not a longstanding quirk.

## Why a ticket and not a fix

The fix lives in the relay's archive-**write** path. field-relay-nba's Rule 39
requires mapping every dependency and auditing every consumer before touching a
route or a table, and its confidence bar forbids committing below 95. A blind
de-dup pushed to their main from here would violate both.

So this writes the one thing it can author correctly without their write-path
context: an evidence-carrying, self-closing bug report naming both archive ids
per pair, which is the actionable part.

## Reused, not reimplemented

`decideIssueAction` is **imported** from `relay-brief-watch.mjs` rather than
copied — one rule, one implementation, the same reason the relay keeps
`drawPriceFrom` in `src/odds-shape.js` instead of duplicating it into
`index.js`. A fixture asserts the import is the real thing:

```
PASS  decideIssueAction is the imported one, not a second copy
```

## Keyed on the event id, never on names

Names are the thing that drifted. My own duplicate detector in
`brief-phase-live-check` keyed on names first and **missed the MLS pair
entirely** — `Dallas @ St. Louis` reduced to `dallas|louis` and
`FC Dallas @ St. Louis CITY SC` to `dallas|sc`. Two keys, one fixture, no report.

A row with no event id is skipped rather than grouped: several rows sharing "no
id" are not thereby the same fixture, and grouping them would manufacture
duplicates out of missing data.

```
PASS  THE NAMES DIFFER AND IT IS STILL ONE FIXTURE
PASS  ROWS WITH NO EVENT ID ARE SKIPPED, NOT GROUPED
```

## Cost and safety

Rides `drift-sentinel`, which already fetches this payload daily. No new
workflow, no new schedule. `continue-on-error` so the relay's backlog cannot
redden this repo's run, and it SKIPS cleanly with a warning when
`SIBLING_REPO_TOKEN` is unset — so it is safe to land before the secret exists.

An empty slate cannot close a real ticket: `rowsPresent` gates the close path,
the same three-state discipline the other four checks gained today.

## Verified

```
node scripts/relay-duplicate-fixture-watch.mjs --self-test   9/9
npm run check:workflows                                      9/9
npm run check:script-orphans                                 3/3
npm run check:import-purity                                  2/2
```
