# The mutation baseline was computed every run and readable none of them

**Date:** 2026-10-05
**Repo:** field-laboratory
**Files:** `scripts/mutation-check.mjs`, `.github/workflows/verify-full.yml`

## Rule 42, applied

Three attempts to name the confidence gate's second baseline failure, all the
same shape or blocked:

1. Read the job log tail — truncated before the `baseline:` detail.
2. Read it again with a larger tail — landed in the next step's script echo, twice.
3. Run the 22 expectations locally — **all 14 runnable ones are
   `ERR_MODULE_NOT_FOUND`**. Every one imports from `build/`, and there is no
   dotnet in this sandbox.

A fourth attempt was going to be a third 50-minute dispatch to read one line.
That is iterating, not diagnosing.

## What the system was literally showing

`mutation-check.mjs` already computes `baselineFailures` on every run. It has
been computed at least twice this week — `2 of 39` on `ff1bed5`, and again on
`df48496` — and printed into a log roughly 1,300 lines deep inside a job that
takes 40 to 50 minutes. The number existed every time. It was never retrievable.

That is the same failure as two others this session: the per-day odds table,
derived by hand for six days because the script did not print it; and the
refusal streak, which nothing surfaced until a gate was built for it. A
measurement that only exists in a truncated log is not a measurement anyone can
act on.

## The change

`outbox/mutation-baseline-latest.json`, written **unconditionally** — pass or
fail — so a green run records the baseline it was green against, not only a red
one.

```json
{ "at": ..., "ran": 39, "from_mutations": N, "failing": 2,
  "results": [ { "cmd": ..., "passed": false, "status": 1, "tail": "..." } ] }
```

**WHY AND WHAT, not just which.** A failing command's name moves the question
rather than answering it. Each failure carries its exit status and the last 30
lines of combined stdout+stderr — the tail, because a check's verdict is at the
END of its output and the head is setup noise. 30 rather than 12: a node stack
trace puts `Error: Cannot find module` about ten lines above the end, and 12
cut it off in testing.

**COMMITTED, in its own step, placed BEFORE the ledger step.** An artifact that
dies with the runner is the exact failure being fixed here. It is not folded
into the existing "Record this measurement" loop because that loop asserts
"exactly one new record" per ledger — correct for an append-only jsonl, wrong
for a whole-file artifact — and that loop already survives a real mid-run race
(run 15, 2026-09-05). Rewriting it to carry a different file shape would risk
the thing that works to add the thing that is new.

## Verified

- Ran against the real script with `--only known-survivor`, the same invocation
  CI already makes: `baseline: ran 1 of 1 … 0 failing`, artifact written, keys
  `at, ran, from_mutations, failing, results`.
- The failing-capture path exercised separately against a command that does
  fail: `passed: false`, `status: 1`, tail captured.
- Tree left clean by the harness; `check:script-orphans` and `check:workflows`
  both green.

**Honest limit:** this does not name the second baseline failure. It makes the
NEXT verify-full run name it, in a file, permanently, at no extra runner cost —
the array was already in memory. The 20 points stay unexplained until a run
happens either way.

This commit pairs source with an outbox entry.
