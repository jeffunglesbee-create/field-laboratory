# Session record: recordDriver's pid argument is no longer the harness's own pid

**Date:** 2026-11-05. **Scope:** fix stream F2, review 6, finding tests-vacuity 1 part (a). Commit 7 of 8. New file for `check:staged-outbox`; existing outbox files are not edited.

## Reproduction (Rule 100), on a frozen copy of this clone at d4bcd69, before this stream's first commit

The mutant `driver: { pid, start: startOf(pid) }` to `driver: { pid: process.pid, start: startOf(process.pid) }` in `recordDriver`, on the copy: `node scripts/mutation-check.mjs --self-test` gave `162/165`, and the three FAIL lines were the three E22 clauses. The clause `REAP: the record names the process it was given with its start time ...` stayed green: it called `recordDriver(process.pid)` and asserted `written.driver.pid === process.pid`, which a record that ignored its argument also satisfies. E22 is skipped without /proc, and it is not the clause that names the property.

## What was built

- That REAP clause now starts a process that is not the harness (`sleep 30`), calls `recordDriver` with its pid, and asserts the record names that pid, not `process.pid`, with that process's start time (read before the process is killed), and names the harness as the run that wrote it. The process is killed and the record removed in a `finally`.
- Table: `driver-record-names-the-harness`.

## Red evidence (Rule 90)

On a copy of the tree (`177/177` unmutated): the mutant above gives `170/177`, and the `REAP: the record names the process it was given, a pid that is not the harness's own ...` clause is among the seven FAIL lines (the others are the three E22 clauses, the E22 clause for the failed rebuild, and the two nested-self-test clauses). A second mutant, the right pid with the harness's own start time, gives `171/177` and the same REAP clause among the six. Through the harness, `driver-record-names-the-harness` and `driver-record-forgets-its-start` are each `PASS` (caught).

## Not verified

The REAP clause was not run on a machine without /proc; `startOf` returns null there and the clause then does not compare start times (`!haveProc ||`), as before.
