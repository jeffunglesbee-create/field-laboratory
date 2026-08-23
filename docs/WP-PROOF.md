# Market shape: the compiler refusing a live production defect

jubilant-bassoon (the FIELD app) computes a win-probability away side as the
two-way complement of home — `_wpA = _wpOdds.awayWP ?? (1 - _wpH)`. `1 - home` is
the away probability in a two-way market; in a three-way (soccer) market it is
away PLUS draw, so a three-way game reaching that branch shows the draw's
probability folded into the away side, at full confidence. The relay de-vigs
correctly; the client is the layer that lets a three-way component and a two-way
complement share one bare `number`.

`Market.fs` gives win-probability its market shape as a type. Below are the
operations that defect is made of, each written on purpose, compiled, and
rejected. `scripts/proof-check.mjs` injects every one into a real source file and
asserts the build fails with the stated code. Same technique as
docs/UNITS-PROOF.md, one axis over: there a vigged price could not be confused
with a probability; here a two-way complement cannot be taken on a three-way
market.

## 1. The exact line — a two-way complement on a three-way market

`awayComplement` (the `1 - home` operation) exists for `TwoWay` and has no
`ThreeWay` counterpart, so the client's fallback cannot be written against a
three-way market at all.

<!-- proof: FS0001 -->

```fsharp
match Market.devigThreeWay 0.5<Units.implied> 0.3<Units.implied> 0.3<Units.implied> with
| Some tw -> Market.awayComplement tw
| None -> 1.0<Units.prob>
```

## 2. A three-way market cannot be read with two-way accessors

The shapes are distinct types, so a three-way market cannot be silently treated
as a two-way one anywhere — not just at the complement.

<!-- proof: FS0001 -->

```fsharp
match Market.devigThreeWay 0.5<Units.implied> 0.3<Units.implied> 0.3<Units.implied> with
| Some tw -> Market.twoWayHome tw
| None -> 1.0<Units.prob>
```

## 3. A bare number cannot become a market

The client's root cause was one untyped `number` standing in for a probability of
unknown shape. A market cannot be built from a bare float — it must carry its
`prob` unit, which is where the shape is established.

<!-- proof: FS0001 -->

```fsharp
Market.twoWay 0.4 0.6
```

## What this is and isn't

**It is** evidence that the miscalculation cannot be written: the two-way
complement, the two-way accessor on a three-way value, and the untyped
construction all fail at compile time, with no runtime check and no per-site
assertion. The arithmetic of the defect — that on a real de-vigged three-way set
`1 - home` equals away + draw, not away — is demonstrated over real numbers in
`scripts/wp-check.mjs`.

**It is not** a claim that a three-way game reaches the client's fallback branch
in production today. The path is reachable; whether live soccer data hits it is
the client's to probe. The type removes the branch either way — the same
"compliant only by accident of the data" reasoning behind the amnesty gate.
