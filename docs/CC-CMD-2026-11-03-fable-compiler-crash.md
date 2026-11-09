# Claude Code Command — the F# compiler inside Fable crashes on the CI runners, about once in a hundred builds

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, as the follow-up `docs/CC-CMD-2026-11-03-gate-speed.md` requires (Rule 87.4: its answer to the crash is a bounded, counted repeat, and the cause is not known).
**Confidence gate:** `npm run gate` >= 95 before any commit that lands. A pin of the SDK version would change what every workflow builds with.
**Status:** **DONE 2026-11-03, on the second branch of done condition 2: no factor was found at this power; the repeat in `scripts/build-steady.mjs` and the harness stays.** Task 1 ran (run 41649197891, `outbox/fable-crash-probe-latest.json`): 400 builds, 1 crash. Landed as `fcb8556` after a gate on the landing tree (run 41652648922, 530/530, ledger `bf487aab59f5-45f06491eb07`, gate step 975 s, run 17 min 45 s); `verify` run 41655707008 green, including the new step `The compiler-crash probe counts what it should`; the deploy that carries it, run 41656472547, green. The report to file upstream is drafted in `outbox/fable-crash-upstream-report.md`; filing it is the owner's (it posts outside this repository).

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
```

## What was measured (2026-11-03; nothing here is a cause)

| fact | value | where |
|---|---|---|
| the signature | `error FSHARP: internal error: Object reference not set to an instance of an object. (code 193)`, reported at many files of the project at once, for source that compiles; the same crash also prints diagnostics that look real: code 72 and 752 ("Lookup on object of indeterminate type"), code 1 ("the type ... is not compatible with ..."), "A unique overload for method 'DateTime' could not be determined" | run 41614410302, job 125844142720 (`mutation shard 1 of 8`, step `Build`) |
| rate on the runners | 2 to 4 failed builds in the ~260 `--build full` builds of each whole-table equivalence run (runs 41590393392, 41603976677, 41614404411), 1 plain `npm run build` in the 9 builds of one scored gate; none in about 800 `--build watch` compiles, where one long-lived process does the checking | `outbox/mutation-equivalence-latest.json` (`crashRetries`), the run logs |
| clustering | three builds in a row crashed once (reference shard 3, run 41603976677, the restore of `venue-reading-serves-only-its-own-name`), and the repeat budget of two was spent | run 41603976677, job 125809151719 |
| where in the project | files under `build/fable_modules/Thoth.Json.10.5.1/` (Decode.fs, Types.fs: Fable's copies of a package's sources), and `src/` files | the same logs |
| the runner | ubuntu-26.04 image 20261025.179, .NET SDK 10.0.403 (`setup-dotnet` `10.0.x`), Fable 5.13.0 | the `Set up job` and `setup-dotnet` lines |
| the sandbox | SDK 10.0.113. One crash in the first harness run of `narrative-second-wind-off-by-one` under `--build full` (Thoth.Json `Types.fs(33,1)`); none in 12 clean `npm run build`, none in 16 builds each straight after a source change, none in 6 plain `dotnet fable` of that mutated file into fresh directories | this session |
| what is already done about it | `scripts/mutation-lib.mjs` repeats a failed build and believes a diagnostic only when the next build says the same first thing; `scripts/build-steady.mjs` does that for the CI build steps | `docs/CC-CMD-2026-11-03-gate-speed.md`, `outbox/cc-session-2026-11-03-gate-speed.md` |

Hypotheses, none tested: the newer SDK's F# compiler checking in parallel (a race on a shared structure); a race on the package sources Fable copies under `build/fable_modules` while the checker reads them; memory pressure on a 7 GB runner; a difference between SDK 10.0.113 and 10.0.403.

## Rulings this must not undo (BUILD-ON-A)

- `docs/CC-CMD-2026-11-03-gate-speed.md`: the repeat is bounded, announced and counted, and a real failure still fails; do not widen it, and do not remove it until a cause is fixed and measured.
- No fallbacks: the answer to the crash is the cause, not another repeat. If the cause is the SDK, the workflows pin the SDK; if it is a compiler option, the project sets it; neither is a fallback.
- `src/` is not touched without the Rule 39 diagnostic written first.

## RESULT of Task 1 (run 41649197891, 2026-11-03, ubuntu image 20261026.180.1, 4 cores, Fable 5.13.0; 100 builds per cell in two jobs of 50)

| cell | builds | crashes | rate (95% interval) | mean per build |
|---|---|---|---|---|
| SDK 10.0.403 (the image's), fresh outDir each build | 100 | 0 | 0.0% (0.0 to 3.7%) | 21.7 s |
| SDK 10.0.113 (pinned by a `global.json`), fresh outDir each build | 100 | **1** (part 1, build 14) | 1.0% (0.2 to 5.4%) | 20.0 s |
| SDK 10.0.403, one outDir reused | 100 | 0 | | 0.8 s |
| SDK 10.0.113, one outDir reused | 100 | 0 | | 0.9 s |

The one crash: `./build-14/fable_modules/Thoth.Json.10.5.1/Types.fs(33,1): (37,6) error FSHARP: internal error: Object reference not set to an instance of an object.`, the same
signature and the same file as the harness runs. What this says, and does not:

- **The SDK version is not the cause.** The crash happened on 10.0.113, the sandbox's SDK, as well as on the runner's 10.0.403 in the harness runs. It cannot rank the two: 1 in 100 against 0 in 100 is inside either's interval.
- **The rate on an idle runner is low:** 1 in 400 builds pooled (0.25%, 0.04 to 1.4%), 1 in 200 fresh compiles (0.5%, 0.09 to 2.8%). The harness runs saw two or more failed builds in about 260 (about 1%), and the sharded gate lost builds three times in four runs. The probe's interval contains both, so it neither confirms nor refutes that the harness context (browser checks and a server running in the same job) raises it.
- **The "reuse" cells measure the cache, not the compiler.** A reused output directory with an unchanged source is a cache hit (0.8 to 0.9 s a build), so those cells hold 2 real compiles each, not 100. The harness's pattern (a source change between builds in one directory) was not probed. That is a design flaw of this probe, stated here instead of rerun: a probe that touches a source file between builds would have to run about 1,500 builds per cell to tell 1% from 0.1%.
- **Nothing fails faster on one cell**, so nothing is pinned. The decision recorded is the one already in force: repeat, count, print; the count is in every merge line (`failed builds repeated`).

## TASK 1 — a probe that counts (CI-as-proxy, Rule 89: the artifact is the count)

`fable-crash-probe.yml` (trigger file `outbox/.trigger-fable-crash-probe`), a matrix of cells, each running 60 `dotnet fable src/Laboratory.fsproj --outDir <fresh>` builds in a row and writing `{cell, builds, crashes, firstSignature, secondSignature}` to `outbox/fable-crash-probe-latest.json`. Cells: SDK 10.0.113 against 10.0.x latest (pin with `setup-dotnet`); a fresh outDir each time against the same outDir; an idle runner against one with a second `dotnet fable` running (a stand-in for the shards). The comparison is the rate per cell with its denominator, not a pass.

## TASK 2 — the cause, if the probe finds a cell that does not crash

Name the factor (the SDK version, the shared outDir, load), reproduce it with ONE command, fix it where it lives (the workflow's SDK pin, a project option), and then remove the repeats from `scripts/build-steady.mjs` and the two build steps. If every cell crashes at the same rate, say so with the numbers and keep the repeat as the measured answer; file the upstream report with the signature.

## DONE CONDITION — every line an artifact

1. `outbox/fable-crash-probe-latest.json` with a denominator per cell.
2. Either a one-command reproduction and a fix whose scored gate shows `failed builds repeated: 0` across two runs, or the upstream report and the rate.
3. `verify` green on the landing commit.

**What this does not prove:** that the crash is the same crash in every cell (the signature is compared, not assumed); that 60 builds per cell is enough to see a rate below 2% (the probe prints the confidence bound).

## Occurrences found after this CC-CMD closed (BUILD-ON-A: counted here, not filed again)

### 2026-11-09, `live-check` run 42690276129, attempt 1

| fact | value | where |
|---|---|---|
| the occurrence | attempt 1 (job 129407885849, 20:09:51Z to 20:10:39Z) failed at step 7, `Build (the venue table this check derives its expectation from)`: `dotnet tool restore` and a plain `npm run build`, on the deploy of `3429152`. Steps 8 to 17, every check of the deployed page, were skipped. Attempt 2 (job 129409113140) on the same commit ran all of them and passed | `gh api repos/jeffunglesbee-create/field-laboratory/actions/runs/42690276129/attempts/{1,2}/jobs` |
| the signature | 68 ` error FSHARP` lines: 44 `internal error: Object reference not set to an instance of an object. (code 193)`, the first printed at `./build/fable_modules/Thoth.Json.10.5.1/Types.fs(33,1): (37,6)`; the other 24 carry codes 72 (9), 752 (4), 39 (4), 1129 (4), 41 (2) and 1 (1). 29 lines are in Thoth.Json's sources (Decode 22, Extra 4, Encode 2, Types 1) and 39 in nine `src` files (Scoreline 8, Desk 8, Program 7, Journalism 7, Fixtures 3, Suite 2, Stamina 2, Scoreboard 1, Lineups 1). After them: `Extra.fs(1,1): error EXCEPTION: Cannot find user entity Thoth.Json.ExtraCoders`, a stack trace through `Fable.Transforms`, `Compilation failed`, exit 1 | the job's log, `gh api repos/jeffunglesbee-create/field-laboratory/actions/jobs/129407885849/logs` |
| against the signature row above | job 125844142720 (that row's log): codes 72 (9), 752 (4), 41 (2) and 1 (1), 43 lines of code 193, 59 ` error FSHARP` lines in all, and no line of code 39, code 1129 or `Cannot find user entity`; the other log this CC-CMD cites by job, 125809151719, has none of those three either. This occurrence has the same codes plus 1 more line of code 193, 4 of code 39 and 4 of code 1129 (59 + 9 = 68), both of the last two about `ExtraCoders`, and the entity line. Code 39 for `ExtraCoders` is listed in `outbox/fable-crash-upstream-report.md`; code 1129 and the entity line are in neither that report nor this CC-CMD | the logs of the three jobs |
| the runner | ubuntu-26.04 image 20261101.186.1, .NET SDK 10.0.403 (runtime 10.0.14), Fable 5.13.0, the same in attempt 2 and in the green `live-check` of `0827a1f` (run 42683554851); the image build is a third one, after 20261025.179 and 20261026.180.1 above | the `Set up job` and `setup-dotnet` lines of each log |
| the count | this tree, the content of `3429152`, was built 5 times that the session knows of: the sandbox, `verify` run 42689207143, `deploy` run 42690116309 and the two `live-check` attempts. 1 crashed | those runs |
| where the repeat is | `scripts/build-steady.mjs` is used by `.github/workflows/verify-full.yml` (line 170) and `.github/actions/mutation-shard/action.yml` (line 54) only. `verify.yml` (line 254), `deploy.yml` (169) and `live-check.yml` (107) run a plain `npm run build` | `grep -rn 'build-steady\|npm run build' .github` |
| what was done | nothing in a workflow or in `scripts/`. The ruling above (do not widen the repeat, do not remove it until a cause is fixed and measured) stands. Whether the plain build in `live-check`, `verify` and `deploy` gets the repeat is the owner's call | `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, `outbox/cc-session-2026-11-09-fit-c.md` items 26 and 27 |

**What this does not show:** whether code 1129 and the entity line mark a different failure or the same one with a different consequence; the cause, which is still not known; a rate for the three plain builds, because the number of builds they have run was not counted (the rates above, 1 in 400 on an idle runner and about 1% in the harness runs, come from the probe and the harness, not from these steps).
