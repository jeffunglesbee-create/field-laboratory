# ORACLE-PROVENANCE — the copy, checked against the original

`scripts/jq-tokenizer.mjs` is the oracle that `src/Prose.fs` is measured
against. Everything Phase 1 claims rests on that file really being the relay's
`scoreProse`, and until 2026-08-15 the only evidence for it was four fixtures —
a *proxy*. Four briefs agreeing is consistent with the copy being right and also
consistent with it being wrong in a way those four briefs do not exercise.

On 2026-08-15 the original was read directly and compared line by line.

**Original:** `field-relay-nba/src/journalism-quality.js`
**At sha:** `9d8151d44f32890b818dc03b7d8565ac06b8c452` (975 lines)
**Read via:** the relay MCP's `read_lines`, whose READ_ALLOWLIST covers `src/`.

## The comparison

| oracle (`jq-tokenizer.mjs`) | relay lines | verdict |
|---|---|---|
| `words = text.split(/\s+/).filter(Boolean)` | 420 | identical |
| `sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 3)` | 422 | identical |
| `nSent = Math.max(1, sentences.length)` | 423 | identical |
| `sentStarts = new Set(sentences.map(s => s.split(/\s+/)[0]))` | 424 | identical |
| `properNouns = words.filter(...)` | — | **absent from the relay** (see below) |
| `numbersAll = words.filter(w => /\d/.test(w))` | 443 | identical |
| `factsPerSentence = sentences.map(...)` | 444-450 | identical |
| `specificity` reduce (1.0 / 0.6 / 0.3 / taper) | 451-458 | identical |
| `rawDensity = (properNouns + numbersAll) / nSent` | — | **superseded** (see below) |
| `density = max(0, min(1, 1 - abs(raw - 1) * 0.5))` | 524 | identical |
| `numsPerSent = numbersAll.length / nSent` | 523 | identical to the relay's *current* `rawDensity` |
| `densityNumsOnly` | 524 | identical to the relay's *current* `density` |
| weights `spec:30`, `density:16` | 531 | identical |

Every line the oracle claims to reproduce, and which still exists in the relay,
is **token-for-token the same expression**. The claim is no longer a chain
through four fixtures; the corpus agreement in `scripts/prose-check.mjs` now
sits on a direct comparison for the tokenisation half.

### Where it is NOT character-identical, and why that is still fine

Two formatting differences run through the whole comparison, and calling them
"identical" would be the kind of overstatement this repo exists to catch:

- **Semicolons.** The relay terminates statements; this repo does not.
- **Interior alignment.** The relay writes `const numbersAll  = words.filter(…)`
  with two spaces, aligning it against a neighbour that has since been deleted.

Neither can change behaviour — JavaScript's grammar is identical with and
without the semicolons at these positions, and interior whitespace outside a
string literal is not observable. But the difference means the copy cannot be
verified by hashing, and no future check can be built on byte equality. It has
to be compared as expressions, which is what this table is.

## The two divergences, which are the finding rather than drift

**1. `properNouns` no longer exists in the relay.** The 2026-08-13 unit fix
made it dead and it was deleted, with a comment at relay line 438 saying so:
*"`properNouns` was declared here and used ONLY by Dim 4's ratio. That ratio
now uses numbers alone, leaving this dead, so it is removed."*

The consequence for this repo is precise and worth stating plainly: the shipped
`rawDensity` **cannot be re-derived from current relay source**. It is the
pre-fix formula, and it is retained because the 592 stored `quality_score`
values in `data/jq-mlb-game-corpus.json` were produced by it. Comparing against
a formula that no longer exists anywhere is the only way to measure what those
stored scores meant.

What pins that history is the four fixtures and nothing else. That is a real
limit, it does not get better with time, and it is the reason the fixtures are
asserted before any downstream number is trusted.

**2. `densityNumsOnly` is no longer a proposal.** It was written into the oracle
as "the same curve on the unit `FIELD_PROSE_STYLE` actually names… not shipped
anywhere". Relay line 523 is now:

```js
const rawDensity = numbersAll.length / nSent;
```

which is character-identical to `numsPerSent`. So `Prose.density` — the F#
function carrying `float<numeral/sentence>` and refusing to be compared against
a name-bearing density — computes what production computes today.

This upgrades a Phase 1 claim. `outbox/cc-prose-units-2026-08-14.md` describes
the corrected dimension as the unit the rule states, verified only against the
oracle's own proposal. It is now verified against shipped code.

## What this does NOT close

- **The comparison is manual and one-shot.** It was performed by a session with
  relay MCP access. `field-laboratory`'s CI has no credential for the relay and
  should not be given one by pasting `X-FIELD-Relay` into this repo. Automating
  it needs that value held as a GitHub Actions secret — the user's call, not a
  thing to work around.
- **It is pinned to one sha.** If `journalism-quality.js` moves again, this
  document is stale and nothing here will notice. The fixtures still fire if the
  *copy* drifts; nothing fires if the *original* drifts.
- **Datamuse, `statDepth`, `variety`, and Dims 6-10 were not compared.** The
  oracle does not reproduce them and does not claim to.
