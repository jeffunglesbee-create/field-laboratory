# Session 2026-11-03 — the gate's mutation row: incremental compiles, then parallel shards

CC-CMD: `docs/CC-CMD-2026-11-03-gate-speed.md` (filed and built the same day, on the owner's "Go 1 and 2. Fully finish the cc-cmd").
Status of this document while the work is in flight: **IN PROGRESS.** It is completed in the last commit of the CC-CMD (Task 6).

## Why

The last four ledger lines put the row "breaking each invariant makes a check fail" at 4003 to 5688 s of a 4624 to 6513 s gate, 87% of it. The
suite is 235 mutations; 161 of them mutate `src/` (the CC-CMD said 139, see below) and each paid a whole-project compile (34.5 s) before its expectation ran, in series, on one
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

## The second whole-table run, and what the 2 differing verdicts were (run 41590393392, tree `a464e3b`)

235 of 235 compared. 233 agree on verdict and on compiled digest (163 mutations rebuild; the clean digest is `c60e1799e7a0cbbe` on both sides).
The table's kinds, counted from the artifact's `perId`: 161 `src`, 2 `index.html`, 69 `scripts/` or `.github/`, 3 world. **The CC-CMD's "139 that
mutate src/" and "94 that do not rebuild" were wrong** (they were read from a count made before the table was listed; the right numbers are 163
that rebuild and 72 that do not). Of the 72 that do not rebuild, all 72 were caught on a clean build and 0 survived: **the legacy question, answered:
0 of the 72 non-rebuild mutations were caught only by a leftover build.**

Two differed: `proxy-silent-becomes-false` and `tactical-lock-bars-take-a-negative-best`, caught under `--build watch` and `compiler` under
`--build full`. Run alone on a runner both drivers caught both with identical digests (probe run 41594837471). Replaying the whole of shard 5
under `--build full` (probe run 41595164605, list 2) then showed it:

```
restoring [metrics-gravity-unexplained]: the restore build failed: the build failed, exit 1:
./src/Suite.fs(17,32): (17,101) error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)
./src/Program.fs(73,15): ... internal error: Object reference not set to an instance of an object. (code 193)
```

**The F# compiler crashed.** It reports the same internal error at every file of the project for source that compiles. Four times in about 560
`--build full` builds across the two runs and the probe, never twice on the same source, none in about 560 `--build watch` compiles (one long-lived
process).

**This is a defect of the harness as it was, not of the new drivers.** `mutation-check.mjs` counted any failed build as "defended by the COMPILER
(the mutation does not build)", which is a catch that costs nothing: a crash was a free pass for whichever mutation it landed on. The watch driver
refused no mutation across the whole table (`0 refused by the compiler`), so on this table every "refused by the compiler" the old harness could have
printed was a crash. The old gate run 41576121384 printed that line once; which mutation it was is not recorded, and it is not claimed here.

The fix, in the tool: `isCompilerCrash` tells a crash (`internal error`) from a refusal (a diagnostic about the code); `compileSteadily` repeats a
crashed build at most twice and counts the repeats; a mutation whose build still crashed gets the verdict `build-fault` (broken, like a mutation
that did not apply: the expectation is not run and the merge refuses it); the repeats are in the record (`crashRetries`), in the merge's denominator and
in the comparison. A refused compile prints and records the compiler's words. `MUTATION_FAULT=crash-once|crash-always` injects the runner's real
crash line so the path can be shown on demand: `crash-once` under both drivers exits 0 with the mutation caught and `crashRetries 1`;
`crash-always` exits 1 with `build-fault` and `crashRetries 2`. The root cause of the crash (Fable's embedded compiler on the runner's SDK 10.0.403, the
sandbox has 10.0.113) is not investigated here, and the repeat is a bounded, counted answer to a measured fault, not a claim about its cause.

## Independent review of the sharded gate (28 agents, five layers)

Five reviewers each attacked one layer (merge/compare, await, the build drivers, the workflows, end-to-end soundness) with no conclusion of mine in their
brief, then one agent per finding tried to refute it. 23 findings were claimed, 14 survived, 9 were refuted (each refutation read and kept in
the workflow's journal). All 14 are fixed:

| # | what was wrong | what changed |
|---|---|---|
| 1 | `compare` read the merge's structure problems and not its verdict problems, so a comparison over a red baseline or a broken mutation passed and its legacy count was vacuous | its problems now include the merge's verdict findings, each prefixed with the side |
| 2 | the merged baseline kept the FIRST shard's result per command, so a command that failed only in a later shard was recorded as passing | the failing entry is kept, with its tail |
| 3, 13 | the artifact download had no retry: one blob-storage hiccup failed a 20-point row after the whole wait | three tries, each asking the API again (the redirect address is short-lived); a 4xx still stops at once |
| 4 | a body that ends early, a 429 and the secondary-rate-limit 403 were permanent failures | they are retried like a 5xx |
| 5 | any failed build (the site failing to assemble, a killed process, a full disk) was recorded as "defended by the COMPILER" and its expectation never ran | a refusal now requires a compiler diagnostic in the output; every other failed build is `build-fault` (broken, refused by the merge) |
| 6 | a dead watcher was found by a 20 s or 300 s timeout that named the wrong cause | the exit code or signal and the last lines it printed, at once |
| 7 | `--ids ""`, a trailing `--shard` or `--out` fell through to a full run that wrote the baseline artifact | exit 2, "wants a value, so nothing was run" |
| 8, 14 | the gate's failure summary kept only lines with an arrow, SURVIVED or FAIL, so the merge's and the wait's reasons never reached it | every reason is its own arrow line; the failing baseline commands are named |
| 9 | a re-run attempt left the previous attempt's artifact listed, and the wait read it | a shard counts as present only when its artifact is listed AND its job has completed; the upload overwrites |
| 10 | `merged-baseline` was uploaded from the tracked file, so a refused merge published the last run's | the tracked copy is removed before the merge |
| 11 | watch re-checks the file that changed and not the files after it: a type-only upstream mutation builds under watch, survives, and fails the row, where the full compile refuses it | a watch survivor is confirmed by a full compile into a throwaway directory before it stands |
| 12 | nothing could show the CI branch of the row (`shardedSuite`) failing: its body replaced by `return true` left every check green | `scripts/sharded-row-check.mjs --self-test` with stub commands, and six new mutations of the row (the table is now 241) |

**#11 shown end to end** in a throwaway copy with a mutation that changes `devig`'s return type in `src/Units.fs` (three downstream errors): under watch it
built and survived its expectation; the confirmation printed `built under watch, which does not re-check later files; refused by the full compile` with
`./src/Market.fs(77,41) error FSHARP: Type mismatch` and `./src/Suite.fs(165,22)`, and the verdict is `compiler`. While doing it the confirmation was found to
read only the last 25 lines of the build output, which for a refusal followed by a stack trace holds no diagnostic (verdict `build-fault`); the build now
keeps the diagnostics wherever they are in the output.

**What this says about the CC-CMD's premise.** "A watched compile is the same compile as the full one" is true for every build the compiler ACCEPTS
(163 of 163 digests equal) and was never true for a build it REFUSES: watch does not report errors in later files. The words in `verify-full.yml` and the
CC-CMD are corrected, and the confirmation above is what makes the verdicts equal anyway.

**Refuted (each with the refuting agent's reason in the workflow journal):** that the equivalence report needs its own pass/fail field (not a defect as
claimed); that a re-run's upload fails with a 409 (the agent could not make it happen; `overwrite: true` is set anyway); that the poll budget being a count
and not a time is a defect (the gate ends red, which is right in every scenario traced; hardening, not a wrong outcome); that a green gate does not print
the denominator (the merge prints it and the gate hides stdout on success by design); that nothing fails if the row's wiring regresses (a true premise
with no wrong outcome in the code as written; #12 is the same concern from another reviewer and was confirmed); that the merge never compares the shards'
clean digests and that the unset path differs from the old behaviour (in both the mechanism exists and the agent could not make it produce a wrong outcome).

## The third whole-table run (run 41603976677, tree `a5d6e9c`, 241 mutations) and why a diagnostic is no longer trusted once

211 of 241 compared: reference shard 3 died. Its restore of `venue-reading-serves-only-its-own-name` crashed three builds in a row
(`./build/fable_modules/Thoth.Json.10.5.1/Decode.fs(201,23): error FSHARP: internal error: Object reference not set to an instance of an object`), which was
all the repeat budget of 2 allowed. Of the 211 compared, 0 digests differ across 142 mutations that rebuild, 69 non-rebuilding mutations were all caught on a
clean build, and one verdict differed: `narrative-second-wind-off-by-one`, `caught` under watch and `compiler` under full. `failed builds repeated`: watch 0, full 2.

That one was run locally under `--build full` and did NOT refuse: its first build crashed (`Thoth.Json.10.5.1/Types.fs(33,1)`, the same family), the repeat built
and the mutation was caught. So the `compiler` on the runner was a build that printed a diagnostic that was not the words "internal error" and was still the
flaky compiler. **A diagnostic that appears once is therefore not a refusal.** A refusal is now only a diagnostic that a second build says again (the first real
diagnostic, whitespace-squeezed, equal), a build that fails differently each time is a fault, and one that stops failing was a flake and its good build is the
answer. A watch survivor's confirming full compile obeys the same rule. The repeat budget is 4 with a growing pause. Cost: nothing on the table, which has
no real refusals.

What was measured about the flake itself, so as not to claim a cause: 12 clean `npm run build` in a row locally, 0 crashes; 16 builds each straight after a
source change, 0; 6 plain `dotnet fable` of the mutated file into fresh directories, 0; and one crash in the first harness run of that same mutation. About one
in 100 builds on the runners (2 to 5 per equivalence run), clustering once (three in a row), none in about 800 watch compiles. The cause (Fable's embedded F#
compiler, the runner's SDK 10.0.403 against the sandbox's 10.0.113, a race in checking the copies of the Thoth.Json sources under `build/fable_modules`) is
NOT established, and nothing in the gate depends on knowing it: the production path is `--build watch`, one fresh compile per shard.

**One clause the sweep could not tell, closed.** Breaking the confirming full compile's early stop (`if (seen === sig) break`) left every lib check green:
without it the compile repeats a real refusal until its budget is spent and reaches the same verdict, only slower. The self-test now counts the builds (two,
not one and not the whole budget). This commit changes `scripts/mutation-lib.mjs`'s self-test only and lands after the tree the scored gate ran on; `verify` runs
`check:mutation-parts` on the landing commit.

## The fourth whole-table run, and the first scored gate (runs 41614404411 and 41614410302, tree `ee33fc9`)

**DONE condition 3, met: 241 of 241 compared, 0 verdicts differing, 0 compiled digests differing across the 163 mutations that rebuild, the clean digest
`c60e1799e7a0cbbe` on both sides.** The table's kinds: 161 `src`, 2 `index.html`, 75 `scripts/` or `.github/`, 3 world. **DONE condition 4, answered with a number: of
the 78 mutations that do not rebuild, 78 were caught on a clean build and 0 survive: none was caught only by a leftover build.** (`failed builds
repeated`: watch 0, full 2: the flaky compiler, absorbed.)

**The first scored gate (run 41614410302) was red, in 35 minutes, and the cause was the same flaky compiler**, this time in a shard's plain `Build` step, before the
harness ran: `mutation shard 1 of 8` printed `internal error ... (code 193)` at about forty places mixed with diagnostics that look real (code 72, 752, 1), and
`npm run build` exited 1. The gate itself did what it was built to do: `mutation-await.mjs` saw the finished job with no artifact on two polls and the row failed
in 32 s with `mutation-shard-1-of-8: its job "mutation shard 1 of 8" finished (failure) and uploaded nothing` and the job's URL, in the gate's own summary. The
ledger line is `ee33fc974755-e3b0c44298fc`: 510/530 = 96, failing row `breaking each invariant makes a check fail`, 575 s (the other rows were green, the proof row 511 s).
Nine builds a run instead of one raised the exposure to a compiler fault measured at about one build in a hundred, so `scripts/build-steady.mjs` now builds the shards
and the `full` job: the same rule as the harness (a crash is repeated; a diagnostic counts only when the next build repeats it; a failure with no diagnostic is not
repeated), every repeat printed and counted in the step summary, a real failure printing its whole output and exiting 1. The root cause is the subject of
`docs/CC-CMD-2026-11-03-fable-compiler-crash.md` (filed, with the measured table and a probe design).

**The second scored gate (run 41620392450, tree `b07f072`) was red too, and again to the same compiler**: the shard's `Build` step now repeats, passed, and then the WATCHER's own first
compile (a fresh full check like any other) crashed at about forty places (`Thoth.Json.10.5.1/Types.fs(33,1)`, `Decode.fs(201,23)`, `Journalism.fs(310,5)`), mixed with real-looking
diagnostics. Ledger line `b07f072019e5-e3b0c44298fc`: 510/530 = 96, failing row `breaking each invariant makes a check fail`, 830 s, the mutation row failing in 32 s by naming the
shard. A fresh full compile is exposed wherever it is: eighteen a run (nine builds and nine watcher starts), at about one in a hundred each, is not a gate that can be trusted
to go green. `WatchBuild.start` now stops the watcher (and waits for it to be gone) and starts it again by the same rule as every other build (a crash is repeated, a diagnostic
is believed only when the next start says it again, no diagnostic is not repeated), at most four times, each repeat announced and counted (`startRepeats`). The incremental
compiles after that are not fresh checks: none crashed in about 1,500 of them.

## The scored gates, and what landed

| run | tree | result | gate step | whole run | runner time |
|---|---|---|---|---|---|
| 41614410302 | `ee33fc9` | 510/530 = 96 (shard 1's `Build` step crashed) | 575 s | 35 min | |
| 41620392450 | `b07f072` | 510/530 = 96 (shard 4's watcher start crashed) | 830 s | 22 min | |
| 41627438202 | `7af6e24` | **530/530 = 100**, ledger `7af6e2472a5e-c55db6e046dd` | **1075 s** | **19 min 19 s** | 75 min |
| 41630543901 | `8682660` (this plus main, the landed tree) | **530/530 = 100**, ledger `86826602144a-43b5429ee06e` | 1869 s | 32 min 39 s | 102 min |

Before: 6153 / 6228 / 6513 s for the gate step, about 108 min for the run, about 110 min on one runner. The spread between the last two is the proof checks (729 s and 750 s once in the
gate, twice in the shard that holds `seal-goes-public`: 18.5 min and 31 min) and runner speed; the proof row is now the longest path. Wall-clock fell by a factor of 3.3 to 5.6, runner time by
a factor of 1.1 to 1.5. Main moved (workflow and script changes) after the first 100%, so the tree that landed is a second merge with main and was gated again; a push that deletes a
trigger file fires its workflow (the equivalence run and the ids probe started on the removal and were cancelled), so the trigger files were removed in a separate push before the gate.

**Landed:** the merge of `gate-speed` into `main` (the commit is in the CC-CMD and in the landing note below). `verify` and the deploy on main are read in the landing note.

## What this does not prove

- That no mutation anywhere is order-dependent for a reason other than the build. The table now runs every mutation from a clean build (78 do not rebuild and none was kept alive by a leftover one), but two mutations of one shared file are isolated only by being in different shards.
- That eight shards always start together. In run 41627438202 all nine jobs started within a second; in run 41630543901 six of the nine shards waited a minute for a runner (11:49:57Z against 11:48:57Z; the cancelled equivalence run's jobs were winding down at that moment, which is a guess, not examined). A wait of that size is inside the 40-minute wait of the gate; a long one would show in the start times.
- The cause of the compiler crash. It is bounded and counted (`failed builds repeated` in the merge's line and the equivalence artifact), not fixed: `docs/CC-CMD-2026-11-03-fable-compiler-crash.md`.
- That the proof checks cannot be sharded: they are the longest path and are the next CC-CMD, `docs/CC-CMD-2026-11-03-proof-check-shards.md`.
- The older gate runs: the old harness counted a compiler crash as a catch, so the "defended by the COMPILER" it printed once in run 41576121384 is not known to have been a real refusal. This table has none.
