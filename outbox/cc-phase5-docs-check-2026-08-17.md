# Outbox — Phase 5: documents that stop being true stop the build

**Date:** 2026-08-17
**Ships:** `scripts/docs-check.mjs`, claims embedded in four docs, one verify
step, one mutation

## What it does

`proof-check.mjs` keeps COMPILER claims honest. This keeps the PRODUCTION
numbers honest — the corpus minimums, percentages and scales that documents
quote and nothing re-derives.

    <!-- claim: prose.flooredPct = 91.2 -->

The id names an entry in a registry that computes the value from committed data.
The document states what it believes; the registry states what is true; a
mismatch fails the build and names both.

Twelve claim ids, eleven claims live across `PROSE-PROOF`, `CEILING-PROOF`,
`JOURNALISM-PROOF` and `JLAYER-PLAN`. Every one was measured once, written into
prose, and never re-checked until now.

## Two deliberate deviations from the Phase 5 sketch

**"Every doc claim carries the command that re-derives it" — not done, on
purpose.** Executing arbitrary shell written inside markdown is a
code-execution surface in a repo where docs are the least-reviewed files, and it
puts a process spawn behind every claim. A named-claim registry gets the same
property in under a second.

The cost is real: a NEW kind of claim needs a registry entry, so the registry
gates what can be asserted. That is the trade — claims nothing can compute are
exactly the claims that rot.

**A verify step, not a gate row.** The plan left this open and it is now
decided. Gate rows moved to `verify-full` and run weekly; a stale document caught
seven days late is most of the way to not catching it. This runs on every push
for under a second.

## Teeth, measured two ways

**Its own self-test**, run first and in the same command, because a docs checker
that cannot detect a stale claim would report every document true forever. It
writes four documents to a temp directory — fresh, stale, unknown-id, and one
making no claim at all — and requires the right verdict for each. 4/4.

**A real mutation.** `doc-claim-goes-stale` edits
`docs/PROSE-PROOF.md`'s `91.2` to `50.0` and requires `docs-check` to fail. It
mutates the DOCUMENT rather than the checker, because mutating the checker to
test the checker is circular.

Non-vacuity is the first assertion in the real run: "every claim is true" is free
when there are no claims, and a regex that stopped matching would report exactly
that. Verified by running it before any claims existed — it failed.
