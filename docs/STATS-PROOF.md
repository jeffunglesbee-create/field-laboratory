# The Stats tab: what the compiler refuses

Each case is injected into a real source file and built. It passes only if the
build **fails** with the stated error. `scripts/proof-check.mjs` runs them.

## The bug these exist for

From production's own audit of its Stats tab, 2026-08-12:

> "Tied — anyone's game" appears on all seven games, including Athletics 47–73 vs
> Rays 73–46 and Padres 64–57 vs Brewers 74–46. It comes from
> `buildComebackProbability`, which is a **live in-game** feature. Its first line:
>
> ```js
> if (!eData || eData.state === 'post') return null;
> ```
>
> It guards `post` but not `pre`. On a scheduled game there are no scores, so
> both sides parse to 0, margin is 0, and it announces a tie. It's worse than a
> cosmetic glitch because of placement: it sits directly beneath the win-loss
> records, so it reads as a verdict on those records — a 47–73 team called even
> with a 73–46 team.

The audit's fix is one condition: `state === 'pre'` also returns null. That is
correct, and it patches a shape that invites the bug — a function taking raw
scores, trusted to have checked the state first. The list of states to exclude
has to be maintained by hand, and it was already wrong once.

The three cases below are that hole, closed by construction rather than by a
condition.

## A scheduled game cannot reach the comeback line

<!-- proof: FS0001 -->

```fsharp
    let line = Stats.comebackText Desk.Scheduled
    ignore line
    ""
```

## Nor can raw scores

This is production's signature: two integers and the trust that somebody checked
the state. There is no such constructor.

<!-- proof: FS0001 -->

```fsharp
    let line = Stats.comebackText (0, 0)
    ignore line
    ""
```

## Nor can a margin be assembled by hand

`LiveMargin`'s fields are private, so `liveMargin` — which returns `None` for
`Scheduled` and for `Final` — is the only way in. Without this, a caller could
build `{ Leader = 0; Trailer = 0 }` from a pre-game card and get the same
sentence back.

<!-- proof: FS1093 -->

```fsharp
    let m: Stats.LiveMargin = { Leader = 0; Trailer = 0 }
    ignore m
    ""
```

## An unresolved row cannot be rendered as a resolved one

`ParkUnknown` carries the venue instead of the numbers. Production's `if (pf)`
drops the row entirely — two of seven games showed no PARK line and nothing said
which two or why — so the type has no case that is both absent and printable as
a figure.

<!-- proof: FS0001 -->

```fsharp
    let runs: int =
        match Stats.ParkUnknown "Chase Field" with
        | Stats.ParkUnknown r -> r
        | Stats.ParkKnown(_, r, _) -> r
    ignore runs
    ""
```

## A fourth park lean cannot be added silently

`FS0025` is an error here, so a new lean forces every reader to handle it —
including the one that draws the badge.

<!-- proof: FS0025 -->

```fsharp
    let badge (l: Stats.ParkLean) =
        match l with
        | Stats.PitchersPark -> "pitcher"
        | Stats.LaunchPad -> "hitter"
    ignore (badge Stats.NeutralPark)
    ""
```

## A record cannot be printed without handling the missing case

The audit: "Rockies @ Diamondbacks shows no line at all — one of the two lookups
failed", matched by `.includes(nickname)` substring.

<!-- proof: FS0025 -->

```fsharp
    let text (r: Stats.Record) =
        match r with
        | Stats.RecordKnown(w, l) -> sprintf "%d-%d" w l
    ignore (text Stats.RecordUnknown)
    ""
```
