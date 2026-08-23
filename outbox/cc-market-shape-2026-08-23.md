# Outbox — win-probability market shape as a type

**Date:** 2026-08-23
**Ships:** `src/Market.fs`, `docs/WP-PROOF.md`, `scripts/wp-check.mjs`. A typed
answer to a live-shaped defect found in jubilant-bassoon.

## The defect it removes

The FIELD app computes a win-probability away side as the two-way complement of
home — `_wpA = _wpOdds.awayWP ?? (1 - _wpH)`. `1 - home` is the away probability
in a **two-way** market; in a **three-way** (soccer) market it is away **plus
draw**. So a three-way game reaching that branch renders `0.45 / 0.28 / 0.27` as
home 45% / away 55% / no draw — the draw's probability folded into the away side
and shown at full confidence. The relay de-vigs correctly (`ambient-do.js:622`);
the client is the layer that lets a three-way component and a two-way complement
share one bare `number`.

## The type

`Market.fs` gives win-probability its market shape. `TwoWay` and `ThreeWay` are
distinct types with private constructors that validate the sum. `awayComplement`
— the `1 - home` operation — exists for `TwoWay` and has **no** `ThreeWay`
counterpart, so the client's fallback cannot be written against a three-way
market. This is the `implied` vs `prob` proof one axis over: there a vigged price
could not be confused with a probability (meaning at one scale); here a two-way
complement cannot be taken on a three-way market (shape at one meaning). Both
removed the same way — a type that makes the wrong operation fail to compile.

## Proven both ways

- **Compiler (`docs/WP-PROOF.md`, under `check:proof`):** three FS0001
  rejections — the two-way complement on a three-way market, a two-way accessor
  on a three-way value, and an untyped (bare-float) construction.
- **Arithmetic (`scripts/wp-check.mjs`, in `verify`, 7/7):** on a real de-vigged
  three-way price (home -110 / draw +240 / away +260), the two-way complement
  `1 - home` equals away + draw and NOT away, with the draw a non-trivial ~0.27
  the two-way path discards. Constructors validate the sum; the two-way path
  still resolves the laboratory's own README example (-142/+132 → sums to 1).

## Honest limit

The client's two-way fallback branch is reachable, but a live three-way game was
not confirmed to hit it — a latent defect on a permitted branch, not a confirmed
live miscalculation. The type removes the branch regardless of whether today's
data reaches it (the "compliant only by accident of the data" reasoning behind
the amnesty gate). Confirming a live soccer game reaches the client branch is the
client's to probe, not the laboratory's; recorded in `Market.fs` and WP-PROOF.

## Not wired into the desk

Like `Units`, this is a typed answer plus its proofs, not a card feature — the
desk does not render win-probability. It answers one of the questions the
laboratory exists for: does a type earn its keep against a real FIELD failure
mode. Here it would have made the miscalculation impossible.
