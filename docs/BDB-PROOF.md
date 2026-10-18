# BDB-PROOF

What `Bdb` makes impossible, demonstrated by compiling the violation rather than
describing it. Each case below is injected into `src/Scoreboard.fs` and built by
`scripts/proof-check.mjs`. A case passes only if the compiler refuses it with
the stated code.

The command is `docs/CC-CMD-2026-10-18-bdb-scout-mirror.md`. It mirrors the NFL
scout panel's Big Data Bowl rows from jubilant-bassoon's `src/legacy/field.js`.
There, a tracked 2022 top speed is shown as a floor, "≥19.6". The mark is a
template-literal character that one edit can remove, and smoke catches that
edit. Here, the mark comes from the type.

```fsharp
type SpeedFloor = private | SpeedFloor of float<mph>
type SpeedIndex = private | SpeedIndex of season: int<Vintage.season> * floors: Map<string, SpeedFloor option>
```

The speed values are reachable only through the following functions:
- `Bdb.speedIndex` builds an index, only from an archive (`Vintage.archiveAt`).
- `Bdb.floorOf` reads a floor out of it.
- `Bdb.floorText` is the only renderer, and it writes "≥".

## 1. Building a floor by hand

A floor with no archive behind it:

<!-- proof: FS1093 -->
```fsharp
Bdb.SpeedFloor 19.64<Bdb.mph>
```

## 2. Reading the speed out of a floor without the renderer

Taking it apart, which would let a caller print a bare number:

<!-- proof: FS1093 -->
```fsharp
let floor : Bdb.SpeedFloor = Unchecked.defaultof<_>
match floor with
| Bdb.SpeedFloor v -> float v
```

## 3. Building an index from rows that never passed through the archive gate

A hand-made row list cannot become an index. The only constructor is private:

<!-- proof: FS1093 -->
```fsharp
let rows : Map<string, Bdb.SpeedFloor option> = Map.empty
Bdb.SpeedIndex(2022 * 1<Vintage.season>, rows)
```

The one public route takes the season and the `Tracked` file. A partial
application is a function, not an index:

<!-- proof: FS0001 -->
```fsharp
let tracked : Vintage.Tracked<Bdb.SpeedRow list> = Unchecked.defaultof<_>
let idx : Bdb.SpeedIndex option = Bdb.speedIndex tracked
idx
```

## What is not a compile error, and what holds it instead

- **Speed index on the current season.** `Bdb.speedIndex 2026 tracked` compiles,
  because the season is a runtime value. It returns `None` for any file that is
  not the archive of that season (`Vintage.archiveAt`). The Suite row "only an
  archive is released" fails if it ever returns a value for 2026.
- **Ranking by speed.** `starterFloors` could sort, and no type stops it. The
  Suite row "the QB before a faster RB" fails if it does, and so does the
  mutation `bdb-starters-ranked-by-speed`.
- **A name match that is a different player.** A 2023+ player who shares a name
  with a different 2022 player takes that player's floor. Only a collision
  inside the 2022 file is caught. Not typed, and said here.
