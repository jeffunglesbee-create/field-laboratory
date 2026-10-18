# The Metrics tab: the four empowerment metrics, mounted

CC-CMD: `docs/CC-CMD-2026-10-17-metrics-tab-render-path.md`. The session ran
on 2026-10-18; the file name is the command's.

## TASK 0: premises, measured

| # | premise | measured | holds? |
|---|---|---|---|
| 1 | only `Suite.fs` references the four modules outside themselves | `git grep` lists Flow.fs, Gravity.fs (each matching its own name in a string) and Suite.fs | yes |
| 2 | the signatures in the table | all present by name and arity (Flow 227/422/432/443, Stamina 222-591, Gravity 293/309/323, Gridiron 202, TacticalLock 178/192/307) | yes |
| 3 | fixture sizes | 4,859 + 20,629 + 2,141 + 14,577 + 149,977 + 265,898 + 1,816,808 = 2,274,889 bytes | yes |
| 4 | tab machinery | `ids` at Program.fs `wireTabs`, buttons from `tab-scoreboard` to `tab-verify`, `loadVerifyOnce` | yes |
| 5 | no capture clocks a restart below the minute | AMNESTY-PROOF's "No real window gives a lock to render" is unchanged | yes, so the Tactical Lock stop condition does not fire |
| — | Flow can be witnessed from committed data | **no.** `witnessAfterKickoff` needs each capture's BSD event row, and PROVENANCE said "the witness (its only route is the event row, which is not part of a capture)". Both rows are now captured (below) | fixed in scope |
| — | TASK 3: one Second Wind subject per state, "from the fixture" | **no.** One game cannot form a curve (`supportFloor` 1,000), and under the season curve it holds 31 Insufficient and 5 PopulationRate, with no SecondWind and no TrailingRate | stopped, filed as `docs/CC-CMD-2026-10-18-second-wind-population-capture.md` |

## The event rows

- **Captured by a jubilant-bassoon runner.**
  - `scripts/lab-flow-event-rows.mjs`, run 39148931854: found 601226.
  - Run 39149405673, after a fix: found 213708.
  - Each row is the served bytes cut by its own braces. sha256 values are in
    `data/PROVENANCE.md`.
- **Measured while capturing:** the relay's `/bsd/events/by-date` ignores
  `offset` and sets no edge cache.
  - **Cost:** the first run paged up to 20 times per busy day and re-received
    page one each time. Every one of those calls reached BSD.
  - **Fix:** the second run asked one page per day, filtered by `league_id`.

## What was built

- **Tab:** `tab-metrics` and `panel-metrics`, placed before Verify. `ids` in
  `Program.fs` is updated, and `loadMetricsOnce` follows the `loadVerifyOnce`
  pattern. `tab-check.mjs` and `live-tabs-check.mjs` name the eleventh tab.
- **`src/MetricsView.fs`, a mount with no metric arithmetic.**
  - **Flow:** for both captures, a 90-minute strip per side. Each cell's style
    comes from `Flow.pulseStyle` and its accessible name from `Flow.ariaLabel`.
    A capture with no witness still renders a named node.
  - **Gravity:** fetched once, on the first expand of its section.
    - The season comes from the file name; `archivedAt`, `measuredAt` and
      `gravityCensus` are called at that season.
    - The panel shows 12 plays in file order, never ranked.
    - Receivers that are not route runners get a dashed outline. A season
      mismatch renders as its own named state.
  - **Second Wind and Tactical Lock:** stated in text, with census counts and
    proof citations, and no marks.
- **`scripts/metrics-render-check.mjs`:** 12 predicates over a DOM snapshot.
  - `--self-test` gives 25/25: each predicate holds on a good snapshot and
    fails on its own mutation.
  - The real run writes `outbox/metrics-tab-latest.png`.
  - It is wired into `verify.yml` as `npm run check:metrics`, and the
    screenshot is uploaded as an artifact.

## Verification

Recorded below once the runner has built and served it.
