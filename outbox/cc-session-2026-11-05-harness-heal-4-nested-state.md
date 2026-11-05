# Session record: clearing a parent's state keeps a stranded nested run's marker

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 8 (the nested-marker item; `scripts/mutation-check.mjs` only). Assignment H2, commit 4 of 5.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05, in a scratch repository with the real harness and the test-only fault of this change added by hand: the parent `--only outbox-stub` runs, as its expectation, a child `--only known-survivor` that is SIGKILLed with its mutation applied (its marker in `.mutation-state/nested/`). After the parent ended: `git status --short` showed ` M docs/gate-rows.txt`, `.mutation-state` did not exist, and the next `--heal` printed `Nothing to heal: no run left a mutation applied.` The premise holds on this tree: `emptyEntries` removed every entry but `run.json` and `driver.json`, and `nested/` is one.

## What was built

`emptyEntries` keeps a `nested` directory that holds something and removes one that holds nothing; everything else as before. The next run's `healHeld` already heals `nested` first. A test-only fault, `expect-strands-a-child`, makes an expectation start a child harness that kills itself with a mutation applied, then run the real expectation. It is one more branch of `expectOf`, with the others.

**Re-anchored by the change on this tree** (not as the probe's spec had it, which predates the driver record): `clearing-state-takes-the-run-lock` and `clearing-state-removes-the-driver-record` quoted the line `emptyEntries` had; both now anchor on `if (entry === 'run.json' || entry === 'driver.json') continue` and drop one name each.

## Verified

- Real script, after the fix, same scenario: the parent exits, `.mutation-state/nested/{active.json, docs_gate-rows.txt, run.json}` are there, `docs/gate-rows.txt` is still the child's mutation, and the next `--heal` prints `HEALED ... Restored docs/gate-rows.txt from its backup`, after which the tree is clean and `.mutation-state` is gone.
- Self-test: 141 clauses before, 143 after (a unit clause and `E26`). Without the fix: 139/143; the unit clause (`nested marker survived false`) and `E26` (`child marker kept false, its file mutated true ... Nothing to heal ... file back false`) fail, and two clauses that run the self-test as a child fail with them. With it 143/143.
- 4 table entries through the harness (`--ids`): 2 new (`nested-state-deleted-with-its-parent`: by hand 139/143, 4 red; `empty-nested-directory-kept`: 140/143, 3 red) and 2 re-anchored; 4 of 4 caught, 5/5 with the baseline.

## Not covered, stated

- A child killed before it claims state leaves only `nested/run.json`. The parent keeps `nested/` then (it is not empty); the next run's lock check removes the stale lock and its own clear removes the now-empty directory. `.mutation-state/` can persist, gitignored, until then.
- The state-directory guard of the next commit must accept `nested` (it is in its list of the harness's own names).
