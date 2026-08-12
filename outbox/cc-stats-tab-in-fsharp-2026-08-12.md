# The Stats tab, in F# — 2026-08-12

Jeff sent production's Stats tab and its own audit, and asked for it in F#.

The audit had already done the hard part. It found a bug and proposed the fix:

> "Tied — anyone's game" appears on all seven games, including Athletics 47–73 vs
> Rays 73–46 and Padres 64–57 vs Brewers 74–46. It comes from
> `buildComebackProbability`, which is a **live in-game** feature. Its first line:
>
> ```js
> if (!eData || eData.state === 'post') return null;
> ```
>
> It guards `post` but not `pre`… It's worse than a cosmetic glitch because of
> placement: it sits directly beneath the win-loss records, so it reads as a
> verdict on those records — a 47–73 team called even with a 73–46 team.
>
> The fix is one condition (`state === 'pre'` returns null, same as `post`).

That fix is correct. It is also a patch on a shape that invites the bug: a
function taking raw scores, trusted to have checked the state first, with the
list of states to exclude maintained by hand. That list was already wrong once.

## What the type does instead

```fsharp
type LiveMargin = private { Leader: int; Trailer: int }

let liveMargin (state: GameState) : LiveMargin option =
    match state with
    | InProgress(home, away) -> Some { Leader = max home away; Trailer = min home away }
    | Scheduled
    | Final _ -> None
```

`comebackText` takes a `LiveMargin`. There is no pre-game path to it, so there is
no guard to forget. The affirmative case is named once and everything else is
`None` — a fourth `GameState` cannot open a hole, because it has no case.

Three proof cases compile the bug and the compiler refuses it: passing
`Desk.Scheduled`, passing a raw `(0, 0)` — production's actual signature — and
assembling a `LiveMargin` by hand. `proof-check` 35/35 → **41/41**.

And a `0–0` margin still says "Tied — anyone's game". The sentence was never
wrong; it was unreachable-in-principle and reachable-in-fact. It is true exactly
when it can now be produced.

## The second bug, visible without reading any source

The screenshot shows a header reading **"Orioles @ Twins"** and, directly
beneath, **"Twins: 59–62 · Orioles: 58–62"**. Home first, under an away-first
header. The audit separately notes the pitcher rows are "away first then home" —
so one card carries two orders and states neither.

That is the transposition `orderByMatchup` was written for, arriving for the
fourth time. `recordsLine` and `pitcherRows` both go through it.

## The third: silence

- "Two games have no PARK row at all — that's `if (pf)` skipping a null lookup."
- Umpires "render as bare names: that's the `else` branch, no rating entry."
- "Every pitcher is a bare name, meaning `era`/`wins` were null and both the
  tempo and arsenal lookups missed."

A row that vanishes and a row that renders half of itself are the same failure as
the weather empty state: absence and failure collapsed into one appearance. Every
row here has an unresolved case that carries what is missing, the panel marks
them, and `gaps` counts them per card — because row by row four silent absences
look like four ordinary rows, and together they are a number.

## The harness caught me again

I wrote "the pitcher rows lead with the same team as the records line" with a
different SPORT as the counterexample. `NO TEETH`, correctly: both orderings go
through `orderByMatchup`, so no sport can make them disagree. The design working
is exactly what makes the property true of everything and an assertion about
nothing.

Third time this session the F# harness has refused a check I wrote. The version
with content names the team — "Twins" is what production leads with under an
"Orioles @ Twins" header, so the counterexample exists.

## The gate failed it, on the same pairing as the weather build

```
440/480 points = 92/100   (bar: 95)
2 FAILING ROW(S). Do not commit.
  - breaking each invariant makes a check fail (20 pts)
  - no value is written without being read back (20 pts)
```

One cause: `pitcherName` was written and nothing read it. Same guard, same day,
third time this session it has caught speculative API I added because it looked
like it belonged. `mutation-check` fails alongside it because its unmutated-tree
precondition runs that row.

Given a real consumer rather than deleted, because the claim is genuine:
production's rows degrade to a bare name when enrichment fails, and the name is
the one thing that must survive that degradation — a row with neither stats nor a
name is not a row. Both directions, with an empty name as the counterexample.
46/46 → **48/48**.

## Evidence

`proof-check` **41/41** with six new rejection cases. `VerifyMain` **46/46** with
eleven new checks whose counterexamples are production's live bugs. `tab-check`
**28/28**, including that a slate with no game in progress carries **zero**
comeback lines, and that unresolved rows are flagged. Two mutations —
`comeback-on-a-scheduled-game` restores production's exact bug,
`records-line-transposed` restores the header mismatch — both killed.

CONFIDENCE: 96.

Docked four: `reportFor` fills every row with its unresolved case, because
`/context/date` carries none of the enrichment production reads from side tables.
So the ENRICHED branches — a rated umpire, a pitcher with an ERA, a known park
factor — are exercised only by the suite's literals and have never rendered from
a real payload. The unresolved path is what the deployed page will show, and that
is honest; it also means half of each type is proven by fixture alone.
