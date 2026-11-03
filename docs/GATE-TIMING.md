# Where the gate's time actually goes

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
