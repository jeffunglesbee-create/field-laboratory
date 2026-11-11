# Claude Code Command — a workflow step that pipes into `tee` reports tee's exit status; nine steps in six workflows did, and no guard said so

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-11, from the review of `fable-issue-prefill.yml` (2026-11-10) and the owed-work check that followed. Rule 87.4 / BUILD-ON-A: searched `docs/CC-CMD-*.md` by content (`pipefail`, `PIPESTATUS`, `unguarded pipe`, `tee`); nothing covers it. `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` A9 is about a pipe on a self-test's stdout, a different defect.
**Confidence gate:** `npm run gate` >= 95 before any commit that lands.
**Status:** **BUILT 2026-11-11 on branch `pipes-guard`; the scored gate and the landing follow** (the run ids go in `outbox/cc-session-2026-11-11-pipes-guard.md`, and this line becomes DONE with them). Task 0, 1 and 2 are done and reviewed (53 agents; 17 findings confirmed, fixed below). The filed text said "nine steps in five workflows": it was nine steps in SIX workflows (a miscount at filing, found by that review), and three of the nine (`fable-crash-probe.yml` x2, `mutation-ids-probe.yml`) were fixed first, in `aa71d3a`, because they were this session's own.

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
node scripts/workflow-check.mjs | grep -E "^Read |tee"
```

## Why this exists, measured

A GitHub Actions `run:` step with no `shell:` key runs `bash -e {0}`: no `pipefail`. In `node script | tee -a "$GITHUB_STEP_SUMMARY"` the exit status is `tee`'s, so a script that throws leaves the step GREEN, and anything after it that depends on the script's output (a file it should have written) is stale. Evidence, each with its method:

| fact | value | where it was read |
|---|---|---|
| the trap, measured on a real run | "the import of METHOD threw, nothing was written, and this step said success" | `.github/workflows/forecast-run.yml:62-66` (the fix there: `shell: bash` and a comment) |
| the trap, reproduced offline | `bash -e -c 'node -e "process.exit(3)" 2>&1 \| tee /dev/null'` exits 0; the same with `; exit ${PIPESTATUS[0]}` exits 3 | review of `fable-issue-prefill.yml`, 2026-11-10 (25 agents; two skeptics reproduced it with a stubbed 403) |
| how many steps carried it | 337 `run:` steps read, 30 pipe into `tee`, **9 had nothing that handles the left side's status** at `a6b282a` (the filing); **6** at `f4b6103` (after `aa71d3a` fixed three) | the final check run over the workflows at each commit: `outbox/pipes-guard-red-before-fix-2026-11-11.txt`; the independent first count is `outbox/find-unguarded-pipes-2026-11-11.mjs` |
| whether any guard saw it | none: `scripts/workflow-check.mjs` had no check for a pipe's exit status, and `check:workflows` passed on `fable-issue-prefill.yml` with the trap in it (commit `828300b`, before the review found it) | read from the script and from that commit's passing guards |

The nine steps at filing, in six workflows: `alternate-colour-probe.yml` (3), `fable-crash-probe.yml` (2), `favourite-band-census.yml` (1), `mutation-ids-probe.yml` (1), `open-meteo-egress-probe.yml` (1), `verify.yml:257` "Fail on any F# compiler warning" (1).

## Rulings and prior work this must not undo (BUILD-ON-A)

- The convention in use: `; exit ${PIPESTATUS[0]}` after the pipeline (`forecast-live-probe.yml`, `lineups-live-probe.yml`, `mutation-equivalence.yml`, `fable-issue-prefill.yml`), `set -o pipefail` (`bdb-census.yml`, `gravity-census.yml`, `venue-source.yml`), or an explicit `shell: bash` (`forecast-run.yml`). The check accepts exactly these and nothing else.
- `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` section C holds the determinism scan and the checkers that share its scanner; the check went into `scripts/workflow-check.mjs` and its fixtures, the file the gate row "workflow jobs can run the scripts they invoke" already runs. No gate row's name or weight changed.
- Nothing here changes what any step measures. What changes is the step's OUTCOME when its script fails, which is the point; the two scripts that exit non-zero by design are named under Task 2.

## Scope

**Touched:** `scripts/workflow-check.mjs` (the check and its fixtures), `alternate-colour-probe.yml`, `favourite-band-census.yml` (the step, and `if: always()` on its commit step), `open-meteo-egress-probe.yml`, `verify.yml` (one step), `outbox/`. **Not touched:** any step's command (only what follows it, or `set -o pipefail` before it), any gate row's weight or name, `docs/gate-rows.txt`, the mutation table.

## TASK 0 — Probe block

At the build: `node outbox/find-unguarded-pipes-2026-11-11.mjs .` printed 6 (not the 9 of the filing: `aa71d3a` had fixed the first three); `grep -n "pipefail\|PIPESTATUS" scripts/workflow-check.mjs` found nothing. Premises checked before editing, because two of the six scripts exit non-zero BY DESIGN and a fix that turned every run red would have been a regression: the three `probe-*` scripts of `alternate-colour-probe.yml` end `process.exit(0)` on a normal run; `favourite-band-census.mjs` exits 1 only on a void shadow or a refused reading; `probe-open-meteo-egress.mjs` exits 1 only on `not-observable` (its own comment: "the probe REPORTS. It does not gate"); all three workflows are `workflow_dispatch` or push-path only, so nothing scheduled turns red.

## TASK 1 — The check, red before it is green

`scripts/workflow-check.mjs` reads every `run:` step (`runStepsOf`: a `- key:` item of a `steps:` list, block, quoted and plain-multi-line scalars, CRLF, YAML de-indentation) and the shell text of each (`shellViews`, a small scanner: comments, heredoc bodies and quotes, read the way bash reads them), and fails a step that pipes into `tee` unless its code carries `PIPESTATUS`, `set ... -o pipefail`, or an explicit `shell: bash` (or a shell value that says pipefail). **The Task 0 decision on a tokenizer: yes, a scanner was needed.** The first version blanked quotes with one regular expression, and review showed an apostrophe in a trailing comment or in heredoc prose pairing with a later quote and swallowing a real pipe (reproduced under `bash -e`: exit 0 over a failed script). The scanner replaced it; the same review found a block scalar's indentation was never stripped, so a heredoc's closing line never matched and swallowed the rest: found by a failing fixture, fixed by de-indenting as YAML does.

42 checks, 30 of them fixtures with a must-fail twin: bare pipe; `exit ${PIPESTATUS[0]}` on the next line, on the same line, inside quotes; `set -o`, `-eo`, `-euo`, `-e -o`, the long `set -o errexit -o pipefail`; `set -e` alone is NOT a guard; `shell: bash` (also quoted, also padded) and `shell: bash -eo pipefail {0}` guard, `shell: bash -e {0}` and `shell: sh` do not; **a comment that says PIPESTATUS and pipefail is not a guard**; `tee` that is not a pipe target; `||`; `|&`; a pipe on a continuation line; `| sudo tee`, `| /usr/bin/tee`, a backslash-newline before `tee`; a quoted `| tee`; an escaped quote inside a string; heredoc prose and heredoc data; `<<<`; a trailing-comment apostrophe; double-quoted, single-quoted and plain multi-line `run:` scalars; CRLF; a `with:` key named `run:`; a matrix `include:` entry with `run:`; the next job's keys not read as the last step's; `#` that does not begin a word; PIPESTATUS inside a heredoc is not a guard. The check prints its denominators (`Read 337 run steps; 30 pipe into tee (22 by PIPESTATUS, 7 by pipefail, 1 by shell; 0 unguarded)`) and fails on a blind reader. **Rule 90:** 34 deliberate breakages of the new code, each caught (`outbox/pipes-guard-sweep-2026-11-11.txt`), and one pair that is expected to survive and says why. **Red before green:** the final check over the workflows at `a6b282a` fails on exactly the nine, at `f4b6103` on exactly the six, and passes on the fixed tree (`outbox/pipes-guard-red-before-fix-2026-11-11.txt`).

## TASK 2 — The six steps

`exit ${PIPESTATUS[0]}` after the pipeline where the pipeline is the step's last command: `alternate-colour-probe.yml` x3, `favourite-band-census.yml`, `open-meteo-egress-probe.yml`. **`verify.yml:257` takes `set -o pipefail` before the `dotnet build ... | tee`, NOT `exit ${PIPESTATUS[0]}`:** the filed text said to put the exit before the `grep`, and that would have exited 0 on a clean build and skipped the `grep` that fails the step on a compiler warning, switching the warning gate off (found by the review). Outcomes that change, by design: `open-meteo-egress-probe.yml` goes red on `not-observable` (its commit step is `if: always()`, so the reading is still committed); `favourite-band-census.yml` goes red on a void or refused census, and its commit step, which had no `if:`, gained `if: always()` so the artifact is still committed as before (what it commits is the census's stdout; the reason is in the step log). Shell behaviour of each step, before and after, with the tool replaced by a shim that exits 3: **before, all six exit 0; after, all six exit 3; with a tool that exits 0 all twelve runs exit 0**; with the fix removed the harness goes red 6 of 6 (`outbox/pipe-fix-proof-2-2026-11-11.txt`).

## DONE CONDITION — every line an artifact (Rule 89)

1. `node scripts/workflow-check.mjs` prints `Read 337 run steps; 30 pipe into tee (... 0 unguarded)` and `42/42 checks passed`, in `verify` (step "Workflow jobs can run what they invoke") and in the gate row of the same name.
2. The sweep: 34 of 34, kept in `outbox/pipes-guard-sweep-2026-11-11.txt`.
3. The check was red on the nine and then the six before they were fixed (`outbox/pipes-guard-red-before-fix-2026-11-11.txt`) and is green after.
4. One scored `verify-full` on the landing tree: the ledger line, 530/530; `verify` green on the landing commit.

**What this does not prove, and what the check does not read** (also in the comment on `teePipeGuard` and `shellViews`): that a guard reaches EVERY pipe of a step that has two (the test is the guard's text, per step); a pipe inside `$( )` within double quotes, inside a nested `sh -c '...'` string, or in `$'...'` quoting; `defaults.run.shell` (a workflow that sets it writes `shell: bash` on the step or uses the convention); other ways a step hides its script's failure (`cmd || true`, `;` between commands, `if: always()` on a commit step after a failed writer). That the six steps now fail on a REAL script error on Actions: the shell behaviour is shown with a shim, not by a run of each workflow (all are dispatch-only; none was dispatched).
