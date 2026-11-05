# Session record: clean-source-check's run-state clause forbids any git command, not one spelling

**Date:** 2026-11-05. **Scope:** review 6 fix stream F1, `tests-vacuity.json` finding 1 clause (c) (the clean-source clause `WITH a run state, no checkout is recommended` is a negative assertion on one spelling). Touches `scripts/clean-source-check.mjs` (two clauses) and `scripts/mutation-check.mjs` (one entry); no production line changes.

**Why this file exists.** `check:staged-outbox` wants an `outbox/` path in every commit that stages `scripts/`, and this stream may not edit existing outbox files. New file; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on the tree before this commit

In a copy, the with-state remedy was extended with `. To discard every uncommitted edit to the file instead: git reset --hard HEAD -- <files>`. `node <copy> --self-test` still printed 21/21 and exited 0: the clause only forbade the literal `git checkout`.

## What was built

The negative is now `\bgit\b`: with a run state the remedy is proof-check, and any git command in it (a checkout, a restore, a reset, a clean, a stash) discards uncommitted work. The with-state remedy text has no other reason to contain the word; the real output was read to confirm. Both clauses that make this assertion use it (the block with a run state, and the separated probe with a run state). The reproduction above was run on the tree of the previous commit (21/21, exit 0, with the reset appended).

## Clauses (self-test 21 before, 21 after)

Two clauses changed in place; none added.

## Red evidence (Rule 90)

The mutant above, through the harness (`node scripts/mutation-check.mjs --ids clean-source-with-state-recommends-a-reset`): caught. With the old negative the same mutant survives (reproduced first).

## Not verified

- The no-state remedy legitimately names `git checkout` for an uncommitted injection and is not touched.
