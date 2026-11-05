# Session record: a marker with an empty touched list runs no restore command

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 8 (the `planHeal` item; `scripts/mutation-check.mjs` only). Assignment H2, commit 3 of 5.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05: a scratch repository with the real harness, a hand-made `.mutation-state/active.json` for a world mutation with `"touched": {}` and `restoreCmd` `echo RAN-BLIND > restore-ran.txt`, then `--heal`. Output: `HEALED: a previous run was killed with [hand-made-world] still applied.`, then the refusal that the restore ran but what it touched is not as it was; `restore-ran.txt` held `RAN-BLIND`. The premise holds. No code path writes such a marker (the main flow stops a mutation that touched nothing before the marker names paths), so this hardens against a hand-edited or corrupt one.

## What was built

`hasTouched(m)` (a list with at least one path) in `planHeal`, and in the refusal branch of `healAt` that distinguishes "no list" from "a path moved". A marker with `{}` then takes the route of a marker with no list: tree equal to `before` is `clear`, any other is `diverged` with the message for a mutation killed before it recorded its paths. The restore command never runs.

**One departure from the probe's spec, found by reading.** The spec also changed the read-back after the restore command (`back = m.touched ? ...`). That line is reached only when `planHeal` returned `restore`, which for a world marker now requires `hasTouched(m)`, and before this change required a truthy `touched`; so its `sameSnapshot` branch is unreachable today and was before. Changing it would be a no-op (an equivalent mutant), so it is untouched, and the existing entry `heal-accepts-a-partial-restore` keeps its anchor. The unreachable branch is reported, not removed (Rule 69).

## Verified

- Real script, after the fix: `touched: {}` over an unchanged tree: `Nothing to heal`, exit 0, no `restore-ran.txt`, state gone. Over a changed tree: the "killed before it recorded which paths it touched" refusal, exit 1, no `restore-ran.txt`, state kept.
- Self-test: 140 clauses before, 141 after. Without the fix the new clause fails (138/141: `equal: returned null, exit 1, calls 1, kept true; moved: exit 1, calls 1`; two more clauses fail because they run the self-test as a child). With it 141/141.
- 3 new table entries (`heal-runs-a-restore-for-an-empty-touched`, `plan-heal-reads-an-empty-touched-as-a-list`, `heal-refusal-for-an-empty-touched-lists-no-path`), run through the harness (`--ids`): 3 of 3 caught, 4/4 with the baseline.
