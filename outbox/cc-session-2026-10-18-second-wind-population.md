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

## Verification

| step | run | result |
|---|---|---|
| `verify.yml` on `849e70f` | (dispatch) | all green, including the four-case Metrics check against the real build |
| `verify-full`, the gate | 39160589637 | **530/530 = 100** |
| main | — | `f87d338`, `8b6db8d` (data), `ce240fe`, with source byte-identical to the gated `849e70f`; then records `00c1a4a` and `5c225d1` |
| `metrics-screenshot.yml` from main | 39168034291 | render check **14/14**, self-test **27/27**; `outbox/metrics-tab-latest.png` |

**The browser reproduced the census.** The page formed the curve from the
committed bytes and read every skater-game. Its counts are 11,807 skater-games:
11,232 Insufficient, 551 PopulationRate, 15 SecondWind, 9 TrailingRate. That is
the node census to the unit, by a second run of the same F# over the same bytes
in a different runtime.

**The four subjects, first in game order:**
- Insufficient: game 2025020001, player 8473422, a bare track.
- PopulationRate: game 2025020001, player 8473419, two ticks at half opacity.
- SecondWind: game 2025020089, player 8471214, observed far right of expected.
- TrailingRate: game 2025020161, player 8479525, observed far left.

Each state name is in the subject's accessible name only. The visible text
names the game and the player id, and the census counts.

## Cost, as chosen

- 131,448,424 bytes added to the repository and to every deployed build.
- 657 requests, made once when a reader first opens the Second Wind section.
- On the runner the section loaded inside the check's 180 s budget. On a phone
  over mobile data it will be slow. The owner chose this knowingly, and it
  stays out of every other path: nothing fetches before the section opens.
