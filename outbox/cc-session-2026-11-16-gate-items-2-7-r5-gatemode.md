# Round 5, gate-mode area: findings A8, A9, A10, A12, A13, A15 (session note, 2026-11-16)

Branch `proof-r5-gatemode`, from 9043fa75. Files: `scripts/gate-mode.mjs` (its `--self-test`), `scripts/confidence.mjs` (call sites and one refusal block), the `gate-mode-*` entries of `scripts/mutation-check.mjs`. The record is `outbox/review-round-5-findings-2026-11-16.md`. A11 and A14 were confirmed fixed and are untouched.

Baselines at 9043fa75 (commands run in the worktree): `node scripts/gate-mode.mjs --self-test` printed `32/32 checks passed`; `node scripts/mutation-check.mjs --anchors` printed `checked 1665 of 1668 mutation anchors; 0 stale`.

Each fix below was broken on purpose: one find/replace (anchor asserted to occur once and applied, by the harness's own check and by my own `showred` runner that refuses a count other than 1), the self-test run, the failing checks counted, the file restored byte for byte. The table entries then print `PASS [<id>]` under `node scripts/mutation-check.mjs --only <id>` (it applies the mutant, runs `expect`, and passes only if `expect` goes red).

## A8: a run that measured nothing exits 0 in `--quick`   REACHABLE, FIXED

Classification (Rule 77): reachable. An edit that makes every row of a `--quick` run skipQuick (or a new table whose rows are all `NOT_APPLICABLE` on a runner) lands on it with no deliberate act; the real table never reaches it today (quick runs 13 rows), which is why it was filed as "reachable enough".

What failed before: `node scripts/confidence.mjs --quick` over rows that are all `skipQuick` (reproduced on 9043fa75 files with stand-in rows `build`, `browser`): `0/0 points = 0/100`, `--quick: ... NOT a pass.`, `No failures among the rows that ran.`, **exit 0**. `exitFor` asked `failed > 0`, `!Number.isFinite(total)` and `(mode !== 'quick' && total < bar)`; in quick nothing asked whether anything was measured, although its own comment says a run that measured nothing is a failure in every mode.

What changed:
- `exitFor({ mode, failed, possible, total, bar })` gains `!(possible > 0)`. One clause covers both degenerate values: 0 (nothing ran) and `NaN` (a row with no weight: `NaN > 0` is false). A caller that forgets to pass `possible` passes `undefined`, which also reads as nothing measured, so the omission is a loud red (a passing run exits 1), never a quiet green.
- `scripts/confidence.mjs` passes `possible` at all six call sites and has a seventh exit: a refusal block before the mode branches, `if (!(possible > 0))`, which prints `Nothing was measured: N points possible ...` and exits through `exitFor`. Without it the quick path would print `No failures among the rows that ran.` and exit 1 with no reason, and a NaN `possible` would print `Gate passed` and exit 1 (the second oddity the review noted).
- The wiring check of the exits now pins the closed form with `possible` and counts seven `exitFor` calls and ten `process.exit` calls (three usage refusals).

NaN `possible`, asserted and why the exit 1 is not accidental. Before: `NaN` possible makes `total` NaN, and the exit was 1 only because of the `!Number.isFinite(total)` clause (pinned by `gate-mode-exit-nan-is-a-pass`). Now: the truth table has columns for `possible: NaN, total: 100` (a finite score beside a NaN possible, which only `!(possible > 0)` refuses) and for both NaN, in all three modes. Through the real gate a weightless row never reaches scoring at all: the inventory comparison refuses it first (`live.get(name) !== weight` is `undefined !== N`, exit 2), which is also why the review's output pair (`NaN/NaN points`, `Gate passed`, exit 1) cannot occur on the real table.

Fixtures (all in `node scripts/gate-mode.mjs --self-test`):
- the truth table, now 8 columns x 3 modes, three of them measured-nothing (`possible: 0`, `possible: NaN, total: 100`, both NaN), each 1 in every mode, quick included;
- `a call that does not pass possible exits 1`;
- end to end over the real `confidence.mjs`: five runs that measured nothing (full, browserless, `--quick` with every row skipped, `--quick` with every row `NOT_APPLICABLE`, browserless with only a browser row), each exit 1, `possible 0`, `total 0`, `0/0 points = 0/100`, `Nothing was measured: 0 points possible`, no `Gate passed`, no `No failures among`.

Red on purpose (self-test counts are failing checks of 33):
- `gate-mode-exit-possible-zero-is-a-pass` (remove the clause): 3 failing (the truth table, the omission check, the five end-to-end runs). `PASS [gate-mode-exit-possible-zero-is-a-pass] a run that measured nothing (0 points possible) exits 1 in every mode, quick included`
- `gate-mode-exit-possible-nan-is-a-pass` (`possible === 0` instead): 2 failing, the truth table's NaN-possible column and the omission check. `PASS [gate-mode-exit-possible-nan-is-a-pass] a possible that is NaN (a row with no weight) exits 1 even beside a finite score`
- `gate-mode-confidence-measured-nothing-unsaid` (`if (false) {`): 1 failing, the end-to-end line check. `PASS [gate-mode-confidence-measured-nothing-unsaid] a run that measured nothing says so, in every mode, before any line that reads like a pass`
- `gate-mode-confidence-measured-nothing-exits-green` (`process.exit(0)` in the block): 2 failing, the exit wiring and the end-to-end check. `PASS [gate-mode-confidence-measured-nothing-exits-green] the refusal of a run that measured nothing exits through exitFor, not 0`
- `gate-mode-confidence-exit-without-possible` (the final call loses `possible`): 3 failing, the exit wiring and two end-to-end runs. `PASS [gate-mode-confidence-exit-without-possible] a call to exitFor that leaves `possible` out is a loud red (a green run exits 1), never a quiet green`

Five existing entries had anchors that this change moves (`gate-mode-exit-ignores-failed-rows`, `gate-mode-exit-browserless-failure-is-green`, `gate-mode-confidence-exit-hardcoded`, `gate-mode-confidence-pass-falls-through`, `gate-mode-confidence-failed-arg-zero`): their find/replace text now carries `possible` and nothing else changed (`--anchors`: 0 stale).

After: `node scripts/gate-mode.mjs --self-test` printed `33/33 checks passed`.

## A13: the stand-in `diffAgainst` ignored its arguments   REACHABLE, FIXED (by construction: the stand-in is gone)

Classification: reachable. `diffAgainst(readInventory(), rows)` is one line of `confidence.mjs`; an edit that swaps, drops or empties an argument is an ordinary slip, and the only net left for it was `npm run check:gate-rows`.

By construction, not by one more fixture: the end-to-end copy of `confidence.mjs` no longer uses a hand-written `gate-inventory.mjs`. `gate-inventory.mjs` is a pure module (its only import is `node:fs`; its own self-test is guarded by `import.meta.url === file://argv[1]`), so the scratch directory gets a REAL copy of it, and `docs/gate-rows.txt` there is written by the test (`<weight> <name>` per stand-in row by default, or the lines a fixture passes). The comparison that runs is the real `diffAgainst`, by name, as in the repository, and its export list is the real one, so there is no list to drift.

Fixtures (replacing the single `STANDIN_INVENTORY` run): the inventory has a row the gate lacks (`MISSING row "ghost" (7 pts)`), the gate has a row the inventory lacks (`UNDECLARED row "build" (5 pts)`), a weight differs (`WEIGHT changed for "build": declared 6, gate has 5`), the first again in `--quick` and in `--browserless` (the refusal is before any mode logic); each exit 2, named, `Refusing to score`, no row run, nothing recorded. Controls: every other end-to-end run goes through the same comparison and must exit as before (so `diffAgainst(readInventory(), [])` and `diffAgainst([], rows)` turn 11 of them red), and the same rows declared in another order are no mismatch. A row with no weight (the NaN `possible` of A8) is refused as `UNDECLARED row "noweight" (undefined pts)`, exit 2: through the real gate a weightless row never reaches scoring.

Before (the review's own mutation, on a copy of the tree at 9043fa75 in /dev/shm, `showred` with the entry's find/replace): `diffAgainst(rows, rows)` `32/32 checks passed`, exit 0; the swapped arguments, `diffAgainst(readInventory(), [])` and `diffAgainst([], rows)`: each `32/32 checks passed`, exit 0.
After (same four mutants on this tree): `compares-itself` 32/34 (2 failing: the three-way refusal check and the weightless check); `args-swapped` 32/34 (the same two, by the message: MISSING became UNDECLARED); `against-nothing` 23/34 (11 failing); `is-empty` 23/34 (11 failing).

Red on purpose, all `PASS` under `--only`:
- `PASS [gate-mode-confidence-inventory-compares-itself] the gate is compared with the inventory, not with itself: diffAgainst(readInventory(), rows)`
- `PASS [gate-mode-confidence-inventory-against-nothing] the inventory is compared with the gate's rows, not with an empty table`
- `PASS [gate-mode-confidence-inventory-args-swapped] the inventory is the declared side and the rows the live side (a swap names MISSING for UNDECLARED)`
- `PASS [gate-mode-confidence-inventory-is-empty] the inventory the comparison reads is the file's, not an empty list`
- the existing `PASS [gate-mode-confidence-inventory-refusal-off]` still goes red (its fixture is now the real comparison).

After: `node scripts/gate-mode.mjs --self-test` printed `34/34 checks passed` (33 before this commit, one check added for the weightless row and the reordered inventory).
