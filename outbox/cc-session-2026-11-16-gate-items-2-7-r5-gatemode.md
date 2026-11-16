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

## A15: the stand-ins covered some modules' export lists and not others; the first red was unnamed   REACHABLE, FIXED

Classification: reachable. A new `import { x } from './gate-checks.mjs'` in `confidence.mjs` (the gate imports `shardedSuite`-like helpers from it whenever a row gets one) is an ordinary edit. It was a false red, not a green: the failing end-to-end checks said `{"full":[1,null,null,null,null],...}` and named nothing.

What changed (all in the `--self-test` of `scripts/gate-mode.mjs`):
- Every module `confidence.mjs` reaches is now either a REAL copy (`COPIED`: `confidence.mjs`, `gate-mode.mjs`, and, since A13, `gate-inventory.mjs`) or a stand-in with a LITERAL export list: `checks.mjs` `['runIdentity']`, `gate-checks.mjs` `['NOT_APPLICABLE','failures','ok','rows']` (it was in no list), `mutation-check.mjs` `[]` (it is run as a process, so any name imported from it is uncovered).
- A check ties each literal list to the TEXT of its stand-in (`exportNames` reads `export const|function|class`, `export { a, b as c }`, `export default`), so a list cannot drift from what is written.
- `uncovered(src, copied, standIns)` returns sentences: `no stand-in for: <name> from <module>` for a name imported from a stand-in that does not export it (the name before `as` is the export; a namespace or default import is named too, since neither can be compared with a list), and `no stand-in or copy for module <m>` for any `'./x.mjs'` the source names that is neither (an import, a dynamic import, `new URL('./x.mjs', ...)`). The check on the real `confidence.mjs` is named `THE STAND-INS COVER WHAT confidence.mjs REACHES`, and its detail is that sentence list.
- A non-vacuity check: the reader must find the imports `confidence.mjs` has today (a literal list), so a reader that finds nothing cannot read as full coverage.
- The function is run over ten LITERAL sources (one import differing each; not edits of `confidence.mjs`, because a fixture that edited the import line would be a crash on exactly the edit it is meant to name; I wrote that version first and the review's own input made it throw). The literal lists those fixtures use are asserted equal to the constants.

The review's own inputs, run on the baseline copy (9043fa75) and on this tree:
- `shardedSuite` added to the import from `gate-checks.mjs`: before `21/32`, first red `THE REAL confidence.mjs OVER STAND-IN ROWS ...` with detail `{"full":[1,null,null,null,null],...}`; after `24/37`, first red `THE STAND-INS COVER WHAT confidence.mjs REACHES`, detail `no stand-in for: shardedSuite from gate-checks.mjs`.
- `import { somethingNew } from './mutation-check.mjs'` added: before `21/32`, the same unnamed first red; after `24/37`, first red the same named check, detail `no stand-in for: somethingNew from mutation-check.mjs`.
(The review found a namespace import of a stand-in stayed green; it is now a named failure on purpose, since a property that is not exported reads `undefined` and fails later and quieter. A name from a real copy, such as `gate-mode.mjs`, stays green: control case.)

Red on purpose (each applied once, self-test run, restored; counts are of 37):
- `gate-mode-standin-coverage-blind` 36/37; `gate-mode-standin-module-unknown-passes` 36/37; `gate-mode-standin-list-drifts` 34/37 (first red the literal-vs-text check); `gate-mode-standin-text-drops-an-export` 24/37 (first red the same named check); `gate-mode-standin-import-alias-read-as-name` 36/37; `gate-mode-standin-namespace-import-passes` 36/37; `gate-mode-standin-default-import-passes` 36/37; `gate-mode-standin-reader-finds-nothing` 35/37 (first red the non-vacuity check); `gate-mode-standin-copy-list-loses-a-module` 23/37 (first red `THE STAND-INS COVER WHAT confidence.mjs REACHES`: `no stand-in or copy for module gate-inventory.mjs`).
- Each prints `PASS` under `node scripts/mutation-check.mjs --only <id>` (9 of 9):
  - `PASS [gate-mode-standin-coverage-blind] a name imported from a stand-in that the stand-in does not export is a named failure`
  - `PASS [gate-mode-standin-module-unknown-passes] a module the gate names that is neither a real copy nor a stand-in is a named failure`
  - `PASS [gate-mode-standin-list-drifts] the literal list of what the gate-checks stand-in exports is tied to the stand-in's text`
  - `PASS [gate-mode-standin-text-drops-an-export] the gate-checks stand-in's text exports every name its list says`
  - `PASS [gate-mode-standin-import-alias-read-as-name] in `import { a as b }` the export is a, the name before `as``
  - `PASS [gate-mode-standin-namespace-import-passes] a namespace import of a stand-in cannot be compared with its list and is named`
  - `PASS [gate-mode-standin-default-import-passes] a default import of a stand-in is named`
  - `PASS [gate-mode-standin-reader-finds-nothing] an import reader that finds no import cannot read as full coverage`
  - `PASS [gate-mode-standin-copy-list-loses-a-module] the modules copied for real are the modules the coverage check counts as covered`
- `node scripts/mutation-check.mjs --anchors`: `checked 1683 of 1686 mutation anchors; 0 stale` (the 3 not checked are the same as at 9043fa75).

After: `node scripts/gate-mode.mjs --self-test` printed `37/37 checks passed` (34 before this commit; the one coverage check became four, and the fixture check holds ten cases).

## A9: the failing-row filter could ignore a function-valued `browser` or a weight and stay green   REACHABLE, FIXED

Classification: reachable. A `failedRows` filter that reads a row's flags is exactly the edit the next "skip this kind of row" feature makes, and the one real row with a function for `browser` (the mutation row, weight 20, skipQuick) was in no end-to-end run. The review's own mutants: 9d `&& typeof r.browser !== 'function'` and 9f `&& r.weight !== 30`, both `32/32` at 9043fa75 (re-run here on a copy of that tree: `32/32 checks passed`, exit 0, for 9d, 9f and for the same two filters on `quickFailures`).

What changed: three stand-in rows and two checks.
- `fb`: weight 30, skipQuick, `browser: () => process.env.STANDIN_FB_BROWSER === '1'` (the real mutation row's shape, with the environment as the function's input); `fq`: the same without skipQuick, so `--quick` runs it; `q20`: a plain failing row of weight 20 that quick runs.
- `A FAILING ROW IS RED WHATEVER SHAPE OR WEIGHT IT HAS`: a matrix of 3 modes x 6 shapes (`bad` 10, `q20` 20, `sq` 20, `br` 20, `fb` 30, `fq` 30) plus a 4th mode (browserless where the function says a browser is needed), 20 runs of `good` and ONE other row, each cell `[exit, failing, skipped, notApplicable, score >= bar]` compared with a literal table. In every cell where a row fails, the score is at or above the bar (97 to 99), so only the conjunction of failing rows can be what keeps it red. In full each exits 1 and is named; in `--quick` the skipQuick ones are skipped and `bad`, `q20`, `fq` fail; in browserless `sq`, `bad`, `q20`, `fb`, `fq` fail, `br` is not applicable, and with the function answering true `fb` and `fq` are not applicable, not failing.
- `THE FAILING STAND-INS COVER EVERY WEIGHT the real table has`: the real weights are read from the table and compared with the literal `[10,20,30]`, and the rows quick runs (`bad`, `q20`, `fq`) carry 10, 20, 30, so a weight-dependent filter has no weight it can hide in; a new real weight is a red asking for a stand-in.

Before (copy of 9043fa75): all five mutants below `32/32`, exit 0. After (this tree): each `38/39`, exit 1, the matrix check the one failing.

Red on purpose (all five also `PASS` under `--only`):
- `PASS [gate-mode-confidence-failed-rows-by-function-browser] a failing row is red whatever shape its `browser` flag has (a function, as the mutation row's is)` (the review's 9d)
- `PASS [gate-mode-confidence-failed-rows-by-weight] a failing row is red whatever its weight (30 here)` (the review's 9f)
- `PASS [gate-mode-confidence-quick-failures-by-function-browser] a failing row that --quick ran is red whatever shape its `browser` flag has`
- `PASS [gate-mode-confidence-quick-failures-by-weight-30] a failing row that --quick ran is red whatever its weight (30 here)`
- `PASS [gate-mode-confidence-quick-failures-by-weight-20] a failing row that --quick ran is red whatever its weight (20 here)`
The four older entries on the same filters still pass (`...failed-rows-by-skipquick`, `...failed-rows-by-browser`, `...failed-filter-browserless`, `...quick-failures-empty`).

After: `node scripts/gate-mode.mjs --self-test` printed `39/39 checks passed` (37 before this commit, two checks added).

## A10: `dirty` and `sha` pinned only in the full-mode record   REACHABLE as an edit, NIL as a verdict; FIXED (a few lines, so added)

Classification: the edit is ordinary (`dirty: BROWSERLESS ? false : treeDirty` is the kind of tidy-up a reader might make), the consequence is nil today: `scripts/confidence-record-check.mjs` refuses any citation whose `run.mode !== 'full'` (line 193, `only a full run can back a score`) whatever `dirty` says, so a quick or browserless record that lied about the tree backs nothing. The review said so; the fixture is a few lines, so it is added anyway (it pins what a record says, not what a verdict does).

What changed: one check, `THE RECORD NAMES THE TREE IT MEASURED IN EVERY MODE`: `--quick` and `--browserless` runs with `STANDIN_DIRTY=1`, a sha and an id record `dirty: true`, that sha, that id (browserless under its `-browserless` suffix) and the line says `(tree dirty)`; the green runs of both modes record `dirty: false`, the clean sha, and no `(tree dirty)`.

Before (copy of 9043fa75, review's mutants 10h `dirty: BROWSERLESS ? false : treeDirty`, 10i `dirty: MODE === 'full' ? treeDirty : false`, 10j `sha: QUICK ? 'x' : runSha`, and the browserless sha one): each `32/32 checks passed`, exit 0. After: each `39/40`, exit 1, the one check failing.

Red on purpose, all `PASS` under `--only`: `gate-mode-confidence-record-dirty-quick-false`, `gate-mode-confidence-record-dirty-browserless-false`, `gate-mode-confidence-record-sha-quick-dropped`, `gate-mode-confidence-record-sha-browserless-dropped` (the review's 10i, `MODE === 'full' ? treeDirty : false`, is the union of the first two and is red too: 39/40). The older `...record-dirty-false` and `...record-sha-dropped` still pass.

After: `node scripts/gate-mode.mjs --self-test` printed `40/40 checks passed` (39 before this commit).

## A12: `needsServer` unobserved   lost time or a loud red, never a green; FIXED (a few lines, so added)

Classification: the review's own: `needsServer = true` costs `--quick` a probe and, where nothing listens on :8080, a spawned `scripts/serve.mjs` and up to 20 s of waiting; `needsServer = false` leaves the render rows to fail for want of a server, loudly. Neither is a green. Reachable as an edit (it is one line); the cost is the reason it was only noted.

What changed: the stand-in `ok` of `gate-checks.mjs` now appends its command to `ok.log` and answers true (it still answers true, so no server is spawned), and `go()` returns the lines. The only call `confidence.mjs` makes to `ok` is its own probe of `http://localhost:8080/`, so one check pins it: a full run asks for exactly one `curl -sf -o /dev/null http://localhost:8080/`, a `--quick` run asks for nothing. A browserless run is deliberately left unpinned: it runs no browser row, and whether it wants the server is a question about what else listens on :8080, which is not this clause's job; a later `needsServer = !QUICK && !BROWSERLESS` would be a saving, not a regression (nothing in the gate depends on it being either).

Before (copy of 9043fa75, the review's 12f/12g): `needsServer = true` and `needsServer = false` each `32/32 checks passed`, exit 0. After: each `40/41`, exit 1, the new check the one failing.

Red on purpose, both `PASS` under `--only`: `gate-mode-confidence-server-wanted-in-quick` (`needsServer = true`), `gate-mode-confidence-server-never-wanted` (`needsServer = false`).

After: `node scripts/gate-mode.mjs --self-test` printed `41/41 checks passed` (40 before this commit).

### A15, continued: the copies reach the stand-ins too

Found while running the review's input on `gate-mode.mjs` itself: the scratch directory holds a REAL copy of `gate-mode.mjs`, and that copy imports `rows`, `ok`, `failures` from `gate-checks.mjs`, which in the scratch is the stand-in. A name added to THAT import is the same unnamed crash, and the first version of the check read only `confidence.mjs`. The check (`THE STAND-INS COVER WHAT THE COPIED MODULES REACH`) now reads the text of every copy (`confidence.mjs`, `gate-mode.mjs`, `gate-inventory.mjs`, asserted against a literal list of those three) and names the file: `gate-mode.mjs: no stand-in for: shardedSuite from gate-checks.mjs` (run on this tree: 25/41, first red that check). Module names that appear only as text count as reached for `confidence.mjs` alone (`strings`), because the other copies carry a self-test whose fixtures name modules in strings and it never runs in the scratch directory; for every copy an `import` of an unknown module is named. Fixtures added: a copy other than `confidence.mjs` importing a name the stand-in lacks, one importing an unknown module, and one whose fixture merely names a module as text (no reach). Three more entries, each `PASS` under `--only`:
- `PASS [gate-mode-standin-strings-not-read] confidence.mjs's reach includes a module it names without importing it (new URL, a dynamic import)`
- `PASS [gate-mode-standin-only-first-copy-read] the stand-ins are checked against what EVERY copied module reaches, not only the first`
- `PASS [gate-mode-standin-unknown-import-unnamed] an import of a module that is neither a copy nor a stand-in is named, in any copied module`
After this commit: `41/41 checks passed` (the number of checks is unchanged: the fixtures are cases of an existing check). All twelve `gate-mode-standin-*` entries `PASS`.
