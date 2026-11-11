# Claude Code Command — a workflow step that pipes into `tee` reports tee's exit status; nine steps in five workflows do, and no guard says so

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-11, from the review of `fable-issue-prefill.yml` (2026-11-10) and the owed-work check that followed. Rule 87.4 / BUILD-ON-A: searched `docs/CC-CMD-*.md` by content (`pipefail`, `PIPESTATUS`, `unguarded pipe`, `tee`); nothing covers it. `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` A9 is about a pipe on a self-test's stdout, a different defect.
**Confidence gate:** `npm run gate` >= 95 before any commit that lands.
**Status:** **FILED 2026-11-11, unblocked, not started.** The owner's go on 2026-11-11 covered the two workflows that are this session's own (`fable-crash-probe.yml`, `mutation-ids-probe.yml`: fixed in their own commit, see the session note `outbox/cc-session-2026-11-11-owed-work.md`). This CC-CMD touches four workflows that belong to other work and the shared guard, so it waits for a go.

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
node outbox/find-unguarded-pipes-2026-11-11.mjs .
```

## Why this exists, measured

A GitHub Actions `run:` step with no `shell:` key runs `bash -e {0}`: no `pipefail`. In `node script | tee -a "$GITHUB_STEP_SUMMARY"` the exit status is `tee`'s, so a script that throws leaves the step GREEN, and anything after it that depends on the script's output (a file it should have written) is stale. Evidence, each with its method:

| fact | value | where it was read |
|---|---|---|
| the trap, measured on a real run | "the import of METHOD threw, nothing was written, and this step said success" | `.github/workflows/forecast-run.yml:62-66` (the fix there: `shell: bash` and a comment) |
| the trap, reproduced offline | `bash -e -c 'node -e "process.exit(3)" 2>&1 \| tee /dev/null'` exits 0; the same with `; exit ${PIPESTATUS[0]}` exits 3 | review of `fable-issue-prefill.yml`, 2026-11-10 (25 agents; two skeptics reproduced it with a stubbed 403) |
| how many steps carry it today | 337 `run:` steps read, 30 pipe into `tee`, **9 have nothing that carries the left side's status** (no `PIPESTATUS`, no `pipefail`, no `shell: bash` in the step) | `node outbox/find-unguarded-pipes-2026-11-11.mjs .` at `origin/main` on 2026-11-11; output kept in `outbox/unguarded-pipes-2026-11-11.txt` |
| whether any guard sees it | none: `scripts/workflow-check.mjs` has no check for a pipe's exit status, and `check:workflows` passed on `fable-issue-prefill.yml` with the trap in it (commit `828300b`, before the review found it) | read from the script and from that commit's passing guards |

The nine steps: `alternate-colour-probe.yml` (3), `fable-crash-probe.yml` (2), `favourite-band-census.yml` (1), `mutation-ids-probe.yml` (1), `open-meteo-egress-probe.yml` (1), `verify.yml:257` "Fail on any F# compiler warning" (1). The first four files' steps write evidence files or measure; `verify.yml:257` recompiles after the real build and then greps its log for warnings, so a failed recompile with no warning text would pass: low impact, same defect.

## Rulings and prior work this must not undo (BUILD-ON-A)

- The convention in use: `; exit ${PIPESTATUS[0]}` after the pipeline (`forecast-live-probe.yml`, `lineups-live-probe.yml`, `mutation-equivalence.yml`, `fable-issue-prefill.yml`) or an explicit `shell: bash` (`forecast-run.yml`). Use one of them; do not invent a third.
- `docs/CC-CMD-2026-11-06-gate-residuals-remaining.md` section C holds the determinism scan and the checkers that share its scanner; a new check belongs in `scripts/workflow-check.mjs` and its self-test, not in a new script, unless Task 0 finds that file cannot hold it.
- Nothing here changes what any step measures; a step that now fails on a script error would have been green before, and that is the point.

## Scope

**Touch:** `scripts/workflow-check.mjs` (the check and its self-test), the five workflows above (the nine steps only), `outbox/`.
**Do NOT touch:** any step's command, only what follows it; any gate row's weight or name; `docs/gate-rows.txt`.

## TASK 0 — Probe block (run first)

```bash
node outbox/find-unguarded-pipes-2026-11-11.mjs .   # 9 steps expected; if not 9, say what moved
grep -n "pipefail\|PIPESTATUS" scripts/workflow-check.mjs | head   # expected: nothing
```

## TASK 1 — The check, red before it is green

In `scripts/workflow-check.mjs`: a `run:` step whose script pipes into `tee` fails unless the step carries `PIPESTATUS`, `pipefail`, or an explicit `shell: bash`. The self-test has a must-fail input per clause: a bare `node x | tee f` (must fail); the same with `; exit ${PIPESTATUS[0]}` (must pass); with `set -o pipefail` (must pass); with `shell: bash` in the step (must pass); `shell: sh` (must fail: sh has no pipefail); a `tee` that is not a pipe target (`tee` as the first word) (must pass); a pipe inside a quoted string (decide in Task 0 whether the scan needs a tokenizer, and say). Mutate each clause in a copy and require the self-test red (Rule 90) before the check goes in. Run it over the 9 steps: it must be red on exactly those 9 before Task 2.

## TASK 2 — The nine steps

Add the convention to each of the nine steps, nothing else. For `verify.yml:257` the right fix is `; exit ${PIPESTATUS[0]}` before the `grep`, so a failed recompile fails the step with its own output above it.

## DONE CONDITION — every line an artifact (Rule 89)

1. `node outbox/find-unguarded-pipes-2026-11-11.mjs .` prints `... with nothing carrying the left side's exit status: 0`.
2. `npm run check:workflows` prints its new clauses' denominators and passes; its mutation sweep (each clause broken in a copy, red) is kept in `outbox/`.
3. The check was red on all 9 steps before Task 2 (output kept), green after.
4. One scored `verify-full` on the landing tree: the ledger line, 530/530; `verify` green on the landing commit.

**What this does not prove:** that a `tee` pipe is the only way a step can hide its script's failure (`cmd || true`, `;` between commands, `if: always()` on a commit step after a failed writer are the same class and are not scanned); that the fixed steps now fail on a REAL script error (a mutated copy of each script that throws is the proof; the offline reproduction above shows the shell behaviour, not the step).
