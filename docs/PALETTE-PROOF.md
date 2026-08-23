# The palette: the compiler enforcing FIELD's color rules

FIELD's Semantic Design System v2 states its color rules in English and leans on
review to keep them: "no raw hex in component code", "gold = MUST everywhere",
and a drama-keyed palette whose thresholds a person is trusted not to cross with
the wrong quantity. Production keeps color in several string-keyed maps that have
drifted apart before — the exact class the `Sport` union removed by making one
exhaustive registry the only source.

The laboratory turns each rule into an invariant. Below are three mistakes a
person writes without noticing, each written on purpose, compiled, and rejected.
`scripts/proof-check.mjs` injects every one into a real source file and asserts
the build fails with the stated code, so these claims cannot drift ahead of the
types the way a prose rule silently can.

## 1. The hex is sealed — "no raw hex in component code" is a type error

A `Token`'s constructor is private, so a component cannot spell a color literal;
it must go through the semantic registry. Writing the hex directly does not
compile. Same seal `SealedDrama` puts on the drama peak, applied to color.

<!-- proof: FS1093 -->

```fsharp
match g.HomeScore with
| _ -> Palette.cssValue (Palette.Token "#000000")
```

## 2. The registry is exhaustive — "gold = MUST everywhere" by construction

Color comes from one function over a closed union, not from maps that can
disagree. A match on `Semantic` that forgets a case does not compile (FS0025 is
an error in this project, not a warning), which is what makes "every dimension
says the same word" a guarantee instead of a convention.

<!-- proof: FS0025 -->

```fsharp
match Palette.Semantic.Must with
| Palette.Semantic.Must -> "must"
```

## 3. The two scales cannot be crossed — a unit mismatch is a compile error

`dramaScale` buckets a `float<drama>`; `advancementScale` buckets a `float<pct>`.
They share three colors and use different thresholds, which is exactly where a
person applies the wrong bands to the wrong quantity. Feeding an advancement
percentage to the drama scale is rejected — the same units-of-measure guard that
already caught the production win-probability scale bug, pointed at color.

<!-- proof: FS0001 -->

```fsharp
match g.AwayScore with
| _ -> Palette.cssValue (Palette.tokenOf (Palette.dramaScale 50.0<Units.pct>))
```

## What this is and isn't

**It is** evidence that the three rules hold at compile time, with no runtime
check and no reviewer needed: the build simply does not produce output. The
runtime facts a compiler cannot state — that the drama and advancement bands
partition their range with no gap or overlap, that every token clears a contrast
ratio against the background — are proven separately, over real values, in
`scripts/palette-check.mjs`.

**It is not** a claim that the palette is applied correctly at every call site.
As with units, the compiler protects the interior; which semantic a card is
given is still a judgement made where the card is built. The one place that
judgement is itself typed is drama color, which only `Desk.dramaSemantic` can
supply and only under the post-game `AmnestyZone` witness.
