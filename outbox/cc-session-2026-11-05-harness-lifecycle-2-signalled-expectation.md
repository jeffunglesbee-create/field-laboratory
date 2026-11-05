# Session record: an expectation ended by a signal is not a caught mutation

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 10 item 8 (`scripts/mutation-check.mjs` only). **Base:** commit 1 of this assignment (the build-watcher record). Commit 2 of 3.

**Why this file exists.** Same as commit 1: `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On a scratch copy of the repository, 2026-11-05, an expectation made `sleep 25`, one run each (the marker file showed the mutation was applied when the signal was sent):

- The item says the refusals advise `kill -9`. For `mutation-check.mjs` that is false: both refusals already say "stop it (kill -9 if it ignores a plain kill)". The `kill -9 ${pid}` wording is `proof-check.mjs`'s (Task 7). The texts are untouched.
- SIGTERM to the harness during a docs mutation's expectation: the harness was gone 23.07 s later, after the command ended and after printing its own verdict (`FAIL [known-survivor]`), exit 1. The signal was not acted on until then. Cause: a mutation of a file has no `await` after its expectation, so the event loop never turns and the queued handler never runs.
- Ctrl-C (SIGINT to the process group) in the same state: gone in 0.11 s, `PASS [known-survivor]`, exit status 0. A killed command was read as a failed check and counted as caught, for a mutation that survives by design.

## What was built

- `run()` remembers how the last command ended: its signal, or an exit status in 129..159 (what `sh -c a && b` reports for a killed `b`: the OOM killer, a browser crash).
- `expectation(m)` wraps both call sites (a file mutation and a change made outside the source): a killed expectation stops the run through `fatal()`, whose exit handler puts the file or the stash back, and then one event-loop turn so a queued SIGTERM is acted on. The baseline is one named function and a loop with the same turn after each expectation.
- `run()` stays synchronous: the exit handler reaches it through `undoWorld` and cannot await. Making it async was considered and rejected.
- Four test-only faults (`expect-interrupted`, `expect-terms-the-run`, `expect-child-killed`, `baseline-terms-the-run`). The existing baseline clause and the `harness-blind` entry quoted lines this change moved and are re-anchored.

## Verified

- Self-test: 132 clauses before, 137 after (five `E24`). All five fail on the code without the change (132/137: a signalled expectation printed `PASS` with exit 0 in both the file and the world branch, SIGTERM printed its own verdict, `baseline: ran` was printed) and pass with it.
- 7 new table entries plus the two re-anchored ones, each run through the harness (`--ids`): 10/10 including the baseline.

## Decision for the owner

Any signal or exit status 129..159 now STOPS the run. A crash or OOM kill inside one expectation used to be a free catch (a false one) and now ends the shard. The alternative is a red `expectation-fault` check that goes on, like `build-fault`; it adds a verdict word and branches. Checked: no script outside the harness exits in that range itself except `proof-check.mjs`'s own signal handler (exit 130, a signal ending a run). Not exhaustive: statuses can also come from children.

## Not fixed, stated

- A SIGKILL of the harness still leaves the expectation's own children running (and a heal's `npm run build` is one of them, derived from the measured `sleep 25` child, not run with npm). Fixing it needs a spawn with process groups, which is the async conversion rejected above.
- The optional kill-first wording of the refusals (a plain kill is acted on when the running expectation ends, Ctrl-C stops it at once, `kill -9` is for when it persists) was not built; no clause asserts those texts today (Task 10 item 11).
- Source mutations: a SIGTERM during the synchronous full compile that confirms a catch (about 30 s) is still acted on only when it ends. The probe that specified this measured 52.3 s from the signal to the exit on the unchanged code; I did not re-measure it, on either version.
