# FLOW-PROOF

What `Flow` (`src/Flow.fs`, Task 1 of
`docs/CC-CMD-2026-10-15-empowerment-metrics.md`) makes impossible, shown by
compiling the violation rather than describing it. Each case is injected into
`src/Scoreboard.fs` and built by `scripts/proof-check.mjs`; it passes only if
the compiler refuses it with the stated code.

This document holds the cases about how a Flow value is BUILT: who can mint a
state, a capture or a witness. The cases about how one may be SHOWN, which is
the ADR-002 question, are in `docs/AMNESTY-PROOF.md` under "Flow".

## A verdict cannot be held outside Flow

`InFlow` is a verdict about a named team: three shots of positive xG with no
opposing shot between them. `TeamState` is a PRIVATE type, so no module but
`Flow` can name it, mint it, read the xG out of it, compare two of them or hand
one to a serialiser. The verdict leaves `Flow` only as `ariaLabel`'s string and
`pulseStyle`'s opacity, and both demand the witness.

<!-- proof: FS1092 -->
```fsharp
let held : Flow.TeamState option = None
held
```
```
error FS1092: The type 'TeamState' is not accessible from this code location
```

## A reading carries no verdict

`readingAt` is public because the census and the tests need to know whether a
minute was recorded at all. Its cases carry nothing, so matching on one cannot
yield a state.

<!-- proof: FS0725 -->
```fsharp
let reading : Flow.Reading = Unchecked.defaultof<_>
match reading with
| Flow.Recorded state -> string state
| _ -> ""
```
```
error FS0725: This union case does not take arguments
```

## A witness cannot be assembled from parts

`Finished` holds the capture it was built from, which is what stops a witness
for one match from unlocking the label of another. Building one by hand, from
any capture and any zone, would undo that.

<!-- proof: FS1093 -->
```fsharp
let capture : Flow.Capture = Unchecked.defaultof<_>
let zone : AmnestyZone = Unchecked.defaultof<_>
let forged : Flow.Finished = { Of = capture; Zone = zone }
forged
```
```
error FS1093: The union cases or fields of the type 'Finished' are not
accessible from this code location
```

## A capture cannot be restaged

A capture's event id and stage come from its own two files. Copying a capture
with a different event id would let it borrow another match's kickoff.

<!-- proof: FS1093 -->
```fsharp
let capture : Flow.Capture = Unchecked.defaultof<_>
let restaged = { capture with EventId = Some 7001 }
restaged
```
```
error FS1093: The union cases or fields of the type 'Capture' are not
accessible from this code location
```

## Two witnesses cannot be compared

`Finished` carries `NoEquality`, so `a = b` on two witnesses does not compile:
the comparison would be a one-bit projection of two captures outside any label.

<!-- proof: FS0001 -->
```fsharp
let a : Flow.Finished = Unchecked.defaultof<_>
let b : Flow.Finished = Unchecked.defaultof<_>
a = b
```
```
error FS0001: The type 'Flow.Finished' does not support the 'equality'
constraint because it has the 'NoEquality' attribute
```

## What is not a compile error

- **Printing a witness or a reading.** `string`, `sprintf "%A"`, `%O`,
  interpolation and `JSON.stringify` compile on every value, so none of them
  can be rejected here. A reading has nothing to print but its case name.
  `Finished` overrides `ToString` and attaches a `toJSON`
  (`Fable.Core.AttachMembers`), so each of the five prints `Finished`, not the
  capture inside it. The Suite row "a witness and a reading print as names,
  never what they hold" checks all five under Fable, the only host that runs
  the suite, and a mutation that deletes the `toJSON` turns it red.
- **Reflection.** `FSharpValue.MakeRecord`, `unbox` of a look-alike object, or
  `Unchecked.defaultof` (which these proof bodies use to get a typed value) can
  build a `Finished` or a `Capture` that no route produced. That is true of
  every private type in F#, including `Desk.AmnestyZone`, and it is outside
  what a type can enforce. What reflection cannot reach is a verdict: no public
  function returns one, so there is no `TeamState` value outside `Flow` to
  reflect on.
