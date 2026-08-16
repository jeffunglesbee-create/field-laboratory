# CEILING-PROOF — a bar from one scale cannot judge a score from another

`src/Ceiling.fs` claims that applying a threshold decided against a 300-point
rubric to a scorer that tops out at 245 cannot be written in F#. This document
is that claim compiled.

Every case below is injected into a real source file and built by
`scripts/proof-check.mjs`. A case passes only if the build **fails** with the
stated error code.

## The defect, stated once

`field-relay-nba/src/journalism-quality.js` documents its own reachable total:

```
// Worker runtime: no localStorage, no DOM, game object not available (relay
// scores without game context — Dims 7/10 return N/A, ceiling reduces to 245)
```

`/quality/report` applies a flat bar of 240. Measured 2026-08-15 over the
preceding seven days: `above_240` was **0** on all 25 brief_type/sport rows,
`below_flat_240_pct` was **100** on all 10 alerts, and the best brief scored
**230**.

240 is 80% of 300. It is **97.96%** of 245. In JavaScript both are `number`, the
comparison `score >= 240` is ordinary arithmetic, and nothing objects.

### A score cannot be judged by a threshold from another scale

The whole defect in one expression. `Score<'tag>` and `Threshold<'tag>` share a
phantom tag, so `passes` requires both to come from the same scale.

<!-- proof: FS0001 -->

```fsharp
    let s = Ceiling.score Ceiling.relayReachable 179<Ceiling.point>
    let verdict = Ceiling.passes Ceiling.flatBarAsDecided s
    ignore verdict
    ""
```

### The two scales are not interchangeable, even at the same number

`flatBarAsDecided` and `flatBarAsApplied` are both 240 points. They are not the
same value, and assigning one where the other is expected is refused — which is
what makes "we always used 240" an insufficient defence.

<!-- proof: FS0001 -->

```fsharp
    let bar: Ceiling.Threshold<Ceiling.Nominal> = Ceiling.flatBarAsApplied
    ignore bar
    ""
```

### A fraction of one scale is not a fraction of another

`atFraction` takes the scale, so "80%" resolves to 240 points on the nominal
scale and 196 on the relay's. The bar cannot be carried across by writing the
number down.

<!-- proof: FS0001 -->

```fsharp
    let bar = Ceiling.atFraction Ceiling.nominal 0.8
    let s = Ceiling.score Ceiling.relayReachable 179<Ceiling.point>
    ignore (Ceiling.passes bar s)
    ""
```

### The scale's maximum cannot be edited around

`Scale` has private fields, so a caller cannot quietly restate the ceiling as
300 to make the bar look reasonable.

<!-- proof: FS1093 -->

```fsharp
    ignore Ceiling.relayReachable.Max
    ""
```

### A raw integer is not a score

Scores are constructed through `score`, which takes the scale. A bare number
carries no scale and cannot be compared.

<!-- proof: FS0001 -->

```fsharp
    ignore (Ceiling.passes Ceiling.flatBarAsApplied 179<Ceiling.point>)
    ""
```

## What this does not prove

**What the bar should be.** Whether 80% of *reachable* — 196 on the relay's
scale — is the right editorial standard is a judgement about journalism, and no
type decides it. This module makes the scale explicit; it does not pick one.

**That 240 is unreachable in principle.** It is 5 points below a 245 ceiling, so
it is reachable arithmetically. The measurement says no brief in seven days came
within 10 points of it, across 25 brief_type/sport combinations. Those are
different claims and only the second is established here.

**That the relay is still alerting on it.** It is not. The live alert predicate
now uses per-brief_type calibrated percentiles (`threshold_source:
brief_type_p25(...)`, values 123–169). The flat 240 survives as a *reported*
figure — `below_240`, `above_240`, `below_flat_240_pct` — which is why a
constant 100 still reads as a quality catastrophe rather than an arithmetic
certainty.
