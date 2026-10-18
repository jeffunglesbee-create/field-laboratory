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

Results are recorded below as each step runs.
