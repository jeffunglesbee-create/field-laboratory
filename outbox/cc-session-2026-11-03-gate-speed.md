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

## Part 2 — shards, the poll, the merge, the comparison (commit "mutation row: eight shard jobs ...")

`scripts/mutation-merge.mjs`, `scripts/mutation-await.mjs`, `scripts/mutation-compare.mjs`, each importable with its own `--self-test`,
all four self-tests in `npm run check:mutation-parts` (12.8 s, run in `verify`).

- **merge** starts from the table (`mutation-check.mjs --list-ids` of this tree), derives what each shard was meant to run (`shardOf`),
  and refuses on the first difference: a shard missing, an id run twice or by nobody or not in the table, a sha from another commit, a
  shard that ran the wrong partition, two build modes mixed, a baseline that disagrees with its own list. A survivor or a failing baseline is
  a verdict problem, not a structural one, so the baseline artifact is still written (pass or fail, as the harness always did) only when the
  shard set is exactly the table. It prints the denominator: `N of 235 mutations across 8 shards (watch): ...`.
- **await** is the part the gate's `full` job needs because it does not wait for the shards (they would otherwise be in series with the
  proof checks). It lists this run's artifacts through the Actions API, up to 80 polls of 30 s (counted in polls, not read from a clock:
  the script is named in a gate row), downloads and unzips them, and fails by name. A shard job that has finished with no artifact on two
  consecutive polls fails the wait at once with the job's conclusion; one still running when the polls are spent is named with its job state.
  The token goes to the API and not to blob storage (asserted against two local servers on two ports). A 5xx is retried, a 4xx stops the wait.
- **compare** lines the two drivers up per mutation (verdict, and for every mutation that rebuilds, the compiled digest), refuses a comparison
  of a mode with itself, and counts the non-rebuilding mutations that survive on a clean build.
- **The gate row** (`gate-checks.mjs`, the mutation row only): with `GATE_MUTATION_SHARDS` unset it is the same three commands as before; set to
  a positive integer it runs `--self-test`, then await, then merge, then `--only known-survivor` must still FAIL. Set to anything else, it fails.

**Broken on purpose (Rule 90):** 41 clauses of the three scripts were broken one at a time in a copy; 40 went red on the first pass. The survivor
was the `unzip` exit-status check, hidden behind the later "file is not in the archive" check; a corrupt-zip case was added and the second pass was
41 of 41.

**A premise of the CC-CMD was half wrong (Rule 100).** It said the `Proof-doc claims` step in `verify-full.yml` was the gate row's own command run a
second time. `check:proof` is `proof-check.mjs --self-test && proof-check.mjs`; the gate row is only the second. Removing the whole step would have
dropped the self-test from every workflow. The suite half is removed and the self-test (0.06 s) stays as its own step.

## The first whole-table run on CI (run 41585094592, branch `gate-speed`, tree `7a2ed28`)

17 jobs started at once. What it showed, from the logs and the committed `outbox/mutation-equivalence-latest.json`:

- **The gate's read path works on real artifacts.** `await-check` started with the shards, polled 61 times, saw the uploads arrive while the run
  was in flight (1 of 8 at poll 7, 7 of 8 at poll 15), downloaded all 8 and merged them:
  `235 of 235 mutations across 8 shards (watch): 235 caught, 0 refused by the compiler, 0 survived, 0 not applicable, 0 broken; 71 distinct
  expectations, 0 failing`. The matrix job names (`mutation shard 5 of 8`) are exactly what `mutation-await.mjs` looks for.
- **Watch against full, 205 of 235 compared:** 0 verdicts differ; 0 compiled digests differ across 145 mutations that rebuild; the clean digest is
  `c60e1799e7a0cbbe` on both sides and on the sandbox too. 60 mutations that do not rebuild were all caught on a clean build, 0 survived.
  Per `src/` mutation (compile plus restore): 5.3 s mean under watch, 29.3 s under full.
- **30 of 235 are not compared**, because one reference shard failed (below). That is why `compare` went red: it named the missing shard.
- **Reference shard 1 failed** at the third source mutation of its slice: `the build is not clean before the restore of
  [proxy-silent-becomes-false] was verified: digest fd58264554a015dd, clean c60e1799e7a0cbbe`. The same three mutations under `--build full` pass
  locally. The message could not say why, so the diagnosis went into the tool: a build that is not clean now names the files that differ, and a
  full build that fails keeps its exit status and the last lines of its output (it was `stdio: 'ignore'`).
- **The long pole is not a hang.** Shard 8 took 31 min (watch) and 39 min (reference) against 3 to 18 for the others. It holds
  `seal-goes-public`, the only mutation whose expectation is the proof row (`proof-check.mjs`, 776 s): the baseline runs it once unmutated and the
  mutation runs it again. The shard's wall time used to leave the baseline out (it started the stopwatch after it); it is now included.

## Still open at this commit

The whole-table equivalence run, the scored `verify-full` on this topology, and `docs/GATE-TIMING.md` follow; this document is completed with their run ids.
