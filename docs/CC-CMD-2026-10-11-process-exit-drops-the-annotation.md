# Claude Code Command — `process.exit` drops the only channel a failure reaches us through

**Date:** 2026-10-11
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** B (gap) — a reporting channel that fails silently, at a measured rate
**Status:** DONE 2026-10-11. Five tasks, four done conditions. Session doc:
`outbox/cc-session-2026-10-11-exit-drains.md`.

**TASK 0 REFUTED THE FIGURE THIS DOCUMENT WAS FILED ON, which is what it was
for.** The "5 of 30" below came from one synthetic script printing 400 rows.
Nothing in this repository prints 400 rows. Measured by
`scripts/exit-truncation-probe.mjs`, twenty piped runs of each real program,
idle and then under eight CPU burners on four cores:

```
build/VerifyMain.js        13146B   idle 0/20   loaded 5/20
check-doc-citations.mjs     3021B   idle 0/20   loaded 0/20
palette-check.mjs           1909B   idle 0/20   loaded 0/20
design-tokens-check.mjs     1535B   idle 0/20   loaded 0/20
typography-check.mjs        1310B   idle 0/20   loaded 0/20
sport-registry-check.mjs     834B   idle 0/20   loaded 0/20
```

**One** program here has ever been shown to lose its tail, and it is the one
already fixed. No `createChecks` script lost anything in 240 piped runs. So the
claim "roughly one failing check in six publishes no annotation" is not true of
this repository, and the sentence stands below only because deleting it would
hide that it was published.

**LOAD IS THE TRIGGER, NOT SIZE.** The same 13 KB loses nothing idle. And a bare
loop printing 13 KB loses nothing even loaded — the program that lost output
also loads thirty modules and reads four fixtures off disk. The race is between
the last write draining and the process being told to die; the work in flight is
a term in it, which is why a CI runner shows what an idle sandbox does not.

**TASK 1 — `finish()` in `checks.mjs`.** Sets `process.exitCode` and returns. It
also closes a second thing quietly: four sites wrote `process.exit(summarize())`,
exiting with the FAILURE COUNT as the status — the "exit code 6" seen in the run
that opened this — and a count above 255 wraps to 0.

**TASK 2 — 65 of 127 sites converted, and the other 62 deliberately not.**
`process.exit()` also STOPS, and `finish()` does not. Sixty-one of the remaining
are early exits inside `if (SELF_TEST)` blocks whose live half is not separately
guarded; converting them would let `--self-test` fall through into a run that
needs a browser or the network. Restructuring sixty-one blocks into if/else is a
large diff against a loss nothing has exhibited, so they are frozen at a count
instead. **0 terminal report exits remain.**

**TASK 3 — `scripts/check-exit-drains.mjs`.** Terminal report exits are FATAL
(must be 0); early ones are a RATCHET at `docs/early-exit-budget.txt` = 61,
which also fails if the budget drifts loose. 18 self-tests.

**TASK 4 — two mutations, both caught.** Restoring a terminal `process.exit`
in `workflow-check.mjs`, and adding a new early one to `glyph-check.mjs`.

**What was tried and rejected, by measurement rather than by argument:** writing
the tail with `fs.writeSync(1, ...)` so nothing is ever pending. On a pipe it
throws EAGAIN and takes the process down — 21 of 30 runs under load, worse than
the bug.

---

**Status as filed:** FILED, not started.

**Required by Rule 87.4.** `field-relay-nba/docs/CC-CMD-2026-10-11-predicted-xi-render-decision.md`
hit this while closing, fixed the one instance that blocked it
(`src/VerifyMain.fs`), and measured the general case. The general case is out of
that document's scope — it changes the exit behaviour of 136 scripts — so it is
filed rather than carried forward.

## What happened

`verify` run `38155172428` went red on a tree that was green. Six assertions in
`scripts/verify-render-check.mjs` failed at once:

```
every row sits in a group — none is orphaned outside one
    191 rows inside groups, 3 rows on the page
the page reports the same total the node suite does
    data-total="191", node says 3
```

Nothing was wrong with the page, the suite, or the build. `nodeSuiteCount()`
reads `node build/VerifyMain.js` through `execSync` and takes the LAST
`N/N checks held` line. `VerifyMain` prints two: phase 1's deliberate 1/3
counting probe, and phase 2's real total. On that run, **everything after line
18 was missing**, so the last line was the probe's.

### The cause, measured rather than inferred

`process.exit()` terminates immediately and **drops pending asynchronous stdout
writes**. To a terminal or a file, Node's stdout writes are synchronous and
nothing is lost. To a PIPE — which is what `execSync` and a CI log runner both
give it — they are not.

Five identical `execSync` runs of the unmodified program:

```
run 1  2 count lines seen, last total 191
run 2  2 count lines seen, last total 191
run 3  1 count line  seen, last total 3      <- 13146 bytes of output, tail lost
run 4  2 count lines seen, last total 191
run 5  2 count lines seen, last total 191
```

`src/VerifyMain.fs` now sets `process.exitCode` and lets Node drain stdout and
exit on its own with the same status. 40 of 40 runs clean afterwards, and the
non-zero exit still blocks — proven by the `lineups-unrecognised-falls-through`
mutation, whose whole expectation is that a broken suite makes this program fail.

## Why this is its own document

**Every script in `scripts/` ends the same way.** The convention is
`process.exit(summarize() === 0 ? 0 : 1)`, and `summarize()` prints the PASS/FAIL
lines and — on a runner — the `::error` annotations immediately before it.

Measured 2026-10-11, 400 passing rows and one failing one, through `execSync`,
30 runs:

```
runs where the ::error annotation was LOST: 5 of 30
```

**That is the channel `checks.mjs`'s own header exists for.** Its words:

> a run's failure reason is printed to the log, and a log is not reachable from
> every client that can reach the run. `runs/<id>/logs` answers with a redirect
> to blob storage, and the GitHub client in this project's authoring sandbox
> refuses it — so for six days in October 2026 the reasons behind red `verify`
> steps were unreadable from the place the fixes were being written

So roughly one failing check in six publishes no annotation, and the reason is
then readable only from a log this project cannot fetch. A red step with no
annotation looks exactly like a red step whose script emitted none.

## Tasks

**Task 0 — establish the real rate before changing anything.** The 5-of-30 above
is one synthetic script at one output size. Measure it across the scripts that
actually produce long output, at their real sizes, and record the sizes with the
rates. A rate without its output size is not a measurement of this bug.

**Task 1 — one place to end a check.** `checks.mjs` already owns `summarize()`.
Give it the exit as well — something a script calls instead of
`process.exit(summarize() === 0 ? 0 : 1)` — so the fix is in one file rather than
136. Setting `process.exitCode` is the fix; any `await` on a drain is a
workaround around it.

**Task 2 — convert the call sites.** 136 scripts. The conversion is mechanical
and that is exactly when a regex eats a character, so the diff is reviewed as a
count: N call sites before, N after, and no script left calling `process.exit`
after printing.

**Task 3 — a check with teeth.** A script that calls `process.exit` after a
`summarize()` is a reporting defect, and nothing currently says so. The check
must fail on the pattern and not on the many legitimate `process.exit(1)` calls
that print nothing first — `capture-render-fixture.mjs`'s `UNREACHABLE` exits are
correct and must not be flagged.

**Task 4 — the mutation.** Rule 90: convert a script back and watch the check go
red. A check written against a pattern nobody has restored is a check that has
only ever passed.

## Stop conditions

- **Do not wrap anything in a retry or a flush-and-wait.** The write is lost
  because the process was told to die; the fix is not to tell it to.
- Do not change what any check asserts. This is about how a result leaves the
  process, not about the result.
- Do not convert `process.exit` calls that print nothing first. An early refusal
  with one line of output is not this bug, and widening the change to them makes
  Task 2's count unreviewable.

## Done conditions

1. A measured rate, with the output sizes it was measured at, in the outbox.
2. One exported way to end a check, used by every script that prints before
   exiting, with a before/after count of call sites.
3. A check that fails on the pattern and passes on a bare early refusal.
4. A mutation that restores the pattern in one script and is caught.
