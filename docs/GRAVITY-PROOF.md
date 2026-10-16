# GRAVITY-PROOF

What `Gridiron` and `Gravity` make impossible, demonstrated by compiling the
violation rather than describing it. Each case below is injected into
`src/Scoreboard.fs` and built by `scripts/proof-check.mjs`; it passes only if
the compiler refuses it with the stated code. Every operand is bound first, with
a qualified type and `Unchecked.defaultof`, so a case can fail only for the
reason it names and not because a name was unbound.

The command this answers, `docs/CC-CMD-2026-10-15-empowerment-metrics.md`, Task 4:

> **The coordinate frame goes into the type.** A bare `private SpatialGravity of
> float32` is the right instinct aimed at the wrong hazard: it lets a home-axis
> `x` be subtracted from an away-axis `x` and compile clean, **against data whose
> declared axis is known false**. Carry the frame so that subtraction is a
> compile error, and add a `docs/GRAVITY-PROOF.md` showing the rejection.

## The NFL form of the hazard

The soccer finding was two payload paths sharing a key name and a shape while
meaning different frames. The Big Data Bowl frames artifact has the same hazard
in two places.

**Instants.** Every row of `data` is `{gameId, playId, event, players:[{nflId,
team, pos, side, x, y}]}`. A play's `ball_snap` row and its `pass_forward` row
carry the same keys, the same shape and the same 22 players. A snap position
subtracted from a release position is a plausible distance that describes no
moment of the play, and Gravity Well reads both instants on every measured play.

**Frames.** The served frame is `offense-right` (the envelope says so, as data).
The metric derives a second one, yards past the line of scrimmage, which also
has an along and an across.

So a position is `Gridiron.Position<'Frame, 'Instant>`: private fields, two
phantom tags, minted only by the decoder (served frame) or by `toScrimmage`
(the derived frame, which takes a SNAP anchor).

## Frames and instants cannot be mixed

**1. A served-frame position against a scrimmage-frame one:**

<!-- proof: FS0001 -->
```fsharp
let served : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Release> = Unchecked.defaultof<_>
let fromLine : Gridiron.Position<Gridiron.Scrimmage, Gridiron.Release> = Unchecked.defaultof<_>
Gridiron.distanceSq served fromLine
```
```
src/Scoreboard.fs(149,32): error FS0001: Type mismatch. Expecting a
    'Gridiron.Position<Gridiron.OffenseRight,Gridiron.Release>'    but given a
    'Gridiron.Position<Gridiron.Scrimmage,Gridiron.Release>'
The type 'Gridiron.OffenseRight' does not match the type 'Gridiron.Scrimmage'
```

**2. A snap position against a release position, in the same frame:**

<!-- proof: FS0001 -->
```fsharp
let atSnap : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Snap> = Unchecked.defaultof<_>
let atRelease : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Release> = Unchecked.defaultof<_>
Gridiron.distanceSq atSnap atRelease
```
```
src/Scoreboard.fs(149,32): error FS0001: Type mismatch. Expecting a
    'Gridiron.Position<Gridiron.OffenseRight,Gridiron.Snap>'    but given a
    'Gridiron.Position<Gridiron.OffenseRight,Gridiron.Release>'
The type 'Gridiron.Snap' does not match the type 'Gridiron.Release'
```

**3. The line of scrimmage anchored where the snapper is at the release:**

<!-- proof: FS0001 -->
```fsharp
let snapperAtRelease : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Release> = Unchecked.defaultof<_>
let receiver : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Release> = Unchecked.defaultof<_>
Gridiron.toScrimmage snapperAtRelease receiver
```
```
src/Scoreboard.fs(149,26): error FS0001: Type mismatch. Expecting a
    'Gridiron.Position<Gridiron.OffenseRight,Gridiron.Snap>'    but given a
    'Gridiron.Position<Gridiron.OffenseRight,Gridiron.Release>'
The type 'Gridiron.Snap' does not match the type 'Gridiron.Release'
```

**4. A position asserted without the decoder:**

<!-- proof: FS1093 -->
```fsharp
let forged : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Release> =
    { Gridiron.Along = 60.0<yd>; Gridiron.Across = 10.0<yd> }
forged
```
```
src/Scoreboard.fs(148,9): error FS1093: The union cases or fields of the type
'Position' are not accessible from this code location
```

## Yards, not meters, not 0-100

Task 4 ends "0-100 normalized only. No fabricated meters." That sentence was
written for soccer, whose coordinates are 0-100 percentages of a pitch whose
size is not in the payload, so meters cannot be had without inventing them.

Big Data Bowl tracking is published in **yards** on a field that is 120 by 53.3
yards by rule. The envelope states it (`coordinateConvention.units: "yards"`),
the builder verified the convention before upload, and the capture's x runs
4.41 to 123.49 and y 0.04 to 52.75. Yards are the native unit here, not a
normalisation, so the principle carries over as "native units only": `yd` in
`src/Units.fs`, the decoder refusing any other unit by name (a Suite row), and
no meters measure anywhere. The brief's "more than 4.0 meters" radius is not
used, converted or approximated: Gravity Well has no radius.

**5. Yards against a bare number, a unit-less or 0-100 threshold:**

<!-- proof: FS0001 -->
```fsharp
let a : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Release> = Unchecked.defaultof<_>
let b : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Release> = Unchecked.defaultof<_>
Gridiron.distanceSq a b < 16.0
```
```
src/Scoreboard.fs(149,31): error FS0001: This expression was expected to have type
    'float<yd ^ 2>'    but here has type    'float'
```

**6. Meters have no unit to be written in:**

<!-- proof: FS0039 -->
```fsharp
let a : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Release> = Unchecked.defaultof<_>
let b : Gridiron.Position<Gridiron.OffenseRight, Gridiron.Release> = Unchecked.defaultof<_>
Gridiron.distanceSq a b > 16.0<m ^ 2>
```
```
src/Scoreboard.fs(149,36): error FS0039: The type 'm' is not defined.
```

This one is a tripwire, and it is only one because both operands are bound: the
undefined `m` is the only thing in the body that can fail. Declare a meters
measure in a module `src/Scoreboard.fs` opens (`Units`, where `yd` lives) and
the error becomes FS0001, yards against meters, so this case goes red.
Measured on 2026-10-16 in a scratch copy of `src/` with `[<Measure>] type m`
appended to `src/Units.fs`; the same body then fails with a different code:

```
src/Scoreboard.fs(149,31): error FS0001: Type mismatch. Expecting a
    'float<yd ^ 2>'    but given a    'float<m ^ 2>'
The unit of measure 'yd ^ 2' does not match the unit of measure 'm ^ 2'
```

A meters measure declared in a module `src/Scoreboard.fs` does not open would
leave this case at FS0039, so the tripwire covers `Units`, the module the
units live in, and not every module.

## A verdict carries its counterexample, and stays sealed

`Gravity.Well` is minted only by a private function that builds it from a
private `Pull`: what the route drew at the release, what the alignment alone
drew at the snap, and how many defenders were in coverage. Outside `Gravity`, a
Well cannot be built, and the numbers inside one cannot be read.

**7. Minting a Drawing without its counterexample:**

<!-- proof: FS1093 -->
```fsharp
let pull : Gravity.Pull = Unchecked.defaultof<_>
Gravity.Drawing pull
```
```
src/Scoreboard.fs(148,5): error FS1093: The union cases or fields of the type
'Well' are not accessible from this code location
```

**8. Reading the counts out of a Well:**

<!-- proof: FS1093 -->
```fsharp
let well : Gravity.Well = Unchecked.defaultof<_>
match well with
| Gravity.Drawing pull -> pull.AtRelease
| _ -> 0
```
```
src/Scoreboard.fs(149,7): error FS1093: The union cases or fields of the type
'Well' are not accessible from this code location
src/Scoreboard.fs(149,31): error FS1093: The union cases or fields of the type
'Pull' are not accessible from this code location
```

**9. Forging the pull itself:**

<!-- proof: FS1093 -->
```fsharp
let pull : Gravity.Pull = { Gravity.AtRelease = 3; Gravity.AtSnap = 0; Gravity.Coverage = 7 }
pull
```
```
src/Scoreboard.fs(147,31): error FS1093: The union cases or fields of the type
'Pull' are not accessible from this code location
```

## Nothing projects a well without the archive witness

The 2026-10-15 ADR-002 ruling lets derived verdicts about named players reach
the page only as geometry, colour or opacity, plus an accessible name that
states the math. This command also says "Do not build toward live". So the two
projections that exist, `Gravity.encodeWell` and `Gravity.accessibleName`, take
an `Archived` witness, and the only way to get one is `Gravity.archivedAt`,
which returns it only for frames whose envelope season is an ARCHIVE of the
season being displayed. The witness holds the measurements it describes, and
the projections take the receiver's coordinates within it, so a witness cannot
be obtained from one season's frames and spent on another's wells.

This is Gravity's own witness, not `Desk.AmnestyZone`. That token also unlocks
the drama formatters, and a second route to it would have widened what a 2022
archive could authorise to any live card.

**10. Forging the witness:**

<!-- proof: FS1093 -->
```fsharp
let measured : Gravity.Measurement list = []
Gravity.Archived measured
```
```
src/Scoreboard.fs(148,5): error FS1093: The union cases or fields of the type
'Archived' are not accessible from this code location
```

**11. Encoding from the frames, with no witness:**

<!-- proof: FS0001 -->
```fsharp
let frames : Vintage.Tracked<Gridiron.Play list> = Unchecked.defaultof<_>
Gravity.encodeWell frames 2022091500 118 40011
```
```
src/Scoreboard.fs(148,24): error FS0001: This expression was expected to have type
    'Gravity.Archived'    but here has type    'Vintage.Tracked<Gridiron.Play list>'
```

**12. An accessible name from the frames, with no witness:**

<!-- proof: FS0001 -->
```fsharp
let frames : Vintage.Tracked<Gridiron.Play list> = Unchecked.defaultof<_>
Gravity.accessibleName frames 2022091500 118 40011
```
```
src/Scoreboard.fs(148,28): error FS0001: This expression was expected to have type
    'Gravity.Archived'    but here has type    'Vintage.Tracked<Gridiron.Play list>'
```

## What the compiler does not refuse

Said here rather than left to be inferred from twelve green cases.

- **Positions from two different plays.** Both carry the same tags. Nothing
  outside `Gravity` can mix them in the metric, because the measurement is a
  private function over one `Play`, but `Gridiron.distanceSq` itself will
  accept them.
- **A coordinate frame or unit other than the one declared.** That is data,
  refused at runtime by the decoder with its name in the error (Suite: "a
  coordinate frame other than offense-right, or units other than yards, is
  refused by name").
- **Printing.** `string`, `sprintf "%A"`, interpolation and `JSON.stringify`
  all compile on a `Well`, an `Archived` and a `Vintage.Tracked`. They print the
  type name only, which is a runtime property (`ToString` and `toJSON`
  overrides), checked by two Suite rows, not a compile error.
- **`Unchecked.defaultof` and reflection.** Every case above uses the first to
  bind an operand; either can manufacture a sealed value. No type closes that.
- **Which season is current.** It is the caller's argument to the decoder (the
  F# reads no clock), so a caller passing a future year mints an archive from a
  current payload. See docs/VINTAGE-PROOF.md.
- **The accessible name is a string.** By design: the amendment requires one.
  It is generated from the value in one function and takes the witness; what it
  may say is pinned by the Suite and, over every receiver in the capture, by
  `scripts/gravity-census.mjs`.

## What is not claimed

Gravity Well is not position-adjusted (a receiver's drawn is relative to his own
snap alignment on that play), not a player trait (no roll-up across plays), and
its route runners and coverage are line-geometry proxies. `src/Gravity.fs` says
so in its header and on the `Well` type, and the census reports the
per-position means and the proxy's distance-past-line distribution beside the
counts.
