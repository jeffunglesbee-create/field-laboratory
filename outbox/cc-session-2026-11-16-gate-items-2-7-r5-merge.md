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

## Verification round (workflow `wf_f9f5e556-127`, head `c6b1c33f`)

The account's 5-hour usage limit stopped the first run after 2 of 5 verifiers had finished (12 agent runs failed with `You've hit your 5-hour limit`, none with a defect of the work); the run was resumed at 12:35 UTC, the two finished results replayed from the journal. Dispositions, one per finding, are added below as each is decided.

### G-new-4 (REACHABLE, false red, introduced by round 5): the final step's message could not carry a run id
Reproduced by hand in a scratch worktree at `c6b1c33f`: `echo "::error::(run $GITHUB_RUN_ID) ..."` in the last step of `verify-full.yml` was refused (`echo reads $GITHUB_RUN_ID, which this guard's run does not set`), and so was `env: RID: ${{ github.run_id }}` with `$RID` in the echo (`env RID uses an expression other than steps.<id>.outcome, which this guard cannot evaluate`). The previous guard accepted the first. Round 5's A28 asked that a TEST read only variables the guard's run sets; the echo half of that clause was added on top of it and has no hazard behind it: an echo changes neither the exit status nor the `::error::` literal the guard looks for, so a variable it prints can only make the guard's run print less than the runner's, never pass over a job that is green.
Fix, one construction: an echo may print any variable; an env value that is an expression the guard cannot evaluate gets a placeholder in the guard's run and may be printed but not tested (`final_tested_names` reads the `if`/`elif` lines). Controls that must still be refused, run: the same `RID` tested (`env RID uses an expression ... and the script tests it`), and `[ "$GITHUB_ACTIONS" ... ]` (`must be made only of these lines`). Self-test 910/910 (909 + 1); fixtures changed with it: the 'any other expression is refused' check split into tested-refused and printed-accepted, the 'echo of a runner variable is refused' check reversed, two entries moved from the near-miss list to the accepted list, `$` dropped from the double-quoted refusal set (it was refused only because `$b` named a variable the env lacked). Table: `browser-gate-final-echo-any-name` (replaces `browser-gate-final-echo-env-names`), `browser-gate-final-expression-tested`, `browser-gate-final-expression-printed`, `browser-gate-final-tested-names`, each `PASS [id]` under `--only`; `--anchors` 1888 of 1891, 0 stale.

### G-new-1 (CONTRIVED, false green, a regression of round 5): `node -e` and `node --run` on an unreadable line
Reported against `c6b1c33f` and reproduced by the verifier on `echo "$(date)"; node -e "require('child_process').execSync('npm run check:peak')" scripts/proof-check.mjs` (rc=0 `verdict: gated`; the `9043fa75` guard refused it, by accident: it read the `(` inside the quoted code as a head, and blanking quoted text for B0 and B8 removed that). It is also the half of round 4's A23 that the BENIGN_HEADS fix did not reach (the finding named `node -e`/`--run`). `raw_line_hides` let a `node`/`python` head through whenever a script-file-looking token was anywhere on the line.
Fix: such a head is read as running its script FILE only when no flag makes it run something else (`_runs_inline_code`: `NODE_INLINE`/`NODE_INLINE_EQ` for node, the first word after `PY_FLAGS` being a script file for python, so `-c`, `-m` and a quoted word are refused). 15 refused forms and 5 kept forms as fixtures; 3 table entries (`browser-gate-raw-inline-code-hides`, `-raw-node-eq-forms`, `-raw-python-first-word`), each `PASS [id]`; self-test 912/912.

### G-new-3 (REACHABLE, false red, a text defect): the importer scan told a reporting script that `confidence.mjs` runs it
`scripts/list-gate-rows.mjs` with `import { rows } from './gate-checks.mjs'` and `rows.sort(...)` for display is refused (`changes rows ... and confidence.mjs runs it`), by me in a scratch worktree at `c6b1c33f` as by the verifier; the control `[...rows].sort(...)` is clean. The refusal is right to be broad: a module is loaded in `confidence.mjs`'s process through its import graph, and a reader of that graph that missed one import form would be a false green; a file that only reports is a separate process and harmless, but telling the two apart needs that reader. Not built (the code would add a failure mode to prevent a one-line rewrite). The message was false for a standalone script and gave no remedy; it now says the rows of `confidence.mjs`'s own process are what a change would reach, that the file is refused whether or not it is loaded there, and that a reporting file works on a copy (`[...rows].sort(...)`). Text only; the importer fixtures match on `changes \`` and are unchanged (912/912).

### The verification round, finished (workflow `wf_f9f5e556-127`: 66 agents, 2026-11-16, run on `c6b1c33f`)

**Denominators (Rule 91).** Five verifiers: the trap re-ran 10 of 10 ids, the guard 20 of 20, the gate and delete 16 of 16; one population agent ran 22 cases (16 ordinary edits and 6 measurements of the real tree: 563 of 563 steps with `run:` or `uses:` read by both guards, 4 of 4 final steps, 23 rows with 7 flagged, 7 importers, the delete pin, 14 node-options lines); one hunter mutated 167 clauses of the guard (58 left the self-test at 909/909; 22 of those equivalent or message-only) and one hunter mutated 139 clauses of the trap, gate-mode, confidence and delete files. Two skeptics read each new finding that was not already triaged by hand (`G-new-*` of the first verifier were; the id `G-new-1` of the gate and delete verifier was NOT, and is the pins branch's finding F-D below). The real tree was green on every real input; no finding is a red on a file that exists today.

**Dispositions, one line per finding.** "round 6" is `outbox/cc-session-2026-11-16-gate-items-2-7-r6-guard.md`; "CC-CMD n" is item n of `docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md`; "pins" is `proof-r6-pins`, the branch of the non-guard fixes.

| finding | result | disposition |
|---|---|---|
| guard A24, A25, A28, B1 to B9 (12 ids) | CLOSED | none needed |
| guard A21, A22 | still pass, CONTRIVED (`&>file` and `VAR=$(cmd)` heads) | CC-CMD 4 |
| guard A23 (`node --run`, `node -e` behind a script name) | still passes; a regression of round 5 | fixed in the merge round, `4e5395fb` (G-new-1) |
| guard A26 | CONTRIVED | CC-CMD 5 |
| guard A27, hunt-guard-9, G-pop-5, G-pop-6 | CONTRIVED (aliases, element writes, subdirectory importers); G-pop-5 is a false red on a parameter called `rows` | CC-CMD 6; the refusal's message now names the rename (`945daddf`) |
| guard A29 | CONTRIVED half | the write and its name on different lines are closed (`74a58539`: hunt-guard-1, hunt-guard-2); a name built from pieces and a step before the install: CC-CMD 7 |
| guard A30, hunt-guard surv-2, -3, -5, -6, surv-contrived, surv-cosmetic | clauses no fixture can fail; each guards a contrived or cosmetic input | CC-CMD 8 |
| guard B0 | false red, present before round 5, fails closed | CC-CMD 1 (design from the existing `shellViews`); a heredoc is in 2 of 402 `run:` steps in the tree, both outside the audited jobs |
| trap A0 to A6, B10, B11 | CLOSED | none needed |
| trap A7, O-new-3, O-new-4 | contrived or cosmetic | CC-CMD 10 |
| gate and delete A8 to A20, B12 (14 ids) | CLOSED | none needed |
| delete B13 | false red remains (mutants built from hard-coded blocks of the pin) | pins F-C |
| delete B14, O-new-5, G-pop-8 | contrived; G-pop-8 a design | CC-CMD 11 |
| gate-mode O-new-2 | false red: a new row reds two literal denominators | pins F-B |
| gate-mode G-new-1 of the gate and delete verifier | self-test reads `confidence.mjs` as text | pins F-D |
| trap O-new-1, G-pop-7 | a reworded comment on the allowlist reds the trap, and the detail has no remedy | pins F-A |
| G-pop-1 (`tee`, `cp`, `mv`, `rm`, `uniq`, `sed`, `awk`, `sort` refused in an always() step) | both skeptics UPHELD, REACHABLE | five of the eight restored (`8299add0`); `sed`, `awk`, `sort` stay refused (each can run a command): CC-CMD 2, an owner decision |
| G-pop-2 (a `$VAR` in the final step's echo; a trailing comment) | one UPHELD, one REFUTED | (a) already fixed at `697042ee`; (b) the message names the remedy (`945daddf`) |
| G-pop-3 (`echo ... >> "$GITHUB_PATH"` refused, no remedy named) | both REFUTED (COSMETIC, CONTRIVED) | not changed |
| G-pop-4 (`import * as g` of `gate-checks.mjs` refused) | both REFUTED (CONTRIVED) | not changed; the refusal names the accepted form |
| hunt-guard-1 (`{ echo NODE_OPTIONS=...; } >> "$GITHUB_ENV"`) | one UPHELD REACHABLE, one REFUTED | fixed (`74a58539`) |
| hunt-guard-2 (`NAME<<DELIM`) | CONTRIVED | fixed with hunt-guard-1 |
| hunt-guard-3 (a step before the install) | CONTRIVED | CC-CMD 7 |
| hunt-guard-4 (backslash then a space) | CONTRIVED | CC-CMD 4 |
| hunt-guard-5 (`;` in an echo message) | both UPHELD, REACHABLE | fixed (`7144cdc2`) |
| hunt-guard-6 | both REFUTED | none |
| hunt-guard-7 (`.npmrc` in a quoted message) | one UPHELD REACHABLE, one REFUTED | CC-CMD 9 |
| hunt-guard-8 | both UPHELD, REACHABLE | the message names the rename (`945daddf`); CC-CMD 6 |
| hunt-guard-surv-1 (apostrophe in double quotes), surv-4 (a dot on the next line) | one UPHELD REACHABLE, one REFUTED | fixtures and mutation entries (`945daddf`) |

**One premise of round 4 was wrong, and is corrected here.** A23 removed `tee`, `cp`, `mv`, `rm` and `uniq` from the tools the guard reads as running nothing, because they can replace a script it has already read. The population verifier showed `echo x > scripts/render-check.mjs` is read clean: the guard accepted the redirect and refused the tool, so the refusal bought nothing and refused `| tee outbox/x.txt`. I had classed it, in this round's first reading, as a deliberate trade for the owner; the reproduction (round 6, first table) shows the trade was not made, the premise failed.
