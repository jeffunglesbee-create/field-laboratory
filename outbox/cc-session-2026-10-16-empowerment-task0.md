# CC session — 2026-10-16 — empowerment metrics, Task 0 only

**CC-CMD:** `docs/CC-CMD-2026-10-15-empowerment-metrics.md`, TASK 0 (four probes).
No type was written; Tasks 1-4 are not started.
**State:** probe REVISED after its first live run was attacked and four
verdict claims did not hold (below). The revision's run is the next commit.
Getting the gate green needed four stale mutation anchors fixed first,
recorded separately in `outbox/mutation-anchors-2026-10-16.md`.

## Why Task 0 was run again

`docs/TASK0-RESULTS-2026-10-15-empowerment-metrics.md` (chat, 2026-10-15) is
not Task 0 as specified, and one of its findings does not hold:

| its claim | measured this session (2026-10-15/16) |
|---|---|
| "R2 holds wc26 only … nothing current-season" (the "blocking finding") | the first run's census (run 38853536166) found **887 events in 10 competitions**, uploads through 2026-10-15, 786 of them non-shell. `/bsd/r2/list` returns at most 100 keys and takes no cursor; a first page cannot carry a population claim |
| 0.3 "confirmed by prior work, not re-probed" | the prior work was ONE game, 125 shots; 0.3's stop condition is about the interval JOIN over events, which was never run |
| findings from one event (wc26 8348) | each verdict states its denominator (Rule 91) |
| artifacts | one doc in `docs/`, not four `-latest` outbox artifacts with stop conditions (done condition 1) |

## First run (7e2585b, run 38853536166): four claims that did not hold

The artifacts were read and then attacked by nine reviewers before any
verdict was reported (workflow `wf_43e72702-3a5`: two lenses per verdict and
a completeness critic). Findings, ranked by what they did to a verdict:

| verdict as printed | what was wrong |
|---|---|
| 0.1 Flow **MET** | MET came from a third condition the probe ADDED ("no possession event type seen"), not from the spec's two. Both of the spec's conditions were false on the run's own numbers. The scan that found "no pass" skipped `incidents[].sequence[]`, which carries `pass`. The "narrowed variant reconstructible" flag ignored the order evidence printed beside it |
| 0.4 Tactical Lock **NOT MET** | rested on momentum's sign agreeing with the team that shot (77%). A momentum that only echoes the shotmap passes that perfectly, and an echo is exactly what the stop condition stops ("reduces to the opponent did not shoot"). The test could not fail for the reason it existed |
| 0.2 Gravity **MET** | an absence verdict from a detector never made to fail: it saw only `{x:number, y:number}`, and read two of the writer's file kinds. The BSD WebSocket feed is not in R2 at all |
| 0.3 Second Wind **NOT MET** | held, but its "16 of 16 finals" was counted after the cap, and the actor test's chance rate was never measured |

The census's contradiction of "wc26 only" survived review, and the critic
found its mechanism: `/bsd/r2/list` answers a request with NO prefix from
`bsd/wc26/`. A first page taken without a prefix shows wc26 only, whatever
else the store holds. The revision records the three listings side by side.

## The revision

`scripts/probe-empowerment.mjs`, same workflow (now pinned to one relay
commit, recorded in every artifact as `relay_sha`).

- **Census:** competition slugs are found by WALKING the store (descend a
  truncated page along its last key, re-list every sibling after it), not
  from a list of expected names; the relay's `V2_LEAGUES` is kept as a
  cross-check, both directions printed. Event ids are walked over every key
  character, not digits only. `incidents.json` is read for EVERY non-shell
  capture, so each competition's finished / in-play / unmarked split is
  measured, not sampled.
- **0.1 Flow:** the verdict is the spec's two conditions AS WRITTEN; the
  possession-level question is answered under its own name in `readings`.
  `sequence[]` events are censused (types, keys, whether any carries a clock,
  whether a build-up ever names both teams). Narrowed runs are counted over
  EVERY arrangement of every mixed-team minute and reported as a range. The
  shotmap's `min` is joined one-to-one to the goal incidents.
- **0.2 Gravity:** the detector reports `{x,y}` as numbers or numeric
  strings, 2-3 number tuples, and any timed array of 2+ identified points
  whatever its name; each of those is a negative control that must block MET.
  `average-positions.json` is read wherever populated. The population is
  printed IN the stop condition, and the unread WebSocket surface has its own
  CC-CMD (`docs/CC-CMD-2026-10-16-bsd-ws-frame-shape.md`).
- **0.3 Second Wind:** the same join with the clock moved 600 s inside the
  same period is the chance-rate control; the verdict needs the real share to
  be a majority AND the control not to be. Identity is broken out by play type
  and period; the finals on the board are counted before the cap.
- **0.4 Tactical Lock:** the question is whether momentum moves where nobody
  shoots. In shot-free stretches a function of the shots alone is
  constrained: a cumulative count does not move, any mix of up to two decay
  rates changes direction at most once per stretch, and a shot-window count
  changes only at one shot age. Momentum that does none of those is a
  territory proxy; the test never uses momentum's sign. The active-play
  window is its own UNMEASURED field: nothing carries a clock below the minute.

## Verification of the revision

- Self-test: 95 checks, every verdict branch fired on purpose, including
  each shape a reviewer used to break an earlier version (slow, cumulative,
  two-rate, windowed and sign-inverted echoes; a busy territory index; runs
  needing two mixed minutes resolved opposite ways; a slug hidden behind a
  crowded hyphenated sibling; an event id that sorts after every number).
- Mutations: 57/57 caught (scratchpad harness; each analyser loosened, the
  self-test goes red; the harness refuses an anchor that is not unique).
- `live()` end to end against a local fake relay + NHL server with the
  relay's real `nhl-onice.js` and `index.js`.
- A second review of the revised code (workflow `wf_bf5787f1-ab2`, 10 agents)
  reproduced 6 more defects, all fixed before the gate: two-order run counting,
  overtime left in the control's denominator, the slow/busy/inverted territory
  failures, and four minor census and join holes.

## Found on the way, not Task 0

- `/bsd/contract` declares `incidents[].sequence[].pos` target-goal-relative.
  The first run measured one SHARED frame over 427 non-own goals (home scorers
  high x 246/246, away low x 181/181). The owner's
  `docs/BSD-FRAME-DIAGNOSTIC-2026-10-15.md` reached the same over 11 goals.
- `verify` was red on `7e2585b` for a reason unrelated to the probe: its axis
  check rendered the live slate, which was empty at 01:00 ET. Fixed and
  recorded in `outbox/verify-axis-pinned-2026-10-16.md`.
- `guards` was red because two CC-CMDs filed 2026-10-15 carried no `Status`
  line; both now do.
