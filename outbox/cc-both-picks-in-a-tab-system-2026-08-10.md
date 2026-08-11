# Both picks, in tabs — and they disagree with each other on purpose — 2026-08-10

Brought FIELD's two pick features into the laboratory behind a tab system, kept
strictly distinct. They are not two views of one idea. They are opposites.

| | Field's Pick | Scout's Pick |
| --- | --- | --- |
| Question | which is the marquee game? | which game would you never find? |
| Source | `bundle.pick` on `/analytics/newspaper/<date>` | boolean gates over game fields |
| National broadcast | **counts in its favour** — a live `reasons` value | **disqualifies outright** — Gate 0 |
| Output | a ranked top-5 with a composite score | one qualifier per night, no score |

That contradiction is the reason both panels open by saying what they are for
and naming the other. A page showing both without captions presents two
opposing recommendations as one opinion, and `tab-check.mjs` asserts each panel
names the other so that cannot quietly regress.

## Field's Pick — building the half production never built

Not a re-implementation. The production outbox `Field's Pick — Ranked List —
2026-07-07` shipped the relay side and closed with:

> `ranked` is now available in the relay response and stored in D1
> `analytics_output`. It is **not yet rendered anywhere** in `jubilant-bassoon`.
> A separate client-side CC-CMD is required to display the ranked list in the UI.

That CC-CMD was never dispatched. The client half has been sitting unbuilt for a
month, so this is the first thing that renders it.

### The score is sealed, and there is no amnesty this time

The live response carries `score: 3.5` beside three reasons, and `score: 3`
beside two. It is a sum over independent boolean dimensions — a composite. ADR-002
PROHIBITED #3, severity CRITICAL, is the display prohibition the 2026-07-07
push/pull re-analysis explicitly did *not* relax.

`SealedRank` is a private single-case DU: orderable via `compareRank`, never
convertible to a string. **Unlike `SealedDrama` there is deliberately no
formatter and no amnesty zone.** `formatDramaPeak` exists because ADR-002
Defense 4 grants a documented post-game exemption. No exemption is recorded for
the pick score, and inventing one to make a panel read better is exactly the
move the amnesty gate was built to stop.

Three violations compiled for real, in `docs/PICK-PROOF.md`, and re-compiled by
`proof-check.mjs` on every run (13 claimed rejections across all proof docs, all
passing):

```
sprintf "%.1f" entry.Rank
  -> FS0001: The type 'Pick.SealedRank' is not compatible with any of the types
     float,float32,System.Decimal

| Pick.SealedRank raw -> sprintf "%.1f" raw
  -> FS1093: The union cases or fields of the type 'SealedRank' are not
     accessible from this code location

ignore (Pick.SealedRank 9.9)
  -> FS1093: ... not accessible from this code location
```

And because a type seal only governs the F# path, `tab-check.mjs` independently
asserts in a real browser that the string `3.5` appears nowhere in
`document.body`. Two checks, because either alone is satisfiable while wrong.

The **reasons** render in full. Each is a single-dimension statement; showing
the evidence while withholding the sum is the ADR-002 shape, not a compromise
with it.

### The tie the data actually has

The live response ranks five games and the **top three all score 3.5.**
Production takes `scored[0]` after a descending sort, so which of the three
becomes "tonight's pick" is decided by sort stability over input order — not by
anything editorial.

So `Leadership` is a type, not a footnote:

```fsharp
type Leadership =
    | Unrivalled
    | SharedBy of contenders: int
```

and the panel renders `⚖ level with 2 others on the same signals`. Calling one
of three equal games "the pick" without saying so is a claim the data does not
support.

`PickOutcome` separates `NoPickSection` from `Passed`: an absent section means
the analytics run has not produced one — a pipeline fact — while a pass means it
ran and declined. Collapsing them would hide a broken pipeline behind a
normal-looking quiet night.

## Scout's Pick — where the type system paid for itself

The architecture doc defines five gates. Audited against both committed captures
rather than assumed, this payload can answer **two**:

| Gate | Status here |
| --- | --- |
| 0 — already easy to find | answerable, from `streams` |
| A — series context | answerable, from `league`/`series` |
| B — milestone within 5% | **no data** — production reads BDL |
| C — stat anomaly ≥ 0.25 | **no data** — no `getStatOfDay` deviation |
| D — World Cup MD2/MD3 stakes | **no data** — no scenario `pAdv` |

In production every gate is a JS boolean, so a gate with no input returns
`false` — indistinguishable from a gate that looked and said no. The
architecture doc records that exact failure as the reason for the June 10
rebuild:

> Gate 0 killed all WC games — every WC game has `nationalBundle` set … because
> there's no local alternative, not because it's mainstream.

The gate did not misjudge those games. It answered a question it could not
answer, and `false` had no way to say so.

```fsharp
type GateAnswer =
    | Qualifies of because: string
    | DoesNotQualify of because: string
    | Unanswerable of missing: string
```

Run against the real captures, **every game comes back `Indeterminate`** — 3 of
5 gates unanswerable on `games-2026-08-09`, 4 of 5 on `context-2026-05-15`.
Production would have returned `false` for all of them and rendered "no Scout's
Pick tonight", which is a different and untrue statement.

The panel prints what each gate would need: *"cannot tell — needs getStatOfDay
deviation (PK%/DRTG/park factor; not in /context/date)"*. A to-do with an
address on it rather than a silent no.

### Gate 0 is not a port

Production reads `nationalBundle`; this payload has `streams`
("MLB.TV, BravesVision, YES"). Different field, so this asks the same editorial
question of the data that exists — and arguably the better one, since Gate 0's
recorded bug was `nationalBundle` conflating "national" with "no local
alternative". `streams` lets the local alternative be read directly.

Outlets are a named registry, not substring matching — FIELD Rule 50 prohibits
`sportName.includes(...)` for the same reason. `UnrecognisedOutlets` is
deliberately **not** treated as local; that assumption is the Gate 0 bug in the
other direction. Unmodelled outlets are named on the panel, never counted.

## The tabs

WAI-ARIA tabs pattern, not a row of buttons toggling `hidden`: roving
`tabindex`, arrow keys with wraparound, Home/End, real `tabpanel`s. Three
surfaces that say contradictory things — knowing which one you are on is
load-bearing, so a screen reader has to be told.

Sticky offsets are chained from variables, `--tab-h` then `--nav-h`, never
hand-tuned. The 3px seam this repo already shipped once came from an eyeballed
`top`, and adding a second sticky layer is exactly where that recurs.

## What the gate caught

`npm run gate` came back **85/100** and refused the commit. Two rows:

**`grouping and date navigation pass` — FAIL.** A real regression, not a flake.
The page now talks to a *second* relay route for Field's Pick, and
`nav-check.mjs` intercepts only `**/context/date/**`. The analytics request went
to the real network, which in this sandbox is a console error and on a runner
would be an unannounced egress dependency in a check that claims to need none.
Fixed by stubbing the second route. 18/18.

**`source changes arrive with an outbox entry` — FAIL.** Correct: this document
did not exist yet.

Worth recording that the gate blocked a commit for the second time, and that the
failing row was the one added this morning after an outside review found the
outbox check could not tell a documented commit from an undocumented one.

## Verification

| | |
| --- | --- |
| `check:pick` — decoders vs the recorded response | 17/17 |
| `check:tabs` — tabs, both panels, no score in the DOM | 19/19 |
| `check:proof` — every claimed rejection compiled | 16/16, 13 rejections |
| `check:nav` after the route fix | 18/18 |
| build warnings | zero (three introduced and fixed: two FS0067 downcasts, one FS3548) |
| confidence gate | 165/165 |

### Honest limits

**The fixture was transcribed, not fetched.** `data/pick-2026-07-07.json` was
copied from the Drive document, because this sandbox cannot reach the relay. Its
`_provenance` block says so in the file. `scripts/pick-live-check.mjs` runs on a
CI runner, which has egress, and asserts that whatever the real route returns
today decodes — with an HTTP failure reported but not fatal, since the analytics
bundle genuinely may not exist for a given date, and a 200 the decoder cannot
read treated as fatal, since that is the actual assertion.

**Scout's Pick is 2 gates of 5.** Stated on the panel itself, not just here.

**One assertion started too loose.** `the reasons DO appear` was first written
with `|| /No pick section/` as an allowance for the empty state — which made it
satisfiable by a panel that rendered nothing, the same shape as the outbox row
that passed on any dated file. Tightened before commit, and two more assertions
added for the tie and the chasers.
