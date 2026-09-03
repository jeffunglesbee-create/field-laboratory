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

## Result — run `33796824941`. The reconciliation holds exactly, and the gap is my instrument.

```
rows 2724   unrecognised 956
dash 540    predicted 540    GAP 416
```

**540 = 540.** The census's 591 over 2777 rows, minus the 51 merged away, lands
on the number this restatement of the rule produces. The two predicates agree,
which is what the prediction was for.

### The 416 decompose into two things, and only one is a mystery

| | rows |
|---|---|
| `${label}_${date}_${home}_${away}` — **our own shape, with a non-acronym label** | **397** |
| round labels (`nba-ecf-2026-g1`, `nhl-east-semis-2026-g7`, `ufl-playoffs-2026-wk9`) | 19 |
| | **416** |

397 of the 416 are **not a foreign scheme at all.** They are the same
`provider-composite` shape `/archive/game` writes, misfiled because
`schemeOf`'s test is `/^[A-Z]{2,5}_/` — two to five UPPERCASE letters and then
an underscore:

```
MLS_2026-08-29_a_b                            -> provider-composite
Bundesliga_2026-08-28_bayern_stuttgart        -> unrecognised
EFL Cup_2026-08-08_qpr_millwall               -> unrecognised
FIFA World Cup 2026_2026-06-20_netherlands_sweden -> unrecognised
Ligue 1_2026-09-03_e401876468                 -> unrecognised
```

A league whose label carries a **space**, a **lower-case letter**, or **more
than five characters** falls through. `Bundesliga` fails on one letter of case.
And the last line is `d253209`'s new numeric-ESPN key — **the key this session
shipped is itself being filed as unrecognised** whenever the league is not an
acronym.

The eleven families, all one scheme wearing different label widths:

```
 155  a a a 9_9-9-9_a_a      FIFA World Cup 2026_… · MLS 52
 109  a a_9-9-9_a_a          EFL Cup_… · La Liga · Serie A
  48  a a a a a_9-9-9_a_a    UEFA Europa Conference League Qualifying_…
  33  a a a a_9-9-9_a_a      UEFA Europa League Qualifying_… · UCL Qualifying
  18  a 9_9-9-9_a_a          Ligue 1_…
  15  a a_9-9-9_a9           PGA Tour_2026-06-26_src401811953
   9  a_9-9-9_a_a            Bundesliga_…
   7  a a_9-9-9_a_a9         EFL Trophy_…_brightonu21
   1  a a a a_9-9-9_a_a9   ·   1  a a a a_9-9-9_a9_a   ·   1  a 9_9-9-9_a9
```

### The error is mine, and it is a reuse error

`schemeOf` was built for `briefs.game_id`, where the capture measured
`provider-composite 32 "MLS_MLS-COM-…"` — acronym labels. It is not wrong for
that population. **I applied it to the games table, which carries full league
names, and reported the regex's narrowness as a property of the data.**

Every statement this session made about "956 `unrecognised` rows across 22
sports" was measuring the classifier as much as the archive. The counts were
real; the reading was not.

### What is actually unaccounted for

**19 rows.** Round labels in NBA, NHL and UFL — `nba-ecf-2026-g1`,
`nhl-east-semis-2026-g7`, `ufl-playoffs-2026-wk9`. A genuine fourth scheme,
addressing a series game by round and ordinal rather than by fixture. They are
the only ids in the archive whose key space nothing in this repo names.

## What this does NOT change

The merges. `mixedScheme` compares scheme *labels* for inequality — it never
needed either label to be right, only different — and the 53 pairs it found were
`provider-composite` against a genuinely foreign shape in every case. A pair of
two mislabelled rows would have compared equal and never entered a plan.

## Next

`schemeOf`'s `provider-composite` test needs widening, and that is a change to a
classifier `game-id-check.mjs` asserts fixed counts against — so it is its own
task with its own before/after, not a fix to smuggle in here.
