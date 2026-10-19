# The outbox row stands aside on a scheduled run, and nowhere else

CC-CMD: `docs/CC-CMD-2026-10-17-verify-full-scheduled-outbox-row.md`. The owner
chose option 1.

## What was wrong

verify-full's weekly cron (`0 6 * * 1`, 02:00 ET) is not a session, but it
scored "this session wrote its outbox". That row needs an outbox entry dated
the Eastern day, so the run passed only if a session happened to write one
before it started. The mutation baseline re-runs the row, and the outbox world
mutations had nothing to move, so one cause cost 30 points.

**The 10-19 run proves the defect rather than refuting it.** Run 39249586642
passed 530/530 only because this session's two 10-19 entries already existed.

## The change: a third row state, NOT APPLICABLE

- **`scripts/gate-checks.mjs`**
  - `outboxVerdict` is pure. It returns `NOT_APPLICABLE` when the event is
    `schedule`, and a boolean otherwise.
  - `outboxToday` passes it `GITHUB_EVENT_NAME`.
- **`scripts/confidence.mjs`**
  - An N/A row is neither earned nor possible. It prints as `N/A —/10`, the
    rows it leaves out are printed with the score (Rule 91), and it is recorded
    as `notApplicable`.
  - The branch sits before `if (passed)`, because the sentinel is a truthy
    string and would otherwise score as a pass.
- **`scripts/run-row.mjs`** exits **3** for N/A. That is distinct from 0
  (pass), 1 (fail) and 2 (no such row), so no caller that knows only 0 and 1
  can read it as a pass.
- **`scripts/mutation-check.mjs`**
  - A baseline expectation that exits 3 is not applicable. It is not a
    baseline failure.
  - Every mutation expecting it is printed `N/A … not run`, never counted as
    caught.
  - The count goes on the baseline line, and the artifact gains
    `notApplicable`.
- **`scripts/confidence-record-check.mjs`**
  - A run with a not-applicable row cannot back a score, and the refusal says
    why. The denominator check would refuse it too, but without the reason.
  - A scheduled run and a session run of the same tree measured different row
    sets, so they are *incomparable*, neither corroboration nor conflict.
    Without this, a dispatch landing on the scheduled run's tree would read as
    "the gate is not a function of the tree".
  - Two scheduled runs of one tree still compare, and still conflict.
- **`scripts/outbox-row-check.mjs`**, wired into `verify` as "The outbox row
  stands aside only on a scheduled run". On fixtures:
  - no dated entry fails on a local, `workflow_dispatch` and `push` run;
  - a stub still fails;
  - an entry passes;
  - on `schedule` it is N/A with or without an entry, never `true`;
  - the real `run-row.mjs` exits 3 under `schedule`, and 0 or 1 otherwise.
  - Result: 9/9.

The commit-pairing row ("source changes arrive with an outbox entry") is
untouched, as the CC-CMD required.

## Verification

- **Mutations, each caught on its own run** (`--only <id>`):
  - `outbox-na-beyond-schedule`: N/A on every event;
  - `run-row-na-exits-zero`: exit 0 instead of 3;
  - `na-run-backs-a-score`: the citation refusal removed;
  - `na-runs-read-as-conflict`: the incomparable branch removed.
- **The harness under each event:**
  - `GITHUB_EVENT_NAME=schedule --only outbox-missing` prints `1 not applicable
    on this run (1 mutation(s) not run: outbox-missing)` and `N/A [outbox-missing]`;
  - the same under `workflow_dispatch` catches it.
- **The scorer under `schedule`** (`--quick`, ledger line reverted afterwards):
  `N/A —/10 this session wrote its outbox`, `possible` 10 lower, the line "1
  row(s) not applicable on this schedule run, out of the score", and
  `notApplicable` recorded.
- **Self-tests:** `confidence-record-check` 25/25 (3 new). `row-confidence`,
  `gate-inventory`, `short-circuit`, `import-purity`, `check:workflows`,
  script orphans and `check:rows` all pass.

## What is not defended, said here

- **No check covers the harness's own N/A skip.** On a non-scheduled run the
  skip never triggers, so no local or dispatched check can fail if it is
  removed. Under `schedule`, removing it would make `outbox-missing` report
  "mutation does not apply" rather than a false catch, because there is no
  dated file to move. The failure would be loud, not quiet.
- **`confidence.mjs`'s N/A branch has no mutation either.** Its only check is
  a full gate under `schedule`, which a dispatch cannot simulate:
  `GITHUB_EVENT_NAME` is set by the runner.
- **`--only <id>` with an id that matches nothing passes on "0 of 0".** It was
  seen once here, from a failed insert. That is a separate harness gap; it is
  recorded, not fixed in this commit.

## Done conditions 3-4

Both need the 2026-10-26 scheduled run. They are filed as
`docs/CC-CMD-2026-10-26-read-scheduled-verify-full.md`, with a self-follow-up
scheduled to read it.

## Gate and landing

- `verify` run 39289570791 passed on `c9c22bf`, including the new step "The
  outbox row stands aside only on a scheduled run".
- `verify-full` run 39289566325 scored **530/530 (100)**. A dispatched run
  scores the outbox row, so `notApplicable: []`, as designed. The mutation
  baseline is 0 failing across 172 mutations (62 distinct expectations).
- The code is on main as a cherry-pick of `c9c22bf`, then the gate's two
  record commits.
- Done conditions 3-4 are filed as
  `docs/CC-CMD-2026-10-26-read-scheduled-verify-full.md`. A scheduled
  follow-up fires 2026-10-26T17:00Z to execute it.
