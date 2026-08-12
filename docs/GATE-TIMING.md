# Where the gate's time actually goes

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
