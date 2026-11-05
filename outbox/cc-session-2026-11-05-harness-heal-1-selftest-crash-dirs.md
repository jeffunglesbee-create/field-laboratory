# Session record: a crashed self-test removes its temp directories

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 10 item 12 (`scripts/mutation-check.mjs` only). Assignment H2, commit 1 of 5.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05: a `git` stand-in first on PATH (prints `git: stand-in, fails on purpose`, exits 1), TMPDIR at an empty directory, `MUTATION_SELFTEST_CHILD=1 node scripts/mutation-check.mjs --self-test`. Exit 1 after 0.1 s, the stack at `inSnap` (the scratch repository's first git call), and TMPDIR then held `heal-selftest-7S1Hyt` and `mutation-state-ocst1i`. The premise holds.

## What was built

An exit handler registered right after the self-test's first `mkdtemp`, removing the scratch directory and the state directory (the self-test's own `mkdtemp`, made at module level). The uncaughtException handler already ends in `process.exit(1)`, which fires exit. Not in `restore()`: the self-test calls that itself, part-way. SIGKILL cannot be covered. Clause `E25` starts the self-test as a child with the stand-in and an empty TMPDIR.

## Verified

- Self-test: 139 clauses before, 140 after. Without the handler `E25` fails (139/140: `left behind in its TMPDIR: heal-selftest-zzcRsK, mutation-state-M1dlWx`). With it 140/140.
- 1 new table entry (`crash-leaves-the-self-test-directories`), run through the harness (`--ids`): caught, 2/2 with the baseline.

## Not covered, stated

- A SIGKILL of the self-test still leaves both directories (no handler runs).
- The system temp directory held 2,613 `heal-selftest-*` and `mutation-state-*` entries when this was measured; they are from earlier runs and are not removed by this change.
