# The pick score cannot be displayed — compiler-verified

`SealedRank` in `src/Pick.fs` claims that FIELD's Pick score can be sorted by
and never rendered. Every violation below was written on purpose, compiled for
real, and the error copied verbatim. `scripts/proof-check.mjs` re-injects each
one on every CI run, so the claim cannot rot into prose.

## Why this claim exists

The live 2026-07-07 response carries `score: 3.5` alongside
`reasons: ["tight line (1.5)", "prime time", "national broadcast"]` — three
reasons scoring 3.5, two scoring 3. The score is a sum over independent boolean
dimensions. That is a composite.

ADR-002 PROHIBITED #3 — displaying a raw composite number to the user, severity
CRITICAL — is the prohibition the 2026-07-07 push/pull re-analysis explicitly
did **not** relax. It recorded that the corrections to Rules A/B/C/E "does NOT
touch the separate, still-fully-enforced prohibition on displaying a raw
composite number to the user."

FIELD's own Scout's Pick architecture doc states the same constraint from the
patent side: *"`_rankSignal()` is for SORT ORDER only. The ranking scores are
NOT summed or compared to a threshold for qualification."*

**What is and is not claimed.** No ADR-002 clause names the *pick* score
specifically. This applies the drama precedent by analogy, because the two
values have the same shape and the same failure mode. If the analogy is wrong it
is wrong in the safe direction: the number is withheld and nothing downstream is
misled.

**No amnesty zone, deliberately.** `formatDramaPeak` exists because ADR-002
Defense 4 grants a documented post-game exemption for the drama number. No such
exemption is recorded for the pick, so there is no `formatRank`, no witness type
and no post-game branch. Inventing an exemption to make a panel read better is
precisely the move the amnesty gate was built to stop.

## What the compiler said

**1 — format the rank directly:**

<!-- proof: FS0001 -->
```fsharp
let entry : Pick.PickEntry = Unchecked.defaultof<_>
sprintf "%.1f" entry.Rank
```
```
src/Scoreboard.fs(28,20): (28,30) error FSHARP: The type 'Pick.SealedRank' is not
compatible with any of the types float,float32,System.Decimal, arising from the
use of a printf-style format string (code 1)
```

**2 — unseal it by pattern match, then format the float:**

<!-- proof: FS1093 -->
```fsharp
let entry : Pick.PickEntry = Unchecked.defaultof<_>
match entry.Rank with
| Pick.SealedRank raw -> sprintf "%.1f" raw
```
```
src/Scoreboard.fs(29,7): (29,26) error FSHARP: The union cases or fields of the
type 'SealedRank' are not accessible from this code location (code 1093)
```

**3 — construct one from outside the module, to get a float back out later:**

<!-- proof: FS1093 -->
```fsharp
ignore (Pick.SealedRank 9.9)
```
```
src/Scoreboard.fs(27,13): (27,28) error FSHARP: The union cases or fields of the
type 'SealedRank' are not accessible from this code location (code 1093)
```

## What this does NOT prove

Three honest limits, stated because the last three overstated claims in this
repo were all in prose about guards.

**It does not prove the number never reaches the DOM by another route.** The
seal stops the F# path. A future renderer could fetch the raw JSON itself and
read `score` straight off it, and nothing here would object. That is why
`scripts/tab-check.mjs` asserts, in a real browser against the committed
fixture, that the string `3.5` appears nowhere in `document.body`. Two
independent checks, because either alone is satisfiable while wrong.

**It does not prove the score is a composite in ADR-002's sense.** That is an
inference from the shape of the live data and from the Scout's Pick doc's own
framing, not a citation. It is recorded as an inference above.

**It does not seal anything in Scout's Pick.** There is no Scout score in this
payload to seal. `ScoutVerdict` is boolean gates over independent dimensions,
which is what the architecture doc requires, and nothing sums them.

## The other half: reasons ARE displayable

Worth stating so the seal is not read as "hide everything". Each reason is a
single-dimension statement — "tight line (1.5)", "prime time" — and production
already surfaces them. The panel shows every reason and withholds only the sum
that weighs them. Showing the evidence while withholding the composite is the
ADR-002 shape, not a compromise with it.
