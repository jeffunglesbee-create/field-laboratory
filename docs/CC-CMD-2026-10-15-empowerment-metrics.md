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
>
> **Open, for the owner, before Task 1 decides any of them:**
>
> 1. A run whose existence depends on the order inside a mixed-team minute
>    (it changes the count in 20 of 150 captures). `TeamState` has no case
>    for it.
> 2. Whether a run may cross a period break (half time, or into or across
>    extra time). The probe ended runs at all of them.
> 3. Whether "positive xG" carries over, and if so whether an own-team shot
>    with xG 0 ends a run or is passed over; and whether the 13 estimated xG
>    values count.
> 4. Whether Task 1 runs over all captures or only finished ones, given
>    "post-hoc over finished matches". Read literally, the standing R2 ruling
>    already gives finished-only: 47 of 786 captures, 11 of the 150 sampled.
>    The question is whether to revisit that ruling now that its premise has
>    been measured.

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

---

# TASK 3 — Second Wind (gated on 0.3)

**The biological claim is dropped.** No biometric input exists anywhere in this
pipeline, and "elite biological conditioning" inferred from WP deltas is the
`a claim that outruns its evidence` row in this repo's README. Nothing in the
type, the docs, or the UI copy may assert conditioning, fitness or biology.

```fsharp
type Stamina =
    | Insufficient of events: int
    | Fatiguing
    | SecondWind
```

**Two denominators, both required:**

1. **Within-player.** Late-window contribution against *that player's own*
   early-match baseline. Paired and self-referential, which removes the
   between-player confounders for free.
2. **Against the population decline curve.** Most players decline late, so flat
   is not the null. A player dropping 5% where the league drops 20% has a second
   wind; one holding flat against a flat baseline has nothing.

`Insufficient` is a **sibling case, not a silent fall-through to `Fatiguing`**
(Rule 91, SAMPLE-COVERAGE-A). One late event is not a second wind, and must not
render as its opposite either.

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
name the exclusion in the type** — Rule 91, and the `Insufficient` principle
above applied to coverage rather than sample size.

**`onIceAt` has no period filter.** Actor plays on a period-end second are
counted without one. Establish what that does to the rate before relying on it.

**Source:** `api.nhle.com/stats/rest/en/shiftcharts`. The documented form
`/nhl-stats/shiftcharts` is refused by the allow-list — use the working one.

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
