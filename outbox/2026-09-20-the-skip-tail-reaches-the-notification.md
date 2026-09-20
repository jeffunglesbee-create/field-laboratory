# The cost of a red now reaches the notification, and measuring it found my own count wrong

**Date:** 2026-09-20
**New:** `scripts/run-steps.mjs`, `scripts/mutate-run-steps.mjs`
**Changed:** `scripts/red-main-issue.mjs`, `.github/workflows/status.yml`

## The gap

Three reds cleared today, each hidden behind the last:

| step | defect | how long |
|---|---|---|
| 25 | `.sv-run__button:hover` outside its `(hover: hover)` gate | seven runs |
| 48 | `ceiling-check.mjs` hard-coding numbers the source no longer held | hidden behind 25 |
| 57 | `drift-check.mjs` reading the clock inline | hidden behind 25 |

The red-main sentinel opened an issue for every one of those seven runs' worth
of red. Each issue said, in full:

```
`verify` failed on `<sha>`.

<run url>
```

`body()` had a `**First failing step:**` field. **No workflow ever set
`RED_MAIN_STEP`**, so it rendered on zero issues in the sentinel's lifetime. The
notification a human opens carried the fact that something was red and nothing
about what that red was costing.

## What was built

`stepSummary(steps)` → `{ total, ran, skipped, failedStep, failedNumber }` over
one job's steps. `worstFailure(jobs)` picks the failed job with the largest
tail — the one that hid the most, not the one that failed first. `costLine()`
renders one sentence.

The issue body now reads:

```
**First failing step:** The chrome, measured on the rendered page (step 25).

**43 of 68 steps did not run behind it.** A skipped check and a check that
does not exist look identical from the outside; this red is hiding 43
unknowns, not 43 passes.
```

And the "still red" comment repeats it on every subsequent run, because a
persisting red is a bill that grows.

### Three states, again

A run whose steps cannot be read reports **nothing**, never `0 skipped`. The
daily backstop and manual dispatches have no triggering run to point at, so they
report the red without a cost rather than a cost of zero. S1 in the mutation
harness is that rule: collapse UNKNOWN into zero and the self-test goes red.

A genuinely empty tail is *stated* — "Nothing was skipped behind it" — rather
than left blank, because silence reads as "the tool did not run".

## Measuring it found my own count wrong

The first thing the module was pointed at was run 35534740675 job 106141625640 —
the run this whole thread started from. It reported:

```
{ "total": 68, "ran": 25, "skipped": 43,
  "failedStep": "The chrome, measured on the rendered page", "failedNumber": 25 }
```

**43 of 68.** I had written "44 steps skipped" and "sixty-nine-step job" in two
commit messages and two outbox files. Both were wrong:

- **69** is the highest step *number* on the run page, and it includes the
  runner's own `Set up job`. The suite has 68 steps the filter counts.
- **44** came from counting `pending` entries in a status payload I had read
  mid-run, not from the completed conclusions. The tail is 43.

Counted by reading; corrected by measuring — inside a change built because
reading had already cost seven runs. The two outbox files are corrected in this
commit with a note saying so. The commit messages are immutable and stand as
written; this is the correction of record.

## Teeth

`scripts/mutate-run-steps.mjs`, **7 of 7 caught**:

| mutation | what it breaks |
|---|---|
| S1 | an unreadable run reports zero skipped |
| S2 | the skip tail is never counted |
| S3 | the runner's own steps inflate the denominator |
| S4 | a step still running counts as having run |
| S5 | the smallest failure is reported instead of the largest |
| S6 | a zero tail goes quiet instead of saying so |
| S7 | the denominator is dropped from the line (Rule 91) |

**S6 reported NOT CAUGHT on its first run, and the harness was the defect.** Its
anchor covered only the opening line of a two-line template return, so the
`Nothing was skipped` string survived concatenated on the end and the self-test's
regex still matched. Widening the anchor to span both lines caught it. That is
Rule 90's corollary exactly: a mutation that does not mutate what it claims to
is worse than no mutation, and only running it reveals which.

## Verification

| check | result |
|---|---|
| `run-steps.mjs --self-test` | 14/14 |
| `mutate-run-steps.mjs` | 7/7 caught |
| `red-main-issue.mjs --self-test` | 33/33 (was 29) |
| `check:workflows` | 9/9 |
| `check:script-orphans` | 3/3 |
| `check:import-purity` | 2/2 |
| `check:short-circuit` | 5/5 |
| `check:rows` | 23/23 rows ≥ 95 |
| `check:citations` | PASS |
| against run 315's real payload | `43 of 68`, failing step named |

## Cost

No new workflow, no new schedule, no new secret. `status.yml` already runs
`red-main-issue.mjs` on a red `verify`; this adds one `GET /actions/runs/{id}/jobs`
on that path only, plus the self-test and mutation harness (both sub-second, no
build). The fetch is wrapped: a failed read reports the red without the bill
rather than suppressing the notification.

## What this does NOT do

It reports the cost of a red that has already happened. It does not stop a red
from parking in front of forty-three checks — reordering the suite so cheap
structural checks run before the browser ones would do that, and is a separate
decision with its own trade-off (`check:history` was moved last for exactly this
reason on 2026-08-17, and the comment there argues the case). This makes the
cost visible; it does not reduce it.
