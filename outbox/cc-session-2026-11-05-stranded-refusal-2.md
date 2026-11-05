# Session record: the pre-commit hook and the gate refuse a stranded tree

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 8, the item "the gate row and the pre-commit hook do not run `--heal` first". Assignment D2, commit 2 of 2: the wiring of `--stranded` (commit 1 is the mode). Touches `package.json`, `scripts/confidence.mjs`, `.githooks/pre-commit` (a comment) and `scripts/mutation-check.mjs` (clauses and entries).

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

**The owner's decision, 2026-11-05:** refuse, do not heal.

## Consumers of the changed text (Rule 39), by grep on this clone

- `package.json` `check:mutation-anchors`: run by `.githooks/pre-commit` (the line `npm run --silent check:mutation-anchors`) and by the verify workflow's step "Every mutation's anchor still exists". CI starts from a fresh checkout, which never holds a marker, so there the new first command exits 0 in about 0.1 s. No script reads the script's text.
- `scripts/confidence.mjs`: run by `npm run gate` and by the verify-full workflow's step "Confidence gate (>= 95)" (a fresh checkout again). No script reads this file's source (grep for it by name and by `readFileSync`: only comments and the table entries added here mention it).
- **Not touched, by design.** Design R (refuse) does not change row 16 of `scripts/gate-checks.mjs` ("breaking each invariant makes a check fail"), so `scripts/sharded-row-check.mjs` (which reads that row's source through regexes), the row mirrors in the verify and verify-full workflows (comments no check reads), `docs/gate-rows.txt` (names and weights only) and `scripts/row-confidence.mjs` (finds teeth by row name) are unchanged. A heal inside the row would have been too late for rows 1 to 15 anyway.

## What was built

- `package.json`: `check:mutation-anchors` is now `--stranded && --anchors && --self-test`. First, so that a stranded tree is named as one: on this clone a killed `known-survivor` run made the old script fail in the anchor check with `STALE known-survivor: not found in docs/gate-rows.txt` (commit 1's record), which points at the table, not at the dead run.
- `scripts/confidence.mjs`: a preflight before the inventory comparison and before any row. It runs `mutation-check.mjs --stranded` as a process (the harness does its work at module scope and exports nothing), located from this file's own directory; any non-zero status (a crash included) prints the child's output, then `Refusing to score: ... exited N. Nothing was run.` and exits 2, the status of the inventory's refusal. It is a hard stop and not a row: nothing is earned or risked, nothing is recorded in the confidence log (the existing concept for this in the runner is the inventory stop, so no new one was invented).
- `.githooks/pre-commit`: a comment saying what the script does now. The hook line itself is unchanged.

## Verified (Rule 61: the real doors, the real tree)

On this clone, a real kill (`MUTATION_KILL_AT`, SIGKILL, exit 137), then the real commands:

| stranded state | `npm run --silent check:mutation-anchors` | `bash .githooks/pre-commit` | `timeout 20 node scripts/confidence.mjs` |
|---|---|---|---|
| source file, `known-survivor` on `docs/gate-rows.txt` | exit 1, `::error::.mutation-state/active.json is a mutation a killed run left applied ([known-survivor] on docs/gate-rows.txt)` + `Heal it first: node scripts/mutation-check.mjs --heal` (before: exit 1 as `STALE`) | exit 1 at that step, 8 s | exit 2, the same message, `Refusing to score: ... exited 1. Nothing was run.` |
| world change, `outbox-stub` (15 outbox files stubbed) | exit 1, `[outbox-stub] on the tree` (before: exit 0 with only a warning, 46 files stubbed, commit 1's probe) | exit 1 | exit 2, nothing run |

Both healed afterwards with `--heal` (exit 0) and `git status` showed only this commit's four files. `git status` after the gate refusals showed no change to `docs/confidence-log.jsonl`.

## Clauses (self-test; 162 before, 165 after)

| clause | covers |
|---|---|
| the hook's script refuses a stranded state before anything else | the script text read from `package.json`, run by `npm run` in a scratch directory over the stranded fixture (`scripts` symlinked to the real directory): non-zero, the message, no `mutation anchors` / `STALE` / self-test heading in the output, directory byte-identical |
| the pre-commit hook runs that script | `npm run --silent check:mutation-anchors` is a non-comment line of the hook |
| the gate refuses to score a stranded tree, ahead of everything else | the real `confidence.mjs` in two scratch directories: over the stranded fixture, exit 2, the message, `Refusing to score`, no row line, directory unchanged; over a directory with no marker it is not refused by this check and goes on to the inventory, which a scratch directory lacks, and fails there |

## Red evidence (Rule 90)

By hand, one entry at a time (the clause that fails in each): `gate-preflight-removed` 164/165, the gate clause; `gate-preflight-exits-zero` 164/165, the gate clause; `gate-preflight-refuses-every-tree` 164/165, the gate clause (the clean directory is refused); `hook-script-without-stranded` 164/165, the script clause; `hook-script-stranded-last` 164/165, the script clause (the anchor check runs first and prints `mutation anchors`); `hook-drops-the-mutation-anchors-line` 164/165, the hook clause. Not a table entry: the preflight moved below the inventory comparison, by hand, 164/165, the gate clause (the scratch directory has no inventory, so the inventory read fails first). Green: 165/165.

Through the harness, `node scripts/mutation-check.mjs --ids <the 6 ids>`: `7/7 checks passed` (baseline plus 6 of 6 caught), 2 m 08 s, tree restored. Six entries, every `expect` is `--self-test`; with commit 1's nine that is 15 entries added by this item. Cost in the mutation row: commit 1's nine took 4 m 07 s through the harness and these six 2 m 08 s, each including one baseline of about 25 s, so roughly 24 s per entry and about 6 minutes for the 15 (a machine shared by three streams, so not an idle figure). **Correction to commit 1's record:** it says its nine entries cost "about 2.5 minutes"; the measured figure is 4 m 07 s, about 3.7 minutes without the baseline.

## Not verified, and not covered

- A kill during one of this item's own entries leaves the mode (or the preflight) mutated, so the refusal can be absent exactly when needed. `--heal` shares the limit; `git status` shows the file.
- The verify and verify-full workflows were not run: they start from a fresh checkout, where `--stranded` has nothing to find. The first CI run of this commit is the check that the added first command exits 0 there.
- `bash .githooks/pre-commit` was run by hand over a stranded tree; a real `git commit` over one was not.
- The preflight prints the child's output as the child produced it. If the child's output were lost to a pipe at exit (the phenomenon commit 1's record describes for the large self-test), the status alone would still refuse; the message is 600 runs clean in the measurement there.
