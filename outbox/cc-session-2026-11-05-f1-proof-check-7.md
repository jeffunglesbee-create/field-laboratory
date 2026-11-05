# Session record: how a pid is told to be a proof-check is tested against the real /proc

**Date:** 2026-11-05. **Scope:** review 6 fix stream F1, `tests-vacuity.json` finding 4 (the /proc recognition of a proof-check run is not tested end to end). Touches `scripts/proof-check.mjs` (clauses) and `scripts/mutation-check.mjs` (three entries); no production line changes.

**Why this file exists.** `check:staged-outbox` wants an `outbox/` path in every commit that stages `scripts/`, and this stream may not edit existing outbox files. New file; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on the tree before this commit

Three mutants of the committed script, each followed by that copy's `--self-test`: `commandOf` reading `/proc/<pid>/comm` instead of `cmdline`; the node pattern `/(^|\/)node[\d.]*$/` without its `(^|\/)` anchor (so `ts-node` would match); the file pattern `/(^|\/)proof-check\.mjs$/` without it (so `my-proof-check.mjs` would match). All three exited 0 at 120/120 (measured on the tree of the previous commit). A marker with no recorded start is judged by this recognition alone, so a live proof-check could be judged a stranger and healed over (the 2026-09-07 race).

## What was built

- Two lookalikes in the string-level clause: `ts-node scripts/proof-check.mjs` and `node scripts/my-proof-check.mjs` are not a proof-check run.
- A clause that spawns three real processes (node running a file named `proof-check.mjs`, node running `my-proof-check.mjs`, and `sleep 30`), reads each through the real `/proc/<pid>/cmdline`, and checks the exact command, `runsProofCheck` and `isStranger` for each. A `comm` read gives `node` for the first, which has no argument, so it fails; the two anchors fail on the lookalikes. `spawn` returns after the child has exec'd: 300 spawns, 0 reads of the parent's command line. Coverage (Rule 91): three processes; asserted only where `/proc` can say what a process is.

## Clauses (self-test 121 before, 122 after)

One new clause and one extended.

## Red evidence (Rule 90)

Through the harness, `node scripts/mutation-check.mjs --ids <3 ids>`: the three mutants above.

## Not verified

- Platforms without `/proc` skip the real-process clause (it says so in its label); the string-level clause still runs there.
