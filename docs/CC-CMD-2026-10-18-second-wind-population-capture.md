# Claude Code Command — give the Metrics tab's Second Wind section something it can draw

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Confidence gate:** `npm run gate` >= 95 before any commit
**Filed:** 2026-10-18 by CC, as Rule 87.4 requires, from
`docs/CC-CMD-2026-10-17-metrics-tab-render-path.md` TASK 3. That task's premise
did not hold.
**Status:** FILED, needs an owner decision (below).

## What was measured

TASK 3 asked for one Second Wind subject per state, "picked from the fixture".
- **The committed capture is one game**, NHL 2026020115, with 36 skater-games
  (`outbox/second-wind-population-latest.json`, `fixture`).
- **It cannot form a curve.** `Stamina.staminaCurve` refuses any population
  under 1,000 attempts in a third, in any of the three bands
  (`src/Stamina.fs`, `supportFloor`). So no player in the committed data can be
  read at all.
- **Under the season's curve** (328 games, run 38984743564), the game's 36 are
  31 `Insufficient` and 5 `PopulationRate`. It holds no `SecondWind` and no
  `TrailingRate`. The population holds 15 and 9.

The Metrics tab therefore shows Second Wind as a stated absence with these
counts, as it shows Tactical Lock. `scripts/metrics-render-check.mjs` asserts
that the section draws no mark and names this command.

## The decision needed (owner)

Drawing all four cases needs two things committed: a curve, and the games that
hold the rarer states. Two ways to get them:

1. **Commit the population's raw captures**: 328 games of pbp and shifts. This
   is about 136 MB at the fixture's 415 KB per game. The curve is computed in
   the browser from raw bytes, as the census computes it. The proof chain stays
   whole, but the tab's weight is out of all proportion.
2. **Commit a derived population file plus three witness games.** The census
   writes the season's `PlayerGame` rows (11,807 rows of five integers), and the
   capture script commits one game holding a `SecondWind` reading and one
   holding a `TrailingRate` reading, beside the existing game. The tab decodes
   the rows, calls `staminaCurve`, and reads the three games through
   `staminaWitness`. Weight: roughly 0.6 MB plus 0.8 MB, fetched on expand.
   **Cost:** the curve is then formed from rows a script wrote, not from raw
   captures, so a decoder must refuse a population file whose sha256 differs
   from the one the census recorded.

Recommendation: 2, with the sha256 gate. Option 1 sacrifices the tab's
usability for a property the gate can carry instead.

## Done condition

The Metrics tab's Second Wind section draws one `TrackOnly` mark and three
`Ticks` marks (`PopulationRate`, `SecondWind`, `TrailingRate`), each from a
committed game. `metrics-render-check.mjs` asserts all four, and a `TrackOnly`
node is told from a `Ticks` node by its geometry.
