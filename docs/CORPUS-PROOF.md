# CORPUS-PROOF — a score cannot be compared across rubrics

<!-- claim: corpus.size = 592 -->
<!-- claim: corpus.unattributed = 592 -->

`src/Corpus.fs` claims that subtracting two scores produced by different rubrics
cannot be written in F#. This document is that claim compiled.

Every case below is injected into a real source file and built by
`scripts/proof-check.mjs`. A case passes only if the build **fails** with the
stated error code.

## The defect, stated once — and it was mine

Measuring the `mlb_game` corpus across the `6aed3bb` deploy, this project
reported:

```
stored mean, pre  : 203.2
stored mean, post : 135.4
stored delta      : -67.8
```

Both are "quality_score, 0-300". They were produced by **different rubrics** —
`6aed3bb` redefined Dim 1 per-sentence and clamped Dim 4, which had been
unbounded. Subtracting them is `Prose.fs`'s finding one level up: that module
exists because `name + numeral` added incommensurable quantities, and
`score(era2) - score(era3)` subtracts them.

The conclusion drawn at the time was right, and it was right because a
**separate** experiment rescored the same texts under one rubric. The
subtraction proved nothing on its own.

### Two scores from different rubrics cannot be subtracted

The whole defect in one expression. The compiler answers **FS0193**, "type
constraint mismatch", naming both eras:

    The type 'Corpus.Score<Corpus.Era3>' is not compatible with
    type 'Corpus.Score<Corpus.Era2>'

Recorded as FS0193 rather than FS0001 because that is what it actually emits —
this document asserts the compiler's answer, not a guess at it.

<!-- proof: FS0193 -->

```fsharp
    ignore g
    let a = Corpus.asEra2 (Corpus.storedScore 203<Ceiling.point> (Corpus.Stamped 2))
    let b = Corpus.asEra3 (Corpus.storedScore 135<Ceiling.point> (Corpus.Stamped 3))
    ignore (Corpus.difference a.Value b.Value)
    ""
```

### A mean cannot mix eras

The same error in aggregate, and the form the -67.8 actually took: two means,
each over a set that was assumed homogeneous.

<!-- proof: FS0001 -->

```fsharp
    ignore g
    let a = (Corpus.asEra2 (Corpus.storedScore 203<Ceiling.point> (Corpus.Stamped 2))).Value
    let b = (Corpus.asEra3 (Corpus.storedScore 135<Ceiling.point> (Corpus.Stamped 3))).Value
    ignore (Corpus.meanOf [ a; b ])
    ""
```

### An inferred score cannot be promoted to a typed one

`asEra2` and `asEra3` demand a `Stamped` attribution. A score whose era was
deduced from a timestamp returns `None`, so the promotion cannot be assumed —
and the raw value cannot be wrapped directly, because the case is private.

<!-- proof: FS1093 -->

```fsharp
    ignore g
    let s: Corpus.Score<Corpus.Era2> = Corpus.Score 203<Ceiling.point>
    ignore s
    ""
```

### The attribution cannot be edited around

`StoredScore` has private fields, so a caller cannot restate an inference as a
stamp to get past the constructor.

<!-- proof: FS1093 -->

```fsharp
    ignore g
    let s = Corpus.storedScore 203<Ceiling.point> (Corpus.Inferred "created_at < cutoff")
    ignore s.How
    ""
```

## What this does not prove

**That any row belongs to any era.** The data does not say. `/archive/query`
projects `id, date, brief_type, sport, game_id, brief_text, model,
quality_score, word_count, source, created_at` — no `scoring_version` — so for
the committed corpus the set difference {stored} minus {attributed} is **all 592
rows**. `CC-CMD-2026-08-16-quality-coverage-route` asks for the projection.

**That the era boundaries are right.** `scripts/ceiling-check.mjs` and
`scripts/jq-density-census.mjs` both hardcode `'2026-07-16 01:36:49'` and
partition by comparing `created_at` to it. That is an inference from a
timestamp. `Attribution.Inferred` makes it say so; it does not make it correct.
