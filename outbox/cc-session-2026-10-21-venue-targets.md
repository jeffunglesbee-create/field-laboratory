# Venue sourcing, stage 3 tooling: the work list, built from the relay, not from a transcript

CC-CMD: `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md`, Task 0.2. Committed
separately from stage 1 on purpose: stage 1 (`57dea69`) is the tree under the
`verify-full` gate; this adds a script and a workflow mode on top of it.

## Why not copy the names from the D1 result

The first thought was to paste the venue strings I had read from `field-archive`
into a file. About 500 names copied by hand through a transcript is exactly where
a character goes missing, and a mistyped name geocodes to nothing or to the wrong
place. The relay already serves the same table: `GET /archive/sport/:sport`
returns every regular and postseason row for a sport, public, with the `venue`
column (`src/index.js` in field-relay-nba, the `/archive/sport/` route). A runner
can read it directly.

## `scripts/venue-targets.mjs`

- Reads the table names and the indoor-arena names from `src/Venues.fs` as text, so
  the work list cannot drift from the files it is meant to extend.
- `targetsFrom(games, table, arenas)` is pure: trims the name, drops empty and
  missing venues, drops what the table carries and what is a recorded arena, and
  groups by (sport, venue) with a game count and first and last date.
- **Completeness is asserted.** `EXPECTED_ROWS` holds the per-sport row counts of
  `regular_season_games` measured on 2026-10-21 (27 sports). The route returns
  regular and postseason rows and the table only grows, so any sport read with
  fewer rows than that fails the run: a truncated read cannot pass as complete.
- Writes `outbox/venue-targets-latest.json` with per-sport counts beside the list.

## Verified here

- `--self-test`: 8 of 8, no network (known, arena, empty, null, padded and
  duplicate cases; the two real name sets are non-empty and share no name).
- Mutation `venue-targets-arena-listed` (drop the arena exclusion): caught.
- `check:workflows` and `check-push-lands.py` still pass with the new `targets` mode
  in `.github/workflows/venue-source.yml`.

## Not run yet, and what that leaves open

The runner has not fetched the route. Two premises ride on it, each testable by
that one run: that the route's row counts are at or above the D1 counts (the
completeness check says so on its own output), and that the relay answers a
runner within the timeout for the larger sports.
