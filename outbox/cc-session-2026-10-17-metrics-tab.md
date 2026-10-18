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

| step | run | result |
|---|---|---|
| `verify.yml` on the first candidate | 39150793897 | built; red on "The chrome, measured on the rendered page". Cause: `--mx-fill` was set only inline, and that check fails a `var()` that no stylesheet declares. Fixed in `3d71ee8` |
| `verify.yml` on the fixed candidate | (dispatch on `f8911d6`) | **all green**, including "The Metrics tab renders what the modules hand it" and the chrome check |
| `verify-full`, the confidence gate | 39151424842 on `8e5d2b9` | **530/530 = 100** in 4,993 s; mutation baseline recorded |
| main | — | `5d9a3e1`, `3d71ee8`, `222a043` (source byte-identical to the gated `8e5d2b9`; main had gained only STATUS, docs and outbox), then records `db08fd7` and `9abc5d9` |
| `metrics-screenshot.yml` from main | 39158838265 | render check **13/13**; self-test **25/25**; `outbox/metrics-tab-latest.png`, `outbox/metrics-render-latest.txt` |

## Done conditions

1. `metrics-render-check.mjs --self-test` gives 25/25, and the real run gives
   13/13 against a served build. **Met.**
2. `npm run check:tabs` passes with eleven tabs (the verify run above). **Met.**
3. The screenshot of `panel-metrics` with all four sections expanded is
   `outbox/metrics-tab-latest.png`. **Met.**
4. `npm run gate` gives 530/530 = 100. **Met.**
5. This document, and the README's "answer so far". **Met.**

## What the screenshot shows, read rather than asserted

- **Flow, Bundesliga 213708:** both sides pulse. Away has three runs, the last
  one late. The render check counted 24 styled minutes across all four strips.
- **Flow, Europa 601226 (captured in play):** Home draws no minute and Away
  draws one short run. Both strips are witnessed, so this is the metric's own
  reading: "Every other reading draws nothing" (`Flow.pulseStyle`).
  - **A gap, kept rather than hidden:** a minute with no pulse is invisible, so
    a strip with no InFlow minute looks empty. Its accessible names still say
    `Disjointed` or `not recorded` minute by minute. Making the track itself
    visible is a design choice this command did not make.
- **Gravity:** 12 plays and 60 marks, 15 of them unencoded (dashed). Circles,
  squares and diamonds are `Expanding`, `Steady` and `Contracting`; a fill is
  `encodeWell`'s opacity, and an empty solid square is a receiver who drew
  nothing.
  - The visible counts, `545`, `489`, and `515 of 2438`, are summed from
    `gravityCensus`'s tallies. They match `outbox/gravity-census-latest.json`.
- **Second Wind and Tactical Lock:** text with census counts, no marks.

## What did not go as the command said

- **TASK 3's four Second Wind cases.** Not built; the measured reason is in
  TASK 0 above. Filed as `docs/CC-CMD-2026-10-18-second-wind-population-capture.md`,
  with an owner decision on how to commit a population.
- **TASK 6.3.** It was rewritten to assert the stated absence. The four-case
  assertion moves to that command.
- **Flow needed data the command did not list:** two BSD event rows, now in
  `data/`.
- **A relay defect found on the way:** `/bsd/events/by-date` ignores `offset`
  and caches nothing. Filed as field-relay-nba
  `docs/CC-CMD-2026-10-18-bsd-by-date-offset-and-cache.md`. My first capture
  run paged against it and re-fetched page one on every busy day; that cost is
  recorded in jubilant-bassoon `outbox/cc-session-2026-10-18-lab-bdb-mirror-producer.md`.
