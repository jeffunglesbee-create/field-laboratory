# Session record: a run that owns a killed child's mutation no longer ends green

**Date:** 2026-11-05. **Scope:** review 6, lens "harness heal", finding 0 (`harness-heal.json`, n 0). Stream F3, commit 1 of 7. Touches `scripts/mutation-check.mjs` only (main flow, the self-test's stranded warning, clauses and table entries).

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on this clone at d4bcd69

A scratch repository like the self-test's, real script, `MUTATION_FAULT=expect-strands-a-child ROW_FAILS_ON_STUB=1 node scripts/mutation-check.mjs --only outbox-stub`:

- Output: `PASS  [outbox-stub] ...`, `2/2 checks passed`, exit 0. `find .mutation-state` listed `nested/active.json`, `nested/docs_gate-rows.txt`, `nested/run.json`; `git diff --stat` showed `docs/gate-rows.txt | 2 +-`.
- `node scripts/mutation-check.mjs --stranded` over that tree: exit 1, `.mutation-state/nested/active.json is a mutation a killed run left applied ([known-survivor] on docs/gate-rows.txt)`. So the D-stream's `--stranded` already reads `nested`; it was not changed.
- The self-test's own warning read only `active.json` and stayed silent over the same directory (the half of the finding that did reproduce and was not yet fixed).

Without `ROW_FAILS_ON_STUB` the fixture's row passes on a stub, `outbox-stub` survives and the run exits 1 on its own account; that is why the existing E26 clause could not see the defect.

## What was built

- Main flow, after the run's own restore and before the baseline file is written: if `nested/active.json` exists the run records a failed check, `no harness run started inside this one was killed with its mutation still applied`, whose detail names the marker, the mutation id and the file, says the child was killed and that this run did not undo it, and gives `node scripts/mutation-check.mjs --heal`. The run exits 1. It heals nothing: a child that was killed is something a person should hear, and a heal there would repair the tree under verdicts already printed.
- Self-test: the stranded warning loops over `active.json` and `nested/active.json`.
- Not changed, and said: the check sits at the end of the run (the assignment's design), so the entries that ran between the kill and the end read the mutated file. Stopping at the first expectation after the kill would be better still, but that is a change inside `expectation()`, which another stream edits.

## Clauses (self-test; 165 before, 167 after)

| clause | covers |
|---|---|
| E26: a run that is green on its own account but has a killed child's mutation left in `nested` fails | the reproduction above, plus a control without the fault (exit 0, no complaint); exit 1, PASS for its own entry, the message with id, file and the heal command, no HEALED in the run, marker and mutated file still there, its own write-ups back, and the named command heals it (1 run with a stranded child, 1 control) |
| the self-test names a marker a nested run stranded too | `--self-test` started over a directory whose only marker is in `nested`: the warning names that file and the heal command, directory byte-identical afterwards (1 nested state) |

## Red evidence (Rule 90)

Each clause against the code without its fix, applied in place and always restored: end-of-run check off (`if (false)`): `166/167`, only the E26 clause fails; self-test loop reading `active.json` only: `166/167`, only the nested-warning clause fails. With both fixes: `167/167`.

Through the harness, `node scripts/mutation-check.mjs --ids <the 7 ids>`: `8/8 checks passed` (baseline plus 7 of 7 caught), tree restored (`--stranded` exits 0, `--anchors` 0 stale). Six new entries (the check off; the check heals silently; the check reads the run's own directory; the failure names no heal command; the failure names no child; the self-test skips `nested`) and the existing `self-test-heals-a-stranded-state`, re-anchored because the warning is now inside a loop. All seven run `--self-test`.

## Not verified

- A full gate run (68 minutes) was not run; the owner session runs it once on the merged result.
- A kill during one of these entries leaves `scripts/mutation-check.mjs` mutated; `--heal` and `--stranded` are the way back.
