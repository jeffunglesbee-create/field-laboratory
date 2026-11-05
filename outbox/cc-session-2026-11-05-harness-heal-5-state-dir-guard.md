# Session record: a MUTATION_STATE_DIR that holds foreign files is refused

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 8 (the state-directory item; `scripts/mutation-check.mjs` only). Assignment H2, commit 5 of 5.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05, in a scratch repository with the real harness: `mkdir -p precious/sub; echo x > precious/keep.txt; echo y > precious/sub/n.txt; MUTATION_STATE_DIR=<precious> node scripts/mutation-check.mjs --only known-survivor`. Before: `precious/keep.txt`, `precious/sub/n.txt`. After: `ls precious` said `No such file or directory`. The premise holds: the first clear empties everything but `run.json`, `driver.json` and a non-empty `nested`, and the run lock's release removes the directory.

## What was built

A guard in the main flow, before `checkLocks`: the state directory is read; if it holds anything and none of the harness's own names, the run prints what is in it (`(keep.txt, sub)`), says to give a directory that is absent or empty, and exits 2 (the usage-error status this file already uses), having touched nothing. A path that is not a readable directory is refused the same way (`not a directory it can read`); an absent one is the normal case and is used. `--anchors`, `--list-ids` and `--self-test` exit before it (the self-test makes its own directory).

**Two departures from the probe's spec, both found by reading this tree.**
1. **Five own names, not four.** The spec's list (`active.json`, `run.json`, `nested`, `world`) predates the build driver's record (`driver.json`, residuals Task 1, already on this tree). A run killed after it cleared a stale lock and before it finished stopping a dead driver leaves a directory holding only that record; the four-name rule would refuse it and wedge every later run behind a message about files the harness wrote itself. A clause starts a run over exactly that directory, and an entry removes the name.
2. **`nested` is accepted on purpose.** The previous commit keeps a stranded child's marker in `.mutation-state/nested`, which can be all that is in the directory after the parent exits. The guard accepts it (otherwise `--heal` would refuse to heal it); entry `state-dir-guard-refuses-a-stranded-nested-run` pins that, and only `E26` (the previous commit's clause) fails on it.

## Verified

- Real script, after the fix, same scenario: exit 2, the refusal naming `(keep.txt, sub)`, both files still there, no tracked file modified.
- Self-test: 143 clauses before, 146 after (three `E27`: foreign files, a path that is a file, and a dead run's lock plus a dead driver's record, which must be used). Without the guard: 144/146, both refusal clauses fail (`status 1, files kept false, ran true`; `EEXIST: file already exists, mkdir ...`), the third passes as its positive control. With it 146/146.
- 5 new table entries through the harness (`--ids`): 5 of 5 caught, 6/6 with the baseline. By hand, the red clauses per entry: `state-dir-guard-removed` 2 (E27 x2); `-refuses-its-own-state` 27; `-refuses-a-stranded-nested-run` 1 (E26); `-refuses-a-dead-drivers-record` 1 (E27); `-swallows-an-unreadable-directory` 1 (E27). A sixth mutant, an absent directory read as foreign (`ENOENT` no longer let through), is not a table entry: 49 clauses go red, and every real-script clause is its own proof.
- `check:exit-drains` still counts the same early exits (the guard's `process.exit(2)` is not `process.exit(summarize(...))`).

## Not covered, stated

- The rule is lenient: one of the five names is enough, so a person's directory that happens to hold a `nested` directory or a `run.json` among its own files is still emptied. A strict rule (every entry is the harness's) was not built: a source mutation's backup is named for the file it backs up, so the harness would need the whole table's file list to recognise its own state, and a directory holding a backup and nothing else would be refused.
- A directory that holds only a source mutation's backup (a run killed between writing the backup and the marker, whose stale lock a second killed run then removed) is refused. It has no marker, so there was nothing to heal; the message says what is in it.
