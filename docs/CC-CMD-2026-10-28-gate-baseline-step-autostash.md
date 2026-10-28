# Claude Code Command — the gate's baseline step loses the ledger lines when the branch moved during the run

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-28
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** **PARTIAL 2026-10-28.** The step is fixed and tested (done conditions 1, 2 and 4); condition 3, a `verify-full` run whose
`Record this measurement` is green after the branch moved, needs a gate run after the fix and has none yet. Evidence below is from run
40621860549. See `outbox/cc-session-2026-10-28-gate-baseline-step.md`, including the `push-lands` failure the first landing hit.

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
```

## Why this exists, measured

`verify-full` run 40621860549 (2026-10-28, branch `claude/bsd-list-caller-search-5jd70z`, tree `01421c7`) printed
`530/530 points = 100/100 (bar: 95) 6264s` and `recorded in docs/confidence-log.jsonl as run 01421c764095-5fc65746a9fc`,
then its `Record this measurement` step failed:

```
expected exactly one new record in docs/scale-log.jsonl, got:
+<<<<<<< Updated upstream
+=======
 {"id":"01421c764095-e3b0c44298fc", ... "mountMs":543,"budgetMs":5000}
+>>>>>>> Stashed changes
```

Neither ledger line reached the repository. 104 minutes of runner time produced a printed measurement and no durable record.

Cause, from that run's own log (job 122597763010, lines 1286-1300, 1397-1401):

1. The previous gate (on `9b58ef2`) was cancelled by the new dispatch (`concurrency: group: verify-full`, `cancel-in-progress: true`).
   A cancelled run still executes its `if: always()` steps, so its `Record this measurement` pushed `ff9d491` ("Record CI measurement of
   9b58ef2") to the branch at 02:36:24Z, nine seconds before the new run's checkout at 02:36:33Z.
2. At the end of the new run, `Keep the mutation baseline` ran `git pull --rebase --autostash`. The ledgers were dirty (the gate and
   `scale-check` had each appended one line), so autostash stashed them, rebased onto `ff9d491`, and popped the stash. `ff9d491` had also
   appended to the end of `docs/scale-log.jsonl`; two appends to the same end of one file are a content conflict by construction.
3. `Record this measurement` then read `git diff` of the ledger, found conflict markers (three added lines, not one), and exited 1.

`Record this measurement` already carries the rule in its header: "AN APPEND-ONLY LOG MUST BE RE-APPENDED, NOT REBASED" (the 2026-09-05
incident). The step before it re-introduces the rebase of the same files.

Every re-dispatch of `verify-full` while one is running triggers the cancel, so step 1 is not rare: it is the designed behaviour of the
concurrency group.

## Rulings and prior work this must not undo (BUILD-ON-A)

- `outbox/cc-session-2026-09-05-the-gate-is-a-decision.md` and the header of `Record this measurement`: ledgers are re-appended, never
  rebased; both ledgers are landed by one commit. Keep that.
- `outbox/cc-session-2026-10-25-confidence-ledger-resolved.md`: a missing ledger line is recovered byte for byte from a commit that holds
  it, never typed. A run whose gate step fails records nothing, by design.
- `outbox/cc-session-2026-10-05-mutation-baseline-artifact.md`: the baseline artifact is landed by its own commit on `if: always()`.
- `docs/gate-rows.txt`, `scripts/confidence.mjs`: untouched. This changes how two CI steps handle git, not what the gate measures.

## Premises, each with the one command that would refute it (Rule 100)

| premise | refuting command |
|---|---|
| `ff9d491` was pushed by the cancelled run, not by the new one | `git log -1 --format='%ad %s' ff9d491` is 02:36:24, before the new run's checkout at 02:36:33, and says "of 9b58ef2" |
| the conflict is in the autostash pop, not in the baseline commit | the log shows `Created autostash`, `Rebasing (1/1)`, then "applying them resulted in conflicts" |
| the same step text fails on any moved branch that appended to a ledger | Task 1's reproduction |
| `Record this measurement` is correct once the tree is clean | Task 1's second run, with only the baseline step changed |

## Scope

**Touch:** the `Keep the mutation baseline` step of `.github/workflows/verify-full.yml`; one new script
`scripts/gate-ledger-step-check.mjs` (+ its package.json entry and verify.yml step); `outbox/`.
**Do NOT touch:** `scripts/confidence.mjs`, `docs/gate-rows.txt`, the `Record this measurement` step's logic, any gate row.

## TASK 0 — Probe block

```bash
git log --oneline -5
grep -n "Keep the mutation baseline" -A20 .github/workflows/verify-full.yml | grep -n "autostash"
git log -1 --format='%h %ad %s' --date=iso ff9d491
```

## TASK 1 — Reproduce first, on the current text

`scripts/gate-ledger-step-check.mjs` builds a bare origin and two clones. Clone A is the runner: it checks out `X`, appends one line to each
ledger (as the gate and `scale-check` do) and leaves `outbox/mutation-baseline-latest.json` changed. A second clone pushes a commit to the
same branch that appends a different line to `docs/scale-log.jsonl` (the cancelled run's record). The harness then runs, in clone A, the
real text of the two steps, extracted from `verify-full.yml` by name (not copied). Assertions, over the origin after both steps:

- exit codes 0 and 0;
- origin's `scale-log.jsonl` and `confidence-log.jsonl` each hold the other writer's line AND this run's line, once, no conflict markers;
- the baseline artifact landed;
- with nothing racing, the same two steps still land exactly one line per ledger.

Each assertion gets a must-fail input (Rule 90): the harness runs the step text of `git show 8127af2:.github/workflows/verify-full.yml`
(the current text) and requires it to FAIL the race scenario with the observed message. That run is printed in the artifact.

## TASK 2 — The fix

`Keep the mutation baseline` must leave the ledgers as the next step expects them (one added line each, in the working tree) without
`--autostash`: save each ledger's added line, `git checkout --` the ledger, commit the artifact, `pull --rebase` on a clean tree, push,
then re-append the saved lines. Re-append, not rebase, exactly as the next step's header says.

## DONE CONDITION — every line an artifact (Rule 89)

1. `node scripts/gate-ledger-step-check.mjs --self-test` prints the denominators: scenarios run, assertions per scenario, and the old text
   failing the race scenario.
2. `node scripts/gate-ledger-step-check.mjs` passes on the fixed text: 2 ledgers x (other writer's line, this run's line) present once.
3. The next `verify-full` run on any branch shows `Record this measurement` green, and a ledger line for that run on the branch. This is read
   from the run, not assumed: the run id goes in the outbox.
4. verify green on the commit (run id printed).

**What this does not prove:** it covers a branch that moved by an append to a ledger. A branch that moved by a force-push is not a race this
step can recover from, and is not tried.

## TASK 3 — Outbox manifest (last)

`outbox/cc-session-<date>-gate-baseline-step.md`: commit hashes, the reproduction output on the old text, the passing output on the new,
the run id of the next gate. Mark this CC-CMD DONE with the run ids.
