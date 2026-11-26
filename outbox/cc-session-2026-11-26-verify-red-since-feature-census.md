# verify was red on main for three runs because a new workflow added a command the no-launch pin did not count

**Date:** 2026-11-26. **Repo:** field-laboratory. **Fix commit:** the one carrying this file.

## What was red, measured

`verify` on main: 45865985796 (`e075c09b`, 17:14Z), 45894399564 (`be2ffb0c`, 20:54Z) and 45907706915 (`62c28c3b`, 22:54Z) all `failure`; the run before them, 45740763182 (`08c30f0a`), `success`. Two steps failed in each, and only one is a cause:

| step | conclusion | why |
|---|---|---|
| 15 "The browser-free steps' self-tests and read-only modes launch no browser" | failure | `node scripts/no-launch-check.mjs` read 74 commands from `check-browser-gate.py --plain-commands` and the pin (`EXPECTED_COMMANDS`) said 73 |
| 16 "Render checks (both captures...)" | skipped | default `if: success()`, so step 15's failure skipped it. It is the step that starts `node scripts/serve.mjs` |
| 114 "Render check against the LIVE slate" | failure | `if: always()` ran it with no server: `page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:8080/` (log line 2281) |

One root cause. Step 114 is a consequence, not a second defect.

## Cause

`e075c09b` added `.github/workflows/feature-census.yml`, which is a browser-gate exempt site whose self-test step (`node scripts/feature-census.mjs --self-test`) joins the guard's plain-command list: 73 became 74. The pin moves with the step that changes the list (its own message says so) and I did not move it.

## The premise that was wrong (Rule 100)

I treated a workflow commit as unable to trigger `verify` and did not run `npm run check:no-launch` before pushing. `verify.yml`'s `paths-ignore` covers `docs/**`, `outbox/**` and `**/*.md` only; `.github/workflows/**` and `scripts/**` are not ignored. One command would have refuted it, and the pre-commit fast gate does not run this check.

## The fix, the same bump as `afedae13` (72 to 73)

- `scripts/no-launch-check.mjs`: `EXPECTED_COMMANDS` 73 to 74, its doc comment, and the self-test's literal sizes (73 to 74, and the "list of N+1" case 74 to 75).
- `scripts/mutation-check.mjs`: the entry `no-launch-check-pin-constant-stale` finds the constant by its text; find 73 to 74, replace 72 to 73.

## Verified

- `npm run check:no-launch`: 58 of 58 checks; the real run prints `checked 74 of 74 commands: 74 exited 0 with 0 launches ... the guard's list is the pinned 74`.
- `node scripts/mutation-check.mjs --only no-launch-check-pin-constant-stale`: `PASS [no-launch-check-pin-constant-stale] the pinned count is the guard's count` (the entry still turns the check red when the constant is wrong).
- `node scripts/mutation-check.mjs --anchors`: `checked 2248 of 2251 mutation anchors; 0 stale` (3 not checked, as before this change).

## Not verified here

That `verify` on the fix commit is green. It is the done condition: the run for this commit must conclude `success`, and its step 15 and step 114 must both be `success`. A red result is reported, not explained.

## Also true of the same session (single-page work)

The Tonight surface (`62c28c3b`) was committed on the owner's explicit choice without a full confidence-gate score: the gate's mutation row is about 2.5 hours serial (`docs/GATE-TIMING.md`) and two local attempts were killed. The red above is NOT caused by it: the first red run is `e075c09b`, which precedes it.

## Second cause, found when the first was fixed (run 45913... on `e1bf0e28`, 126 of 126 steps, one failure)

With the pin fixed, steps 15, 16 and 114 passed, and step 30 "The chrome, measured on the rendered page" (`npm run check:computed-chrome`) failed. It had been SKIPPED in the three earlier red runs (default `if: success()` after step 15's failure), so it had never run against the Tonight CSS.

- Failure, reproduced locally: `FAIL every custom property used is declared (21 in use)` / `--border — var() with no declaration resolves to nothing, silently`.
- Cause: the Tonight rule in `index.html` (commit `62c28c3b`) used `var(--border, rgba(...))`. `--border` is not declared; the check treats a fallback as no declaration.
- First fix attempt, also wrong, caught by the same check before it was pushed: `var(--edge)`. `--edge` was DELETED on purpose (index.html comment at the `.pick-leader` rule: "the invisible `--edge`").
- Fix: `var(--edge-strong)`, the declared token `.tabs` already uses (tokens are generated from the F# `Palette` in `scripts/build-site.mjs`).
- Measured after: `npm run check:computed-chrome` 25/25 (was 24/25); `scripts/tab-check.mjs` 85/85 on a pinned capture.

Premise that failed (Rule 100): that a pre-commit fast gate plus tab-check was enough to commit `62c28c3b` without the full gate. The full gate was not scored (its mutation row is about 2.5 h serial) and this is one of the checks it would have run. The owner chose to commit; the cost was one extra red `verify` run.

Done condition for this fix: `verify` on its commit concludes `success`.
