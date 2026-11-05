# Session record: the race refusal and the torn run lock are asserted

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 10 item 10 (`scripts/mutation-check.mjs` only; one test-only fault branch, two real-script clauses, three table entries). Assignment H3, commit 4 of 4.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05, three one-line mutations applied to a copy of `scripts/` and run against its `--self-test`: the race refusal's `process.exit(1)` changed to `process.exit(0)`; the same line removed (the run carries on to heal and mutate); and `catch { held = null }` in `checkLockAt` changed to `catch { held = { pid: process.pid } }`. All three `154/154 checks passed`. The premise holds. By reading: `acquireRunLock` creates the lock with `wx` and then writes it, two syscalls, so a reader (or a kill) can leave or see an empty or half-written file.

## What was built

A test-only fault in `acquireRunLock`, after its `mkdirSync`: with `MUTATION_FAULT=lock-appears`, the lock is written naming the run's parent (alive, not the run's own pid) just before the exclusive create, so the create finds it. It is inside the taking and not between `checkLocks` and the `if`, so the `lock-taken-after-the-heal` anchor (`reapDriver` line, then `if (!acquireRunLock()) {`, contiguous) is untouched; the self-test's direct `acquireRunLock()` calls run without the variable.

Two clauses, both `E28`, both start the real script in the scratch repository: (1) the race: exit 1, `appeared while this run was starting`, no `Mutation testing`, `docs/gate-rows.txt` unchanged, and `run.json` still there naming the self-test's pid (a run that overwrote it, or went on, would show its own); (2) a `run.json` holding `{"pid": 12`: the run goes ahead (`Mutation testing`, `known-survivor`), no `IN PROGRESS`, no `SyntaxError`. Entries: `race-refusal-exits-zero`, `race-refusal-carries-on`, `torn-lock-reads-as-live`.

**What (2) pins, and what it does not fix.** Today's rule is "a lock that does not parse names no run and is removed". The same rule means a live holder caught between its create and its write can be read as stale (the family of residuals Task 8 item 1, the stale-lock takeover). A refinement (an unparsable lock younger than a few seconds counts as live) is a behaviour change and is not part of this item.

## Verified

- Self-test: 154 clauses before, 156 after (2 new). The race clause written before the hook existed: 155/156, that clause FAIL, the torn-lock clause green (it pins existing behaviour). With the hook: 156/156.
- By hand, one mutation against the self-test each: `race-refusal-exits-zero` 155/156, `race-refusal-carries-on` 155/156 (both: the race clause), `torn-lock-reads-as-live` 155/156 (the torn-lock clause). The existing `run-lock-is-not-exclusive` mutation (`wx` to `w`), run with the new clause present, is also red in the race clause (152/156: that clause, the lock-exclusivity clause, and the two nested self-tests).
- The three entries through the harness (`--ids`): 4/4 checks passed (3 caught, plus the baseline), tree restored. The four neighbouring lock entries (`run-lock-is-not-exclusive`, `run-lock-never-taken`, `lock-taken-after-the-heal`, `lock-held-by-a-live-run-is-ignored`) re-run through the harness: 5/5 checks passed.
