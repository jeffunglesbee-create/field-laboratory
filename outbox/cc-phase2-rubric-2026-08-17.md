# Outbox — Phase 2, and the subtraction I got wrong

**Date:** 2026-08-17
**Ships:** `src/Corpus.fs`, `docs/CORPUS-PROOF.md`, `scripts/corpus-check.mjs`,
one mutation, one verify step

## The defect is mine

Measuring the corpus across `6aed3bb`, this project reported:

```
stored mean, pre  : 203.2
stored mean, post : 135.4
stored delta      : -67.8
```

Both are "quality_score, 0-300". They were produced by **different rubrics** —
`6aed3bb` redefined Dim 1 per-sentence and clamped Dim 4, which had been
unbounded. Subtracting them is `Prose.fs`'s finding one level up: that module
exists because `name + numeral` adds incommensurable quantities, and
`score(era2) - score(era3)` subtracts them.

The conclusion drawn at the time — that the drop was formula, not prose — was
right, and it was right because a **separate** experiment rescored the same texts
under one rubric. The subtraction proved nothing on its own. That distinction is
the module.

## Why the planned Phase 2 was unbuildable, and what replaced it

The plan: make `unscored` a set difference and reproduce production's
`unscored_count`. Unbuildable — `/quality/report` reports `unscored_count: 0`,
so the difference is empty, and a set difference proven on an empty difference is
the vacuity failure this repo keeps finding.

The non-empty difference was one field over. Every row carries a
`quality_score`; **not one carries a `scoring_version`**. The projection is
`id, date, created_at, quality_score, word_count, source, brief_text`. So
{stored scores} minus {scores whose rubric is known} is **all 592 rows** —
measured, not assumed.

Same shape as `Journalism.AnsweringModel`: a stored value whose provenance the
store does not record. There it was which model wrote the text; here it is which
rubric scored it.

## And laboratory guesses, in two places

`scripts/ceiling-check.mjs` and `scripts/jq-density-census.mjs` both carry
`const CUTOFF = '2026-07-16 01:36:49'` and partition by comparing `created_at`
to it. That is an inference from a timestamp, and neither file said so.
`Attribution.Inferred` carries the basis, so a guess cannot be mistaken for a
fact by reading the value alone. The check asserts there is exactly **one**
distinct basis and that it names the hardcoded cutoff.

## What the compiler refuses

Four cases, all confirmed. The first answers **FS0193**, not FS0001:

```
The type 'Corpus.Score<Corpus.Era3>' is not compatible with
type 'Corpus.Score<Corpus.Era2>'
```

Recorded as FS0193 because that is what it emits. I had written FS0001 and the
proof failed — the document now asserts the compiler's answer rather than my
guess at it.

| case | error |
|---|---|
| subtracting an era-2 score from an era-3 score | FS0193 |
| a mean over a list mixing eras | FS0001 |
| wrapping a raw int as `Score<Era2>` | FS1093 |
| reading `StoredScore.How` to restate an inference as a stamp | FS1093 |

Teeth: mutation `inferred-score-promotes` lets an `Inferred` score promote to a
typed one — erasing the distinction between "the data says era 2" and "a
timestamp comparison suggests era 2" — and `corpus-check` fails.

## A defect caught by its own non-vacuity assertion

The first run reported `0 of 592 stored scores have no known rubric`, which would
have read as good news. It was the F#-list-versus-JS-array trap: `List.filter`
over a JS array silently finds nothing — the same bug that made
`sport-registry-check` report 0 distinct coordinates. Fixed with `ofArray`, and
the reason the non-vacuity checks are first.
