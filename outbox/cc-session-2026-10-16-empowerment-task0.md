# CC session — 2026-10-16 — empowerment metrics, Task 0 only

**CC-CMD:** `docs/CC-CMD-2026-10-15-empowerment-metrics.md`, TASK 0 (four probes).
No type was written; Tasks 1-4 are not started.
**State:** Task 0 DONE. Final run 38881438378 (head `2b4a93f`, relay
`a39d61e`), four `-latest` artifacts in `outbox/`, every stop condition
stated. The probe was revised twice before its verdicts were trusted; each
revision was forced by an adversarial review of the run before it. Gate run
`62a3aa313c49-eaa739de3f34` passed every row before this write-up was committed.

## Stop conditions, final run

| probe | stop condition (spec text) | verdict | on what |
|---|---|---|---|
| 0.1 Flow | shots carry no within-match ordering key, or carry no opponent-event interleaving | **NOT MET** | `min` (+`added`) on every shot in 150/150 captures; both teams shot in 150/150, and a timed opponent incident falls between two same-team shots in 310 pairs |
| 0.2 Gravity Well | soccer provides on-ball data only | **MET** (R2 captures) | every coordinate path in 150 captures + 9 average-positions files is on-ball or a match average; the BSD WebSocket feed is not stored anywhere and was not read (`docs/CC-CMD-2026-10-16-bsd-ws-frame-shape.md`) |
| 0.3 Second Wind | the interval join cannot resolve a majority of events | **NOT MET** | 4023/4271 actor plays resolve with the actor on ice (94.2%); the same join with its clock moved 600 s confirms 20.5%; 16 of 32 finals, games of 2026-10-13 to 10-15 |
| 0.4 Tactical Lock | no territory proxy exists in the payload | **NOT MET** | `momentum` is not an echo of the shots (571 shot-free stretches, excess direction changes 35.1%) and, shots and xG partialled out, its half mean tracks final-third entries r 0.584 (t 12.3) and possession r 0.735 (t 18.6) over 298 halves |

Denominators (Rule 91): stats read for 150 of 786 non-shell captures, the
newest 15 per competition, 10 competitions; incidents read for all 784 that
have one. R2 census complete: 887 events, 10 slugs found by walking the
store, 0 failed pages.

## What the build has to carry, from the same artifacts

- **Two premises in the CC-CMD's "Task 0 outcome" do not hold.** R2 holds 887
  events in 10 competitions through 2026-10-15, not wc26 only (a listing with
  no prefix answers from `bsd/wc26/`, which is how the first pass saw only
  that). And only **47 of 786** captures are of a finished match: the club
  writer fires from minute 80 and drops finished events, so 734 stop while the
  second half is live. "Post-hoc over finished matches" is post-hoc over
  records that mostly end before full time.
- **Flow (Task 1):** the owner ruled the shots-only version in on
  2026-10-16. Under it, timed opponent incidents no longer interrupt a run
  (up to 310 same-team pairs hold one, counted with no break at a period),
  and four questions it leaves open are listed under Task 1 in the CC-CMD. 535-556 runs of
  3+ own-team shots, the range set by 62 mixed-team minutes (counted over
  shots of any xG, ending runs at every period break; both still open). 171 of 2422
  same-team shot pairs have a `fast-break` second shot, i.e. an opponent
  possession the narrowing calls uninterrupted. xG on 4125/4125 shots, 13
  estimated.
- **Tactical Lock (Task 2):** momentum agrees with the shooting team most at
  the row one minute AFTER the shot; added time has one momentum row for the
  whole added period; the active-play window is UNMEASURED below the minute
  (only 6 incident types exist, so throw-ins, goal kicks and uncarded fouls
  cannot be excluded). Momentum's territory meaning is validated at half
  grain, its minute values only in aggregate.
- **Second Wind (Task 3):** the pooled 94% hides two event classes the join
  gets wrong. Goals confirm 23/101 (the scorer's shift ends on the goal
  second, end exclusive) and penalties 0/133. Task 3 must not credit either
  through `onIceAt` membership as it stands.
- **Frame:** `incidents[].sequence[].pos` is ONE shared frame (home scorers
  high x 246/246, away low x 181/181), against `/bsd/contract`'s declared
  target-goal-relative frame; the owner's frame diagnostic agrees.
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

## Second run (c0c6e0c, run 38868561110), and the third revision

Five skeptics (workflow `wf_36abfca5-f0e`) attacked the second run's
verdicts. 0.1, 0.2 and 0.3 held. 0.4 did not: "momentum is not an echo of
the shots" was shown, but an echo plus integer jitter is also "not an echo",
and nothing tested that momentum carries TERRITORY. The payload carries the
spec's own named measures (final-third entries, possession share) only per
half, so the third revision validates momentum against them: its half mean
against each, with the half's shot and xG difference partialled out.
Momentum that tracks neither is MET ("reduces to the opponent did not
shoot"); one that cannot be computed is UNMEASURED.

Also from that round: Flow runs no longer cross half time; the shot `sit`
field is censused (a fast-break shot after an own-team shot implies an
unseen opponent possession); xG coverage is reported; a goal build-up is
recognised as a sequence of actions by its shape, not by its path name;
Second Wind prints the sampled games' own dates and counts actor plays on a
period-end second (`onIceAt` has no period filter).

The v3 self-test has 109 checks; 70/70 mutations are caught by a failing
check. The harness now refuses to report unless the unmutated self-test
passes, and counts a crash apart from a catch. That rule exists because one
pass printed 70/70 while the self-test was crashing on a use-before-define:
every "catch" was the crash.

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
