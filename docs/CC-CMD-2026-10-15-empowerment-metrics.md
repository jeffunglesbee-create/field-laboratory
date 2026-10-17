# Claude Code Command — four empowerment metrics, probes before types

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-15, by chat, authored against HEAD and verified reads
**Confidence gate:** `npm run gate` must score >= 95 before any commit
**Status:** PARTIAL. Task 0 DONE 2026-10-16: four `-latest` artifacts from run 38881438378, summarised in `outbox/cc-session-2026-10-16-empowerment-task0.md`; Tasks 1-4 not started.

---

## Why this document leads with probes

Four "empowerment" metrics were specified as F# domain types. **Three of the
four can still be killed by what the payload does not carry**, and one of those
three is already known to answer empty in both states anyone has measured. Types
written before the probes run would be types for data that does not exist.

The original spec named `src/Field.Laboratory/EmpowermentEngine.fs`. **That path
does not exist.** This repo's `src/` is flat: `Verify.fs`, `Units.fs`, `Desk.fs`,
`Scoreboard.fs`, `Program.fs`, `VerifyMain.fs`. Nothing defines `TeamState`,
`SpatialGravity` or `DefenseState`. Any claim that "the completed type signatures
map exactly" to these rules describes something not in the tree.

**Do not use `read_source` against this repo.** It returns `total_count: 0` for
every query — "module" and "sentinel" both answer 0 while `read_file` returns a
README containing "sentinel" a dozen times. Its negatives are false and are
indistinguishable from real absence. Use `read_file`, or ripgrep over a clone.

---

## The defect all four shared, and the fix

Every metric as originally specified **defined a positive state as the absence of
a negative**: no opponent interruption, no late decline, no opponent xG. An
absence-defined state cannot be distinguished from nothing happening. That is the
`a check that passes in one direction` row in this repo's own README, and it is
the half of FIELD's failure modes that no type system catches for you.

**The fix in every case is a denominator** — measure against what should have
happened, not against zero. Each task below carries its denominator explicitly.

---

## Homing: each metric goes where its data actually lives

The original brief mixed xG, "meters", and "time-on-ice" across one spec. Those
belong to three different sports and three different data surfaces. Verified:

| metric | sport | surface | status |
|---|---|---|---|
| Flow | soccer | BSD xG / shot events | Task 0.1 |
| Tactical Lock | soccer | BSD xG + territory | Task 0.4 |
| Second Wind | **NHL** | `api.nhle.com` shift charts | **already proven** |
| Gravity Well | **NFL** | BDB tracking (off-ball XY) | Task 0.2 |

---

# TASK 0 — four probes, each with a stop condition

Run all four before writing a single type. Each writes a probe artifact to
`outbox/` named `-latest` (this tree's convention — **not** a timestamp; a
timestamped name forced a 45 MB tarball pull for a 1 KB file once already).

## 0.1 — Flow: is "consecutive xG without interruption" reconstructible?

Read what `/context/date` and the BSD shot payload actually serve. The question
is not whether xG values exist, it is whether the payload preserves **event
order and possession attribution** well enough to say three xG events were
consecutive and uninterrupted.

**Stop condition:** if shots carry no within-match ordering key, or carry no
opponent-event interleaving, Flow cannot be reconstructed from this payload and
the task stops with that finding written down. Do not substitute wall-clock
timestamps for possession order without proving they order correctly — the `gml`
axis lesson is that a declared field can be false while a derived one is correct.

> **RESOLVED 2026-10-15 — REJECTED for soccer, locked.** `average_positions` is
> populated in captures (the empty surface was the live route, not the data),
> and it is still a **match-long mean, one coordinate per player**.
> Instantaneous gravity is not derivable from it. Build the off-ball concept on
> **NFL BDB tracking**. Do not revisit for soccer without a new data source.

## 0.2 — Gravity Well: off-ball XY, or on-ball only?

**Decision constraint is data availability.** Determine whether the vendor API
provides off-ball XY coordinates for players not involved in the event.

Known already, from `field-relay-nba/outbox/cc-session-2026-10-10-bsd-coordinate-frames.md`,
measured against a live capture:

- Soccer carries **on-ball** geometry: shot origin `pos {7.3, 48}`, keeper
  `gk {5.4, 48.4}`, per-team axes, four distinct frames across five payload paths.
- The average-position surface answers `empty=true` in **both** states exercised:
  `X-AvgPos-State=finished-no-data` and `X-AvgPos-State=in-play`.
- **The declared axis is false; the transform printed below it is correct.**
- Coordinates are **0-100 normalized, not meters.**

**Stop condition:** if soccer provides on-ball data only, **flag Gravity Well
rejected for soccer** and build it for NFL instead, where BDB tracking already
supports separation and route entropy. Do not fabricate off-ball position from
average positions — an aggregate of where a player tends to be is not where he
was.

**`>4.0 meters` is not computable** from 0-100 normalized coordinates without
per-stadium pitch dimensions. Either source pitch dimensions or express the
threshold in pitch-normalized units. `src/Units.fs` exists because this exact
0-100 scale confusion already caused a production bug.

## 0.3 — Second Wind: shift lengths per player

**Decision constraint is shift tracking.** This one is **already answered for
NHL** and the probe is confirmation, not discovery.

`CC-CMD-2026-10-11-nhl-shift-charts-on-ice.md` records
`https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=2026020053`
returning **HTTP 200**, JSON, **one row per shift** with `startTime`, `endTime`,
`period`, `shiftNumber`, `teamAbbrev`, per player. 692 of 692 shifts verified,
clock counting up. Artifact: `outbox/nhl-shiftcharts-probe-latest.json`, run
38119484420.

Note the allow-list trap recorded there: `/stats/rest/en/shiftcharts` is the
working form; the documented `/nhl-stats/shiftcharts` is refused.

> **CC, 2026-10-16 — stale since 2026-10-11.** field-relay-nba commit
> `bf284b0` ("fix: /nhl-stats/shiftcharts reaches the path its own document
> promises", 2026-10-11) made the documented relay form work. That repo's
> `outbox/live-route-probe-latest.json` (probed 20261011T073330Z) records
> `/nhl-stats/shiftcharts?cayenneExp=gameId=2026020053&final=1` answering 200
> with 692 rows and `X-NhlStats-State: vendor`, and a path outside the
> allow-list refused 403. Not re-probed today. Task 3 bypasses the relay
> either way: it reads `api.nhle.com/stats/rest/en/shiftcharts` directly, the
> route Task 0 proved in run 38881438378.

**Confirm instead:** that the interval join from shift to event is sound, and
reuse the four states that work already defined — `resolved`,
`disagrees-with-situation`, `no-shift-data`, `instant-in-no-interval`. Do not
invent a parallel absence vocabulary.

**Stop condition:** if the interval join cannot resolve a majority of events,
stop. That document's own warning applies directly — attaching 1% to an
arbitrary play is **worse than an error**, because it looks like an answer.

## 0.4 — Tactical Lock: rolling window over active play

**Decision constraint is temporal grouping.** Confirm opponent xG events can be
isolated over a rolling 4-minute **active-play** window — stoppages excluded, or
the window silently counts dead time as suppression.

Also establish the **territory denominator** (Task 2): opponent final-third
entries, box entries, or possession share within the same window. Without it the
metric has no denominator and Task 2 cannot be built.

**Stop condition:** if no territory proxy exists in the payload, Tactical Lock
reduces to "the opponent did not shoot," which is not a lock, and the task stops.

---

---

# Task 0 outcome — 2026-10-15

All four probes run. Full results in `docs/TASK0-RESULTS-2026-10-15-empowerment-metrics.md`;
frame work in `docs/BSD-FRAME-DIAGNOSTIC-2026-10-15.md`.

| task | gate | outcome |
|---|---|---|
| 1 Flow | reconstructible? | **CLEAR** — `shotmap[].xg` on 34/34, ordered by `min`/`added`, team by `home` |
| 2 Tactical Lock | window + territory | **CLEAR** — `xg_per_minute` (cumulative) + `momentum` |
| 3 Second Wind | shift lengths | **CLEAR** — NHL shift charts |
| 4 Gravity Well | off-ball XY | **REJECTED** for soccer; NFL BDB |

**Field names are `min` and `home`, not `minute` and `is_home`.** Querying the
latter returns a clean false negative on all 34 shots.

## The R2 constraint — accepted

> **CC, 2026-10-16 — the measured premise under this ruling.** The ruling
> stands; two facts it rests on do not. (1) R2 does not hold wc26 only: a full
> walk finds **887 events in 10 competitions** (bundesliga, eflchamp, epl,
> europa, laliga, ligue1, mls, seriea, ucl, wc26), uploads 2026-06-25 to
> 2026-10-15. `/bsd/r2/list` with no prefix answers from `bsd/wc26/`, which is
> why a first page showed only wc26. (2) Only **47 of 786** non-shell captures
> are of a finished match; 734 were taken while the second half was live,
> because the club writer fires from minute 80 and drops finished events. So
> "post-hoc over finished matches" is post-hoc over records that mostly stop
> before full time. Source: `outbox/empowerment-flow-probe-latest.json`
> (`r2_census`, `r2_list_mechanism`, `capture_stage`), run 38881438378.

R2 holds `wc26` only, 2026-06-25 to 2026-07-19. **Build `InFlow` and `LockedOn`
as post-hoc states over finished matches.** This disposes of the amnesty
question by construction — a finished match is the amnesty zone — but the
accessibility amendment above still applies in full.

> **CC, 2026-10-16.** For `InFlow`, Task 1 ruling 4 replaces the
> finished-only reading of this sentence (47 of 786 captures record full
> time) with all 786. `InFlow`'s amnesty position is ruled under Task 1
> (2026-10-16, by delegation): an `AmnestyZone` witness, plus the non-text
> rule.

A live capture path for current fixtures is filed separately as a prerequisite
for any live rendering. **Do not build toward live in this CC-CMD.**

## The frame finding — binding on Tasks 1, 2 and 4

Measured over 8 matches, 189 shots, 11 goals, both teams:

- `shotmap[].pos` — contract **holds** (both sides cluster low, med ~14).
- `shotmap[].gm.x` — contract **holds** (189/189 zero).
- `incidents[].sequence[].pos` — contract is **wrong**. It is a shared absolute
  pitch frame (home med 87.8, away med 4.6), not per-team target-goal-relative.

These two frames **share a key name and a shape**. Mixing them silently mirrors
the away team — no error, a plausible wrong answer. Carry the frame in the type.

**`goal_type: "ownGoal"` is a frame discontinuity** and needs its own case: the
sequence records the attacking move while `is_home` marks the credited team, and
on an own goal those are opposite sides.

---

# TASK 1 — Flow State (gated on 0.1)

```fsharp
type TeamState =
    | Disjointed
    | InFlow of sequentialXg: float32<xg>
```

~~Three consecutive positive xG events with no opponent event interleaved.~~

**Ruled 2026-10-16 (owner):** asked "should Task 1 adopt the shots-only
version of Flow?", the owner answered "Yes".

> **CC, 2026-10-16 — what the ruling rests on, from Task 0's final run**
> (38881438378, `outbox/empowerment-flow-probe-latest.json`). Every figure
> below, except where marked as over all 786, is over the sample the probe
> read: `stats.json` for 150 of 786 non-shell captures, the newest 15 per
> competition, 11 of them finished.
>
> - **The shots-only version.** `docs/TASK0-RESULTS-2026-10-15-empowerment-metrics.md`
>   states it as "three consecutive own-team shots with no opposing shot
>   between them", derived from a quotation of the struck line that omits
>   "positive", so it never considered that clause; the ruling does not say
>   whether it carries over. The artifact's `narrowed_variant.definition` adds
>   "never across a period break": a constraint the probe applied, not part
>   of the ruling.
> - **What it gives up.** The stop condition as written was NOT MET
>   (`verdict.readings.as_written`): both teams shot in 150 of 150 captures,
>   and a timed opponent incident (card, goal, substitution, VAR decision)
>   falls strictly between the minutes of two same-team shots in 310 pairs.
>   Under shots-only those incidents do not interrupt a run. The 310 pairs
>   shots with no break at a period, so it is an upper bound: pairs that
>   straddle half time are in it, and were not counted apart. No run count was
>   made with them as interruptions. The probe's own reason calls Flow
>   reconstructible "only as the shots-only narrowing"; what is certain is
>   narrower: no incident with a minute and a team is a possession event
>   (`verdict.readings.possession_level`).
> - **What it cannot see.** A shot's `sit` can say `fast-break`. In 171 of 2422
>   same-team adjacent pairs, as the probe pairs them (array order inside a
>   minute, no break at a period), the second shot does. Across minutes that
>   implies the opponent had the ball between the two shots; inside a minute
>   the probe's "second" shot is the earlier one (the array is newest-first),
>   so it implies nothing, and the 171 mixes both. An indication, not a figure
>   to build on. TASK0-RESULTS (chat) asks that `InFlow` not be read as "this team
>   controlled the game" and that the narrowing be named in the type's doc
>   comment.
> - **Measured.** 535 to 556 runs of 3+ own-team shots, depending on how the 62
>   mixed-team minutes are ordered; the probe counted shots of any xG value and
>   ended runs at every period break (158 breaks: half time and the
>   extra-time boundaries). `xg` is a number on 4125 of 4125 shots, 13 of them
>   `xg_estimated: true`; how many are above zero was not measured. The array
>   is newest-first in all 150 captures and agreed with a goal's build-up in 35
>   of 36 checks. Over all 786 non-shell captures (incidents read
>   for 784): 734 stop in play, 47 are of a finished match.

**Ruled 2026-10-16 (owner), the four questions the shots-only ruling left
open, verbatim:**

1. **Minute Ambiguity:** Break the run. If both teams shoot in the same
   minute, chronological certainty is lost. A mathematically ambiguous state
   cannot sustain Flow.
2. **Period Breaks:** Break the run at half-time and extra-time. Flow is a
   physical state that does not survive a 15-minute locker room pause.
3. **0-xG & Estimates:** Skip 0-xG own shots (they do not reset the
   counter). Count the 13 estimated values.
4. **Match State:** Use all 786 captures. Flow is an instantaneous state; a
   match does not need to be finished for a team to achieve it in the 30th
   minute.

> **CC, 2026-10-16 — what these rulings change.**
>
> - **The run count.** 535-556 was counted over 150 of 786 captures, over
>   shots of any xG, with each mixed-team minute tried in every order. Ruling
>   1 makes those minutes breaks, ruling 3 drops 0-xG own shots (how many
>   there are was not measured), and ruling 4 widens the set to all 786. The
>   range no longer applies, and no count was made under the rulings. "The
>   13 estimated values" are the 13 in the 150 read. Over 786, neither the
>   estimated count nor `xg` coverage was measured; Task 1 measures both
>   first, and a shot with no `xg` number, if any exists, goes to the owner
>   before a run treats it either way.
> - **Ruling 2.** The probe ended runs at 46', 91' and 106' (half time, into
>   extra time, and extra time's own interval): 158 breaks. Ruling 2 names
>   half time and extra time; it does not name the 106' interval, listed
>   below. It answers the "never across a period break" point above, and
>   ruling 3 answers the "positive xG" point.
> - **Ruling 4** supersedes "over finished matches" in the R2 section for
>   `InFlow`. That section's "Do not build toward live" is not addressed by
>   it and stands.
> - **Ruling 4 and the amnesty zone, facts only.** 734 of the 786 captures
>   stop in play; 47 record full time. `amnestyZone` returns its witness for
>   any `Final` `GameState`. Nothing in `src/` builds a `GameState` from a
>   BSD soccer capture. The 2026-10-15 ADR-002 ruling below conditions on
>   non-text encodings and names no game state.

**Ruled 2026-10-16 (owner), by delegation.** CC asked the two questions
below, as written here; the owner answered "Go with Claude's best
recommendations". CC's recommendations, each argued against by a reviewer
before being recorded, are the ruling.

1. *Asked:* "Does a run also break at extra time's own interval
   (105'/106')? The probe broke there; rulings 1 and 2 settle every other
   boundary."

   **Yes.** A run never crosses a period boundary: 45'/46', 90'/91' or
   105'/106'. Grounds: ruling 2 is about period breaks, and the owner
   applied it to the extra-time boundary as well as half time. Not grounds:
   the probe's 158 breaks (they count a rule the probe applied and are not
   split by boundary) and ruling 1 (the order at 105'/106' is not
   ambiguous). Task 1 reports its breaks per boundary, and checks that BSD
   encodes stoppage in the first half of extra time as `min` 105 plus
   `added`, as it does at 45' and 90', before relying on 106 as the
   boundary.

2. *Asked:* "What gates `InFlow`'s render? (a) Nothing beyond the
   2026-10-15 non-text ruling; (b) the match being over at render time; or
   (c) the capture recording full time, 47 of 786."

   **(b), plus the 2026-10-15 non-text rule.** Of the three it is the most
   restrictive option that still lets ruling 4's 786 captures render after
   the match. (a) would leave "Do not build toward live" enforced by prose
   while 734 captures stop in play; (c) would cut the render to 47 and undo
   ruling 4. CC implements (b) as this repo's `AmnestyZone` witness. Nothing
   in `src/` builds a `GameState` from a BSD capture, so Task 1 obtains the
   witness under these constraints:
   - From a full-time period incident in the capture (47 of 786), or from
     the match's kickoff FIELD day being at least two days before today's,
     so that a whole Eastern day has passed since the kickoff day ended. A
     kickoff day merely before today's is not enough: a match that kicks off
     late on Eastern day D is still in play after midnight. The kickoff day
     is taken from the kickoff, never from the upload's UTC date. Measure
     that every capture carries a kickoff time before relying on this route.
   - Never by putting a capture's score into `Final` when the capture stops
     in play: for 734 of 786 captures that score is not known to be the
     final one.
   - If this needs a second way to obtain the witness in `Desk.fs`,
     `docs/AMNESTY-PROOF.md` is revised in the same commit. It gains a
     compile-checked case proving the witness cannot be built except through
     that function, and a runtime check, made to fail on purpose (Rule 90),
     that a capture whose match is not over at render time gets no witness.

   The 2026-10-15 ruling's text names no game state. Here the witness
   enforces this CC-CMD's own scope, "Do not build toward live"; the
   live-capture CC-CMD is where it is revisited.

> **CC, 2026-10-16 — the premises, measured over every capture before any
> type was built (lab Rule 100).** field-relay-nba
> `scripts/empowerment-premises.mjs`; every figure below is from ONE run,
> 38963130231 (artifact `outbox/empowerment-premises-latest.json` there at
> relay commit `e09b74e`): 789 non-shell captures read whole, 786 of them
> uploaded by Task 0's census time.
>
> - **xG.** A number on 20,932 of 21,055 shotmap rows. 123 rows carry
>   `xg: null`, in 9 captures; 5 of the 123 are own-goal rows. **No row has
>   `xg` 0**, so ruling 3's skip has nothing to act on in today's store; it is
>   built and tested anyway. 496 rows are `xg_estimated`, not 13 (the 13 were
>   the 150-capture sample).
> - **Stoppage encoding.** `min` plus `added` at 45 (686 shots), 90 (777),
>   **105 (8)** and 120 (13), and nowhere else; no shot past 90' in a capture
>   without an extra-time marker. So 105+N is BSD's encoding at extra time's
>   interval, as at 45 and 90, and 106 is a sound boundary (delegated ruling 1's
>   condition, met).
> - **Period markers, by set.** HT + Second half (live) 736; FT + HT 30;
>   Extra time (live) + FT + HT 14; ET + FT + HT 2; ET + FT + HT + PEN 1;
>   HT + Second half (not live) 3; First half (live) 1; none 2. **FT at 90' sits
>   beside an extra-time marker in all 17 extra-time captures**, at a level score
>   in 14: BSD writes full time at 90' before extra time as well.
> - **Kickoff.** Every capture carries `event_id` (stats.json 789 of 789,
>   incidents.json 787 of 787 that have one), and every capture's BSD event row
>   carries `event_date` (789 of 789 joined; 968 rows fetched for ten league
>   ids). Ruling 2(b)'s condition, "measure that every capture carries a kickoff
>   time before relying on this route", is met through the capture's own
>   `event_id`.
> - **Own goals.** 74 own-goal incidents; the shotmap books 70 of them as a
>   goal row on the credited side (`gtype` "own", 73 rows in all), 0 on the
>   other side.
> - **Shootout kicks.** 8 rows with `sit` "shootout", at minutes 122-129 of the
>   one capture that reached a shootout.
> - **Shared minutes.** 308, in 260 captures (counted over every row, own goals
>   and unread captures included, so the census's count will differ).
>
> **CC, 2026-10-16 — what was built, and the decisions the measurements and
> one adversarial review forced (taken by delegation, "Go with Claude's best
> recommendations"; each is listed again in the session doc for the owner).**
>
> - `src/Flow.fs`: `decodeCapture`, `readingAt`, `witnessAfterKickoff`,
>   `ariaLabel`, `pulseStyle`, `flowCensus`; `xg` in `src/Units.fs`. Shots-only
>   Flow as ruled, never across 45'/46', 90'/91' or 105'/106'; a run still
>   open after the last shot ends at its period's boundary.
> - **The verdict never leaves `Flow` as a value.** `TeamState` is a private
>   type and `readingAt` carries no state; the verdict reaches a page only
>   through `ariaLabel` and `pulseStyle`, which demand the witness. A first
>   version exposed the state as an opaque value; the review showed Thoth's
>   auto encoder, Fable reflection and boxed equality all read it.
> - **The witness is Flow's own (`Finished`) and holds its capture**, so a
>   witness for one match cannot label another. **Its one route is the
>   kickoff**: the capture's own event row, two FIELD days after kickoff,
>   through a new `Desk.amnestyZoneAfterKickoff` that takes no score. A
>   full-time route (ruling 2(b)'s first option) was built and then removed:
>   because FT is written at 90' before extra time too, a knockout match
>   captured in that break carries exactly the "regulation finish" shape while
>   still in play, and its score would have gone into `Final`.
> - **A capture's two files must name one event**: an incidents file whose
>   `event_id` differs from the stats file's is ignored and counted.
> - **Own-goal rows and shootout kicks are set aside**, counted, and seen by
>   no run: an own goal is booked to a team that did not shoot it, and a
>   shootout kick is not a shot in the match. Neither ruling covers them; the
>   frame finding above already said an own goal "needs its own case".
> - **A shot with no `xg` number leaves its whole capture unread**, and the
>   census lists those captures by slug and id. That is this section's own
>   instruction ("goes to the owner before a run treats it either way"), and
>   it is the open owner question: how should a run treat such a shot?
> - Proofs: `docs/FLOW-PROOF.md` (5 cases) and the "Flow" section of
>   `docs/AMNESTY-PROOF.md` (5 cases, plus what no type here can stop: a
>   made-up event row or clock, and reflection). 41 Suite rows; 18 mutations.
> - Nothing renders `InFlow`: no tab, no DOM node. The witness requirement is
>   inherited by whoever builds one.

From the original task (the R2 section above rules `InFlow` post-hoc, not
live):

- The value is a unit-carrying quantity, not a bare `float32`.
- `InFlow` is a **live composite verdict**, so see the amnesty section below
  before rendering it.

---

# TASK 2 — Tactical Lock (gated on 0.4)

**Approved design.** Suppression is meaningless without opportunity:

| opponent territory | opponent xG | state |
|---|---|---|
| low | low | `Quiet` |
| low | high | conceding on the break |
| **high** | **low** | `LockedOn` |
| high | high | under siege |

```fsharp
type DefenseState =
    | Searching
    | Quiet
    | LockedOn of suppressed: float32<xg> * bestChanceAllowed: float32<xg>
```

`Quiet` is the sibling the original spec collapsed into `LockedOn` — Rule 99:
absence must be a sibling of the value.

**`LockedOn` carries its counterexample.** Following `Verify.create`, which takes
a counterexample as its fourth argument: the constructor takes the opponent's
**best chance during the window** and must be private, refusing to build when
that chance exceeds threshold. A lock cannot be minted without showing what it
suppressed.

The original `d(xG)/dt = 0` trigger is **dropped**. xG is a step function over
discrete shot events, so the derivative is exactly zero almost everywhere by
construction; the trigger fired on most of most matches and meant nothing. It
also tested exact equality on `float32`.

## Build constraints from Task 0's final run (38881438378)

Measured 2026-10-16, recorded in
`outbox/cc-session-2026-10-16-empowerment-task0.md`. Carried here because
whoever builds Task 2 reads this task, not the outbox.

**`momentum` is a territory proxy — at HALF grain.** With each half's shot and
xG difference partialled out, its half mean tracks final-third entries
r **0.584** (t 12.3) and possession share r **0.735** (t 18.6) over **298
halves**. It is not an echo of the shotmap: 571 shot-free stretches, excess
direction changes 35.1%.

**Its minute values are validated only in aggregate.** The correlations above
are between half means and half totals. Nothing established that a single
minute's `v` means territory in that minute, and `LockedOn` is a
window-level verdict. **Do not read one minute's momentum as that minute's
territory** without measuring it first.

**The active-play window is UNMEASURED below the minute.** The spec says
stoppages must be excluded or dead time counts as suppression. The feed carries
**six incident types** — substitution, card, goal, period, injuryTime,
varDecision — and **none of them is a throw-in, goal kick, or uncarded foul**.
Nothing in the payload carries a clock below the minute. So a 4-minute window
cannot be restricted to active play with what exists.

That is a **distinct outcome from `Quiet`**, and it must not collapse into it.
A window that cannot be measured is not a window in which nothing happened. If
the build cannot exclude dead time, give it a case of its own — the same move
`Quiet` itself was for.

**Two alignment facts the window arithmetic must respect:**

- Momentum agrees with the shooting team most strongly at the row **one minute
  AFTER** the shot. A window joined on the shot minute is off by one against
  the quantity it is correlating with.
- **Added time has one momentum row for the whole added period.** A rolling
  4-minute window spanning added time is not spanning four minutes of it.

> **CC, 2026-10-16 — Task 2 built. No real window can construct a lock.**
>
> - **Built.** `src/TacticalLock.fs` holds the following:
>   - `DefenseState`, private: `Searching | Quiet | LockedOn of suppressed *
>     bestChanceAllowed | ActivePlayUnmeasured | ChanceUnmeasured`.
>   - One lock constructor. It takes the opponent's best chance and refuses
>     when either xG bar is exceeded.
>   - `Bars`, behind a smart constructor.
>   - The shape encoding and the accessible name, both behind
>     `Desk.AmnestyZone`.
>   - `lockWindows`, which counts one capture's windows by classifying them.
>
>   Proofs: `docs/LOCK-PROOF.md` (5 cases) and a Tactical Lock section in
>   `docs/AMNESTY-PROOF.md` (4 cases). The Suite gains 15 checks, and
>   `scripts/mutation-check.mjs` gains 8 mutations.
> - **The premise, over every capture.** This replaces Task 0's 150-capture
>   sample for Task 2. Source: field-relay-nba run 38962367310,
>   `outbox/empowerment-premises-latest.json`, key `soccer.T`. It read
>   stats.json for 788 of 788 non-shell captures and incidents.json for 786.
>   - **Clocks.** The only key finer than the minute is `period_second`, on 66
>     incident objects; which incident types carry it was not recorded. No shot
>     carries a clock finer than `min`/`added`.
>   - **Incident types.** period 1589, card 2830, goal 2378, injuryTime 1298,
>     substitution 7240, varDecision 220. None is a throw-in, goal kick or foul.
>   - **Restarts.** They appear only in goals' `sequence[]`: throw-in 64 and
>     free-kick 2, of 8166 events. None of the 8166 carries a time key.
> - **The result.** No stoppage can be placed on a clock, so every window
>   keeps its dead time and classifies as `ActivePlayUnmeasured`. `LockedOn`
>   has no real window to stand on, and neither do `Quiet` or `Searching`.
>   Under done condition 2 that is a measured result, not a gap.
> - **Section 0.4's territory denominator.** There is none at window grain
>   either. Final-third entries and possession are reported per half or per
>   match, and `momentum` is validated at half grain only. The module header
>   reconciles this with "Task 2 cannot be built" in three ways:
>   - `ActivePlayOnly` evidence is a test seam. It lets the table and the
>     private constructor be tested (done condition 5).
>   - `Territory` is a judgement handed in, never read from momentum.
>   - The bars are uncalibrated to any window length. No production value
>     ships.
> - **Delegated decision F: the accessible name.** It names the numbers for
>   what they are: "LockedOn state active, opponent xG 0.09, opponent best
>   chance xG 0.05". The type keeps the spec's field names. **Owner
>   question:** what does `suppressed` mean? Either the xG the opponent was
>   held to, which is what the code stores (their summed window xG), or an
>   amount taken away from an expected level, which needs an expected-xG
>   model that nothing here measures.
> - **Delegated decision G: territory**, as above. Two further choices sit
>   with it:
>   - An xG that is not a finite number at or above zero is its own case,
>     `ChanceUnmeasured`. The same premise pass found `xg` null on 123 of
>     21020 shots (`soccer.P1`).
>   - Both high-xG cells of the table are `Searching`.
> - **The gate.** Classifying is not gated: a census may compute a verdict
>   for every capture. Drawing and naming a state require the witness. Where
>   the witness came from is not compiler-checked.
> - **Reopening the window** needs sub-minute clocks and typed restarts.
>   `docs/CC-CMD-2026-10-16-bsd-ws-frame-shape.md` now asks the WebSocket
>   frames for both (its done condition 5).

---

# TASK 3 — Second Wind (gated on 0.3)

**The biological claim is dropped.** No biometric input exists anywhere in this
pipeline, and "elite biological conditioning" inferred from WP deltas is the
`a claim that outruns its evidence` row in this repo's README. Nothing in the
type, the docs, or the UI copy may assert conditioning, fitness or biology.

```fsharp
type Stamina =
    private
    | Insufficient of events: int
    | PopulationRate of Evidence
    | TrailingRate of Evidence      // was `Fatiguing` — renamed, ruled 2026-10-16
    | SecondWind of Evidence
```

**Ruled 2026-10-16 (owner), both questions the build raised:**

1. **`PopulationRate` is retained** as the fourth union case. The population
   was measured **flat**, so below / at / above baseline are three real
   readings. Without the middle case a player performing exactly as expected
   is forced into one of the outer two, neither of which is true — absence
   collapsing in the verdict layer of a module built to prevent it.

2. **`Fatiguing` is renamed `TrailingRate`**, "to keep biological and
   conditioning terms out of the `aria-label` and UI copy." That resolves the
   contradiction this document carried: the accessibility amendment asks for
   "state name plus the number that produced it", while this task bans any UI
   copy asserting conditioning or biology. `Fatiguing` sat on both sides.
   The rename removes the conflict rather than weakening either rule.

**Still open, flagged not resolved.** `SecondWind` is itself a physiological
term — literally a term for recovered breathing under exertion — and it now
sits beside `Insufficient`, `PopulationRate` and `TrailingRate`, three neutral
names. `SecondWind state active` in an `aria-label` makes the same kind of
claim `Fatiguing` was renamed to avoid, and it is the *positive* verdict, so
it is the one most likely to be read aloud about a named player. The symmetric
name is `LeadingRate`. **Not renamed here**: the ruling named one case, and
the feature is called Second Wind in product language, which may be the
intent. Owner's call.

**Two denominators, both required:**

1. **Within-player.** Late-window contribution against *that player's own*
   early-match baseline. Paired and self-referential, which removes the
   between-player confounders for free.
2. **Against the population baseline.** ~~Most players decline late, so flat is
   not the null.~~ **REFUTED by measurement, 2026-10-16.** Over 328 games and
   11,807 skater-games the last/first attempt ratio is **1.06 / 1.00 / 1.04**
   by ice-time band, and by decile 1.11, 1.02, 0.96, 1.00, 1.00, 1.02, 0.98,
   1.09, 0.98, 1.06 — flat to slightly rising. The requirement stands **only
   because each band's expected last-third share is measured** (0.514, 0.499,
   0.509), never assumed. The structure was right; the assumed value for it was
   wrong. A player dropping 5% where the league drops 20% has a second
   wind; one holding flat against a flat baseline has nothing.

`Insufficient` is a **sibling case, not a silent fall-through to `Fatiguing`**
(Rule 99, DISTINGUISHABILITY-A — absence must be a sibling of the value). One
late event is not a second wind, and must not render as its opposite either.

That is the structural half. The reporting half is **SAMPLE-COVERAGE-A**
(`field-relay-nba/CLAUDE.md`): print `checked N of M`. Widening the type and
leaving the printed result silent satisfies neither.

The 45-second trigger is **dropped** — that is one shift, not a fatigue
threshold. Use accumulated TOI from the shift charts.

## Build constraints from Task 0's final run (38881438378)

Measured 2026-10-16 over 16 of 32 finals, games of 2026-10-13 to 10-15.

**The join resolves, and the pooled number hides two classes that do not.**
4023/4271 actor plays resolve with the actor on ice (**94.2%**); the same join
with its clock moved 600 s inside the same period confirms **20.5%**, so the
rate is real and not a chance artifact.

**But the 94.2% is a pool.** Broken out:

| play type | confirmed |
|---|---|
| goals | **23 / 101** |
| penalties | **0 / 133** |

**Task 3 must not credit either through `onIceAt` membership as it stands.**
The scorer's shift ends on the goal second and the interval is end-exclusive,
so the scorer is routinely *not* on ice at his own goal. Penalties resolve at
zero, which is a different failure again and is not explained by the same
mechanism.

A metric about high-leverage contribution that silently drops 78 of 101 goals
is measuring something other than what it says. **Either fix the boundary for
these classes and show the fix moves the number, or exclude them explicitly and
name the exclusion in the type** — **SAMPLE-COVERAGE-A**
(`field-relay-nba/CLAUDE.md`), whose remedy is to print the denominator, with
the `Insufficient` principle above applied to coverage rather than sample size.

**Citation note.** Three rule registries diverge above 88 and STANDARDS.md says
to cite SAMPLE-COVERAGE-A by tag and file, never as a bare "Rule 91" — in this
repo's own STANDARDS.md, Rule 91 is SCOPE-LEGIBLE-A, a different rule.

**`onIceAt` has no period filter.** Actor plays on a period-end second are
counted without one. Establish what that does to the rate before relying on it.

**Source:** `api.nhle.com/stats/rest/en/shiftcharts`. The documented form
`/nhl-stats/shiftcharts` is refused by the allow-list — use the working one.

> **CC, 2026-10-16 — the refusal above is stale.** field-relay-nba commit
> `bf284b0` made `/nhl-stats/shiftcharts` work on 2026-10-11; see the CC note
> under Task 0.3. The source line stands: Task 3 reads the vendor host directly.

> **CC, 2026-10-16 — Task 3 as built, and what the premises said first.**
> Module `src/Stamina.fs`; checks in the Suite's "Second Wind" group; compile
> proofs in `docs/STAMINA-PROOF.md` and the Second Wind section of
> `docs/AMNESTY-PROOF.md`; session record `outbox/second-wind-2026-10-16.md`.
>
> - **The premises, measured before the types.** field-relay-nba run
>   38962367310, its `outbox/empowerment-premises-latest.json` key `nhl`
>   (run 38963130231 reproduced that key with identical values). 2025-26 regular
>   season, ids 2025020001+4k, k = 0..327: 328 of 328 play-by-play and 328 of
>   328 shift charts read; `gameState` OFF on all 328, `gameType` 2 on all 328.
>   13118 roster spots, 0 without `positionCode` (G 1311). Attempts: goal
>   2102, shot-on-goal 16298, missed 9872, blocked 10071; 0 without a credited
>   key, 0 without a clock, 737 beyond regulation (period 4 or later), 5
>   credited to a goalie, 0 to a non-roster id, 0 to a skater with no
>   regulation shift. Penalties 2429, 71 without `committedByPlayerId`. Shift
>   charts: 0 total-against-rows mismatches, 0 games without rows, typeCode
>   517 on 247474 rows and 505 on 2125, 0 unreadable 517 times, 0 ending
>   before they start, 0 of zero length, 0 from another game, 2316 shifts in
>   period 4 or later. Regulation ice per skater-game (11807): p5 543 s, p10
>   631, p25 800, p50 989, p75 1173, p90 1334, p95 1431.
> - **A premise this task states is refuted under this measure.** "Most
>   players decline late, so flat is not the null" is not what individual shot
>   attempts show. Thirds of each skater's own regulation ice (first: 3τ < T;
>   last: 3τ >= 2T), credited attempts in periods 1-3, skaters only: under
>   720 s, 1971 skater-games, first third 1061, last 1122; 720-1079 s, 5505,
>   5308 and 5286; 1080 s and over, 4331, 5791 and 5999. By ice-time decile the
>   last/first ratio runs 1.11, 1.02, 0.96, 1.00, 1.00, 1.02, 0.98, 1.09, 0.98,
>   1.06. The population does not decline under this measure; it is flat to
>   slightly rising. The metric still works, because each band's expected
>   last-third share is measured, not assumed (0.514, 0.499 and 0.509 for these
>   counts, read through `staminaBands`). The Suite's "declining" curves are
>   test inputs and are not described as typical. The sentence "a player
>   dropping 5% where the league drops 20% has a second wind" describes a
>   population this season did not produce.
> - **Goals and penalties.** Attempts are credited by name: `scoringPlayerId`
>   for a goal, `shootingPlayerId` for a shot on goal, a missed shot and a
>   blocked shot. Nothing is credited through on-ice membership, so the 23/101
>   goal failure cannot arise and every goal counts. Penalties are excluded by
>   name: they are not in `AttemptKind`, and every call is counted as
>   `PenaltiesNotCredited`. The boundary these build constraints describe is
>   measured rather than relied on: `staminaCoverage` counts named credit
>   against the credited player's own shifts under [a,b), under (a,b] and in no
>   interval, with a same-period guard `onIceAt` lacks and the +600 s control,
>   per class (goals, other attempts, penalties). The population script
>   reports it; it gates the integrity of named credit for non-goal attempts.
> - **A fourth case, `PopulationRate`.** The type above has three cases. An
>   exact binomial test on the skater's own split has three outcomes at every
>   n, and "one holding flat against a flat baseline has nothing" is the
>   third. Folding it into `Fatiguing` would rebuild the absence-defined state
>   this document opens by naming; Rule 99 puts it beside the others. CC added
>   it; the owner may rule otherwise.
> - **`Insufficient`.** Below the fewest attempts at which BOTH verdicts are
>   reachable at 2.5% in the skater's band. For the measured shares that is 6
>   attempts in the first and last thirds together, in every band. Derived from
>   the counts above, not separately measured: about 2.1 attempts per
>   skater-game fall in those two thirds (24567 over 11807), so `Insufficient`
>   will be most readings.
> - **Question for the owner: the case word in the label.** The accessibility
>   amendment requires "state name plus the number that produced it", so the
>   one string reads, for example, `Fatiguing state active, last third 0
>   attempts against 3.6 expected`. That puts this task's own case word into UI
>   copy, against "Nothing in the type, the docs, or the UI copy may assert
>   conditioning, fitness or biology". `SecondWind` is the same kind of
>   metaphor, more weakly. No check exempts either word. A mechanical
>   alternative, ready if ruled: the label says `BelowPopulationRate`,
>   `AbovePopulationRate` and `AtPopulationRate` where it now says
>   `Fatiguing`, `SecondWind` and `PopulationRate`, and the case names stay.
> - **Filed, not built.** A denser contribution measure (on-ice CF/60):
>   `docs/CC-CMD-2026-10-16-second-wind-denser-measure.md`, an owner
>   decision. Found while building: `SealedDrama`, `DramaBar` and `SealedArc`
>   print their numbers through `%A` under Fable:
>   `docs/CC-CMD-2026-10-16-sealed-drama-string-path.md`.

---

# TASK 4 — Gravity Well (gated on 0.2)

**NFL — the off-ball concept.** Build it where BDB tracking supplies real
off-ball XY. Same concept as specified: a player drawing defenders away.

**Soccer — only if 0.2 permits, and reframed.** Gravity becomes **a property of
the chance, not of the person**. On-ball geometry (`pos` against `gk`) measures
that space existed at the moment of the chance. It cannot attribute who created
it, and must not pretend to.

**The coordinate frame goes into the type.** A bare `private SpatialGravity of
float32` is the right instinct aimed at the wrong hazard: it lets a home-axis `x`
be subtracted from an away-axis `x` and compile clean, **against data whose
declared axis is known false**. Carry the frame so that subtraction is a compile
error, and add a `docs/GRAVITY-PROOF.md` showing the rejection, matching this
repo's `*-PROOF.md` convention.

**0-100 normalized only. No fabricated meters.**

> **CC, 2026-10-16 — the NFL build uses yards, and they are not a
> normalisation.** The sentence above was written for soccer, whose BSD
> coordinates are 0-100 shares of a pitch whose size the payload does not
> carry. Big Data Bowl tracking is published in yards: the frames envelope
> states `coordinateConvention.units: "yards"` (and `frame: "offense-right"`),
> the builder verified that convention before upload (x 910/910 and 895/895,
> y 53/53 and 57/57; jubilant-bassoon `outbox/bdb-event-frames-build-latest.json`,
> run 38945906448), and the committed capture's x runs 4.41 to 123.49 and y
> 0.04 to 52.75 on a field 120 by 53.3 yards by rule. So the principle is kept
> as "native units only": a `yd` measure in `src/Units.fs`, a decoder that
> refuses any other unit by name, no meters measure, and no radius at all (the
> brief's 4.0 m is not converted). `docs/GRAVITY-PROOF.md` compiles yards
> against a bare number (FS0001) and meters having no unit (FS0039).

---

# ADR-002 / amnesty — RULED 2026-10-15, no longer blocking

`InFlow`, `LockedOn` and `SecondWind` are **live composite verdicts about a team
or player, rendered as visual encodings** — a pulsing line, a saturated node,
interlocking shields. `ADR-002-CONTEXT.md:457` puts non-text encodings in scope,
and this repo already built `SealedDrama` / `AmnestyZone` because displaying a
raw composite outside the post-game amnesty zone is a bright-line **CRITICAL**
violation.

`docs/AMNESTY-PROOF.md` records that this repo was already committing that
violation accidentally — `dramaText` ran for every card at every state, and the
output was compliant only by accident of the committed captures all being Final.

## The ruling

The owner ruled on 2026-10-15:

> RUWT PERMITTED #4 extends to derived composite verdicts about named players,
> provided the output is strictly restricted to non-text visual encodings
> (geometry, color, opacity). No narrative strings are permitted. The compliance
> block is cleared.

**The compliance block is cleared. Do not stop on it.** The earlier instruction
in this document to halt if the question was ambiguous is superseded.

## What the ruling still constrains

The clearance is conditional, and the condition is enforceable at the type level
rather than by reviewer discipline. **No narrative strings.** `InFlow`,
`LockedOn` and `SecondWind` may reach the DOM only as geometry, color or
opacity.

Build that as a boundary, not a convention: the render path for these three
takes a value that **has no string projection** — no `ToString`, no interpolation
site, no label field — so emitting one is a compile error rather than a code
review catch. `docs/AMNESTY-PROOF.md` gains cases proving the string path is
rejected. This repo's whole thesis is that a data flow cannot be grepped but can
be typed, and its own audit record already says "string-search RUWT audits are
not reliable."

## Accessibility amendment — ruled 2026-10-15

The original ruling forbade the mechanism a screen reader needs. Amended:

> `aria-label` and `sr-only` text are explicitly **permitted and required**.
> They are exempt from the "no narrative strings" rule, provided they strictly
> describe the math and state (e.g. "InFlow state active"), not vendor
> commentary.

**Required, not optional.** A node carrying one of these three states and no
accessible name is a defect, not a style choice.

The exemption is narrow and the boundary is the hard part: `aria-label` is the
one sanctioned place a string may describe these states, which makes it the one
place vendor commentary could re-enter through the back door. Keep it
mechanical — state name plus the number that produced it, generated from the
value, never hand-written per card and never adjectival. "InFlow state active,
sequential xG 0.42" is the shape. "Senegal are rampant" is the thing the whole
ADR exists to stop.

Build it as a projection the type owns: one total function from the state to its
accessible name, so there is exactly one string site per metric and a reviewer
has one place to look. That keeps the earlier "no string projection" structure
intact for every other path.

---

## Done conditions

1. Four probe artifacts in `outbox/`, `-latest` names, each stating its stop
   condition met or not met.
2. Every task that passed its probe is implemented; **every task that failed its
   probe is written down as rejected with the measured reason** — a rejected task
   is a result, not a gap.
3. `npm run check:proof` compiles every rejection the new `*-PROOF.md` docs claim.
4. `npm run gate` >= 95, every row a real command taking its score from an exit
   code.
5. Mutation-tested in both directions: loosening each new constructor drops the
   gate below 95 and exits non-zero.
6. `outbox/cc-session-2026-10-15-empowerment-metrics.md` is the **last** task
   (Rule 87, SELF-COMPLETE-A), and the README's "answer so far" section is
   updated — this repo has no `HANDOFF.md` and the README does that job.

## Constraints

- Rule 80: no credential value in any committed file, log or document.
- Rule 47: scoring and classification are client-side. These are client-side.
- Do not use `read_source` against this repo (see above).
- `src/` is writable by CC only; chat authored this document and nothing else.
- Four distinct coordinate frames exist across five payload paths. Any coordinate
  arithmetic goes through the `/bsd/contract` revision `2026-10-10-1` contract,
  never through a naive field read.
