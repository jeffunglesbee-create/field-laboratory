# Session record: the kill hook's yield is observed again (review 6, D13)

**Date:** 2026-11-05. **Scope:** `scripts/mutation-check.mjs`, the E18 clauses and the comment of `killHere`. Fix stream R1, commit 1.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on this clone

`node scripts/mutation-check.mjs --ids kill-hook-does-not-yield` before the change:

    FAIL  [kill-hook-does-not-yield] a test-only catchable signal is handled where it was sent, not after the run has finished
          mutation SURVIVED -- scripts/mutation-check.mjs was broken and `node scripts/mutation-check.mjs --self-test` still passed. Nothing defends this claim.
    1/2 checks passed

The finding reproduces. Cause, as the review said: `expectation()` ends in `await tick()`, so a signal queued by `killHere` without its 400 ms wait is acted on right after the expectation, and every state E18 looked at (exit 1, file back, state gone, no verdict) is identical. What differs is whether the expectation ran.

## What was built

- One E18 clause: a SIGTERM at `source-applied` with `MUTATION_FAULT=expect-writes-unrelated` leaves no `unrelated-during-window.txt`; the same run with no signal does leave it (the control, so an absent file means the expectation did not run).
- The comment above the wait in `killHere` said the wait existed for "a run with no `await` in its path"; since `expectation()` gained its turn every run has one. The comment now says what the wait is for.
- The entry's claim says "before the expectation runs". The entry itself is unchanged in `find` and `replace`.

## Red evidence

With the wait replaced by `void signal` (the entry's own mutation), `--self-test` fails exactly one clause, the new one:

    FAIL  E18: ...and a SIGTERM while a source file is mutated is handled BEFORE the expectation runs, not one turn after it: ...
          control (no signal) wrote the file true; after the SIGTERM: status 1, signal null, the expectation ran true, file back true, state gone true

and `--ids kill-hook-does-not-yield` now prints `PASS  [kill-hook-does-not-yield] ...` (caught).

## Replay of the entries that quote the code this regression came through (the skeptic's process point)

The review's finding was that commit 8656882 changed `expectation()` and nothing replayed the existing entries that quote it. The 14 entries of the table whose `find` is in `killHere`, `expectation`, `run` or the baseline loop (harness-blind, signal-killed-expectation-reads-as-caught, run-forgets-the-signal, expectation-never-yields, baseline-never-yields, world-expectation-forgets-the-signal, file-expectation-forgets-the-signal, flooded-expectation-reads-as-killed, run-keeps-the-last-signal, world-mutated-hook-dropped, kill-hook-does-not-yield, source-marker-written-after-the-hook, source-backup-written-after-the-hook, world-marker-written-after-the-hook) were run through the harness on this tree, one `--ids` call: `15/15 checks passed` (the 14 and the baseline), 5 min 54 s on a machine shared with other agents. `kill-hook-does-not-yield` was the only one that had survived.

## Not verified

- The entries that quote other lines the 62 follow-up commits touched were not replayed here (only these 14, chosen by what their `find` text mentions: `await tick()`, `expectation(`, `lastSignal`, `killHere(`, the 400 ms wait). The owner's full mutation run covers the rest.
