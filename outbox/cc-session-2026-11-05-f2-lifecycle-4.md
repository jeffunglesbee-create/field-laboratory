# Session record: WatchBuild stops the watcher's process group, and the real stop() is under test

**Date:** 2026-11-05. **Scope:** fix stream F2, review 6, finding tests-vacuity 1 part (b); the fix the review proposed under harness-lifecycle 0 ("make stop() and the stop between two starts signal the group"). Commit 4 of 8. New file for `check:staged-outbox`; existing outbox files are not edited.

## Reproduction (Rule 100), on a frozen copy of this clone at d4bcd69, before this stream's first commit

The clause the finding asked for did not exist (`REAP: stopping the watcher signals it` replaces the builder with `{ stop: () => { stopped++ } }`). Mutant: `WatchBuild.stop()` made a no-op, on the copy: `node scripts/mutation-check.mjs --self-test` gave **165/165**. (The review reports that the mutation-lib self-test crashes with ENOTEMPTY on that mutant, by accident and not by an assertion; that was not rerun here.)

What the real `stop()` does to a group whose host does not pass the TERM on: it signalled the leader only (`child.kill`), though the watcher is spawned as the leader of a group of its own so that one signal can reach the compiler under it. The review measured a detached `sh -c 'sleep 300 & sleep 301; wait'` going from 3 processes to 2.

The premise that decides whether this is a defect or only a test gap, probed on this clone before the edit (one command, Fable 5.13.0, `dotnet fable watch` spawned detached, TERM to the leader only): the group held `dotnet fable watch` and `fable.dll`, and **6 s after the TERM it held nothing**. The real host passes a TERM on, so leader-only never showed as a failure. It is the host's courtesy: a wedged host, or one the escalation sends KILL (the leader only), cannot extend it. So the change is defence of a path the real host happens to cover, and it is named that, not a measured failure.

## What was built

- `mutation-lib.mjs`: `#signalGroup(child, signal)` (`process.kill(-pid, signal)`, as `reapDriver` does for the same reason); `stop()` and both signals of the stop between two starts use it. The spawn mode is unchanged.
- Two self-test clauses after the REAP group, over the REAL `WatchBuild` and a stand-in host `sh -c 'node fake-fable-watch.mjs ... & wait'`, which dies of a TERM and leaves the compiler in the group (found by /proc, so skipped without it, and skipped in the two nested self-tests every self-test starts, which would each repeat them):
  - `stop()`: the group held at least 2 live processes before the call (so a host that left no group cannot pass) and none within 4 s after it.
  - the stop between two starts: a first start that dies of a compiler crash (the fixture's `crash-once`) is followed by a second; the first group holds nothing when `start()` returns, the second holds at least 2, and `start()` took under 6 s. The time is the observable: the escalation to KILL signals the group too, so after the 10 s it waits for the TERM the first compiler is gone either way (found when the first version of this clause, without the time, stayed green with that stop made leader-only).
  - The two go at once, in directories of their own.
- Table: `watch-stop-signals-nobody`, `watch-stop-signals-the-leader-only`, `watch-restart-signals-the-leader-only`.
- The retry clause times itself with the harness's `stopwatch()`, not a bare `Date.now()`: the gate row that scores this file reads a clock read in any other shape as nondeterministic (`node scripts/row-confidence.mjs` went to 1/2, "breaking each invariant makes a check fail = 70", with the first version of this commit; it is not part of the pre-commit hook, and the after-commit run of it is what found it). It is 2/2 again.

## Red evidence (Rule 90)

On copies of the tree with the clauses present (`170/170` unmutated):

| mutant | result |
|---|---|
| `stop()` a no-op | `166/170`: the WATCHBUILD stop clause, the E22 signal clause (commit 3), and the two nested-self-test clauses that fail when the inner one does |
| `stop()` leader-only | `167/170`: the WATCHBUILD stop clause and the two nested ones |
| the stop between two starts leader-only | `167/170`: the WATCHBUILD restart clause and the two nested ones (81 s: the stop waits out its 10 s grace) |
| the helper itself leader-only | `166/170`: both WATCHBUILD clauses and the two nested ones |

Through the harness, the three new entries: `PASS` (caught) each; the output is in the commit message.

## Not verified

The KILL escalation of the stop between two starts (a host that ignores the TERM for 10 s) was not exercised: it takes 10 s and only the group form of the KILL differs. No real Fable was started through `WatchBuild`; the probe above is a detached `dotnet fable watch` without the class. `stopBuilder` still removes `driver.json` as soon as the signal is sent, not when the group is gone: with the real host that is within a moment, and making the exit handler wait is a design change filed here, not made.
