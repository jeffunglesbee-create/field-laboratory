# Where the gate's time actually goes

## 2026-11-06 — what the gate-residuals follow-up added to the mutation row (shards measured in the dev container, then once on a runner)

`docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, 98 commits. The harness's `--self-test` grew from 118 clauses to 213 and `proof-check.mjs --self-test` from 85 to 127, and the table from 444 entries to 1132. The entries whose expectation is one of the self-tests went from 206 (94 + 62 + 50) to 780 (246 `mutation-check`, 142 `proof-check`, 251 `row-confidence`, 66 `mutate-copy-check`, 48 `clean-source-check` and 27 `network-exempt-check`), which is why a self-test that got slower by a factor of 2 made the row slower by far more. Measured in the 4-core dev container at idle (load average 0.35 to 0.7 at the start of each run), the two trees side by side, two repetitions interleaved (base, final, base, final), 2026-11-06:

| self-test | `4eceb98` | final | entries that run it (base, final) |
|---|---|---|---|
| `mutation-check.mjs` | 118 clauses, 13.7 s and 12.8 s | 213 clauses, 30.8 s and 27.8 s | 94, 246 |
| `proof-check.mjs` | 85 clauses, 5.7 s and 5.4 s | 127 clauses, 10.1 s and 9.8 s | 62, 142 |
| `row-confidence.mjs` | 15 clauses, 0.1 s | 30 clauses, 1.0 s and 1.1 s | 50, 251 |
| `clean-source-check.mjs` | 3 clauses, under 0.1 s | 25 clauses, 1.0 s and 1.1 s | 0, 48 |
| `check-exit-drains.mjs` | 18 clauses, 0.1 s | 22 clauses, 0.6 s | 0, 9 |
| `mutate-copy-check.mjs` (`npm run check:mutate-copy`, a step of `verify`) | none | 11.2 s and 10.8 s | 0, 112 |
| `network-exempt-check.mjs` (`npm run check:network-exempt`, a step of `verify`) | none | 3.9 s and 4.2 s | 0, 39 |

Serial self-test work in the mutation row from those means: about 27 minutes at `4eceb98` (94 x 13.3 s + 62 x 5.55 s + 50 x 0.1 s = 1,599 s) and about 2.5 hours now (246 x 29.3 s + 142 x 9.95 s + 251 x 1.05 s + 48 x 1.05 s = 8,935 s), before the `mutate-copy-check`, `network-exempt-check` and `VerifyMain` entries, the 161 entries that rebuild `src/`, and the baseline. The pre-commit step that runs the harness's self-test is the same 29 s (it was 13 s) plus the anchors check.

**The whole table, run once in shards on this container** (1131 of the 1132 entries; the other is `selfTestOnly`; `outbox/mutation-whole-table-2026-11-06.json`): four clones at once on four cores, two shards in series per clone, 01:53 to 03:27 UTC. Per shard 2,343 to 2,861 s (39 to 48 minutes) of wall time, of which 2,050 to 2,358 s was the expectations, 71 to 99 s the builds and 68 to 96 s the restores, and a baseline of 126 to 322 s. Under that four-way load a `mutation-check` self-test took 57.4 s on average (29.3 s at idle: 1.96 times), a `proof-check` self-test 11.5 s (9.95 s), a `row-confidence` one 1.2 s (1.05 s). **Shard 8 alone, with nothing else running and the network open** (the same code, 141 entries): 2,591 s of wall time, of which 197 s was the baseline; all 141 CAUGHT, including `pin-goes-quiet`, the one entry the first run reported as surviving (it reads the skill's source over the network, which that run did not have).

**What this means for CI, estimated from those numbers and not measured on a runner.** A `verify-full` shard job runs one slice of the table alone, so its time is nearer the solo figure than the four-way one; on a runner the same work takes however much slower or faster than this container the runner is, and nothing in the repository says which. Two budgets sit around it: the shard job's `timeout-minutes` is 90, and the gate step's wait for the shards (`scripts/mutation-await.mjs`) is 80 polls of 30 s, 40 minutes, counted from when the `full` job reaches its mutation row, which it does after its other rows (the shards start with the job, so the wait is 40 minutes on top of that). The wait was 40 minutes against a shard that took 43 here, so it is now 200 polls, 100 minutes, longer than the 90 minutes the job may run, and `scripts/sharded-row-check.mjs` fails if the two drift apart (`outbox/cc-session-2026-11-06-shard-wait.md`); the job cap itself is unchanged, at 2.1 times the solo figure. `verify-full` runs on a Monday schedule and by dispatch; runner minutes per run are the eight shards plus the `full` job, and at 43 minutes a shard that is about 5.7 runner-hours for the eight (an estimate, for a runner as fast as this container), against the 75 to 102 minutes of the 2026-11-03 run below, and the second CC-CMD (`docs/CC-CMD-2026-11-06-gate-residuals-remaining.md`, A5) names the one way to cut it that was considered and not built.

**Measured on a runner, the same day** (`verify-full` run 42200547950, dispatched on `1f05aa4`, which is the pushed tree plus two bot commits that touch only `STATUS.md` and `outbox/`; `outbox/verify-full-runner-timing-2026-11-06.md` has the table and its sources). Success, 46 min 43 s from dispatch to the last job; the gate scored 530/530 and its step took 2,705 s (against 354 s in the 2026-11-03 run). Per shard, the harness's own wall time was 1,723 to 2,373 s (29 to 40 minutes), and the longest job was shard 4's at 46 min 07 s, of which 622 s was setup against 102 s on shard 1: 581 s of it was `npx playwright install --with-deps chromium`, where `apt-get` printed `Fetched 12.3 MB in 9min 23s (21.8 kB/s)` and shard 1's printed `Fetched 21.9 MB in 1s`. The log shows the Ubuntu mirror was slow and apt fell back to a second host; it does not say why. Without that stall shard 4's job would have been about 37 minutes and shard 3's 40 min 50 s the longest. Shard 8 took 2,591 s alone in this container (141 entries; the table has gained 8 since) and 2,079 s on the runner, so a runner was faster here, not slower, and the estimate above (43 minutes a shard) was high by about 7 minutes for the typical shard (five of the eight were 35 to 37 minutes). The job time was 342 minutes, 5.7 runner-hours, as estimated (295.5 for the eight shards, 46.7 for `full`), which at the Monday schedule is about 1,470 job-minutes a month.

Against the budgets: the longest job used 51% of the 90-minute `timeout-minutes` and the gate step, which holds the wait, at most 45% of the 100-minute wait, so neither is changed (the rule above was to raise both together if the slowest shard passed about 70 minutes). One run, eight slices and one stalled mirror: that is the spread this run shows, and it is not a bound.

## 2026-11-04 — what the kill-recovery hardening added to the mutation row (not yet measured on a runner)

`docs/CC-CMD-2026-11-03-gate-state-hazards.md`. The harness's `--self-test` grew from 21 clauses to 118, because it now starts the real script in a scratch git repository for each way a run can end (SIGKILL, SIGTERM, SIGINT, SIGHUP, an exception, a planted lock, a broken git directory, two runs at once, a restarted run), and `proof-check.mjs --self-test` from 41 to 85 because it now runs the real script in a scratch directory per state it can find. Measured in the 4-core dev container at idle (load average 0.7 to 1.0 before and after; an earlier round of these figures was taken at load 5.4 with five runaway processes from review scratch copies running, and was about 50% high), each tree exported with `git archive`, one run each, 2026-11-04:

| tree | `mutation-check.mjs --self-test` | `proof-check.mjs --self-test` | table entries whose expectation is the mutation-check self-test / the proof-check self-test / the row-confidence self-test |
|---|---|---|---|
| `f38fc97`, the base of this work | 21 clauses, 0.57 s | 41 clauses, 1.35 s | 2 / 14 / 0 |
| `7703dd2`, the tree as the third review saw it | 68 clauses, 4.5 s | 55 clauses, 1.9 s | 36 / 22 / 0 |
| the tree as the fourth review saw it | 96 clauses, 8.9 s | 65 clauses, 2.6 s | 66 / 33 / 12 |
| now | 118 clauses, 13.2 s | 85 clauses, 5.8 s (the row-confidence self-test: 15 clauses, 0.14 s) | 94 / 62 / 50 |

Each of those entries starts its self-test once, so the mutation row's self-test work, serial, went from about 20 s (2 x 0.57 + 14 x 1.35) at the base to about 27 minutes now (94 x 13.2 + 62 x 5.8 + 50 x 0.14 = 1,608 s). That is serial CPU-and-wait on one core's worth of the container; the eight shards partition the table by position (`--shard i/8`), and the per-shard spread of these entries was not recomputed for this table, so the slowest shard is estimated, not known: an even split would add about 200 s to each shard (1,608 / 8), against the last recorded range of 3 min 28 s to 6 min 10 s below. The pre-commit hook runs `--anchors` and then the mutation-check self-test, so that step is about 13 s now where it was about 1 s at the base. **The local gate on the final tree** (`npm run gate`, this container, 12:49 to 13:57 UTC on 2026-11-04, load average 1.4 at its first check): 4,077 s in all, 3,967 s of it the row "breaking each invariant makes a check fail" (the first gate on the tree of Review 3 took 51 minutes in all). **Not measured on a runner**: the figures that matter (the slowest shard, the gate step of `verify-full`) are recorded by the first CI run after this lands; if the slowest shard has moved by more than the estimate above, something other than the self-tests is slow.

## 2026-11-03 (later) — the proof checks became one compile, and the gate is 6 minutes

`docs/CC-CMD-2026-11-03-proof-check-shards.md`. The proof checks were the longest path once the mutation suite was sharded (729 to 760 s). The filed answer was to shard them too; Task 0 found
that one compile of all 133 cases does the work (the F# compiler keeps checking after an error in one function), so `scripts/proof-check.mjs` now injects every case as its own function,
compiles once with the error cap lifted, and places each error in the case whose lines it falls in. Measured on the CI runners, run 41680758770 (tree `8b1ee44`, 530/530):

| | before | after |
|---|---|---|
| the row `doc claims are compiler-verified, not prose` | 729 to 760 s in the four sharded gates; 733 to 776 s in the three unsharded | **15 s** |
| the gate step of `verify-full` | 975 to 1869 s | **354 s** |
| the whole `verify-full` run, wall-clock | 19 min 19 s and 32 min 39 s | **7 min 5 s** |
| the mutation shards (eight) | 3 min to 31 min; the one holding `seal-goes-public` ran the proof row twice | 3 min 28 s to 6 min 10 s |
| **the longest path now** | the proof checks | **the mutation shards** (6 min 10 s for the slowest; the gate's mutation row waits 312 s of its 354 s) |
| the same row on the 4-core dev container | 133 x about 12 s under load, 27 min and more | 84 s for the whole run (the compile of the batch is 12 to 16 s; a failing compile costs 12 to 14 s here and 5.8 s on a runner) |

What the speed rests on, each measured (`outbox/proof-check-sweeps-2026-11-03.txt`): the batch and the old one-build-per-case method return **the same set of error codes for 133 of 133 cases**;
a real case passes only if the batch confirms it, so a batch that goes blind is red, not slow (with the error cap at the compiler's default the first version went green after 1030 s, which
is why that rule exists); two controls, one that compiles and one that is rejected with the wrong code, must fail for their own reasons in every run; and 38 deliberate breakages of the script
(18 aimed at its self-test, 20 at the live run) were each caught or, where the design is to go green (L13, N1, N3b), recorded as doing so. A proof case whose stated error is a PARSE error cannot be batched
(a parse error hides every later function's type errors: measured), and the run says so by failing.

The row's 15 s is the figure to watch: if it climbs back toward minutes, the batch has stopped confirming cases and they are being compiled one at a time (the run prints
`N of 133 case(s) confirmed from their own lines` and names the ones that were not).

## 2026-11-03 — both designs built, and what the gate costs now

`docs/CC-CMD-2026-11-03-gate-speed.md`. The two designs below were built in the order that makes the second sound: a watched incremental compiler (B) with the build made clean
and its digest compared before every mutation, then the mutation table split across eight runners (the "shard at the CI level" idea, below). Measured on the CI runners.

| | before | after |
|---|---|---|
| the gate step of `verify-full` (`npm run gate`) | 6153 s, 6228 s, 6513 s (the last three ledger lines) | **1075 s** (run 41627438202, tree `7af6e24`) and **1869 s** (run 41630543901, the tree that landed) |
| the whole `verify-full` run, wall-clock | about 108 min | **19 min 19 s** and **32 min 39 s** |
| runner time, all jobs | about 110 min on one runner | 75 min and 102 min across nine jobs |
| the mutation row | 4003 to 5688 s, 87% of the gate | 309 s and 1080 s at the gate (the wait for the shards); the shards' own time is in `outbox/mutation-baseline-latest.json` |
| a `src/` mutation, build plus restore | about 60 s (two whole-project compiles, 25 to 34 s each) | 5.3 s mean under watch (29.3 s under the reference build) |
| the table | 235 mutations, one process | 241 mutations in 8 shards; 72 distinct expectations; 0 survive |
| **the longest path now** | the mutation suite | **the proof checks** (`doc claims are compiler-verified`, 729 to 760 s, once in the gate and twice in the shard that holds `seal-goes-public`: its baseline and its mutation) |

The second run is slower than the first because the shard holding the proof row spent 31 min in it against 18.5 (same code, a slower runner); the spread is real and is why both are
kept. The next step was named here and built the same day: see the section above (`docs/CC-CMD-2026-11-03-proof-check-shards.md`).

**What was found on the way, each measured and in `outbox/cc-session-2026-11-03-gate-speed.md`:**

- `dotnet fable watch` defaults to Debug, where 53 of 53 output files differ from the full compile; `-c Release` makes every file byte-identical (all 163 mutations that rebuild: 0 digests differ across the whole table, `outbox/mutation-equivalence-latest.json`).
- Watch re-checks the file that changed and not the files after it, so a mutation that breaks only a later file builds under watch. A watch survivor is therefore confirmed by a full compile before it stands.
- The old harness counted any failed build as "defended by the COMPILER", a catch that costs nothing. The F# compiler inside Fable crashes on the CI runners (about one fresh full compile in a hundred), and the crash prints diagnostics that look real, so a crash was a free pass. A refusal now needs a second build to say the same thing, and the repeats are counted.
- 94 of the mutations were said to run on whatever compiled mutation had come before them. The table has 78 that do not rebuild; all 78 were caught on a clean build, so none was caught only by a leftover build.

Everything below this line is the measurement of 2026-08-12 and is kept as the record of why the choice was made; its numbers are superseded by the table above.

---

Measured 2026-08-12 on the dev sandbox (4 cores). Nobody had measured this; the
gate was "slow" as an impression. It is not evenly slow — one call dominates.

## The numbers

| Step | Time |
| --- | --- |
| `npm run build` (full) | **13,260 ms** |
| ↳ `dotnet fable` | **11,701 ms** (88%) |
| ↳ `node scripts/build-site.mjs` | 183 ms (1.4%) |
| a pure-node expect (`pickem-check`) | 3,668 ms |
| a browser expect (`tab-check`) | 2,108 ms |

## Where that lands

`mutation-check` is essentially the whole gate. From CI run 31551408060 the
mutation step ran 00:50:51 → 01:02:02 — **11 m 11 s**, against a gate step of
about the same length.

35 mutations. **25 target `src/` and therefore pay a full build each.**

```
25 × 13.26 s  =  332 s  of building, strictly serialized
```

So roughly **5.5 of the 11 minutes is `dotnet fable`, one whole-project compile
at a time**, and 88% of each of those is the F# compile itself.

Two things follow immediately, and both are counter-intuitive enough to be worth
writing down:

- **Skipping `build-site.mjs` saves nothing.** 183 ms × 25 = 4.6 s. The obvious
  micro-optimisation is noise.
- **The expects are not the problem.** 35 expects at 2–4 s is ~100 s, under a
  fifth of the build cost.

## Why the obvious parallelism is only a 12% win

Mutations are independent, so the instinct is a worker pool. The measurement
says which ones can actually move:

| group | count | can run in an isolated copy? |
| --- | --- | --- |
| `src/` with a bare `node scripts/X.mjs` expect | 9 | yes |
| `src/` with a `run-row.mjs` expect | 12 | only in a **git** copy — `gate-checks.mjs` reads `git diff`/`git rev-list` at import |
| `src/` driving a browser | 4 | needs its own server **and port**; the URL is baked into the expect string |
| `scripts/` and `.github/` | 10 | already build-free |

Parallelising only the trivially-safe 9 saves ~80 s of ~660 s. **12%.** Not worth
the concurrency.

## The two designs that would actually work

**A — worktree pool.** `git worktree` per worker (the tree is 4 MB), each with
its own `--outDir`, browser mutations kept serial in the main tree. Unlocks 21 of
25 builds. 279 s → ~93 s on three effective workers. Gate ~11 min → ~7 min.

**B — `dotnet fable watch`.** Start the watcher once; after writing each
mutation, wait for its recompile. Fable's incremental pass is ~1–2 s rather than
11.7 s, so 292 s → ~40 s. Gate ~11 min → ~5 min. Strictly better than A, and
simpler in structure.

B's risk is the one that matters here: **the synchronisation must be exact.** If
the harness reads `build/` before the recompile lands, every mutation is tested
against stale JS and the whole suite reports on a tree that no longer exists —
a check that passes in one direction, inside the tool that exists to find those.
Polling mtimes is not good enough. The sound signal is Fable's own
`Fable compilation finished` line on the watcher's stdout, consumed as a stream.

## Not implemented on this pass, deliberately

Design B is the right one and it is not a small change: a stdout-synchronised
watch driver with correct restore-on-signal semantics, verified by comparing full
runs before and after. Landing it half-verified would put a silently-stale
mutation harness at the centre of the gate.

The measurement above is the part that was actually missing, and it is what makes
the choice between A and B obvious rather than a guess.

## Other ways to spend less time, ordered by what they actually buy

### 1. Shard at the CI level, where isolation is free — the reframe

Every difficulty with in-process parallelism is an *isolation* problem: a shared
working tree, a shared `build/`, a shared port 8080, a shared git dir. GitHub
Actions already solves all four. A matrix job gets its own runner, its own
checkout, its own filesystem, its own localhost.

So the parallelism belongs one level up. `mutation-check.mjs --shard i/n`
partitions the list; a 4-way matrix runs the real suite four ways with **no
cache, no stale-build hazard, and no synchronisation to get wrong**. 11 min → ~3.

The same argument applies to the gate as a whole: its twenty-one rows are
independent by construction — that is what made the conjunction fix possible —
and CI runs them strictly serially inside one job. `verify` took 23 minutes on
run 31517400219 while its longest single row took 11.

This is the largest available win and the *lowest* risk, which is an unusual
combination and the reason it is first.

### 2. Mutate the compiled JS, not the F# source

The 11.7 s is a full-project F# compile. Most mutations are **behavioural** —
`if home = away then None` → `if false then None` — and have a direct counterpart
in `build/Pickem.js`. Applying the find/replace to the compiled output skips the
compile entirely: 13.3 s → milliseconds.

The objection is that a JS-level find string is brittle against Fable's codegen.
That objection is weaker here than it looks, because `mutation-check` already
fails loudly with `the mutation anchor still exists` when a find string stops
matching. The brittleness is **visible, not silent**, which is the standard this
repo applies elsewhere.

The mutations that must stay on the F# source are the ones whose claim is about
the type system — `seal-goes-public`, `build-warning` — because for those,
*failing to compile* is the point.

### 3. Dedupe the baseline — done, and it is the honest kind

The suite has 38 expects and **22 distinct** ones. Four mutations share
`run-row.mjs "the F# harness refuses a check with no counterexample"`, four share
the same `tab-check` invocation. The green-baseline pass ran all 38.

Sixteen redundant runs at 2–4 s each, gone. It removes **repeated** work rather
than work: every distinct expectation still runs, and the per-mutation loop is
untouched.

### 4. Content-addressed memoisation — rejected

Hash the mutation, its target file, and the transitive closure of its expect
script; replay the recorded verdict when nothing changed. Attractive for local
iteration, and rejected: miss one transitive dependency and it caches a stale
green. That is a check that passes without running, which is worse than a slow
one. If it were ever built, the hash would have to be a conservative
over-approximation — any tracked file changing invalidates everything — at which
point it buys nothing in CI, where almost every file has changed.
