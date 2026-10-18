# Second Wind on the Metrics tab: the population, committed (owner: option 1)

CC-CMD: `docs/CC-CMD-2026-10-18-second-wind-population-capture.md`. The owner
chose option 1: commit the population's raw captures, about 136 MB, so the
curve is formed in the browser from the same bytes the census decoded.

## Capture

`scripts/second-wind-population.mjs --capture-population`, through
`empowerment-data.yml` (new input `population`).
- **The bytes are the census's own.** The capture keeps each response body as
  the census fetched it and writes it verbatim. A game whose written sha256 is
  not the one the census recorded for it stops the run.
- **`empowerment-data.yml` now pushes to the ref it was dispatched on.**
  Before, it rebased onto main and pushed to main, so a dispatch on a candidate
  branch would have landed that branch's ungated code.

## Results

- **Capture:** `empowerment-data.yml` run 39159881789, dispatched on the
  session branch with `population: true`.
  - 328 of 328 games written: 656 files, 131,448,424 bytes, all decoded.
  - The census is reproduced exactly: 11,807 skater-games, 11,232 / 551 / 15 / 9,
    7/7 gates.
  - The data commit `755168c` landed on the branch, not main.
- **View:** the Second Wind section fetches `MANIFEST.json` and the 656 files on
  its first expand, eight in flight at a time.
  - Each game is decoded with `staminaPlayByPlay` / `staminaShifts` and
    windowed with `staminaPlayerGames`. The curve comes from `staminaCurve`
    over every game's `PlayerGame` rows.
  - Every skater-game is read through its own game's `staminaWitness`. One
    subject per state is selected by the leading words of `staminaLabel`; the
    first in game order is drawn with `staminaMark`.
  - `TrackOnly` draws a bare track. `Ticks` draws two ticks at the module's
    fractions and opacity: a thin expected tick and a thicker observed one.
- **Render check:** the Second Wind predicate now requires all four cases. The
  `TrackOnly` subject must have no tick and each `Ticks` subject must have two,
  and the population must be fetched once, only on expand. Self-test 27/27.

Gate, main and the screenshot are recorded below once run.
