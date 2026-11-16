# Round 5 of items 2 to 7, the Chromium guard, part A: B1 to B7 and A24 to A29 (session note, 2026-11-16)

Branch `proof-r5-guard-a`, from 9043fa75. Files: `scripts/check-browser-gate.py` and the mutation table in `scripts/mutation-check.mjs` (entries `browser-gate-*`, one per clause added, inserted
before the `venue sourcing` header). The record being answered is `outbox/review-round-5-findings-2026-11-16.md`. One commit per numbered group of the task.

Method for every clause: the fixture is written in the guard's own `--self-test` (literal lists, asserted equal to the intended set), then the clause is broken by ONE find/replace
(anchor asserted to occur exactly once and to change the file), and the break is shown red twice: by `node scripts/mutation-check.mjs --only <id>` (`PASS [<id>]` = the mutated tree's
self-test failed) and by running the mutated COPY's self-test to count its FAIL lines (so a crash is not mistaken for a catch). Every mutant below failed with FAIL lines and none
crashed.

## Classification (Rule 77: what an ordinary edit would do)

| item | class | why |
|---|---|---|
| B1, backslash route (`echo hi # note \` then the next line) | REACHABLE | a comment that ends in a backslash (a Windows path, a line-continuation habit) is ordinary text; the next line vanished from every reader |
| B1, `${y:- #}`, `${x/ #/z}`; A24 `$'a\'b # c'` | CONTRIVED as inputs, closed BY CONSTRUCTION | only an input written to evade puts a `#` there; the state machine closes the cluster at small cost, so it is fixed |
| B2, B3, B4, B6, A28 (final step) | CONTRIVED as inputs, closed BY CONSTRUCTION | each needs a runner-only variable, an indirection, a glob or a YAML boolean in an outcome test; the whitelist replaces the tokeniser, so it is fixed |
| B5 (`|| true` or `exit 0` in the npm body) | REACHABLE | adding `|| true` to a package script is an ordinary habit; the closed form bound the workflow line but not the body it delegates to |
| B7 (`];` or a statement between `]` and `export {`) | REACHABLE | a trailing semicolon or a helper after the array is an ordinary edit; the guard went red with a misleading message |
| A25 (bare script name in a row) | REACHABLE | `spawnSync('node', ['render-check.mjs'], { cwd: 'scripts' })` is how a script is spawned from a script |
| A26 (regex after `typeof`, `void`, ...) | CONTRIVED, closed by a closed set of keywords | a regex with an apostrophe after one of those words; the keyword set is the construction. The `if (s) /it's/` variant is residual (below) |
| A27 (`rows` changed in an importer) | REACHABLE | a `rows.push(...)` in `confidence.mjs` between its inventory comparison and its loop is not seen by anything |
| A29 (`$GITHUB_ENV`, `$GITHUB_PATH`, `.npmrc`) | CONTRIVED as inputs; fixed (it fits in about 40 lines) | |

## Group 1: the comment cutter (B1, A24)

`strip_comment` was a hand-written approximation of where bash starts a comment. It is now `comment_start`, a state machine over a stack of what is open (`'`, `"`, `$'`, `${`,
`$(` with its parentheses counted, a backtick pair); a `#` is a comment only at the top level and only where a word begins (the start, whitespace, or one of `; & | ( )` that is not the
`)` of a `$( )`). It reads MORE than bash runs where bash itself would call a `#` inside `$( )` a comment: the safe direction. `$"..."` needs no clause of its own (it is `"` after a `$`).
`logical_lines` now asks `comment_start` whether the trailing backslash is inside a comment (it ends at the newline, so the next line is NOT joined), and a comment line that follows a
continuation ends the joined line instead of being dropped (the line after it was joined onto the line before it).

| input | before (9043fa75) | now |
|---|---|---|
| `echo ${y:- #}; exit 0` then `npm run gate:browserless` (B1 a) | cut at ` #}`: `exit 0` unread, `verdict: gated` | refused: `must run scripts/confidence.mjs --browserless as real work` |
| `node scripts/confidence.mjs --browserless ${y:- #}\|\| true` (B1 b) | the `\|\| true` unread | refused |
| `echo skipping # note \` then `exit 0` then the spawner (B1, backslash route) | `exit 0` joined onto the comment and vanished | refused (3 lines: `exit 0` is read) |
| `echo ${y:- #}; node scripts/render-check.mjs` and `echo hi # note \` then the launch (B1 c) | read as `echo`: the step needs no browser | `needs_browser` is True, and without the gate the step is refused |
| `echo $'it\'s # x' ; exit 0` then the spawner (A24) | cut at ` #` after the `\'` | refused |

Self-test: 715 (`python3 scripts/check-browser-gate.py --self-test`, 9043fa75) to 727 (12 new checks: one table of 38 `comment_start` inputs with their indexes, `strip_comment`, a table of 6
`logical_lines` scripts, 6 required-step inputs, the accepting control, 2 browser-step inputs).

Red on purpose (`node scripts/mutation-check.mjs --only <id>`, each `PASS [<id>]`; and the mutated copy's own FAIL lines, counted):

| id | the break | failing checks of the mutated copy |
|---|---|---|
| `browser-gate-comment-brace-frame` | `${` is not an opener | 6 |
| `browser-gate-comment-ansi-c-frame` | `$'` is not an opener | 2 (the A24 input among them) |
| `browser-gate-comment-paren-count` | parentheses inside `$( )` are not counted | 1 |
| `browser-gate-comment-backtick-frame` | a backtick pair is not an opener | 1 |
| `browser-gate-comment-escape` | a backslash escapes nothing | 2 |
| `browser-gate-comment-word-boundary` | a `#` mid-word is a comment | 3 |
| `browser-gate-comment-boundary-after-substitution` | the `)` closing `$( )` ends a word | 1 |
| `browser-gate-logical-lines-comment-ends-continuation` | a backslash ends a comment's line like any other | 3 (the B1 backslash route among them) |
| `browser-gate-logical-lines-odd-backslashes` | `endswith("\\")` instead of an odd run | 1 |
| `browser-gate-logical-lines-comment-line-after-continuation` | a comment line after a continuation is dropped, as before | 2 |

## Group 2: the final step is a closed form (B2, B3, B4, B6, A28)

`final_script_problems` tokenised each line and refused what looked foreign; each missed spelling was a hole (a `#` that was no comment, an assignment line, an unquoted glob, `~`, YAML
`true` stringified as `True`). It is replaced by a WHITELIST: every logical line of the final step's script must be, whole and with nothing after it (a whole-line comment is dropped
first), one of `if [ "$NAME" OP WORD ]; then`, `elif [ "$NAME" OP WORD ]; then`, `else`, `fi`, `exit N` (a literal integer 1 to 255) and `echo ARG...` (`FINAL_IF`, `FINAL_EXIT`,
`FINAL_ARG`, `FINAL_ECHO`, `FINAL_REF`, `FINAL_SHAPES`, `final_line_problem`). NAME is a variable of the step's own `env:`; OP is `=`, `!=`, `==`; WORD is a bare run of `A-Za-z0-9_.:-`
or the same in double quotes (an empty `""` too: an outcome can be empty); an ARG is a bare run of `A-Za-z0-9_.:,=/@%+-` or a double-quoted string with no backtick and no backslash whose
`$` is only `$NAME`, `${NAME}` or `${NAME:-DEFAULT}`. One departure from the task's text, measured: DEFAULT is also free of `'`, because bash 5.2.21 here reads the `'` of
`echo "${x:-it's}"` as the start of a quoted string and stops with `unexpected EOF while looking for matching` (so the guard's run and a runner on another bash could differ).
Every other punctuation character I probed inside a quoted DEFAULT (`~ * ? [a] {a ! # (a) a;b a&b a|b <a> a:b ~root`) printed literally, with HOME set or not.
`final_step_problems` now refuses an env key or value that is not a Python `str` (YAML bool, int, float, null, list) with the advice to quote it, before the closed form and before any run;
the run-it-for-4-outcomes check is unchanged and still follows. Narrower than before, on purpose: `test`, `[[`, `${NAME}` inside a test, `[ a = b ]`, two variables in one test, and an echo
that prints a variable the step's env lacks are refused now (they were accepted). The four real final steps (verify.yml, verify-full.yml, live-check.yml, the mutation-shard action)
are inside the form untouched: `python3 scripts/check-browser-gate.py` prints `exits non-zero with ::error:: for 4 of 4` for each of the four jobs, and a self-test check parses the
four files and asserts it (4 of 4).

| input (the final step's script) | before (9043fa75) | now |
|---|---|---|
| `echo "::error::..." ${y:- #}; if [ "$GITHUB_ACTIONS" != true ]; then exit 1; fi` (B2) and its backslash route | accepted: `4 of 4`, `verdict: gated` | refused (`echo takes only words ...`; the next line's test refused for its variable) |
| `X=$GITHUB_ACTIONS` then `if [ "$X" != true ]; then ...` with env `X: a` (B3) | accepted | refused (`is not echo, exit or a test`) |
| `if [ * != x ]; then ...` (B4); `if [ * = "*" ]; then` (A28 a); `if [ ~ != /home/runner ]; then` (A28 b) | accepted | refused (`must be exactly if [ "$NAME" = WORD ]; then`) |
| env `STRICT: true` (a YAML boolean) with `if [ "$STRICT" != true ]; then ...; exit 1; fi` (B6) | accepted (the run saw `True`) | refused: `which YAML reads as bool ... Quote the value`; `STRICT: "true"` is accepted |

Self-test: 727 to 744 (17 new checks, one of them over a literal list of 14 accepted lines, one over 71 near-misses, one over the characters of each class).

Red on purpose (`PASS [<id>]` from `node scripts/mutation-check.mjs --only <id>`; failing checks of the mutated copy in the second column):

| id | the break | failing |
|---|---|---|
| `browser-gate-final-name-in-env` | a test may read any NAME | 3 |
| `browser-gate-final-exit-range` | `exit 256` accepted | 1 (the near-miss list) |
| `browser-gate-final-exit-nonzero` | `exit 0` accepted | 2 |
| `browser-gate-final-echo-env-names` | an echo may print any variable | 3 |
| `browser-gate-final-echo-dollar` | a stray `$` in an echo accepted | 1 |
| `browser-gate-final-echo-whole-line` | text after an echo accepted (`.match`) | 4 (B2 among them) |
| `browser-gate-final-if-whole-line` | text after `then` accepted | 1 |
| `browser-gate-final-default-no-apostrophe` | `'` allowed in DEFAULT | 1 |
| `browser-gate-final-dq-no-backslash` / `-dq-no-backtick` | a backslash / a backtick allowed in a quoted string | 2 / 2 |
| `browser-gate-final-word-bare-charset` / `-word-quoted-charset` | `*` allowed in a bare WORD / anything allowed in a quoted WORD | 2 / 3 |
| `browser-gate-final-echo-bare-charset` | `*` allowed in a bare echo word | 2 |
| `browser-gate-final-test-operators` | `>` allowed as OP | 1 |
| `browser-gate-final-else-fi-whole` | `else echo x` accepted | 1 |
| `browser-gate-final-closed-form-decides` | the closed form's verdict ignored | 31 |
| `browser-gate-final-env-strings-only` | non-string env accepted | 5 (all five B6 inputs) |

## Group 3: the npm body of the required no-browser step (B5)

`flagged_step_ok` refused `||`, `&&`, `;`, pipes and the rest on the step's own lines, but for `npm run gate:browserless` the commands were read from the package.json body, where
`exit 0; node scripts/confidence.mjs --browserless`, `node scripts/confidence.mjs --browserless || true` and `...; exit 0` were accepted. `read_commands` now also returns `bodies`, every
package script the step runs (pre/post hooks and nested `npm run`s included), and `flagged_step_ok` requires each to be ONE logical line with none of `FORBIDDEN_IN_LINE` after the
comment is cut (`strip_comment`, group 1). A bare `npm ci` that runs a `prepare` hook is read the same way (the fixture `pkg` has one-line hooks and still passes).

| body of `gate:browserless` | before | now |
|---|---|---|
| `exit 0; node scripts/confidence.mjs --browserless` | accepted | refused |
| `node scripts/confidence.mjs --browserless \|\| true` | accepted | refused |
| `node scripts/confidence.mjs --browserless; exit 0` | accepted | refused |
| `node scripts/confidence.mjs --browserless` (the real body) | accepted | accepted |

Run on both modules (the 9043fa75 file and this one) with the review's three bodies and the real one: old `True True True True`, new `False False False True`.

Self-test: 744 to 748 (4 new checks: 11 refused bodies and the real one accepted, hooks and a nested script with a forbidden character refused and plain ones accepted, the comment
cut, the real package.json read from the repository).

Red on purpose (`PASS [<id>]`; failing checks of the mutated copy):

| id | the break | failing |
|---|---|---|
| `browser-gate-npm-body-one-line` | a two-line body accepted | 1 |
| `browser-gate-npm-body-forbidden` | the forbidden characters of a body not looked for | 3 |
| `browser-gate-npm-body-comment-cut` | a body's trailing comment not cut first (`# a; b` refused) | 1 |
| `browser-gate-npm-body-nested` | only the first script's body read | 1 |
| `browser-gate-npm-body-hooks` | only the named script's body, not its hooks | 1 |

## Group 4: the rows reader (B7, A25, A26, A27)

**B7.** `gate_rows` cut the array at the first `\nexport {`, so a `];` or any statement between the array's `]` and `export {` made the last row "not followed by a comma" (a false
red). The array now ends at its OWN `]` (`_matching_bracket` on the text with comments and strings blanked). What may follow is `ROWS_END`: a `;`, the end of the file, or a NEW
statement that starts with a name on a later line; `].concat(more)`, `].map(...)`, `][0]`, a `(` or `[` or `.` on the next line, and `in`/`instanceof` there continue the expression
and are refused (`changes the array that is exported`). Something between ROWS is still refused (unchanged). Two finding-27 fixtures changed: a statement after the array
(`]\nrows.push(1)`) is now refused only for the stray `rows` (it was also told its last row had no comma, which it has), and `].concat(more)` is refused for the new message.

**A25.** Every string literal in a row that is, whole, a script file name (`[\w./-]+\.(mjs|cjs|js|py)`), not taken by a call that only reads (`have`), and names a file that exists under
`scripts/` or at the root, is now a command of the row (`node scripts/x.mjs`, `python3 scripts/x.py`), wherever it sits: `['render-check.mjs'], { cwd: 'scripts' }`,
`path.join('scripts', 'render-check.mjs')`, `['scripts/' + 'render-check.mjs']`. `gate_row_problems` then reads it like any other command, so a browser script behind it in a row that
is not flagged is refused, and one in a flagged row is accepted. The real file reads clean (`GATE ROWS: 23 read ... 7 flagged`, unchanged).

**A26.** `REGEX_AFTER_WORDS` (the task's eleven plus `return`): after one of them a `/` starts a regular expression; a word after a `.` is a property name (`cfg.do / 2` is a division).
The case after `)` (`if (s) /it's/.test(s)`) cannot be told from a division without parsing: residual, below.

**A27.** READ, not run: `scripts/confidence.mjs` line 50 imports `rows`; line 110 `const inventoryProblems = diffAgainst(readInventory(), rows)` compares NAMES AND WEIGHTS once
(`scripts/gate-inventory.mjs` lines 51 to 65: two maps, name to weight, nothing about `browser`); line 145 `for (const row of rows)` runs the array. So a `rows.push(...)` placed after
line 110 and before line 145 is compared by nothing, and one placed between lines 51 and 109 is refused only if its name or weight is undeclared in `docs/gate-rows.txt`, and says nothing
about whether the row drives a browser. NOT ALREADY_COVERED. `importer_rows_problems(root)` now reads every `scripts/*.mjs|cjs|js` that imports `rows` from gate-checks.mjs (`{ rows }`,
`{ rows as r }`, `{ rows: r }`; static, `await import`, `require`) and refuses a use of the binding that is an Array mutator (`ARRAY_MUTATORS`, nine methods), an index or `length`
assignment, or a reassignment; an import that is not `{ names }` is refused as unattributable. Real tree: 7 importers found (confidence.mjs, gate-inventory.mjs, gate-mode.mjs as
`gateRows`, row-confidence.mjs, run-row.mjs, sharded-row-check.mjs; outbox-row-check.mjs imports no `rows`), 0 problems, 0.10 s.

| input | before | now |
|---|---|---|
| `];` after the array; `]` then `const helperLater = 1` then `export {` (B7) | refused: `gate row 'p19' is not followed by a comma ...` (a false red) | clean |
| `['shot.mjs'], { cwd: 'scripts' }`; `path.join('scripts', 'shot.mjs')`; `['scripts/' + 'shot.mjs']` in an unflagged row (A25) | clean (`verdict: gated`) | refused: `drives a browser (by its commands) and is not flagged` |
| `() => typeof /it's/ === 'object' && ok('node scripts/shot.mjs')`; `() => void /it's/ \|\| ok(...)` (A26) | clean | refused: `drives a browser` |
| `rows.push({...})` in an importer of `rows` (A27) | clean | refused: `scripts/importer.mjs changes `rows`, the array it imports ...` |

(Run on the 9043fa75 file and this one over temporary roots with the review's inputs; old/new columns are those runs.)

Self-test: 748 to 801 (53 new checks: 4 clean and 9 refused array ends, 5 A25 rows and the controls, 12 A26 words, the property name case and a token table, 9 mutators and 7 importer
shapes, the unattributable import and the clean importers).

Red on purpose (`PASS [<id>]`; failing checks of the mutated copy):

| id | the break | failing |
|---|---|---|
| `browser-gate-rows-end-own-bracket` | the array runs to the end of the file | 35 |
| `browser-gate-rows-end-continuation` | `].concat(more)` accepted | 10 |
| `browser-gate-rows-end-semicolon` | `];` refused | 2 |
| `browser-gate-rows-end-statement-start` | `(`, `[`, `.` allowed to start the next statement | 3 |
| `browser-gate-rows-end-in-instanceof` | `in`/`instanceof` allowed to start the next statement | 2 |
| `browser-gate-script-file-name` | a bare script file name is no command | 6 |
| `browser-gate-script-file-read-exempt` | a path a read call takes is a run | 4 |
| `browser-gate-script-file-root` | files at the root not looked for | 1 |
| `browser-gate-script-file-python` | a `.py` run by node | 1 |
| `browser-gate-regex-word-typeof` / `-in` / `-do` | a member of REGEX_AFTER_WORDS deleted | 3 / 3 / 3 |
| `browser-gate-regex-word-property` | a word after `.` is a keyword | 2 |
| `browser-gate-regex-word-remembered` | no keyword remembered | 16 |
| `browser-gate-importer-called` | the importers are not read | 17 |
| `browser-gate-importer-push` / `-copywithin` | a mutator deleted | 3 / 2 |
| `browser-gate-importer-alias` | the alias is not followed | 2 |
| `browser-gate-importer-index-assign` / `-length-assign` / `-reassign` | that alternative deleted | 1 / 1 / 1 |
| `browser-gate-importer-non-braced` | `import * as` accepted | 1 |
| `browser-gate-importer-shadow` | a `let rows` in a function counts as a change | 1 |
