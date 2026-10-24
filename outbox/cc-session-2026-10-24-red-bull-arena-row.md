# The `Red Bull Arena` row was New Jersey's after the ground was renamed

Told by the owner on 2026-10-24: the New Jersey ground is now Sports Illustrated
Stadium. Measured before changing anything (field-archive D1, queried
2026-10-24, regular and postseason games):

| venue string | home | games | first | last |
|---|---|---|---|---|
| Red Bull Arena | Red Bull NY | 6 | 2026-07-25 | 2026-09-26 |
| Red Bull Arena | RB Leipzig | 5 | 2026-08-29 | 2026-10-24 |
| Red Bull Arena | Crystal Palace | 1 | 2026-05-27 | 2026-05-27 |
| Sports Illustrated Stadium | Red Bull NY / Red Bull New York | 20 | 2026-04-15 | 2026-11-07 |

So the MLS club's games were filed under both strings until 2026-09-26 and under
Sports Illustrated Stadium only from 2026-09-30; every "Red Bull Arena" game
since is Leipzig's. The Crystal Palace row on 2026-05-27 is the Conference League
final, played in Leipzig.

## What was wrong, and what it cost

- `src/Venues.fs` held `Red Bull Arena` at Harrison NJ (40.7367, -74.1503), so
  Leipzig's Bundesliga game today showed New Jersey weather.
- The same coordinate sat under the Sports Illustrated Stadium row, which made
  the two look like an alias pair. They fed the alias fix's symmetry test and
  its write-up, and that is how I described them. Both were built on the stale
  row. The "collision" the home-team calibration flagged (Red Bull Arena / RB
  Leipzig) was the matcher being right about a row that had not followed a rename.

## Fixed

- The row is Leipzig's ground: 51.3458, 12.3481, Europe/Berlin, open-air
  (Wikidata Q210466 and Nominatim agree).
- The Suite's alias-symmetry check uses a real alias pair (Minute Maid Park /
  Daikin Park), and a new check asserts Red Bull Arena and Sports Illustrated
  Stadium do not serve each other's cards.

## Not changed, and why

The 7 stale "Red Bull Arena" MLS games (2026-07-25 to 2026-09-26) are history;
a weather chip is for today's slate. A feed that goes back to calling New
Jersey's ground "Red Bull Arena" would show Leipzig weather for it: the archive
shows none since 2026-09-26.
