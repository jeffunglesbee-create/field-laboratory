# Session record: the harness records its build watcher and the next run stops an orphaned one

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 1 (`scripts/mutation-lib.mjs`, `scripts/mutation-check.mjs`). **Base:** `4eceb98`. Commit 1 of 3 of the harness-lifecycle assignment (the other two are Task 10 items 8 and 6, each with a record of its own).

**Why this file exists.** `.githooks/pre-commit` runs `check:staged-outbox`, which refuses a commit that stages `scripts/` or `src/` without a path under `outbox/`. The assignment this was built under says not to edit existing outbox files, so this is a new file and no existing outbox file is touched. Fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On a scratch clone of the repository, real Fable 5.13.0 (`dotnet fable --version` prints 5.13.0 in this sandbox), 2026-11-05, one run each:

- `MUTATION_KILL_AT=source-applied node scripts/mutation-check.mjs --only draw` exited 137 and left `dotnet fable watch` at ppid 1 with `fable.dll watch` under it (489 MB). The marker named only the node pid.
- 3 s into the watcher's first compile the state directory held `run.json` and no `active.json`. The marker is written after the first compile (about 25 s) and cleared between mutations, so it cannot be where the record lives.

## What was built

- `WatchBuild` spawns the watcher detached (its own process group) and calls the new `onSpawn(pid)` in the turn it is spawned.
- The harness writes `.mutation-state/driver.json` (run identity, watcher group pid, start time) beside `run.json`. Clearing and healing keep it; `stopBuilder` removes it (it replaces both `builder.stop()` sites).
- `reapDriver` runs after `checkLocks` and before the lock is taken: a live run's record is left alone; a pid with another start time is not ours; pid 1, pid 0 and an unparseable record are never signalled; the group gets TERM, then KILL; a group of zombies counts as dead; a driver that survives KILL stops the run.
- After a reap, one `npm run build`, AFTER the heal. The probe's prototype built before it; a stranded mutation that does not compile fails that build, so the order is pinned by a clause and a table entry.

## Verified

- Self-test: 118 clauses before, 132 after (11 `REAP` unit clauses, 3 `E22`). The three `E22` clauses fail on the code without the change (118/121) and pass with it.
- 17 new table entries and 2 re-anchored ones, each run through the harness (`--ids`): 20/20 including the baseline, on the final tree.
- Real Fable, once end to end: killed in the first compile (record present, no marker), host killed leaving `fable.dll` alone in the old group, `--heal` printed "Stopping it before this run starts one of its own", built, exited 0 in 25.8 s; the next `--only draw` gave clean digest `c60e1799e7a0cbbe` and `PASS [draw]` with a server on :8080 (the baseline's `pickem-check.mjs` is a browser check and fails without one). No process of the run was left.
- `E22` uses a `/bin/sh` stand-in for `dotnet` (a parent that starts the compiler as a child and forwards TERM) over the existing `fake-fable-watch` fixture. It stands for the dotnet host and `fable.dll`; it says nothing about Fable's output or timing.

## Not verified

- A terminal's Ctrl-C with the watcher in its own session: only signals sent to the harness were tried.
- A SIGKILL between `spawn()` returning and the `driver.json` write (microseconds): not closable by recording, not measured.
- Without `/proc` (not Linux): by reading only; `E22` is skipped and says so.
- Timing on a runner: the figures are from the 4-core dev container, shared with other work.
