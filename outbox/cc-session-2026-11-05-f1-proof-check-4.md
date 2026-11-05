# Session record: four proof-check assertions that could not fail now can

**Date:** 2026-11-05. **Scope:** review 6 fix stream F1, finding `proof-check.json` 3 (assertions that cannot fail) and the proof-check parts of `tests-vacuity.json` 6 (the four-space boundary of a proof body, what `inject` throws). The other two survivors named there, the "Put X right by hand" list and the "also carries" note, were pinned by the first commit of this stream, which rewrote those lines. Touches `scripts/proof-check.mjs` (clauses) and `scripts/mutation-check.mjs` (entries); no production line changes.

**Why this file exists.** `check:staged-outbox` wants an `outbox/` path in every commit that stages `scripts/`, and this stream may not edit existing outbox files. New file; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on the tree before this commit

Each mutant applied to a copy of the committed script, then `node <copy> --self-test`:

| mutant | result |
|---|---|
| `ours`: `mine.startsWith(now)` to `mine.includes(now)` | exit 0, 116/116 |
| the marker create: `if (e.code !== 'EEXIST') throw e` to `void e` | exit 0, 116/116 |
| the body shape: `l.startsWith('    ')` to `l.startsWith(' ')` | exit 0, 116/116 |
| `inject`: `throw new Error(...)` to `throw 0` | exit 0, 116/116 |

All four are real survivors. (The mutants the review lists as controls are caught, as it says.)

## What was built

- `ours`: the clause now also holds every suffix of the injection (15) and three middle chunks. A file that is a head of what the run wrote is the run's; a file that is a tail or a middle is a file someone else changed.
- The marker create: a clause that fails it with ENOSPC. A scratch directory cannot refuse a write to a root-owned run, and the reviewer's suggestion (make `.proof-state` a file) fails earlier, at `mkdirSync`, before the create is reached, so the failure is planted where it happens: a module preloaded into the child (`NODE_OPTIONS=--require`) wraps `fs.writeFileSync` and fails only the marker's exclusive create. The run must stop with status 1, say ENOSPC, run no build, and not say "another run took". Coverage (Rule 91): one run.
- The shape test of a proof body: a line indented by 1, 2 or 3 spaces in the gap above the anchor is not stranded; by 4 is (4 sources). `startsWith(' ')` and the 3-space variant both fail it.
- What `inject` throws: the baseline-edit clause now asserts the stderr contains `Error: src/Scoreboard.fs changed while the run was going, so nothing was written to it`.

## Clauses (self-test 116 before, 118 after)

Two new clauses (the boundary of the shape test, the non-EEXIST branch) and two extended (`ours`, the baseline edit).

## Red evidence (Rule 90)

Through the harness, `node scripts/mutation-check.mjs --ids <5 ids>`: five new entries, each the mutant above or a neighbour of it (the one-space and three-space variants of the body shape), find unique and applied, caught.

## Not verified

- The ENOSPC is a planted failure of one call; a real full disk at that call was not produced.
