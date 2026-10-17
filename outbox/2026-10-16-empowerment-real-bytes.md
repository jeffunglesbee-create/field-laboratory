# Empowerment metrics on real bytes — 2026-10-16

Second commit of `docs/CC-CMD-2026-10-15-empowerment-metrics.md` Tasks 1-4. The
first (`b6f1fcf`) tested Flow and Second Wind on inline inputs only, because
their fixtures did not exist yet. `empowerment data` run 38984743564 then
captured them (bot commit `c64251c`, sections in `data/PROVENANCE.md`):

| fixture | event | bytes |
| --- | --- | --- |
| `data/bsd-flow-finished-stats.json` + `-incidents.json` | bundesliga 213708, FT marker at 90', not live | 20629 + 4859 |
| `data/bsd-flow-inplay-stats.json` + `-incidents.json` | europa 601226, "Second half" live at 90', last shot 79' | 14577 + 2141 |
| `data/nhl-second-wind-pbp.json` + `-shifts.json` | NHL 2026020115, OFF | 149977 + 265898 |

## Eight rows over them

Relational: the capture workflow rewrites all six files, so no row is anchored
to a value inside them. What a Flow row sets Flow's answer against is read from
the raw text by a generic decoder (`rawShotRows`, `rawEventId`, `rawLastShot`
in `src/Suite.fs`), never by Flow.

- **Flow, 5:** the finished capture is read and the census counts every shotmap
  row once (counterexample: the same bytes with one shotmap `xg` nulled,
  `Fixtures.bsdFlowFinishedStatsXgNull`); its own FT marker records the clock one
  added minute past its last shot, and without the incidents file that clock is
  not recorded; its stats and incidents name one event, and beside the in-play
  capture's incidents they do not; its own event id joins its event row to the
  witness, and the in-play capture's id does not; through the witness, minutes
  1-90 name both teams in a sanctioned form, InFlow at least once and exactly
  where the pulse draws.
- **Second Wind, 3** (written by the Second Wind build, held until the
  fixture existed): the capture decodes and windows with 30 or more skaters and
  an attempt past regulation; named credit sits inside the shooter's own shifts
  for 95% of other attempts and a +600 s control does not; the capture's own
  `gameState` yields the witness and the same bytes marked LIVE do not.

Suite 294 -> 302, literal count 302.

## Each row made to fail first (MUTATE-FIRST-A, `field-relay-nba/CLAUDE.md`)

Applied in this tree one at a time, compiled, harness run, restored. Every
anchor occurred once and every mutant compiled, so each catch is the row's and
not the compiler's. Each mutant turned its target row red:

| mutation | target row | harness |
| --- | --- | --- |
| census `Shots` + 1 | Flow 1 | 300/302 |
| null xG read as a shot | Flow 1 | 296/302 |
| full-time route removed | Flow 2 | 296/302 |
| incidents event-id check removed | Flow 3 | 300/302 |
| kickoff row's id not compared | Flow 4 | 300/302 |
| InFlow label to three decimals | Flow 5 | 294/302 |
| pulse never draws | Flow 5 | 298/302 |
| chart `total` not compared | SW 1 | 300/302 |
| `BeyondRegulation` forced to 0 | SW 1 | 300/302 |
| coverage ignores `clockShift` | SW 2 | 300/302 |
| LIVE yields the witness | SW 3 | 300/302 |

Seven of those defended invariants no record held, so they are now permanent
records in `scripts/mutation-check.mjs` (155 -> 162): `flow-census-counts-every-row`,
`flow-full-time-route-records`, `flow-label-two-decimals`,
`flow-pulse-draws-inflow`, `stamina-chart-total-checked`,
`stamina-overtime-counted`, `stamina-coverage-clock-shift`. Each passed
`--only` through the harness. The other four already had records.

## Done condition 5, measured

"Loosening each new constructor drops the gate below 95 and exits non-zero."
All 53 new records' expectations are gate rows: 48 are `node build/VerifyMain.js`
(the 20-point harness row) and 5 are `proof-check --only` (inside the 20-point
proof row). On a tree with `Flow.Finished` made public, measured here:
`proof-check --only FLOW-PROOF` exits 1 (case 3 compiles), and
`mutation-check --only flow-teamstate-goes-public` exits 1 on its own baseline
("the unmutated tree passes every expectation" FAIL). That is 40 of 530 points
at least, so 92.45 at most, and `confidence.mjs` exits 1 on any failing row.

## The frames route, hashed

`data/bdb-event-frames-2022-w2.json` was copied from the builder's artifact, and
until now it was tied to `/nflverse/bdb_event_frames.json` by a byte count.
`scripts/frames-route-check.mjs` hashes what the route serves against the
committed file, and `gravity-census.yml` runs it after the census, writing
`outbox/frames-route-latest.json`. Before wiring it: self-test 6/6, including a
one-byte flip at the same length that only the hash catches; three mutants
(each check forced true) each caught; the committed file compared to itself
3/3, and to a copy with one digit changed, exit 1. The route itself is read on
the runner, because this sandbox cannot reach `*.workers.dev`.
