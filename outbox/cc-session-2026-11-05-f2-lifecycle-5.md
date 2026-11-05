# Session record: the reaper's already-gone branch, its two waits, and a rebuild that fails after a reap

**Date:** 2026-11-05. **Scope:** fix stream F2, review 6, findings harness-lifecycle 2 and tests-vacuity 2. Commit 5 of 8. New file for `check:staged-outbox`; existing outbox files are not edited.

## Reproduction (Rule 100), on a frozen copy of this clone at d4bcd69, before this stream's first commit

Six mutants of `reapDriver` and of the main flow's rebuild after a reap, each applied to the copy (the code is unchanged by this stream's earlier commits at these places), each one `node scripts/mutation-check.mjs --self-test` (165 clauses, the self-test of d4bcd69):

| mutant | result before |
|---|---|
| `if (recycled || !alive(d.pid))` to `if (recycled)` (A) | 165/165 |
| the `gone` wait loop reduced to one `alive` test (B) | 165/165 |
| `gone(graceMs)` to `gone(0)` (n3) | 165/165 |
| `gone(killMs)` to `gone(0)` (n4) | 165/165 |
| the `process.exit(1)` after a failed rebuild to `process.exit(0)` (m19) | 165/165 |
| `&& false` appended to `reapedDriver && !run('npm run build')` (b02) | 165/165 |

Every REAP clause passed `graceMs: 0, killMs: 0` and a fake `alive` that was true throughout, and E22 covered only a rebuild that succeeds, so none of these could fail.

## What was built

- Three REAP clauses, run at once in directories of their own (a fake group goes down 150 ms after the signal it is made to obey):
  - a record whose group is already gone: nothing signalled, nothing said, the record dropped, the answer false (so no rebuild follows);
  - a group that obeys the TERM inside a 3 s grace: the sent signals are exactly `SIGTERM@-4242`, no KILL while it is still going down;
  - a group that ignores the TERM and obeys the KILL 150 ms after it, with a 50 ms grace and a 3 s kill grace: `SIGTERM` then `SIGKILL`, the answer true, `exit` not called.
- One E22 variant, `(4)`: the reap is followed by `npm run build`, which the stand-in build fails on request (`BUILD_FAIL`) with the source clean. Asserted: exit 1, the message names the failed build and says build/ may be half written, no "Healed" or "Nothing to heal", the watcher gone, the record gone.
- Table: `reaper-signals-a-group-that-is-gone`, `reaper-does-not-wait-for-a-signal-to-work`, `reaper-gives-the-term-no-grace`, `reaper-gives-the-kill-no-grace`, `reap-rebuild-failure-exits-zero`, `reap-rebuild-failure-is-ignored`. The elapsed time of the waits is printed but not asserted: what the reaper sends tells a waiting reaper from a hurrying one.
- The new clauses time themselves with the harness's `stopwatch()`; the row-confidence scorer reads a bare clock read as nondeterministic (see commit 4).

## Red evidence (Rule 90)

On copies of the tree with the clauses present (`174/174` unmutated). The two nested-self-test clauses ("a self-test started as an expectation ...", "... from a hook ...") fail whenever the inner self-test does, and are not counted below.

| mutant | the clause that fails |
|---|---|
| A | `REAP: a record whose group is already gone has nothing to stop ...` |
| B | `REAP: a group that obeys the TERM inside its grace ...` and `REAP: a group that ignores the TERM and obeys the KILL ...` |
| n3 | `REAP: a group that obeys the TERM inside its grace ...` |
| n4 | `REAP: a group that ignores the TERM and obeys the KILL ...` |
| m19 | `E22: ...and a build that FAILS after the reaper has stopped the watcher stops the run ...` (173/174) |
| b02 | the same E22 clause (173/174) |

Through the harness, the six new entries: see the commit message.

## Not verified

The real 10 s and 2 s defaults were not waited out; the clauses pass their own graces. A real watcher that takes seconds to die was not started.
