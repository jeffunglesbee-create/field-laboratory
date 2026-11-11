# Session 2026-11-11 — the tee-pipe guard (`docs/CC-CMD-2026-11-11-workflow-pipes-into-tee.md`)

Session: https://claude.ai/code/session_017RuhXKQdbuZ7W9Q7sR1Vrm

The owner said "go" to build the guard filed after the owed-work check. Built on branch `pipes-guard`.

## What was built

- `scripts/workflow-check.mjs`: `runStepsOf` (every `run:` step of a workflow), `shellViews` (comments, heredocs and quotes read the way bash reads them), `teePipeGuard`, `unguardedTeePipes`, a `teeAudit` over all 51 workflows with its denominators printed, and 30 fixture clauses. A step that pipes into `tee` fails unless its code has `PIPESTATUS`, `set ... -o pipefail`, or an explicit `shell: bash`.
- The six steps it found, fixed: `alternate-colour-probe.yml` x3, `favourite-band-census.yml` (and `if: always()` on its commit step), `open-meteo-egress-probe.yml`, `verify.yml` "Fail on any F# compiler warning" (`set -o pipefail`, not an exit before the grep).

## Evidence

- Red before green: the final check over the workflows at `a6b282a` (the filing) fails on exactly 9 steps, at `f4b6103` on exactly 6, and passes on the fixed tree (42/42): `outbox/pipes-guard-red-before-fix-2026-11-11.txt`. It reads the same 337 steps and 30 tee pipes as the independent offline counter (`outbox/find-unguarded-pipes-2026-11-11.mjs`).
- Rule 90: 34 deliberate breakages of the new code, each caught, and the pair that must stay green (`outbox/pipes-guard-sweep-2026-11-11.txt`).
- Each fixed step, before and after, under `bash -e` with the tool shimmed to exit 3: all six exit 0 before and 3 after; with a tool that exits 0 all twelve runs exit 0; with the fix removed the harness is red 6 of 6 (`outbox/pipe-fix-proof-2-2026-11-11.txt`). The harness itself failed first on a missing `outbox/` directory in its scratch cwd (every step exited 1 in every scenario), which is how it was shown to be able to fail.
- Premises checked before the edits (Rule 100): the five scripts' exit codes; two exit 1 by design (`favourite-band-census.mjs` on a void or refused census, `probe-open-meteo-egress.mjs` on `not-observable`), so those two workflows will now go red on those outcomes, which is the point; all three affected workflows are dispatch-only, so nothing scheduled turns red.
- Independent review: 53 agents, three dimensions, two skeptics per finding; 17 confirmed, all addressed:
  - the quote blanking was a single regular expression: an apostrophe in a trailing comment or heredoc prose swallowed a real pipe (reproduced under `bash -e`: exit 0 over a failed script). Replaced by a scanner.
  - YAML-quoted and plain multi-line `run:` scalars were missed; CRLF yielded no steps; the step reader bled into the next job and read a matrix `include:` entry as a step; `set -o errexit -o pipefail`, a quoted `shell: "bash"`, and `| sudo tee` / `| /usr/bin/tee` / a backslash-newline before `tee` were wrong; a `| tee` inside heredoc data was flagged. Each has a fixture.
  - THE CC-CMD HAD AN ERROR: its Task 2 told `verify.yml` to put `exit ${PIPESTATUS[0]}` before the `grep`, which would exit 0 on a clean build and skip the grep that fails the step on a warning, switching the warning gate off. The implementation used `set -o pipefail`; the text now says so and why.
  - the filing said "nine steps in five workflows": it was six workflows. The scope, counts and done conditions of the CC-CMD were brought to the tree; the `favourite-band-census.yml` comment overclaimed what its commit step holds (the file has the census's stdout, the refusal text is on stderr) and was corrected.
- My own fixture failed twice in the sweep for a reason worth keeping: a heredoc test could not tell a closed heredoc from an open one (the pipe it looked for was inside the heredoc either way); it now has a real pipe after the closing line. Two pieces of code the sweep showed to be redundant (a comment filter, a here-string clause) were removed.
- The cheap guards run locally on the final tree: `check:workflows` 42/42, `check:gate-rows`, `check:import-purity`, `check-script-orphans`, `check:ignore-parity`, `check-no-literal-secret-writes`, `check-push-lands.py`, `check:docs`, `check:citations`, `cc-cmd-status-check`, and the gate row "workflow jobs can run the scripts they invoke".

## What the check does not read (also in the code's comments and the CC-CMD)

A guard is found as TEXT per step, so a step with two pipes and one guard passes; a pipe in `$( )` within double quotes, in a nested `sh -c '...'` string or in `$'...'` is not scanned; `defaults.run.shell` is not read; other ways of hiding a failed script (`|| true`, `;`, `if: always()` after a failed writer) are the same class and are not scanned. Not run on Actions: the six steps' behaviour is shown with a shim; all three affected workflows are dispatch-only and none was dispatched.

## The scored gate (added before landing)

**Run 42971457634** (`verify-full`, branch `pipes-guard`, head `125e28d`, dispatched 06:18Z, finished 06:58Z): `full` and all 8 mutation shards succeeded. **Ledger `125e28def6ff-954295b1b0f5`: 530/530, total 100, gate 2281 s** (`docs/confidence-log.jsonl`, written by the gate's own ledger commit `7779ea9`). `dirty: true` on that line is the gate's own write of `outbox/mutation-baseline-latest.json` (commit `a6dc8e5` changes only that file); every full run in the ledger since `7af6e24` that reached 530/530 carries the same flag, and the two that failed early (`0d3df2e`, `b07f072`) do not.

**The run before it was red for a different reason**, and I read it wrong first. Run 42967615166 (`0d3df2e`) scored 510/530: only the mutation row, shard 4. I called it environmental (the same row failed on another session's tree); the shard's Build step said otherwise: the first build hit the Fable crash, `build-steady` repeated it, and the repeat printed `Skipped compilation because all generated files are up-to-date!` over the crashed output, so the baseline ran against it (10 of 39 failing) and the driver refused to start. The repair is its own commit, `4327e1f`, written up in `outbox/cc-session-2026-11-11-build-steady-clean.md`. That red run was cancelled by the dispatch of this one.

**Collateral, stated once:** my dispatch of 42967615166 (05:43Z) cancelled six leftover shard jobs of the other session's run 42964147134 (its `full` job had already failed at 05:17Z). That session's failure was the same crash, so its shards were going to be red either way, but they were not mine to cancel; I had not checked for a run in progress.
