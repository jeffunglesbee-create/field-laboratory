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
