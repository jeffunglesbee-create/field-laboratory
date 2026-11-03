# Session 2026-11-03 — proof-check: one batched compile (IN PROGRESS, branch `proof-batch`)

Snapshot, not a landing. `docs/CC-CMD-2026-11-03-proof-check-shards.md` is IN PROGRESS and this file is finished when it is marked DONE.

- Task 0 changed the design: one compile of all 133 cases (14.5 s) replaces one per case (776 s). Sharding is not built.
- `scripts/proof-check.mjs` batches, attributes errors to cases by line range, compiles any unconfirmed case alone, and runs two controls that must fail. `--self-test` is 23 clauses.
- Not yet done: oracle comparison over all 133 cases, live Rule 90 sweep, independent review, scored `verify-full`, landing on main.
- Branch only: `verify` runs on pushes to main, so this push triggers nothing.
