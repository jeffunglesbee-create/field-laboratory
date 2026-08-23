# Outbox — the palette migration blinded a mutation anchor

**Date:** 2026-08-23
**Ships:** `scripts/mutation-check.mjs` — the `cards-run-together` anchor updated
to the tokenised CSS the palette work shipped.

## The defect

The confidence gate's mutation row failed its baseline:

```
FAIL  [cards-run-together] the mutation anchor still exists
      → not found in index.html: .st-card, .wx-row {
```

The `cards-run-together` mutation neutralises the one CSS rule that draws card
borders, then asserts `games on a panel are separated from each other` goes red —
the proof that the separation check has teeth. It finds that rule by an exact
string:

```
  .st-card, .wx-row {
    border: 1px solid #262a33;
    border-radius: 10px;
    padding: 1rem 1.1rem;
    background: #161920;
  }
```

The palette work migrated `index.html` to design tokens — `#262a33 → var(--edge)`,
`#161920 → var(--card)` — so that exact block no longer exists. The anchor could
not be found, the mutation could not be applied, and the mutation harness's
baseline ("the unmutated tree passes every expectation") failed. **Detection was
lost for the separation invariant**, weight 20 on the gate rubric ("a guard
without teeth").

## Why per-push CI never caught it

`mutation-check` is not in `verify.yml` — it runs weekly in `verify-full.yml` and
in the local confidence gate. So the palette commit went green through per-push
verify and deployed with the anchor already stale. The confidence gate is where
it surfaced, which is the gate doing its job: a whole-tree conjunction catches a
latent break that the fast path is blind to.

## The fix

Update the `find` string to the tokenised rule. The `replace` is unchanged — it
already collapses the rule to `border: 0; padding: 0; background: transparent`,
which removes the boundary whatever colour it was drawn in, so the mutation still
trips the separation check. This is a check-side change only; `index.html` and the
separation logic are untouched.

## Verified

`node scripts/mutation-check.mjs --self-test` 4/4. The anchor now matches
`index.html` verbatim (confirmed byte-for-byte). The full mutation suite and the
confidence gate's `breaking each invariant makes a check fail` row pass with the
baseline restored. No source behaviour changed — only the harness can see its
target again.
