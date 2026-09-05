# The check harness, and what the compiler actually refuses

`src/Verify.fs` claims that a check cannot be written without a counterexample.
This document is that claim compiled. Each case below is injected into a real
source file and built; the case passes only if the build **fails** with the
stated error code. `scripts/proof-check.mjs` runs them, so weakening the harness
makes this document's own claims start failing.

## The claim, stated exactly

Read this before the cases, because the previous proof document in this repo
claimed more than it held and nothing could contradict it.

**What the compiler guarantees.** A check cannot be *declared* without a
counterexample. `Check<'input>` has private fields, so the only way to make one
is `Verify.create`, which takes four arguments. A partial application is a
function, not a `Check`, and does not type-check where a `Check` is wanted. A
suite is a list of `Sealed`, whose case is also private, so nothing can enter a
suite that was not built that way — in particular not a bare bool, which is
exactly what `scripts/checks.mjs` accepts.

**What the compiler does NOT guarantee.** That the counterexample really is one.
`Verify.create "positive" (fun n -> n > 0) 1 2` compiles. It cannot be stopped by
a type, because whether `2` fails the predicate is a runtime question. `Verify.run`
returns `NoTeeth` for it and `runAll` counts that as a failure — proven by the
self-test in `src/VerifyMain.fs`, which asserts that exact expression comes back
`NoTeeth`.

So: **the shape is a compile error, the content is a runtime failure.** That is
more than JavaScript enforces and less than "a toothless check is unwritable".
Both halves are executable; neither is prose.

## The cases

### A check cannot be assembled field by field

The record's fields are private, so a caller cannot build one directly — which
is what stops a variant with no `MustFail` field, or one whose `MustFail` was
filled in later by an edit that skipped the constructor.

<!-- proof: FS1093 -->

```fsharp
    let c: Verify.Check<int> =
        { Name = "positive"; Predicate = (fun n -> n > 0); MustHold = 1; MustFail = -1 }
    ignore c
    ""
```

### A one-directional check does not type-check as a check

Three arguments to a four-argument constructor is a function. This is the case
the whole harness exists for: in `scripts/checks.mjs`, `check(name, pass)` is a
complete call.

<!-- proof: FS0001 -->

```fsharp
    let c: Verify.Check<int> = Verify.create "positive" (fun n -> n > 0) 1
    ignore c
    ""
```

### ...and cannot be sealed into a suite either

The same mistake one step later, where it would otherwise reach `runAll`.

<!-- proof: FS0001 -->

```fsharp
    let suite: Verify.Sealed list = [ Verify.seal (Verify.create "positive" (fun n -> n > 0) 1) ]
    ignore suite
    ""
```

### A bare boolean is not a check

The JavaScript harness's entire signature, offered to this one.

<!-- proof: FS0001 -->

```fsharp
    let suite: Verify.Sealed list = [ 1 > 0 ]
    ignore suite
    ""
```

### A suite entry cannot be fabricated

`Sealed`'s case is private. If it were not, this would compile and would be a
check that passes unconditionally, with no predicate and no inputs — the
JavaScript hole re-opened one level up.

<!-- proof: FS1093 -->

```fsharp
    let s = Verify.Sealed("looks fine", fun () -> Verify.Held)
    ignore s
    ""
```

### The counterexample cannot be read back out and quietly dropped

`MustFail` is not accessible outside the module, so no caller can inspect a
check, discover its counterexample is inconvenient, and rebuild it without one.

<!-- proof: FS1093 -->

```fsharp
    let c = Verify.create "positive" (fun n -> n > 0) 1 -1
    let x = c.MustFail
    ignore x
    ""
```

### A fourth `Verdict` case cannot be added silently

`FS0025` is an error in this project, so a new outcome forces every reader to
handle it. This is the guarantee that stopped `PickStatus` growing a sixth case
that rendered as a blank chip — the same shape applied to check outcomes.

<!-- proof: FS0025 -->

```fsharp
    let label (v: Verify.Verdict) =
        match v with
        | Verify.Held -> "PASS"
        | Verify.Broke -> "FAIL"
    ignore (label Verify.Held)
    ""
```

## The gate: how row verdicts combine

`src/Verify.fs` also claims that a **passing gate cannot be manufactured** —
that no score, percentage or majority can produce one from outside the module.
That is a separate claim from the one above, aimed at a separate failure. The
one above is about a single check having teeth. This one is about what happens
when the checks disagree.

The failure it is aimed at is recorded in `scripts/confidence.mjs`: the gate
scored `earned / possible` until 2026-08-10, so at 225 points **ten of seventeen
rows could fail alone and still clear 95** — including "build is clean" and
"decoders still REJECT the corrupted fixture". No commit introduced it. Growing
the suite weakened it, and every row added made the next failure cheaper.

**What the compiler guarantees.** `Passing`'s case is private, so `Passed` has
no argument a caller can supply. `Row`'s case is private, so `decide` cannot be
handed a list of fabricated `Held` rows — which matters because `Verdict`'s cases
are public and have to be. `Score` cannot be turned into a `Gate`: no function in
the module maps one to the other, and `percent` returns a bare `int` that
`Passed` will not accept.

**What the compiler does NOT guarantee.** That `decide` itself stays a
conjunction. It is eleven lines inside the module and an edit could make it an
average tomorrow. No type prevents that in any language. What the types do is
collapse the surface from "every caller, forever" to one function — which is a
smaller thing to guard, not an eliminated one. The runtime half is covered by
the self-test in `src/VerifyMain.fs`, which asserts that a suite scoring **90%
with one toothless row is Blocked**; making `decide` an average at 90% turns
three of its assertions red and exits 1.

### A passing gate cannot be minted from a number

The whole claim in one case. If `Passing` were a public case this would compile,
and a gate would be assertable rather than earned.

<!-- proof: FS1093 -->

```fsharp
    let g: Verify.Gate = Verify.Passed(Verify.Passing 17)
    ignore g
    ""
```

### A percentage is not a passing witness

The same attempt made honestly — compute the real score, then try to pass on it.
`percent` returns an `int` because a percentage is a number, and there is no
conversion from that number to the witness `Passed` demands.

<!-- proof: FS0001 -->

```fsharp
    let s = Verify.score (Verify.runRows [])
    let g: Verify.Gate = Verify.Passed(Verify.percent s)
    ignore g
    ""
```

### Rows cannot be fabricated and handed to the gate

`Verdict`'s cases are public — the suite reads them, so they must be. If `Row`'s
case were public too, `decide [ "everything", Held ]` would be a passing gate
built from nothing at all. The only way to obtain a `Row` is to run a check.

<!-- proof: FS1093 -->

```fsharp
    let g = Verify.decide [ Verify.Row("everything held", Verify.Held) ]
    ignore g
    ""
```

### A score cannot be taken apart and re-decided

`Score`'s fields are not readable outside the module, so a caller cannot pull the
numerator and denominator out and apply a bar of its own choosing.

<!-- proof: FS1093 -->

```fsharp
    let (Verify.Score(held, total)) = Verify.score (Verify.runRows [])
    ignore (held, total)
    ""
```

### A third `Gate` case cannot be added silently

`FS0025` is an error in this project. A `Deferred` or `PassedWithWaiver` case —
which is what a gate override is — forces every reader to handle it rather than
appearing in one branch and defaulting elsewhere. FIELD's production gate has
been overridden at least twice, 92/100 citing a 63/100 precedent, so this is not
a hypothetical case shape.

<!-- proof: FS0025 -->

```fsharp
    let label (g: Verify.Gate) =
        match g with
        | Verify.Passed _ -> "pass"
    ignore (label (Verify.decide (Verify.runRows [])))
    ""
```
