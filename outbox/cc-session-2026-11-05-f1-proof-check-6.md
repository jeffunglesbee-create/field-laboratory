# Session record: the heal of two stranded files is exercised

**Date:** 2026-11-05. **Scope:** review 6 fix stream F1, `tests-vacuity.json` finding 0 (the heal of two stranded files is never exercised). Touches `scripts/proof-check.mjs` (one clause) and `scripts/mutation-check.mjs` (four entries); no production line changes.

**Why this file exists.** `check:staged-outbox` wants an `outbox/` path in every commit that stages `scripts/`, and this stream may not edit existing outbox files. New file; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on the tree before this commit

Two mutants of the committed script, each followed by that copy's `--self-test`: the registry line of the heal `if (registryStranded)` to `if (registryStranded && !targetStranded)`, and the target line `if (targetStranded)` to `if (targetStranded && !registryStranded)`. Both exited 0 at 120/120 (measured on the tree of the previous commit). With either and both files stranded, the heal skips one file, and the next line drops the state: the injected file stays, with nothing left to put it right. Reachable: when phase 1's restore fails, phase 2 still injects the registry, and a kill there strands both.

## What was built

One clause on the real script over a planted state: a dead pid, `src/Scoreboard.fs` with an injected block, `src/Desk.fs` with the probe, and backups of the clean files. Both files must equal their backups afterwards, the state must be gone, the run must carry on, and stderr must contain `HEALED — a previous run (pid N) was killed with src/Scoreboard.fs and src/Desk.fs injected. Restored them before measuring anything.` That is the plural message no clause produced before. Coverage (Rule 91): the state is planted; it was not reached by a failed phase-1 restore followed by a kill.

## Clauses (self-test 120 before, 121 after)

One new clause.

## Red evidence (Rule 90)

Through the harness, `node scripts/mutation-check.mjs --ids <4 ids>`: the two mutants above, a heal message that names only the first file, and one that says "it" for two files.

## Not verified

- The both-stranded state was planted. The path to it (a failed restore in phase 1, then a kill in phase 2) was not driven end to end.
