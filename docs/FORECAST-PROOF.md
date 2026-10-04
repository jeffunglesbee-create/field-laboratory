# FORECAST-PROOF

What `Forecast` makes impossible, demonstrated by compiling the violation
rather than describing it. Each case below is injected into a real source file
and built by `scripts/proof-check.mjs`; it passes only if the compiler refuses
it with the stated code.

## Provenance cannot be dropped

`Forecast` has three cases and one of them is the dominant state. Under the
market-implied phasing roughly 370 of 380 fixtures had no price at all, and the
phases were swapped on 2026-10-03 after EPL odds were measured at zero on every
date probed. A consumer written against the happy case — "read the market
number" — is wrong for most of the season, every season.

The usual way that goes wrong is not a crash. It is a renderer that handles the
case it has seen and silently produces nothing for the rest, which looks like a
quiet slate rather than a missing branch.

<!-- proof: FS0025 -->
```fsharp
match (Forecast.NoForecast Forecast.BeyondOddsHorizon : Forecast.Forecast) with
| Forecast.MarketImplied m -> Market.threeWayHome m
```
```
error FS0025: Incomplete pattern matches on this expression. For example, the
value 'Modelled (_)' may indicate a case not covered by the pattern(s).
```

`FS0025` is an **error** in this project, not a warning — see
`WarningsAsErrors` in `src/Laboratory.fsproj`. The claim "provenance is a
column, not a rendering convention" therefore rests on the compiler rather than
on the zero-warning CI gate.

## A reason cannot be dropped either

`NoForecastReason` distinguishes four situations that a boolean "no forecast"
would merge. The distinction is not academic: on 2026-10-03 the archive served
zero EPL rows, and the question of whether that was a missing fixture, a
missing price or a failed source took a probe to settle. A reader given only
"no forecast" would have had to run it again.

`FixtureUnscheduled` is the one that cannot currently be demonstrated from live
data — zero of 380 fixtures carry `event: null` today — which is exactly why it
has to be held by the type rather than by the data happening to contain it.

<!-- proof: FS0025 -->
```fsharp
match Forecast.BeyondOddsHorizon with
| Forecast.BeyondOddsHorizon -> "beyond the horizon"
| Forecast.NoOddsForFixture -> "not priced"
```
```
error FS0025: Incomplete pattern matches on this expression. For example, the
value 'SubstrateUnreachable' may indicate a case not covered by the pattern(s).
```

## A first run is not an unchanged one

`DeltaOutcome` keeps `NoPrior` out of `DeltaCause` on purpose. A change record
with no prior row has nothing to diff, and rendering that as `Unchanged` is the
same collapse as `closing_odds`, where "observed twice, unchanged" and
"observed once" were indistinguishable until `captured_at` separated them.

Folding the two together is attractive because it makes the first run render
like every other run. That is the defect, not the convenience.

<!-- proof: FS0025 -->
```fsharp
match (Forecast.NoPrior : Forecast.DeltaOutcome) with
| Forecast.Delta cause -> sprintf "%A" cause
```
```
error FS0025: Incomplete pattern matches on this expression. For example, the
value 'NoPrior' may indicate a case not covered by the pattern(s).
```

## A cause cannot be quietly added to

`DeltaCause` carries seven cases and `ModelRevised` is the one that makes the
record worth keeping: a number moving because reality moved and a number moving
because we changed the model are indistinguishable afterwards unless stamped at
write time. A consumer that enumerates six and falls through on the seventh
would attribute our own revision to the world.

<!-- proof: FS0025 -->
```fsharp
match (Forecast.Unchanged : Forecast.DeltaCause) with
| Forecast.ResultObserved f -> f
| Forecast.MarketMoved -> "market"
| Forecast.FixtureScheduled -> "scheduled"
| Forecast.SubstrateGained -> "gained"
| Forecast.SubstrateLost -> "lost"
| Forecast.Unchanged -> "unchanged"
```
```
error FS0025: Incomplete pattern matches on this expression. For example, the
value 'ModelRevised (_)' may indicate a case not covered by the pattern(s).
```
