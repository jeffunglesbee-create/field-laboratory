# VINTAGE-PROOF

What `Vintage` makes impossible, demonstrated by compiling the violation rather
than describing it. Each case below is injected into `src/Scoreboard.fs` and
built by `scripts/proof-check.mjs`; it passes only if the compiler refuses it
with the stated code.

The command is `docs/CC-CMD-2026-10-15-bdb-frame-types.md`. Six Big Data Bowl
files serve 2022 data under `targetYear: 2026`; the season is a field BESIDE the
value, and any reader can drop it. Here it travels inside:

```fsharp
type Vintage = private | Archive of int<season> | Current of int<season>
type Tracked<'T> = private | Tracked of value: 'T * vintage: Vintage
```

`Vintage.decodeEnvelope` is the only mint. `Vintage.valueAt` releases the value
only at the season it describes, and `Vintage.archiveAt` only when that season
is an archive. Task 4 lists five rejections. Three are compile errors and are
proved below; two cannot be, and the last section says which and what holds
them instead.

## 1. Constructing a Tracked outside the decoder

<!-- proof: FS1093 -->
```fsharp
let vintage : Vintage.Vintage = Unchecked.defaultof<_>
Vintage.Tracked([ 0 ], vintage)
```
```
src/Scoreboard.fs(148,5): error FS1093: The union cases or fields of the type
'Tracked' are not accessible from this code location
```

## 2. Forging a Vintage to make an archive value look current

<!-- proof: FS1093 -->
```fsharp
let stated : int<Vintage.season> = Unchecked.defaultof<_>
Vintage.Current stated
```
```
src/Scoreboard.fs(148,5): error FS1093: The union cases or fields of the type
'Vintage' are not accessible from this code location
```

## 3. Reaching the raw value without supplying a season

Taking the value apart directly:

<!-- proof: FS1093 -->
```fsharp
let tracked : Vintage.Tracked<int list> = Unchecked.defaultof<_>
match tracked with
| Vintage.Tracked(value, _) -> value
```
```
src/Scoreboard.fs(149,7): error FS1093: The union cases or fields of the type
'Tracked' are not accessible from this code location
```

Or calling the one exit without its season: the partial application is a
function, not a value.

<!-- proof: FS0001 -->
```fsharp
let tracked : Vintage.Tracked<int list> = Unchecked.defaultof<_>
let value : Result<int list, Vintage.VintageMismatch> = Vintage.valueAt tracked
value
```
```
src/Scoreboard.fs(148,61): error FS0001: This expression was expected to have type
    'Result<int list,Vintage.VintageMismatch>'    but here has type
    'Vintage.Tracked<'a> -> Result<'a,Vintage.VintageMismatch>'
src/Scoreboard.fs(148,77): error FS0001: This expression was expected to have type
    'int<Vintage.season>'    but here has type    'Vintage.Tracked<int list>'
```

And a bare year, `targetYear`'s shape, is not a season:

<!-- proof: FS0001 -->
```fsharp
let tracked : Vintage.Tracked<int list> = Unchecked.defaultof<_>
Vintage.valueAt 2026 tracked
```
```
src/Scoreboard.fs(148,21): error FS0001: This expression was expected to have type
    'int<Vintage.season>'    but here has type    'int'
```

## The two rejections that are not compile errors

Task 4 asks for all five by compilation, and the command's design section says
"A 2022 number reaching a 2026 card is a **compile error** where the call site
is static". Under the command's own types, two of the five are not, and
claiming them here would be the proof doc claiming more than it holds.

- **Rendering an `Archive 2022` value at `displaySeason = 2026`.** The season
  is an `int<season>`, a runtime value, so `Vintage.valueAt 2026 tracked`
  compiles and returns `Error` (a `VintageMismatch` naming both). Held by the
  Suite row "a tracked value is released only at its own season", whose
  counterexample is exactly that call.
- **Decoding an envelope with no `season`.** The bytes arrive at runtime, so
  this is `Error NoSeason` from the decoder, never a default. Held by the Suite
  row "an envelope with no season is refused, never stamped with the current
  year", and by the mutation `vintage-missing-season-defaults` in
  `scripts/mutation-check.mjs`, which makes the decoder stamp it current and
  must be caught.

Three more runtime refusals sit beside them, each a Suite row: a season written
as a JSON string ("2022") is refused rather than parsed (Thoth's integer
decoder would otherwise accept it); a missing or blank `sourceDataset` is
`NoSourceDataset`; and a season later than the current one is `FutureSeason`,
never stamped current.

## What the compiler does not refuse

- **Which season is current.** `decodeEnvelope` takes it as an argument and
  reads no clock, so a caller passing a future year mints an `Archive` from a
  current payload. The census script passes `Vintage.nflSeasonOf` of the
  Eastern field day, the relay's own August rule.
- **`Unchecked.defaultof` and reflection** manufacture a `Tracked` or a
  `Vintage`; every case above uses the first to bind an operand.
- **Printing.** `string`, `%A`, interpolation and `JSON.stringify` compile on a
  `Tracked` and print `Vintage.Tracked` only: a runtime property of the
  `ToString` and `toJSON` overrides, checked by the Suite.
- **`VintageMismatch` carries the value's `Vintage`.** It cannot be matched or
  built outside the module, but it prints its season, which is the point of
  the error.
