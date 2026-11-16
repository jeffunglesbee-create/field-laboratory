# Round 5, merge of the five fix branches into `gate-items-2-7` (2026-11-16)

Base: `5903450f` (origin/main merged into the branch). Merged, in this order, each with `git merge --no-ff`, none with a conflict:

| branch | head | commits since `9043fa75` | items |
|---|---|---|---|
| `proof-r5-guard-b` (contains `proof-r5-guard-a`, 6 of the 11) | `8f4a94b5` | 11 | guard-a: B1, A24, B2, B3, B4, B6, A28, B5, B7, A25, A26, A27, A29. guard-b: B0, B8, A21, A22, A23, B9 |
| `proof-r5-delete` | `f2e9220b` | 5 | B12, B13, B14, A19, A16, A20, A18 |
| `proof-r5-trap` | `ef15911d` | 5 | B10, B11, A0, A1, A2, A3, A4, A5, A6 (A7 not fixed: contrived, in the header's not-covered list) |
| `proof-r5-gatemode` | `f157d7ec` | 8 | A8, A9, A10, A12, A13, A15 |

Merged head before the fixes below: `6aa027cd`.

## Four integration defects the merge produced (none visible on any one branch)

Each branch was green on its own tree. Merged, the tree was red four ways. Each was found by running the same command the branch ran, on the merged tree, and each is fixed by a change in the file that owns the rule.

1. **The real tree went red: `scripts/gate-mode.mjs imports scripts/gate-checks.mjs other than as { names }`.** `proof-r5-guard-a` (A27) added `importer_rows_problems`, which reads every `scripts/*.mjs` that imports `rows` from `gate-checks.mjs`. `proof-r5-gatemode` (A15) put `import * as gc from './gate-checks.mjs'` and `import gc from './gate-checks.mjs'` inside strings, as inputs of its stand-in coverage fixtures. The importer scan blanked comments but kept strings, so a string holding an import was an import. Fix, in the guard: `_blank_prose_strings` keeps the content of a string only when it is a bare module specifier (`[\w./@-]+`) and blanks every other string and template literal before an import is looked for. Three self-test checks (a string import of five forms is no import; a real `rows.push` and a real `import * as` beside such a string are still refused; the helper's output on one literal input), and two mutation entries (`browser-gate-importer-string-is-an-import`, `browser-gate-importer-specifier-blanked`), each printing `PASS [id]` under `--only`. An existing entry (`browser-gate-importer-copywithin`) anchored across the lines the new helper now sits between; it was repointed and passes.
2. **The no-launch trap's allowlist refused two lines: `12 of 14 lines on the list in 195 scripts`.** `proof-r5-guard-a`'s A29 mutation entry (`browser-gate-later-steps-dangerous-names`) holds the word `NODE_OPTIONS` in its `claim` and `replace` text. The allowlist is default-deny by design, and its own comment says a line of mutation-table text that names the variable is admitted by being listed. Both lines are listed under `scripts/mutation-check.mjs`. `no-launch-check.mjs --self-test` is back to 51/52, the one failure being the known `the axis-check mutation needs build/`.
3. **`npm run check:citations` failed with 6 bare citations against a budget of 0.** Three `File: \`scripts/...:NNN\`` lines in `outbox/review-round-5-findings-2026-11-16.md` cited a line of a file the round has since rewritten; three more were the delete note's quotation of the same list. They are reworded to name the commit and a function instead of a line number (a path with no line is not ratcheted), and the check reads `bare 0` and passes.

4. **The harness's own self-test went 218/221: `THE FILES THIS HARNESS IS BUILT FROM ARE ALL LISTED ... reached mutation-check.mjs, checks.mjs, run-marker.mjs, mutation-lib.mjs, gate-checks.mjs; not listed gate-checks.mjs`.** The check reads `mutation-check.mjs` for the text `from './<name>.mjs'` (a regular expression over the whole file, table text included) and counts every match as a module the harness imports. The `claim` of the entry written for defect 1 quoted `import * as gc from './gate-checks.mjs'`, so the harness "imported" a module it does not. The two other failures were the same check seen from two child runs. Fix: the claim says "a namespace import of gate-checks.mjs inside a string" and spells no `from './x.mjs'`. 221/221. The reader is a text match by design and is left as it is (Rule 69); a table entry that needs that spelling in its `find` or `replace` has to escape it, as the existing entries do.

## State after the fixes (commands run on the merged tree)

- `python3 scripts/check-browser-gate.py` : `verdict: gated`.
- `python3 scripts/check-browser-gate.py --self-test` : 909/909 (906 at the guard-b head, +3).
- `python3 scripts/check-browser-gate.py --plain-commands | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"` : 70.
- `node scripts/mutation-check.mjs --anchors` : `checked 1885 of 1888 mutation anchors; 0 stale`.
- `node scripts/gate-mode.mjs --self-test` : 41/41. `node scripts/delete-branches.mjs --self-test` : 33/33.
- `node scripts/no-launch-check.mjs --self-test` : 51/52 (the `build/` check, which only CI can run).
- `npm run --silent check:citations` : `bare 0`, all PASS.
