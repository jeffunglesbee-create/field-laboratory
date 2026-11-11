# The live-shape capture (CC-CMD-2026-11-11-soccer-live-scores, Task 1)

2026-11-11. `scripts/live-shape-capture.mjs` and `.github/workflows/live-shape-capture.yml` (dispatch inputs `sport`, `date`).

## What it is for

The laboratory is going to read soccer scores from the relay's `GET /v2/games?sport=<key>&date=<ET day>`. The keys a live club-soccer game carries (`state`, `clock`, `periodNum`, `situation`) have never been observed: they are inferred from the World Cup adapter, and no soccer match was in play when the route was read on 2026-11-11 (CC-CMD fact 5). Writing the decoder against inferred keys is what Rule 68 says not to do, so this captures the real bytes first.

## What a run writes

`outbox/live-capture-<sport>-<date>-<HHMM>Z.json` holds:

- the `/v2/games` body, raw, with its status, `cache-control`, `age` and `date` headers;
- `/context/date/<date>`, the route the page already reads: for each game in the feed, the archive row it joins to **by espn event id** (the archive says `Man Utd`, the feed `Manchester United`), kept whole under `joins[].raw`, with the row count of the day;
- `games[]`: for each feed game its state word verbatim, its scores, whether they are integers, its clock, whether that is a string, its `periodNum`, whether a `situation` object is present, and its sorted key list;
- `summary`, `coverage` (`checked N of M games joined to an archive row; K live`, Rule 91) and `proved`.

`proved` is true only when **one** game has `state === 'live'`, integer scores, a clock string, and an archive row with no score. A pre game reports score `0` (an integer) and a clock `0'`, so integer scores alone prove nothing; the state word is the gate.

## What was run, and what it showed

| check | result |
|---|---|
| `node scripts/live-shape-capture.mjs --self-test` | 21 of 21 |
| the six table entries `live-capture-*` through the harness (`node scripts/mutation-check.mjs --ids ...`) | 6 of 6 caught, plus the unmutated tree |
| `npm run check:live-capture` (new, wired into `verify.yml`) | 21 of 21 |
| the cheap-check battery over the tree (28 checks) | all exit 0 |

Rule 90 found a defect in the first version. The `proved` flag counted the three conditions with three separate counters, and one mutant of it survived the self-test: three different live games, each showing one condition, would have read as proved. It now counts a single game that shows all three (`liveFullShape`), a self-test clause pins the three-games case, and two table entries break that conjunction and the `>= 1`.

## Not run, and what runs it

It has not run against the relay: the sandbox cannot reach `*.workers.dev`, so the first real run is a dispatch from CI. `docs/CC-CMD-2026-11-11-soccer-live-scores.md` Task 1 arms four one-shot scheduled tasks for 2026-11-11 19:10Z, 19:45Z, 20:20Z and 20:50Z (EFL Trophy, Barnsley v Oldham and Sheffield Wednesday v Accrington, both kicking off 19:00Z). The done condition is a committed capture with `"proved": true`. If none has it, the decoder is not written and the feature does not ship as shipped.
