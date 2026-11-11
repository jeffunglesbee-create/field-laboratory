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

## Revision 2026-11-11, after an independent review (three lenses, each finding re-checked by a skeptic)

The first version above was merged with 21 of 21 and six table entries. The review found that the block that runs against the relay was covered by none of them, and that three one-line mutants of the join, the clock and the coverage line passed the self-test. All of it was reproduced by the skeptics, then fixed here before the first capture ran.

| finding | what was wrong | what changed |
|---|---|---|
| capture:F3 | the capture block sat under `isMain`; `proved: true` forced there passed the self-test and printed SEEN for a feed with only a pre game | the block is the exported `capture()`; the self-test runs it against a loopback stub of the relay in seven scenarios; table entries `live-capture-proved-forced-true`, `-headline-always-seen`, `-error-exits-green`, `-gap-line-not-printed` |
| capture:F4 | one `proved` flag joined two premises, so a live feed whose archive row was missing or already scored printed `NOT SEEN`, and the stored task prompt wrote "the live shape was not seen" and blocked Task 6 | `feedShapeSeen` (feed shape) and `proved` (feed shape plus an unscored archive row) are separate; the headline has four sentences and names the premise that is missing |
| capture:F5, rules:F4 | the last scheduled capture, 110 minutes after a 19:00Z kickoff, is at about the whistle; nothing counted a game that is final in the feed with an unscored archive row, which is the gap the Full time marker rests on | `summary.finalWithArchiveUnscored` and a `gap` line are recorded and printed; captures at 21:00Z, 21:12Z and 21:30Z were added |
| capture:F7 | one failed or slow `/context/date` threw away the `/v2/games` body already in hand | each fetch fails on its own (`settled`); a record keeps the feed and names the failed fetch |
| capture:F8 | with no capture file written, `git add outbox/live-capture-*.json` died on a pathspec error before the step could say so | `2>/dev/null \|\| true`, pinned by a self-test clause that reads the workflow |
| rules:F2 | three one-line mutants survived: a team-name fallback on the join, an empty-string clock counted as a clock (the relay emits `''` when ESPN has none, `adaptESPNWCSoccer`), a coverage line printing the full-shape count as the live count | one self-test clause each; `live-capture-name-fallback-join`, `-empty-clock-is-a-clock`, `-coverage-counts-full-shape` |
| capture:F9 | the CC-CMD said the capture reads `/context/game/<id>` and writes `fetched_at`; it reads `/context/date/<date>` once and writes `capturedAt` | the CC-CMD's Task 1 paragraph says what shipped and records the revision |

Result: `node scripts/live-shape-capture.mjs --self-test` 40 of 40; all 17 `live-capture-*` table entries caught through the harness (6 existing, 11 new), `check:mutation-anchors` 0 stale.

Not changed, and why: capture:F1 (the workflow was not on `main`) was closed by landing the merge at 73810062. capture:F6 was refuted by the skeptic (a re-arm existed). capture:F2 (the four stored tasks carry no connectors and no permission mode) could not be probed without a live run; the earlier fresh-session tasks the skeptic read were `auto` with the repository already attached. The captures are therefore also dispatched from the authoring session, eight minutes after each slot, only when no capture file for the slot is on `main`.

Still not run against the relay: the sandbox cannot reach `*.workers.dev`. The loopback stub is shaped like the relay by reading `handleV2Games` and `adaptESPNWCSoccer`, not by observing a live game, which is what the captures are for.
