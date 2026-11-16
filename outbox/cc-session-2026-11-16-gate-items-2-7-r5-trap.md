# Session 2026-11-16: the no-launch trap, round 5 (items B10, B11, A0 to A7)

Branch `proof-r5-trap`, from `9043fa75` on `gate-items-2-7`. Area: `scripts/no-launch-check.mjs` and its entries in `scripts/mutation-check.mjs`. The record the fixes are written against is `outbox/review-round-5-findings-2026-11-16.md`. Threat model, as the guard states it at its NOT_WORK comment: a careless edit, not a deliberate one. One commit per finding group, in the order below; this note grows with each commit and is staged with every one.

Baselines at `9043fa75`, measured before any edit: `node scripts/no-launch-check.mjs --self-test` printed `35/36 checks passed` (the one failure, `the axis-check mutation needs build/`, needs `build/`, which only CI has, and is the same at every commit below); `python3 scripts/check-browser-gate.py --plain-commands` lists 70 commands.

How the red-on-purpose lines below were produced. `node scripts/mutation-check.mjs --only <id>` prints `PASS [<id>]` when the expectation fails under the mutation, and here its baseline is already red on the build/ check (`FAIL the unmutated tree passes every expectation`: 1 of 1 distinct expectation already failing), so on this machine a PASS line alone cannot tell a caught mutant from the standing failure. Each `PASS` line below is therefore paired with the self-test run of the same mutation on a scratch copy of the tree (the entry's `find` applied once, asserted unique, then `node scripts/no-launch-check.mjs --self-test`), listing the check that went red and is not the build/ one. On CI, where the baseline is green, the PASS line is the whole proof.

## Commit 1, A2: the label and the verdict are one function

Class: REACHABLE as a careless edit (the label had an expression of its own, `r.exit === 0 && !r.launches.length ? 'ok' : 'PROBLEM'`; the reviewer's `!r.exit` printed `ok [self-test] .../pk.mjs (exit null; 0 launch(es); 0.0 s)` for a SIGKILLed command, with the self-test at 35/36).

Change: `export const isClean = r => r.exit === 0 && r.launches.length === 0`, and the label (`show` in `measure`), the problems of `verdictOf` (`results.filter(x => !isClean(x))`) and the count in its closing line (`results.filter(isClean).length`) all read it. Nothing else says what a clean command is.

Fixtures: a LITERAL 6-row table for `isClean` (exit 0 clean; SIGKILL with exit null, exit 1, a launch, exit 3 with a launch, SIGTERM with a launch: each not); a measure() run of three commands (one SIGKILLs itself, one is clean, one swallows a launch) whose printed lines are read: the SIGKILLed one is `PROBLEM` and says `exit null`, the launching one is `PROBLEM`, the clean one `ok`, and each label equals `isClean` of its own result.

Red on purpose (self-test run of the mutation on a scratch copy, then the harness's own line):
- `no-launch-check-label-not-the-verdicts` (the label reads `!r.exit && !r.launches.length`, the reviewer's mutation made precise): 36/38, red by `THE LABEL OF A COMMAND IS THE VERDICT'S: a SIGKILLed command is PROBLEM (exit null)...`. `PASS  [no-launch-check-label-not-the-verdicts] the per-command label is the verdict's own isClean: a command killed by a signal is not ok`
- `no-launch-check-closing-count-not-the-verdicts`: 36/38, red by `A COMMAND KILLED BY A SIGNAL IS NOT A CLEAN COMMAND...` (the closing line counted it). `PASS  [no-launch-check-closing-count-not-the-verdicts] ...`
- `no-launch-check-isclean-ignores-launches`: 32/38, red by `MUTATION: one command that attempts a launch makes the verdict not ok, and names it` and `isClean: exit 0 with no launch is clean...`. `PASS  [no-launch-check-isclean-ignores-launches] ...`
- `no-launch-check-incomplete-ignored` and `no-launch-check-signal-exit-read-as-clean`, existing entries re-anchored on `isClean` (their old anchors, `else if (r.exit !== 0)`, no longer exist): 32/38 and 33/38, red by `MUTATION: a command that did not complete...` and `isClean: ...`. `PASS  [no-launch-check-incomplete-ignored] ...`, `PASS  [no-launch-check-signal-exit-read-as-clean] ...`

Self-test after: 37/38 (the build/ check is the one failure; 36 checks before this commit, plus the isClean table and the label fixture). `node scripts/mutation-check.mjs --anchors`: `checked 1668 of 1671 mutation anchors; 0 stale`.
