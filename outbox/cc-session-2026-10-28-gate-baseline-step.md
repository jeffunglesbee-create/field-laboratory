# Session 2026-10-28 — the gate's baseline step lost both ledger lines on a moved branch

CC-CMD: `docs/CC-CMD-2026-10-28-gate-baseline-step-autostash.md` (filed and built the same day).

## What happened

`verify-full` run 40621860549 (branch `claude/bsd-list-caller-search-5jd70z`, tree `01421c7`) printed
`530/530 points = 100/100 (bar: 95) 6264s` and `recorded in docs/confidence-log.jsonl as run 01421c764095-5fc65746a9fc`. Its
`Record this measurement` step then failed, so neither ledger line reached the repository:

```
expected exactly one new record in docs/scale-log.jsonl, got:
+<<<<<<< Updated upstream
+=======
 {"id":"01421c764095-e3b0c44298fc", ... "mountMs":543,"budgetMs":5000}
+>>>>>>> Stashed changes
```

Cause, in order, from that run's log and the commit dates:

1. The new dispatch cancelled the gate on `9b58ef2` (`concurrency: group: verify-full`, `cancel-in-progress: true`). A cancelled run still
   runs its `if: always()` steps; its record step pushed `ff9d491` at 02:36:24Z, nine seconds before the new run's checkout (02:36:33Z).
2. At the end of the new run `Keep the mutation baseline` ran `git pull --rebase --autostash` over the two dirty ledgers. The stash pop
   conflicted: `ff9d491` and the run both appended to the end of `docs/scale-log.jsonl`.
3. `Record this measurement` read `git diff` of the ledger, found conflict markers (three added lines, not one) and exited 1.

The header of `Record this measurement` already says a ledger must be re-appended, never rebased (the 2026-09-05 incident). The step
before it reintroduced the rebase for the same files. Any re-dispatch while a gate runs triggers step 1.

## The reproduction, then the fix

`scripts/gate-ledger-step-check.mjs` extracts the real text of the two steps from `verify-full.yml` by name and runs them in a runner clone
against a bare origin, with a racer clone that pushes its own ledger lines first.

- **On the old text** (kept verbatim in `scripts/fixtures/verify-full-baseline-step-before.yml`): the quiet branch lands both lines
  (the scenario can pass); the moved branch FAILS with the record step exiting 1 and "expected exactly one new record", which is the
  2026-10-28 loss reproduced. These are two of the self-test's checks, asserted, not read by eye.
- **On the fixed text**: 4 of 4 scenarios land every line exactly once with no conflict markers: a quiet branch; the branch moved; the
  branch moved with another tracked file dirty (not clobbered); the branch moved and the gate recorded no confidence line.
- **A mutation of the fix**: with the re-append loop removed (anchor found exactly once before it is removed) the harness reports the run's
  ledger line lost.
- **Every push refused** (a `pre-receive` hook on the origin that rejects): the fixed step exits 1 with "could not land the baseline artifact"
  and the artifact is not on the origin. Its must-fail input is the same text with the landing verification replaced by an assumption that
  the push landed: it exits 0 and the artifact is absent, which the harness reports.
- Total: 17 of 17 checks (`npm run check:gate-ledger` runs the self-test and the scenarios; about 40 s, two of them waiting out the
  step's own 3+6+9 s retry sleeps).

The fix: `Keep the mutation baseline` sets each ledger's added line aside, resets the ledger, rebases on a clean ledger (`--autostash`
remains for any other dirty file) and puts the lines back by appending. `scripts/gate-ledger-step-check.mjs` runs in `verify`.

## What went red when it landed

`verify` on the first landing (`db9890d`, run 40649230876) failed in the `push-lands` job, "Every push-retry loop verifies the push landed":
`scripts/check-push-lands.py` reported 1 unguarded loop, `verify-full.yml -> full / Keep the mutation baseline`. The `verify` job itself,
including the new harness step, was green. Cause: the step's original loop ended with `exit 0` inside it, so the guard did not count it as a
push-retry loop; mine ended with `break` (so the re-append could run before the step exits), which the guard does count, and nothing after
it verified the push landed. I had run the harness and `workflow-check` locally but not `check-push-lands.py`, which `verify` runs in a
separate job. The loop now ends with `git fetch` and `git merge-base --is-ancestor HEAD origin/<branch>` as the guard requires, and the
harness asserts the verification (with its must-fail input above). `check-push-lands.py` now reports 13 guarded, 0 unguarded.

## What this does not prove

The first real exercise of the fixed step is the next `verify-full` run after this lands. Whether a ledger line then lands on a branch that
moved mid-run is read from that run, not assumed here. It covers a branch that moved by an append; a force-push is not a race this step
can recover from and is not tried.

## The line that was lost

Not reconstructed. The `01421c764095-5fc65746a9fc` confidence line and the scale line for `01421c7` are absent from the ledgers, as the
repository's own convention for an unrecoverable record requires (`outbox/cc-session-2026-10-25-confidence-ledger-resolved.md`). The scale
line was printed in the failure output above; the confidence line was not. The tree was gated again (see the lineups session doc).
