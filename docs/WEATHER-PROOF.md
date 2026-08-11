# Weather: what the compiler refuses

Each case below is injected into a real source file and built. It passes only if
the build **fails** with the stated error code. `scripts/proof-check.mjs` runs
them all.

Every case answers a failure recorded in FIELD's own documents or in
playground's source comments. None is invented.

## The one that matters

FIELD's May 22 2026 session document, on a weather engine that had been live and
feature-flagged as working since May 19:

> Six functions were called but never defined anywhere in the file:
> `wxDescription()`, `wxIcon()`, `wxAlert()`, `wxBadge()`, `isOutdoorVenue()`,
> `getVenueCoords()`. `fetchWeather`'s try-catch swallowed the ReferenceError
> silently. `wxCache` stayed empty. No badges ever appeared. The feature-flag
> `'weather-drama-bonus': '2026-05-19'` was a lie.

Three days of a feature that never executed once, behind a flag that said it
had, because six names were never bound. The try-catch that hid it was not
negligence — it was there to make the fetch resilient, and it worked exactly as
written.

<!-- proof: FS0039 -->

```fsharp
    let badge = wxBadge (Weather.compass 0)
    ignore badge
    ""
```

There is no configuration in which that reaches a user. The build stops.

## A venue cannot be a pair of floats

`getVenueCoords` returns `[lat, lon]` or `null`, and every consumer handles a
two-element array. A latitude of 400 is a fetch.

<!-- proof: FS0001 -->

```fsharp
    let where: Weather.Coordinates = (42.3467, -71.0972)
    ignore where
    ""
```

## ...nor can it be assembled around the validator

`Coordinates` has private fields, so `coordinates` is the only way in and the
range check cannot be skipped.

<!-- proof: FS1093 -->

```fsharp
    let where: Weather.Coordinates = { Lat = 400.0; Lon = -71.0972 }
    ignore where
    ""
```

## The cache cannot be keyed by venue name

98 venue keys resolve to 95 locations. Keying by name fetches Minute Maid Park
and Daikin Park separately — the same stadium, twice, free to disagree.

<!-- proof: FS0001 -->

```fsharp
    let hit = Weather.tryGet "Minute Maid Park" 0.0 Weather.emptyCache
    ignore hit
    ""
```

## A failure cannot be cached

`put` takes a `Reading`. Playground's comment says failures are "deliberately
not cached"; here there is no representation for one, so a two-hour TTL cannot
be applied to an error.

<!-- proof: FS0001 -->

```fsharp
    let c = Weather.put (Weather.coordKey (Option.get (Weather.coordinates 40.0 -80.0))) 0.0 None Weather.emptyCache
    ignore c
    ""
```

## Precipitation and rain cannot be compared as bare numbers

They are not independent — precipitation includes snow. Two floats side by side
are what makes "check snow before rain" a comment somebody has to obey.

<!-- proof: FS0001 -->

```fsharp
    let heavier = 2.0<Weather.mm> > 1.0<Weather.mph>
    ignore heavier
    ""
```

## Fahrenheit is not miles per hour

Open-Meteo's units are query parameters. Downstream they were all `number`.

<!-- proof: FS0001 -->

```fsharp
    let wrong: float<Weather.degF> = 18.0<Weather.mph>
    ignore wrong
    ""
```

## A covered venue cannot enter the warmest/coldest line

Playground states the rule in prose and relies on every future caller filtering
correctly. `RankableReading` is private and `rankable` returns `None` for a
covered venue, so the comparison cannot be reached with one.

<!-- proof: FS1093 -->

```fsharp
    let ranked =
        Weather.RankableReading
            { Venue = "Tropicana Field"
              Where = Option.get (Weather.coordinates 27.7683 -82.6534)
              Roof = Weather.Dome
              Reading = Unchecked.defaultof<Weather.Reading> }
    ignore ranked
    ""
```

## An outage cannot be rendered as an empty slate

The distinction playground protects with a `throw`. A throw is swallowable — see
the top of this document for what swallowing looks like. Here a renderer that
handles only two of the three cases does not compile.

<!-- proof: FS0025 -->

```fsharp
    let render (s: Weather.SlateWeather) =
        match s with
        | Weather.NoVenuesWithCoordinates -> "no venues with known coordinates"
        | Weather.Readings(rs, _) -> sprintf "%d readings" (List.length rs)
    ignore (render Weather.NoVenuesWithCoordinates)
    ""
```

## A fourth precipitation state cannot be added silently

`FS0025` is an error in this project, so a new case forces every reader to
handle it — including the one that writes the sentence a person reads.

<!-- proof: FS0025 -->

```fsharp
    let sky (f: Weather.Falling) =
        match f with
        | Weather.Dry -> "clear"
        | Weather.Raining _ -> "rain"
        | Weather.FrozenOrMixed _ -> "snow"
    ignore (sky Weather.Dry)
    ""
```
