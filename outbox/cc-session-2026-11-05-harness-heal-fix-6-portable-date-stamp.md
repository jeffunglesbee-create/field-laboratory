# Session record: E15's fault asks `date` for seconds, which every date answers

**Date:** 2026-11-05. **Scope:** review 6, lens "harness heal", finding 4 (`harness-heal.json`, n 4). Stream F3, commit 6. Touches `scripts/mutation-check.mjs` only: one test-only fault, one clause, two table entries, three comments.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100)

A `date` first on PATH that prints `%N` as the letter (BSD, busybox; the stand-in answers `+%s%N` with `<epoch>N`): `PATH=<that dir>:$PATH node scripts/mutation-check.mjs --self-test` on the previous commit ended `164/165 checks passed`, with `FAIL  E15: AN UNRELATED FILE WRITTEN WHILE A WORLD MUTATION IS APPLIED DOES NOT ABORT A HEALTHY RUN`. Reproduced as the reviewer reported. After this commit, the same command ends `176/176 checks passed`.

## What was built, and the choice

The `expect-writes-unrelated` fault wrote `date +%s%N`; it writes `date +%s` now. `%s` is answered by GNU, BSD, macOS and busybox dates; `%N` by GNU's alone. The clause's assertion is unchanged and stays strong: the file must hold at least ten digits, so a `date` that never ran (the redirect still creates an empty file) or one that answered a day instead of a time fails it.

**Why not the node one-liner the review suggested.** The fault is the only caller that reaches the self-test's `date` stand-in's pass-through branch (every other question asked of `date` is its `+%F`). With the fault writing from node, that branch is no longer run by anything, and the existing entry `self-test-date-stand-in-answers-only-the-day`, which breaks that branch, survives: shown by hand with both changes applied, `176/176 checks passed`. So the node form would have orphaned an entry; asking `date` for something portable keeps it defended.

## Clause (self-test; 175 before, 176 after)

E15, next to the existing clause: the same fault run with a stand-in `date` first on the PATH that prints `%N` as the letter (a wrapper that rewrites the format and runs the next `date`); the file holds ten or more digits, the write-ups are back, the state is gone (1 run). This is what fails on any machine, GNU included, when the fault asks for nanoseconds again; the old clause only failed on a machine whose `date` lacked `%N`.

## Red evidence (Rule 90) and entries

Two entries, both run through the harness with two neighbours (`self-test-date-stand-in-answers-only-the-day`, `self-test-reads-the-real-day`): `unrelated-write-fault-asks-for-nanoseconds` (the fault back to `%s%N`: fails the new clause) and `unrelated-write-fault-writes-no-timestamp` (the fault writes `date +%F`, which the stand-in answers with the day: fails both E15 clauses, so "a timestamp, not a file exists" is held). `5/5 checks passed` (baseline and the 4 caught), tree restored. All run `--self-test`.

## Not verified

Not run on a real BSD, macOS or Alpine host; the stand-in reproduces the one difference that matters (`%N` printed as the letter), measured on the reviewer's rig.
