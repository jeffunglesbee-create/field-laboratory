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

## A row cannot be built without its data

`Row` has no unresolved case. The first version of this file had `ParkUnknown`,
`UmpireUnrated`, `PitcherUnenriched` and `RecordUnknown` — marking a gap, which
is better than production dropping the row silently and still the wrong shape.
A report that asserts five rows and can fill one is a report about the wrong
subject. There is now no constructor for a row whose data is absent.

<!-- proof: FS0039 -->

```fsharp
    let r = Stats.ParkUnknown "Target Field"
    ignore r
    ""
```

## A sixth row kind cannot be added silently

`FS0025` is an error here, so a new row forces every reader to handle it —
including the one that gives it a label.

<!-- proof: FS0025 -->

```fsharp
    let label (r: Stats.Row) =
        match r with
        | Stats.VenueRow _ -> "VENUE"
        | Stats.MarketRow _ -> "MARKET"
        | Stats.DramaRow _ -> "DRAMA"
        | Stats.BroadcastRow _ -> "BROADCAST"
    ignore (label (Stats.MarketRow "x"))
    ""
```

## The composite park index cannot be displayed

ADR-002 PROHIBITED #3 makes displaying a raw composite a CRITICAL. Coors Field's
run factor is the integer `128`, and production renders `+28% runs` because
`128` on its own tells a reader nothing.

`ParkFactor`'s fields are private, so this is not a rule anyone has to remember.
The index is not reachable from outside `Scouting.fs` at all — the only exits
are `runsDeviation` and `hrDeviation`, which return the signed percentage. The
prohibited render is unavailable rather than discouraged.

<!-- proof: FS1093 -->

```fsharp
    let raw =
        match Scouting.tryParkByVenue "Coors Field" with
        | Some p -> p.Runs
        | None -> 0
    ignore raw
    ""
```

## An umpire's overturn rate cannot disagree with their counts

Production's table carries `challenged`, `overturned` **and** `rate` — three
fields holding two facts. Verified across all 51 imported umpires that `rate` is
exactly `round(overturned / challenged, 3)`, so here it is a function and there
is no stored field to drift away from the counts.

<!-- proof: FS1093 -->

```fsharp
    let stored =
        match Scouting.tryUmpire "jimenez" with
        | Some u -> u.Overturned
        | None -> 0
    ignore stored
    ""
```
