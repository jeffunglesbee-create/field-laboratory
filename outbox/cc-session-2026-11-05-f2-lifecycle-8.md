# Session record: run() clears the signal of the command before it

**Date:** 2026-11-05. **Scope:** fix stream F2, review 6, finding tests-vacuity 6, the part about `run()` (`lastSignal = null`). Commit 8 of 8; the other parts of that finding (the heal order, the guard names, proof-check) belong to the other fix streams. New file for `check:staged-outbox`; existing outbox files are not edited.

## Reproduction (Rule 100), on a frozen copy of this clone at d4bcd69, before this stream's first commit

The mutant: delete the `lastSignal = null` at the top of `run()` (m20). `node scripts/mutation-check.mjs --self-test` on the copy: **165/165**. Nothing ran `run()` on a passing command after one that was killed.

Why it matters, read from the code: `run()` reassigns `lastSignal` only in its `catch`, so a command that PASSES leaves whatever the last one left, and `expectation` reads `lastSignal` after every `run`. A stale kill would stop the run for a mutation whose expectation passed (a survivor) or was caught by an ordinary failure. No record this harness writes reaches it, which the review noted; the reset is the only thing that prevents it.

## What was built

- One clause at the end of the REAP group: `run('kill -KILL $$')` (the shell kills itself, `lastSignal` is `SIGKILL`), then `run('true')` returns true and `lastSignal` is null again.
- Table: `run-keeps-the-last-signal`.

## Red evidence (Rule 90)

The mutant on a copy of the tree with the clause present: `175/178`, with `RUN: A COMMAND THAT ENDS BY ITSELF LEAVES NO SIGNAL BEHIND IT` among the three FAIL lines (the other two are the nested-self-test clauses that fail whenever an inner unit clause does); unmutated `178/178`. Through the harness: `PASS [run-keeps-the-last-signal]`.

## Not verified

Nothing here exercises `expectation` with a stale signal end to end: the clause is on `run()`, which is where the state lives.
