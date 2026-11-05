# Session record: the self-test reads the ET day once

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 10 item 15 (`scripts/mutation-check.mjs` only). Assignment H2, commit 2 of 5.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05: a `date` stand-in first on PATH that answers the real ET day to its first `+%F` call and `2099-01-01` to every later one, then `node scripts/mutation-check.mjs --self-test`. 124/140, 16 red: E3 (2), E4, E5, E6 (2), E8, E12, E15, E18, E19 (2), E20, E23 (2), E24. The residuals CC-CMD names E3 to E6 and E8 and lists E10, E15, E16 as the other candidates; the ones that read the day are the clauses that use `outbox-stub` or `outbox-missing`, which on this tree includes E12, E18 to E20 (as the probe found) and E23 and E24 (added since).

The refutation of the spec's own risk note, by one grep: it said no `date` call other than `+%F` exists in a run `go` starts. `expectOf`'s `expect-writes-unrelated` fault runs `date +%s%N`, and E15 uses it. A stand-in that exits 2 for other arguments leaves that file empty (the shell's redirect creates it) and E15's old assertion (the file exists) still passes: measured, the mutant survived 140/140.

## What was built

In group E: the day is the constant `2000-01-01` (not today), and `go()` puts a `date` stand-in first on PATH. It answers the one question `+%F` with that day and, for anything else, drops its own directory from PATH and runs the real `date`. The self-test no longer forks `date` for the day at all. E15's assertion now requires the fault's file to hold a timestamp (10 or more digits), so a stand-in that swallows the other questions is visible.

## Verified

- With the rolling stand-in outside: 140/140, and the outside stand-in answered `+%F` 0 times (its log: 1 call, the `+%s%N` of E15, passed through).
- Mutant by hand, `go()` without the PATH: 124/140, 16 red (E3 first). Mutant by hand, stand-in exits 2 for other questions: 139/140, E15 red.
- 2 new table entries (`self-test-reads-the-real-day`, `self-test-date-stand-in-answers-only-the-day`), run through the harness (`--ids`): both caught, 3/3 with the baseline.
- Self-test clauses 140 before and after (none added; E15's assertion strengthened).

## Not covered, stated

- The world entries' own `date` logic (`outbox-missing`, `outbox-stub`) is still tested against the real clock only by their own expectations in the gate.
- `run-row.mjs`'s `outboxToday` reads its own day at row time (a separate concern, not touched).
