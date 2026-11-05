# Session record: the stranded-state clause uses a state a heal could undo

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 10 item 9 (`scripts/mutation-check.mjs` only, the self-test's real-script group and one table entry; the harness code is untouched). Assignment H3, commit 3 of 4.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05, one mutation applied to a copy of `scripts/` and run against its `--self-test`: after the stranded-state warning, `if (!process.env.MUTATION_STATE_DIR) healHeld(real, { rebuild: false })`, so a bare `--self-test` heals the state directory it is started over. Result `153/153 checks passed`: it survived. The reason is in the fixture: it names `src/Stranded.fs` and never creates it, and its backup holds text that is not the file's original, so a heal of it is `diverged` and refuses with marker and backup untouched, which is also what a run that touches nothing leaves. The clause read only those two. The premise holds.

## What was built

`strandedFixture(dir)` writes a state a heal could undo: `src/Stranded.fs` reads `MUTATED FILE CONTENT`, the backup reads `ORIGINAL FILE CONTENT`, the marker carries the hash of each and `rebuild: false`. It is called twice (the directory the three modes run in, and a copy for the control) instead of `cpSync`, which is stable only from Node 22.3. A control clause runs `--heal` over the copy and requires the file back and the marker gone. The existing clause `A REAL STRANDED STATE SURVIVES THE SCRIPT BEING STARTED AND STOPPED` now also requires the file to read `MUTATED FILE CONTENT` after each of `--self-test`, `--list-ids` and `--anchors`. The clause that names the stranded state is untouched (same id, same file). Entry `self-test-heals-a-stranded-state` is the mutation above, guarded on the variable: the harness hands `MUTATION_STATE_DIR` to every expectation, so without the guard the nested self-test heals the harness's own state and an unrelated clause catches it, for the wrong reason.

## Verified

- Self-test: 153 clauses before, 154 after (the control; the main clause was changed, not added), 154/154.
- Mutation, on the old fixture: 153/153 (survives). On the new: 153/154, the main clause FAIL and the control green.
- The control can fail: a wrong `mutatedSha` in the fixture makes the heal refuse, and the control is FAIL at 153/154.
- The entry through the harness (`--ids self-test-heals-a-stranded-state`): 2/2 checks passed (1 caught, plus the baseline), tree restored.

## Not covered, stated

- Only `--self-test` is proven to be able to fail the clause. `--list-ids` and `--anchors` exit near the top of the file, before `healHeld` (a later `const`) is initialised, so a one-line heal added to either would, as the file is ordered, reach an uninitialised binding and leave the state (read from the code, not run). The clause covers all three by one assertion; the mutation that proves it can fail is for the self-test.
