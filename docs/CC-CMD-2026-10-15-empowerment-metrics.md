# Claude Code Command — four empowerment metrics, probes before types

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-15, by chat, authored against HEAD and verified reads
**Confidence gate:** `npm run gate` must score >= 95 before any commit

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

# TASK 1 — Flow State (gated on 0.1)

```fsharp
type TeamState =
    | Disjointed
    | InFlow of sequentialXg: float32<xg>
```

Three consecutive positive xG events with no opponent event interleaved.

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

# ADR-002 / amnesty — settle this in Task 0, it gates three tasks

`InFlow`, `LockedOn` and `SecondWind` are **live composite verdicts about a team
or player, rendered as visual encodings** — a pulsing line, a saturated node,
interlocking shields. `ADR-002-CONTEXT.md:457` puts non-text encodings in scope,
and this repo already built `SealedDrama` / `AmnestyZone` because displaying a
raw composite outside the post-game amnesty zone is a bright-line **CRITICAL**
violation.

`docs/AMNESTY-PROOF.md` records that this repo was already committing that
violation accidentally — `dramaText` ran for every card at every state, and the
output was compliant only by accident of the committed captures all being Final.

**Determine in Task 0 whether these three need an amnesty witness**, on the same
footing as `dramaText`. If they do, each render function must demand a witness
only a legal state produces, and `docs/AMNESTY-PROOF.md` gains cases for them.

RUWT PERMITTED #4 explicitly clears win-probability *display*. It does not
obviously clear a derived composite verdict about a named player built on top of
WP. **Do not resolve this by reading the two documents as agreeing.** If it is
genuinely ambiguous, stop and say so rather than picking the permissive reading.

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
