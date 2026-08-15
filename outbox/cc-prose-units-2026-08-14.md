# Outbox — Phase 1: the JQ unit error, refused by the compiler

**Date:** 2026-08-14
**Ships:** `src/Prose.fs`, `docs/PROSE-PROOF.md`, `scripts/prose-check.mjs`,
`scripts/jq-tokenizer.mjs`, one mutation invariant, one verify step

## What this is

The first phase of the J-Layer/JQ mapping. It answers one question with
evidence rather than argument: **would a real type system have prevented the
defect that floored a JQ dimension for four weeks?**

The defect, established earlier this session and since fixed relay-side: Dim 1
(weight 30) and Dim 4 (weight 16) of `scoreProse` compute
`(properNouns + numbers) / nSent` and compare it against an ideal of `1`, taken
from `FIELD_PROSE_STYLE`'s rule that each sentence gets **at most one number**.
The rule governs numerals. The expression counts names and numerals together.

## What was measured, not asserted

`scripts/prose-check.mjs` runs `src/Prose.fs` against the relay's real
tokeniser over all **592** briefs in `data/jq-mlb-game-corpus.json`:

```
PASS  the corpus is present and the expected size
PASS  the oracle still matches its hand-verified fixtures
PASS  every brief in the corpus tokenises identically in F# and the oracle
PASS  the float agreement is exact, not merely within tolerance
PASS  no brief in the corpus is inside the shipped curve's range
PASS  the shipped dimension is at its floor for ~91% of the corpus
PASS  on the unit the rule states, the dimension discriminates again
PASS  the stated ideal is one numeral per sentence
PASS  the taper peaks at the ideal and floors three times above it
PASS  names outnumber numerals roughly 3 to 2, as the module claims
PASS  the dimension weights match the relay
11/11 checks passed
```

Agreement is **exact**, not within tolerance — the largest observed delta across
`specificity`, `rawDensity`, `shippedDensity`, `numeralDensity` and `density` is
**0**. The epsilon in the comparison is not hiding anything, and the check
reports the worst delta rather than trusting the epsilon.

Corpus facts the module states in its own header, now asserted rather than
written down: minimum `rawDensity` **1.75** against a curve peaking at 1.0 and
zeroing at 3.0, and **91.2%** of briefs at the shipped dimension's floor.
Aggregate ratio **3902 names to 2652 numerals = 1.4713:1**.

## Why agreement is the test

A port that quietly computed something more sensible than the thing it claims to
reproduce would pass every check it wrote for itself and prove nothing about
production. So `Prose.fs` reproduces the relay's asymmetries deliberately —
`Names`/`Numerals` counted over the whole text with every sentence's first word
excluded globally, while `PerSentence` excludes only each sentence's own first
word. That is odd, it is in the relay, and tidying it would have broken the only
assertion that matters.

The oracle is `scripts/jq-tokenizer.mjs`: `scoreProse`'s body copied verbatim,
pinned by four hand-verified briefs. It was extracted from
`jq-density-census.mjs` in this commit so there is **one** verbatim copy rather
than two — two reproductions of an original neither can see is two things to
keep in sync, which is the failure this repo keeps finding elsewhere.

## What the compiler refuses

`docs/PROSE-PROOF.md`, four cases, each compiled for real by `proof-check.mjs`
and passing only when the build **fails** with the stated code:

| case | error |
|---|---|
| `namesOf t + numeralsOf t` | FS0001 |
| `taper idealNumeralDensity (nameDensity t)` | FS0001 |
| `numeralDensity t - 1.0` — the shipped `raw - 1` | FS0001 |
| `t.Names` — reaching around `tokenise` | FS1093 |

The only unit erasure in the module is inside `shippedRawDensity`, where it is
deliberate: `(t.Names / 1<name>) + (t.Numerals / 1<numeral>)`. Two visible,
named strips. Nobody writes that by accident. In JavaScript the same expression
is `properNouns.length + numbersAll.length` and reads as obviously correct.

## A defect of mine, and why the fix was not to move the threshold

The name/numeral assertion was first written as *"more than 70% of briefs carry
more names than numerals"* — a threshold invented in the check with no basis. It
failed at **69.6%**.

Moving it to 0.65 would have been fitting the assertion to the data. The module
claims something specific and independently stated — names outnumber numerals
"roughly 3 to 2" — so the check now asserts **that**, and reports the 69.6% as
detail rather than as a bar. This is recorded because inventing a threshold and
then tuning it until it passes is the exact failure this file's own subject
matter is about.

## What is NOT proven

- **That the taper's peak is right.** Whether ~1 numeral/sentence is the correct
  target is a judgement about writing. The redesign's own comment calls 1.9
  facts/sentence "much closer to ideal" while shipping a curve peaking at 1.0.
  `Prose.fs` reproduces that contradiction rather than settling it.
- **Dim 1 is deliberately unchanged.** Same conflation, but it is not saturated
  — ~7% of the corpus at floor, running at about a quarter of its 30-point
  range. A saturated instrument returns one value for everything; a depressed
  one still discriminates. Changing both at once makes the effects inseparable.
  The relay reached the same conclusion independently.
- **One `brief_type`.** `mlb_game` only. `/quality/report` shows the same
  `failure_pct: 100` across 13 types; this measured one of them.
- **No score, no rubric version, no `ScoredBrief`.** Those belong to Phase 2,
  where they have consumers. Shipping public values nothing reads would trip
  `unused-check`, and a type with no consumer proves nothing anyway.

## An operational note worth keeping

Mid-build, a mutation test reported "defended by the COMPILER" — a result that
looked like a pass and was an artifact. `proof-check.mjs` was running in the
background, injecting proof cases into `src/Scoreboard.fs`, and my build picked
up its in-flight injection. The error came from `Scoreboard.fs(123,17)`, a file
this change does not touch.

Same class as the stranded mutations of 2026-08-13: a harness that edits source
in place is not safe to run concurrently with anything that builds. Recorded
rather than worked around, because the failure mode is a *green-looking* result
from a test that never ran.
