# PROSE-PROOF — the unit error, refused by the compiler

`src/Prose.fs` claims that the defect which floored a JQ dimension for 91.2% of
a 592-brief corpus cannot be written in F#. This document is that claim compiled.

Every case below is injected into a real source file and built by
`scripts/proof-check.mjs`. A case passes only if the build **fails** with the
stated error code. If the guard is ever weakened, these start passing — and a
passing proof case is a failing check.

## The defect, stated once

`field-relay-nba/src/journalism-quality.js` computes

```js
const rawDensity = (properNouns.length + numbersAll.length) / nSent
const density    = Math.max(0, Math.min(1, 1 - Math.abs(rawDensity - 1) * 0.5))
```

and compares it against an ideal of `1`, taken from `FIELD_PROSE_STYLE`'s rule
that each sentence gets **at most one number**. The rule governs numerals. The
expression counts names and numerals together. In JavaScript both are `number`,
the addition is ordinary arithmetic, and nothing anywhere objects.

Measured consequence, from `scripts/prose-check.mjs` over the real corpus:
minimum `rawDensity` **1.75** against a curve that peaks at 1.0 and reaches zero
at 3.0 — no brief in 592 inside its range.

### Adding a name count to a numeral count is not arithmetic

The whole defect, in one expression. `namesOf` returns `int<name>` and
`numeralsOf` returns `int<numeral>`; F# has no addition between them.

<!-- proof: FS0001 -->

```fsharp
    let t = Prose.tokenise "Camden Yards plays hot. Orioles start Brandon Young."
    let conflated = Prose.namesOf t + Prose.numeralsOf t
    ignore conflated
    ""
```

### A density that includes names cannot be compared to the numeral ideal

The second half of the same mistake, and the one that survives if someone counts
the two quantities separately and then compares the wrong one. `taper` takes its
ideal and its actual in the same measure, so a `float<name/sentence>` cannot be
scored against `1.0<numeral/sentence>`.

<!-- proof: FS0001 -->

```fsharp
    let t = Prose.tokenise "Camden Yards plays hot. Orioles start Brandon Young."
    let wrong = Prose.taper Prose.idealNumeralDensity (Prose.nameDensity t)
    ignore wrong
    ""
```

### The shipped expression `raw - 1` does not type-check

`1 - Math.abs(rawDensity - 1) * 0.5` subtracts a bare number from a density.
Under units the ideal has to be a value in the same measure rather than a
literal `1`, which is why `Prose.taper` divides by the ideal — numerically the
identity at `1.0`, and the form that closes dimensionally.

This case is the reason the ideal is a named value instead of a magic constant:
a threshold with no unit is a threshold nobody can check against the rule it
came from.

<!-- proof: FS0001 -->

```fsharp
    let t = Prose.tokenise "Camden Yards plays hot. Orioles start Brandon Young."
    let deviation = Prose.numeralDensity t - 1.0
    ignore deviation
    ""
```

### The counts cannot be reached around `tokenise`

`Tokens` has private fields, so the measures cannot be stripped by reading them
directly. The only unit erasure in the module is inside `shippedRawDensity`,
where it is deliberate, named, and commented as the defect being reproduced.

<!-- proof: FS1093 -->

```fsharp
    let t = Prose.tokenise "Camden Yards plays hot. Orioles start Brandon Young."
    ignore t.Names
    ""
```

## What this does not prove

That the taper's peak is in the right place. Whether ~1 numeral per sentence is
the correct target for these formats is a judgement about writing, and the
redesign's own source comment calls 1.9 facts/sentence "much closer to ideal"
while shipping a curve peaking at 1.0. `Prose.fs` reproduces that contradiction
rather than settling it.

That Dim 1 should change. It carries the same conflation, but unlike Dim 4 it is
not saturated — roughly 7% of the corpus at its floor, running at about a
quarter of its 30-point range. A saturated instrument returns one value for
everything; a depressed one still discriminates. Changing both at once would
make the two effects inseparable.

The unit is a compile error. The target is still an opinion.
