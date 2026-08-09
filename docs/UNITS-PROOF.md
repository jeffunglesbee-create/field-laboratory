# Units of measure: the compiler rejecting the real bug

An F# scaffold that merely *has* units of measure proves nothing. This is the
compiler refusing the exact bug class that already shipped to FIELD production
this year — a win-probability scale mismatch where a 0–1 value and a 0–100 value
were treated as interchangeable, because to TypeScript both are `number`.

The mistake below was written on purpose, compiled, and the errors copied
verbatim. Then it was deleted.

## The code

```fsharp
// The real production bug: a 0-100 value and a 0-1 value combined as if they
// were the same scale.
let private scaleBug () =
    let winProbability = 0.62<prob>      // 0-1 scale
    let dramaPeak = 81.0<drama>          // 0-100 scale
    winProbability + dramaPeak

// And the second half: passing an already-scaled percentage to something that
// requires a probability.
let private scaleBug2 () =
    let displayed = 62.0<pct>
    formatWinProbability displayed
```

Both are things a person writes without noticing. `winProbability + dramaPeak`
is two floats added together. `formatWinProbability displayed` passes a number
called `displayed` to a function that formats numbers for display.

## What the compiler said

```
./src/Program.fs(59,20): (59,21) error FSHARP: The unit of measure 'drama' does not match the unit of measure 'prob' (code 43)
./src/Program.fs(59,22): (59,31) error FSHARP: The unit of measure 'drama' does not match the unit of measure 'prob' (code 1)
./src/Program.fs(65,26): (65,35) error FSHARP: Type mismatch. Expecting a    'float<prob>'    but given a    'float<pct>'    The unit of measure 'prob' does not match the unit of measure 'pct' (code 1)
Compilation failed
```

`npm run build` exited **1**. No JavaScript was emitted.

## What this is and isn't evidence of

**It is** evidence that the mismatch is caught at compile time, with no test
written for it, no runtime check, no live probe, and no reviewer noticing. The
build simply does not produce output. The units are erased entirely in the
emitted JavaScript, so this costs nothing at runtime.

**It is not** evidence that units of measure would have prevented the original
incident automatically. They only work where the values are actually *typed* —
a number decoded from JSON arrives as a bare `float` and has to be given its
unit at the boundary, deliberately, by a person who understood the distinction
at the time. `src/Desk.fs` does that for `drama_peak`:

```fsharp
DramaPeak =
  get.Optional.Field "drama_peak" Decode.float
  |> Option.map (fun v -> v * 1.0<drama>)
```

That single line is where the guarantee is actually established. Everything
downstream is then enforced for free — but if that line is wrong, or missing,
the type system has nothing to work with. **The compiler protects the interior,
not the boundary.** The boundary is still a judgement call, and this is the
honest limit of the technique.
