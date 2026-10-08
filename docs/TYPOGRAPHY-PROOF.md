# Typography: the compiler enforcing FIELD's type rules

FIELD's typography is the identity — "Chakra Petch … THE identity", "Two fonts
only. No Playfair, no Barlow" — and the rules are prose a reviewer is trusted to
keep. The laboratory encodes them, the same way it did color: a closed `Font`, a
closed `Role`, one exhaustive registry, a sealed style. Below are three mistakes
compiled on purpose and rejected. `scripts/proof-check.mjs` injects each into a
real source file and asserts the stated code.

## 1. The style is sealed — "no bare font-family in component code"

`TypeStyle`'s representation is private, so a component asks a role for its style
and renders it through `cssFont`; it cannot read a size off a style or build one
from a raw font string. Reaching into a sealed field does not compile.

<!-- proof: FS1093 -->

```fsharp
match g.HomeScore with
| _ -> sprintf "%g" (Typography.styleOf Typography.Data).SizePx
```

## 2. One style per role — the registry is exhaustive

Type styles come from one function over a closed union. A match on `Role` that
forgets a case does not compile (FS0025 is an error here), so "every surface has
a defined style" is a guarantee, not a convention.

<!-- proof: FS0025 -->

```fsharp
match Typography.Body with
| Typography.Body -> "body"
```

## 3. Two fonts only — a third face forces a decision

`Font` is a closed union of exactly two. Any match over it is checked exhaustive,
so adding a third face does not silently ship — it fails to compile until every
site handles it. That is what makes "two fonts only" an invariant instead of a
line in a spec.

<!-- proof: FS0025 -->

```fsharp
match Typography.ChakraPetch with
| Typography.ChakraPetch -> "chakra"
```

## What this is and isn't

**It is** evidence that the seal, the per-role registry, and the two-font limit
hold at compile time. The runtime facts a compiler cannot state — that every role
resolves to one of the two faces, that the numeric roles carry tabular numerals,
that every font stack ends in a real generic fallback — are proven over the
compiled module in `scripts/typography-check.mjs`.

**Amended 2026-10-08.** The score moved from Chakra Petch to DM Sans Variable,
because Chakra Petch ships static instances only and a score set in it cannot
vary its weight. `Score` is a NEW `Role` case, so all three proofs above still
hold unchanged and that is not a coincidence: adding a case to `Role` makes
proof 2's incomplete match *more* incomplete, and `Font` is still a closed union
of two — the variable face is DM Sans's own file, not a third family. "Two fonts
only" was never at risk. What did change is one sentence of prose above, and the
count of tabular roles, which is now two: `Data` for percentages and standings,
`Score` for the game score.

**It is not** a claim that the right role is chosen at every call site; as with
color and units, the compiler protects the interior, and which role a piece of
text uses is a judgement made where the text is rendered.
