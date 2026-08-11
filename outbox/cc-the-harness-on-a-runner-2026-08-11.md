# The harness on a runner — 2026-08-11

Closing the docking on `ba65230`, which read:

> Docked four: `VerifyMain.js` has not run on a runner. The step is new in
> verify.yml and the run that exercises it is the one this commit triggers.

It has now. Run
[31517400219](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/31517400219),
job 93865876845, `ubuntu-latest`, 17:24:34 → 17:47:19 UTC. **Success, 33 of 33
steps green.**

## The two steps that were owed

**Step 26 — "The F# suite, on the F# harness".** Conclusion `success`, which is
the assertion: `VerifyMain.js` exits non-zero if the self-test fails, and skips
the suite entirely in that case. Exit 0 means the harness demonstrated it could
still tell a toothless check from a real one, and then all sixteen held.

Stated precisely, because it matters which artifact says what: I read the step's
**conclusion** from the jobs API, not its stdout. The log window I pulled opens
at 17:36:13.588, a fraction of a second after the step closed, so the `16/16`
line itself is not in what I read. The exit code is the assertion; the count is
decoration on it.

The harness ran a second time in the same job, inside step 29, where the gate row
invokes it — and that output I did read.

**Step 33 — "Status read against the LIVE GitHub API".** 8/8, and it printed the
four real answers:

```
real token   -> **running** on `ba65230`
bad token    -> unreadable — the workflow-history API answered 401
missing repo -> unreadable — the workflow-history API answered 404
no token     -> unreadable — this step ran without `GITHUB_TOKEN`/`GITHUB_REPOSITORY`
```

401 and 404 from api.github.com itself, not from a fixture agreeing with my
reading of the docs. That is the specific uncertainty `status-live-check.mjs` was
written with — the `401|403|404` alternation was me not knowing — and it is now
answered by the service.

## And the gate, on a runner

```
PASS  20/20  the F# harness refuses a check with no counterexample
480/480 points = 100/100   (bar: 95)
```

Twenty-one rows, and `check:rows` reported the new one at 100/100 with both
teeth named: `harness-accepts-toothless, harness-calls-everything-toothless`.

## Nothing else is outstanding

`check:history` passes on full history — every governed commit paired source with
an outbox entry, boundary unmoved at `e9bc4ca` with 17 pre-rule violations. Every
authored commit today has an entry; the only unaccompanied commits are the
machine's own `status: refresh` and `drift-sentinel` runs, which change no source.

CONFIDENCE: 97.

Artifacts: run 31517400219, job 93865876845 — step 26 conclusion `success`, step
33 log 8/8 with the four answers above, step 29 log showing 480/480 across 21
rows and the new row at 100/100. `check:history` PASS locally.

Docked three, and it is the same class as always rather than a new one: this
entry's central claim about step 26 rests on a conclusion field, not on the
suite's own output. That is a strong artifact — it cannot be `success` unless the
process exited 0 — but it is one lookup, and the last time I trusted one lookup
about a workflow run the endpoint was stale and I called a finished run stuck.
