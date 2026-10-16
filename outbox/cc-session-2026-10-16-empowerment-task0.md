# CC session — 2026-10-16 — empowerment metrics, Task 0 only

**CC-CMD:** `docs/CC-CMD-2026-10-15-empowerment-metrics.md`, TASK 0 (four probes).
No type was written; Tasks 1-4 are not started.
**State:** probe built and tested; gate run `1b1fd5670499-93f09fbbc781` passes
every row (530/530) on this tree. The live run's four artifacts are the next
commit. Getting the gate green needed four stale mutation anchors fixed first,
recorded separately in `outbox/mutation-anchors-2026-10-16.md`.

## Why Task 0 was run again

`docs/TASK0-RESULTS-2026-10-15-empowerment-metrics.md` (chat, 2026-10-15) is
not Task 0 as specified, and one of its findings does not hold:

| its claim | measured this session (2026-10-15/16) |
|---|---|
| "R2 holds wc26 only … nothing current-season" (the "blocking finding") | listing `bsd/` returns **bundesliga captures uploaded 2026-08-28 → 2026-10-11** and eflchamp, ucl, europa, laliga, seriea, mls, epl, ligue1. `/bsd/r2/list` returns at most 100 keys and takes **no cursor**; a first page cannot carry a population claim |
| 0.3 "confirmed by prior work, not re-probed" | the prior work was ONE game, 125 shots; 0.3's stop condition is about the interval JOIN over events, which was never run |
| findings from one event (wc26 8348) | each verdict below states its denominator (Rule 91) |
| artifacts | one doc in `docs/`, not four `-latest` outbox artifacts with stop conditions (done condition 1) |

## What was built

`scripts/probe-empowerment.mjs` + `.github/workflows/probe-empowerment.yml`
(dispatch only; the sandbox reaches neither workers.dev nor the NHL APIs).

- **Census:** enumerates R2 by prefix with pruning at the last key of each
  truncated page; competition slugs read from the relay writer's own
  `V2_LEAGUES` map (first slug per BSD league id) + `wc26` + a first-letter
  sweep. A failed page is retried once and then named; the census is never
  called complete while one failed. Shell captures (stats under 1000 bytes,
  empty shotmap) and 2-byte `{}` average-positions files are counted as such.
- **0.1 Flow:** ordering key, both teams, the within-minute order tested
  against goal build-up sequences (each shotmap row used once), cross-team
  ties counted as UNORDERED, and the event types that sit between shots
  censused for any possession event. `/context/date` is read and its shot/xG
  keys listed, because the spec asks what it serves.
- **0.2 Gravity:** every coordinate path in every capture classified; an
  unclassified path blocks a verdict. The goal-build-up frame is measured
  from counts against `/bsd/contract`'s declared frame. NFL evidence is cited
  as inherited (jb, 2026-08-15), not re-measured.
- **0.3 Second Wind:** every timed play of every final on the NHL scoreboard
  through field-relay-nba's own `src/nhl-onice.js` (fetched). The verdict is
  taken over plays that NAME a player, and a resolved on-ice set counts only
  when that player is in it: a goal at a line change resolves to the incoming
  line with the scorer gone, which a body count calls resolved. Games with no
  shift chart are availability, not join failures.
- **0.4 Tactical Lock:** momentum and per-minute xG presence; momentum's SIGN
  established from one-team minutes before it can count as a denominator;
  added time's fold into m=45 / m=90 reported; reconcile in both directions.
- **Three states:** a verdict is MET, NOT MET or UNMEASURED. Nothing read is
  never MET, and the run exits non-zero on any UNMEASURED.

## Verification of the probe itself

- Self-test: every analyser on fixtures, including negative controls.
- Mutations: 20/20 caught (each analyser loosened, the self-test goes red).
- `live()` end to end against a local fake relay + NHL server, with the
  relay's real `nhl-onice.js` and `index.js`.
- Adversarial review, four lenses (workflow `wf_1c50e56e-b28`, 24 agents):
  every confirmed finding fixed before the run, among them zero data printing
  MET, a body count read as identity, the momentum sign not required, the
  census dropping a failed page silently, and a hard-coded frame reading the
  data contradicted.

## Found on the way, not Task 0

- `/bsd/contract` declares `incidents[].sequence[].pos` target-goal-relative.
  Its proof is one AWAY goal, which reads the same under a shared frame. The
  reviewer saw home scorers at x 80-97 (18/18) and away at 6-12 (4/4). The
  probe measures this across every capture; the artifact carries the count.
