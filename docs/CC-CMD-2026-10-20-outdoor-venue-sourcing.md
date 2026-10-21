# Claude Code Command — source coordinates for the outdoor venues the table still lacks (UEFA, CFB, NFL)

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-20 by CC, split out of `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md`
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** PARTIAL — Task 0 DONE 2026-10-21, Tasks 1 and 2 not started, owner decision pending. Measured: 1 red day in 31 against about 360 unknown venues (CFB 138 of them); the premise held on 10-20 and no longer does. See `outbox/cc-session-2026-10-21-outdoor-venue-sourcing-task0.md`, which recommends closing on the measurement.

---

## Why

The venue table now carries playground's reviewed keys and records NHL/NBA
arenas as indoor (`outbox/cc-session-2026-10-20-venue-coverage.md`).
Playground has no UEFA (beyond England, Munich, Freiburg and Strasbourg), CFB or
NFL venues. On a slate whose only outdoor venues are those, verify's live
render check still fails "the venue table covers at least one venue on this
slate", and the page shows no weather chip for venues that should have one.

Named in `src/Suite.fs` ("every venue on the 2026-10-20 slate is accounted
for") as not yet carried: Şükrü Saracoğlu Stadium, Baku Olympic Stadium,
Olimpico, Estádio do Dragão, Stadio Diego Armando Maradona, Parc des Princes,
MHPArena, Pitbull Stadium, Delaware Stadium, Joan C. Edwards Stadium.

## Task 0 — probe

1. `git log --oneline -5`.
2. The exact venue strings to cover: `field-archive` D1 (`cc49101c-0569-4d41-8e7a-be139cde4f26`),
   `SELECT sport, venue, COUNT(*) FROM regular_season_games WHERE sport IN
   ('NFL','CFB','UCL','UEL', …) AND date >= '2025-08-01' GROUP BY 1,2`. Confirm
   the UEFA sport keys from the table first (`SELECT DISTINCT sport`).
3. Count how many of the last 30 days' slates would still have no table venue
   once arenas are excluded. This prices the work against the red days it
   removes.

## Task 1 — coordinates from a source, never from memory

The table's header names playground's method: a Wikidata/Nominatim/Photon/
Overpass probe sequence (`field-playground/scripts/probe-poi-geocode.mjs`,
cache `outbox/poi-geocode-cache.json`). Run it on a GitHub Actions runner:
this sandbox's proxy refused Open-Meteo on 2026-10-20, and the geocoder hosts
were not probed from here. Commit the probe output
as the provenance artifact. Roof type comes from the same probe or from
`probe-wikipedia-roof.mjs`, recorded per venue.

## Task 2 — add, verify, mutate

- Add the rows to `src/Venues.fs` with declared zones.
- Remove each added name from the Suite check's not-yet-carried list.
- `weather-live-check` on a runner must resolve every new row's zone.
- Mutation: delete one added row; the Suite check must catch it.

## Done conditions

1. The probe artifact is committed in `outbox/`.
2. A `verify` run id, green on main, on a day whose only outdoor venues were
   UEFA or CFB.
3. `npm run gate` >= 95.
