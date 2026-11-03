# Session 2026-11-03 — the gate's mutation row: incremental compiles, then parallel shards

CC-CMD: `docs/CC-CMD-2026-11-03-gate-speed.md` (filed and built the same day, on the owner's "Go 1 and 2. Fully finish the cc-cmd").
Status of this document while the work is in flight: **IN PROGRESS.** It is completed in the last commit of the CC-CMD (Task 6).

## Why

The last four ledger lines put the row "breaking each invariant makes a check fail" at 4003 to 5688 s of a 4624 to 6513 s gate, 87% of it. The
suite is 235 mutations; 139 of them mutate `src/` and each paid a whole-project compile (34.5 s) before its expectation ran, in series, on one
runner. `docs/GATE-TIMING.md` (2026-08-12) named two designs, a watched incremental compile and parallel shards, and did not build them
because "the synchronisation must be exact". Both are built here.

## Part 1 — the harness (commit "mutation harness: incremental compiles ...")

`scripts/mutation-lib.mjs` (new, importable, nothing runs on import) holds the Fable cycle parser, the build digest, the shard split and
two build drivers. `scripts/mutation-check.mjs --build watch|full` (default `watch`) drives one of them.

**The facts the watch driver rests on were measured, not read (Fable 5.13.0, 2026-11-03):** `dotnet fable watch` defaults to Debug, where 53 of
53 output files differ from the full compile; with `-c Release` every file is byte-identical except `fable_modules/project_cracked.json`, which
carries paths and is left out of the digest. "Fable compilation finished" is not the end of a compile (on a type error the error lines follow it
2 ms later); the cycle is `Started Fable compilation...` to `Watching src`.

**The invariant that makes it safe:** the build is made clean and its digest compared with the clean digest before every mutation and after every
restore. A stale build can then only produce a survivor (loud), never a catch by the mutation before it (silent). The watched initial compile is
compared with the build that existed before it, so Fable, its configuration or its cache drifting is refused in a second.

**Equality on a subset, locally (14 mutations: 8 `src/`, 2 `index.html`, 3 `scripts/`, 1 world, chosen to include an early and a late src file):**
identical verdicts (14 caught), identical compiled digests for all 10 that rebuild, identical clean digest (`c60e1799e7a0cbbe`).
Watch 123 s, full 410 s. Per compile: watch 1.3 to 7.8 s, full 24 to 28 s.

**The stale-build fault, which has to fail:** `MUTATION_FAULT=skip-restore-wait` restores the file and does not wait for the compile.
Under `--build watch` the run exits 1 with `the build is not clean before the restore of [score-presence] was verified: digest d5f02d96c98b5439,
clean c60e1799e7a0cbbe`. Under `--build full` the same fault is a no-op: exit 0, two mutations caught, so the fault test cannot pass vacuously.

**Broken on purpose (Rule 90):** each clause of `mutation-lib.mjs` was broken in a copy and its self-test required to go red. First pass 15 of 21;
the six that survived were real gaps (a "finished" line with no "Started", a digest that ignored paths, the extra quiet windows a failed compile
is held to, a failed initial compile, and the `verdictOf` mapping twice). Each got a test; second pass 21 of 21. The new usage errors
(`--shard 9/8`, `--shard` with `--ids`, `--build bogus`) were found to exit 1 with a stack trace or to run anyway, and are now exit 2 with a
sentence; four of those clauses were broken on purpose and all four self-tests went red.

**Found, not changed (TOUCH-ONLY):** under `--build full` the harness is one synchronous chain, so `SIGINT`/`SIGTERM` handlers never run until it
finishes; `kill -TERM` did not stop it. This predates the change (the original was all `execSync`). What protects a killed run is the durable
backup, the marker and `heal()`, and `heal()` was exercised for real here: a `SIGKILL` mid-mutation left `src/WeatherView.fs` mutated, and
the next run printed `HEALED ... Restored src/WeatherView.fs from its backup` before measuring anything.

## Still open at this commit

Parts 2 to 5 (the merge, the poll, the comparison, the gate row, the workflows, the whole-table equivalence run, the scored gate) are in the
commits after this one; this document is completed with their run ids.
