# The deferred judgement, resolved: `src/Ceiling.fs` is drift

**2026-09-20** · the Task 2 question CC-CMD-2026-09-11 left open

Task 2 said the stale documents must be reported, not fixed, because *"rewriting
a proof doc's numbers is a judgement about what the doc is arguing."* The open
question underneath that: is `src/Ceiling.fs`'s `300`/`245` **stale**, or is it
**deliberately encoding the historical scale the 240 bar was set against**? Its
own argument is that a bar from one scale cannot judge a score from another, so
preserved history was a live possibility.

**It is drift.** Three independent lines of evidence, and the third is the one
that settles it.

## 1. Tense — and the author's own convention distinguishes them

`src/Ceiling.fs` is present-tense about the relay:

> `field-relay-nba/src/journalism-quality.js` **scores** prose on ten dimensions
> totalling 300 points.
> So Dim 7 (Context, 25) and Dim 10 (Matchup, 30) **are** structurally zero — 55
> of 300 points **are** unreachable by construction.

The same header dates things when it means *then*: the seven-day measurement is
introduced as *"Measured on 2026-08-15"*. So the undated present-tense claims are
claims about now, by the file's own convention.

## 2. The numbers moved

| | header says | relay computes today |
|---|---|---|
| nominal | 300 | **294** |
| relay-reachable | 245 | **252** |

Evaluated, not read off a comment — `NOMINAL_TOTAL` and `REACHABLE_CEILING` are
derived from `SCALE` at runtime.

## 3. The MECHANISM moved, which history could not survive

This is the decisive one. A preserved historical number stays true of its era.
A description of a mechanism does not survive the mechanism being replaced.

`journalism-quality.js` now says, of the two dimensions this module calls
structurally zero:

> Era 5 and era 6 replaced both of the game-fact dimensions with ones that
> **ABSTAIN AT THE MIDPOINT** when the fact is missing: `marginAgreement(text,
> null)` is 15 of 30, and `finalityAgreement(text, null)` is 10 of 20.
> **Neither is unreachable.**

Measured: `UNREACHABLE_DIMS_GAME = []`, `UNREACHABLE_DIMS = ["ctx"]`.

"55 of 300 points are unreachable by construction" is not an old number that
remains true of 2026-08. It describes a construction the relay no longer has.

## The root is in the relay, and it is worth the detour

`journalism-quality.js:485` still reads:

> Worker runtime: … ceiling reduces to **245**

while the same file computes `REACHABLE_CEILING = 252`. And the comment block
**immediately below it** explains why that is dangerous:

> The breakdown above used to live only in that comment, so 245 was a number a
> reader had to trust and a maintainer had to remember to update. Summing the
> caps actually in play makes it move on its own.

The derivation shipped. The comment above it was never updated. **The comment
documenting why comments go stale, went stale** — and `src/Ceiling.fs`
transcribed it faithfully, which is why the laboratory's copy is wrong.

So the drift did not begin here. It began in the relay, in prose, one paragraph
above the fix for exactly that failure.

## What this does NOT invalidate

**The type machinery stands.** `Scale<'tag>` makes a threshold carry the scale it
was set on, and comparing across scales does not type-check. That is true for any
numbers filling it. What is stale is the constants and the mechanism prose — not
the argument, and not `CEILING-PROOF.md`'s compiled cases.

That is why this resolves to a **numbers-and-prose correction, not a rewrite**,
which is the thing Task 2 could not know without looking.

## Already corrected, and worth noting as counter-evidence

`CEILING-PROOF.md:110-116` explicitly retracts a different claim — *"That the
relay is still alerting on it. **It is not.**"* — recording that the live alert
predicate moved to per-brief_type calibrated percentiles and that the flat 240
survives only as a reported figure.

The author updates claims when they learn they moved. The ceiling numbers were
never retracted because nobody re-checked them. That is drift by neglect, not
history by intent.

## What a fix would touch, and why it is not done here

Four sites across two repositories, and the relay one comes first because the
laboratory's is a transcription of it:

1. `field-relay-nba/src/journalism-quality.js:485-487` — header comment says 245
   and "N/A→0"; the code computes 252 and abstains at the midpoint.
2. `field-laboratory/src/Ceiling.fs:67,72` — `Max = 300`, `Max = 245`.
3. `field-laboratory/src/Ceiling.fs` header — the "structurally zero" prose.
4. `docs/CEILING-PROOF.md` — four `<!-- claim: -->` markers and the prose quoting
   the relay header.

**Not done in this session**: the standing instruction is to report stale
documents rather than fix them, and this crosses a repository boundary. The
verdict is the deliverable.

**Confidence: 95.** The numbers and the mechanism are measured. The residual is
interpretive — whether the module's author would prefer to update the constants
or to relabel them as the historical scale and add the live one beside. Both are
defensible; only the first matches the file's present tense.
