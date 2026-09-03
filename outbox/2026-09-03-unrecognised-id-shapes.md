# What ARE the 956 `unrecognised` ids?

The relay's provenance census called **591** rows `dash`. `schemeOf` calls
**956** `unrecognised`. Different predicates over the same rows — `idScheme`
requires a leading ISO date **and** no underscore anywhere, `schemeOf` calls
`unrecognised` everything matching none of seven shapes — so `unrecognised` is
the wider set and roughly 416 rows sit in neither the dash shape nor any
recognised one.

That difference was recorded as *"its own question"* on 2026-09-03 and never
measured. `scripts/probe-unrecognised-id-shapes.mjs` measures it.

## The families are derived, not enumerated

Listing the shapes I expect and counting them would find exactly the shapes I
thought of — and the whole reason this bucket exists is that the column holds key
spaces nobody enumerated. So each id is reduced to a **signature**: digit runs to
`9`, letter runs to `a`, separators kept. The families are whatever the
signatures group into, and a shape nobody has ever seen appears as its own row.

**Runs, not characters.** `2026-08-30-mls-stl-dal` and
`2026-08-30-mls-stlouis-dallas` are one shape differing only in abbreviation
length; per-character substitution splits them and buries the grouping under
length noise. Asserted, and a mutation to per-character drops the self-test to
11/14.

## The reconciliation is a prediction, not a restatement

This probe restates the relay's dash rule so the two counts can be compared —
a second copy of a predicate, which this project normally refuses, and which
exists here only because the two repos cannot import from each other on a runner.

It is made safe by being **falsifiable**: the census measured 591 dash rows over
2777 on 2026-09-03T03:40Z, and 51 dash rows were merged away later that day. So
this must now report **540**. A restatement that had drifted would not land on
the number the other repo measured minus the number this repo deleted.

## Teeth

14/14 self-tests, every rule proven by mutation:

| mutation | result |
|---|---|
| `signature` substitutes per character, not per run | 11/14 |
| the underscore half of the dash rule is lost | 13/14 |
| the date **anchor** is dropped | 12/14 |
| a two-digit year is allowed | 13/14 |

**The anchor mutation passed 14/14 until a counterexample existed.** No test had
a date appearing anywhere but the start, so an unanchored restatement would have
counted `mls-2026-08-30-stl-dal` as dash-scheme and over-counted the
reconciliation with nothing noticing. Two cases now cover it.

## Result

Pending the run.
