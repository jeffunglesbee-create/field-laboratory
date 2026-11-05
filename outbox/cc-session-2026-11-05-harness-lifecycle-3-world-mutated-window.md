# Session record: the kill window after a world mutation, tested

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 10 item 6 (`scripts/mutation-check.mjs` only). **Base:** commit 2 of this assignment (the signalled expectation). Commit 3 of 3.

**Why this file exists.** Same as commits 1 and 2: `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05:

- The window is the code between `run(m.mutate, ...)` and `writeFileSync(marker, worldMarkerText)` in the world branch of the mutation loop: the mutation's own run, then `touchedBy(before, treeSnapshot())`. The kill hooks `world-prepared` and `world-applied` sit before and after it; none inside (read, and `grep killHere('world-`).
- Its size: `treeSnapshot()`'s own commands and hashing, n=20, median 15.4 ms (13.5 to 16.3), on a clean tree of this clone.
- What the next run does with that state is asserted by `E23` (a real SIGKILL with the hook, then a real next run); it could not be run before the hook existed, so the hook is the change.

## What was built

One test-only line, `await killHere('world-mutated')`, between the mutation's run and the snapshot, and clause `E23` (two clauses) in the real-script group. No heal was built for this state: after the kill nothing can tell the mutation's stubs from a person's edit of a path it touched, because the hash of what the mutation left was never written. Restoring from the stash would write over a possible edit, which is the defect "write only over what is provably yours" exists to prevent. A per-entry "applied" predicate in the table was considered and not built (data on 3 entries for a window of about 15 ms with no loss: the stash holds the originals and the refusal names it).

## Verified

- Self-test: 137 clauses before, 139 after (two `E23`). Without the hook both fail (137/139: the run completes normally, no SIGKILL, no marker). With it 139/139.
- `E23` also goes red when the heal clears instead of refusing (a by-hand mutant of `planHeal`'s branch for a marker with no `touched`: 134/139, `E23`'s second clause among the failures).
- 1 new table entry (`world-mutated-hook-dropped`), run through the harness (`--ids`): caught, 2/2 with the baseline.

## Not changed, stated

- The refusal text repeats the stash location twice (cosmetic; reported by the probe that specified this, not re-checked here).
- This makes item 6 "accepted: safe refusal, now tested", not "cannot heal".
