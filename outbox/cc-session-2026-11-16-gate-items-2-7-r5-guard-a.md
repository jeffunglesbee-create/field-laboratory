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

## Hygiene: the self-test left a temporary directory behind per fixture (not an item of the review)

Measured on this machine, whose disk is scarce: `row_pr` (the helper of the gate-rows fixtures) called `tempfile.mkdtemp()` and never removed the directory, so ONE run of
`python3 scripts/check-browser-gate.py --self-test` left 202 directories in `/tmp` (`before=35413 after=35615` around a single run); the 35,601 left by this session's runs were 521 MB of
`/tmp` and are removed now (identified by their content: `scripts/gate-checks.mjs` starting `// rows`; `/tmp` is 83 MB). `row_pr` and the two helpers this change added use a
`TemporaryDirectory` now; the same run leaves 0 (`leaked_per_run=0`), the self-test is 801/801 before and after. A separate commit, because it is a separate concern.

## Group 5: what a command writes for the steps after it (A29)

The reader dropped each redirect's target, so `echo "NODE_OPTIONS=--require /tmp/x.cjs" >> "$GITHUB_ENV"` read as `echo` and the step was called browser-free although it had changed what every
LATER step runs (the same names an `env:` key is refused for). `later_step_effects(text)` is asked of every command line (comment cut) in `read_commands` and makes the step unresolved, the same
way a dangerous `env:` key does, for: any use of `$GITHUB_PATH` or `${GITHUB_PATH}`; `$GITHUB_ENV` or `${GITHUB_ENV}` on a line that also has `NAME=` for a name `dangerous_var` knows
(`NODE_OPTIONS`, `PATH`, ..., `npm_config_node_options`, `NPM_CONFIG_SCRIPT_SHELL`); and any `.npmrc`. It fits in 22 lines of code (4 patterns, one function, one call). Not refused: the two
real `$GITHUB_ENV` writes of the exempt probes (`RELAY_SHA=$sha`, `STAMP=$STAMP`), `$GITHUB_OUTPUT`, the step summary, an npm key that changes no command.

| input | before | now |
|---|---|---|
| `echo "NODE_OPTIONS=--require /tmp/x.cjs" >> "$GITHUB_ENV"` (A29 a) | readable | unresolved: `it writes NODE_OPTIONS to $GITHUB_ENV, which changes what the commands of every later step run` |
| `echo "npm_config_node_options=..." >> "$GITHUB_ENV"` (A29 b) | readable | unresolved (same) |
| `echo "/tmp/shadow" >> "$GITHUB_PATH"` (A29 c) | readable | unresolved: `it writes to $GITHUB_PATH, which puts a directory first on the PATH of every later step` |
| `echo "script-shell=/tmp/sh" > .npmrc` (A29 d) | readable | unresolved: `it names a .npmrc file, which sets npm's own config ...` |
| `echo "RELAY_SHA=$sha" >> "$GITHUB_ENV"` | readable | readable |

Self-test: 801 to 812 (11 new checks: 8 inputs, the 11 dangerous names, the 8 clean lines, the audit). Red on purpose (`PASS [<id>]`; failing checks of the mutated copy):
`browser-gate-later-steps-github-path` 2, `-github-env` 6, `-dangerous-names` 2, `-npmrc` 2, `-comment-cut` 1, `-braces` 1, `-wired` 10.

## Results (the commands were run; denominators stated)

- `python3 scripts/check-browser-gate.py --self-test`: `715/715 checks passed` at 9043fa75; `812/812 checks passed` now (+12 group 1, +17 group 2, +4 group 3, +53 group 4, +11 group 5).
- `python3 scripts/check-browser-gate.py`: `verdict: gated`; `exits non-zero with ::error:: for 4 of 4` on each of the 4 target jobs (verify, live, the shard action, verify-full); `GATE ROWS: 23 read ... 7 flagged`.
- `python3 scripts/check-browser-gate.py --plain-commands`: 70 commands (unchanged: no fix changed what is plain).
- `node scripts/mutation-check.mjs --anchors`: `checked 1727 of 1730 mutation anchors; 0 stale` (1665 of 1668 at 9043fa75: +62 entries, all of this change).
- Red on purpose: 62 table entries added (10 + 17 + 5 + 23 + 7). 62 of 62 print `PASS [<id>]` from `node scripts/mutation-check.mjs --only <id>` (PASS = the mutated tree's self-test failed), and 62 of 62
  mutated COPIES of the guard failed with FAIL lines of the self-test (none crashed with a traceback, so none is a catch by accident). Denominator: the clauses this change added or changed, not the whole guard.
- Baselines not regressed: `node scripts/no-launch-check.mjs --self-test` 35/36 (the one failure is `the axis-check mutation needs build/ (run npm run build first)`, as at baseline);
  `node scripts/gate-mode.mjs --self-test` 32/32; `node scripts/delete-branches.mjs --self-test` 23/23; `node scripts/mutation-lib.mjs --self-test` 81/81 (run alone); the harness's own
  `node scripts/mutation-check.mjs --self-test` 221/221 (run by `npm run check:mutation-anchors`).
- `.githooks/pre-commit`, run by hand (`core.hooksPath` is unset in this checkout, so git does not run it; the guard that does run, `hook-staged-outbox.sh`, passes with this note staged): every check
  passes (clean-source, workflows, staged-outbox, staged-verifier, boundary, import-purity, mutation-anchors, short-circuit, setup-script) EXCEPT `check:citations`, which prints, verbatim,
  `FAIL  bare citations do not grow (budget 0)` / `-> 5 bare against a budget of 0. A ratchet: new citations must quote what they cite.` It prints the same 5 at 9043fa75 with this note moved
  aside, so it is not caused by this change: with `outbox/review-round-5-findings-2026-11-16.md` moved aside the same check prints `bare 0` and passes (its `File: ...:367`-style lines are the bare citations), and this note adds none. Not touched.

The 62 lines, verbatim:

```
PASS  [browser-gate-comment-brace-frame] a `#` inside `${ ... }` (`${y:- #}`) is not a comment, so what follows it is read
PASS  [browser-gate-comment-ansi-c-frame] a `#` after an escaped quote inside `$'...'` is not a comment
PASS  [browser-gate-comment-paren-count] parentheses inside `$( ... )` are counted, so the substitution ends at its own `)`
PASS  [browser-gate-comment-backtick-frame] a `#` inside a backtick pair is not a comment
PASS  [browser-gate-comment-escape] an escaped character (`a\ #b`, `\"` in a string) belongs to the word, so it neither starts a comment nor ends a quote
PASS  [browser-gate-comment-word-boundary] a `#` starts a comment only where a word begins (`a#b`, `x=#a` are no comment)
PASS  [browser-gate-comment-boundary-after-substitution] a `#` right after the `)` that closes `$( ... )` is part of the word, not a comment
PASS  [browser-gate-logical-lines-comment-ends-continuation] a backslash at the end of a comment does not join the next line (a comment ends at the newline)
PASS  [browser-gate-logical-lines-odd-backslashes] a backslash joins the next line only when the run of backslashes at the end is odd (`\\` is an escaped backslash)
PASS  [browser-gate-logical-lines-comment-line-after-continuation] a comment line that follows a continuation belongs to the joined line and ends it (only a comment line with nothing before it is dropped)
PASS  [browser-gate-final-name-in-env] a test in the final step may read only a variable of the step's own `env:`
PASS  [browser-gate-final-exit-range] `exit N` takes an integer from 1 to 255 (256 is refused)
PASS  [browser-gate-final-exit-nonzero] `exit N` takes a NON-ZERO literal (`exit 0` is refused)
PASS  [browser-gate-final-echo-env-names] an echo in the final step may print only a variable of the step's own `env:`
PASS  [browser-gate-final-echo-dollar] a `$` in a double-quoted echo string is only `$NAME`, `${NAME}` or `${NAME:-DEFAULT}`
PASS  [browser-gate-final-echo-whole-line] an echo line is an echo and nothing after it (no `; exit 0`, no comment)
PASS  [browser-gate-final-if-whole-line] a test line is `if [ ... ]; then` and nothing after it
PASS  [browser-gate-final-default-no-apostrophe] a `'` in the DEFAULT of `${NAME:-DEFAULT}` is refused (bash 5.2 reads it as the start of a quoted string)
PASS  [browser-gate-final-dq-no-backslash] a double-quoted echo string holds no backslash
PASS  [browser-gate-final-dq-no-backtick] a double-quoted echo string holds no backtick
PASS  [browser-gate-final-word-bare-charset] the bare WORD of a test is letters, digits and `_.:-` (no glob)
PASS  [browser-gate-final-word-quoted-charset] a quoted WORD of a test is the same characters (no space, no glob)
PASS  [browser-gate-final-echo-bare-charset] a bare echo word is letters, digits and `_.:,=/@%+-` (no glob)
PASS  [browser-gate-final-test-operators] a test's operator is `=`, `!=` or `==` (`>` is a redirect)
PASS  [browser-gate-final-else-fi-whole] `else` and `fi` stand alone on their lines
PASS  [browser-gate-final-closed-form-decides] a final step with a line outside the closed form is refused before it is run
PASS  [browser-gate-final-env-strings-only] a final step's env holds YAML strings only (`STRICT: true` is a boolean)
PASS  [browser-gate-npm-body-one-line] the npm script a required no-browser step runs is ONE command line
PASS  [browser-gate-npm-body-forbidden] the npm script a required no-browser step runs has no `||`, `&&`, `;`, pipe, `&`, redirect, backtick or `$(`
PASS  [browser-gate-npm-body-comment-cut] a trailing comment of the npm script is cut where bash cuts it before the forbidden characters are looked for
PASS  [browser-gate-npm-body-nested] the npm scripts a package script runs (`npm run inner`) are read with the same form
PASS  [browser-gate-npm-body-hooks] the pre and post hooks of the script the step runs are read with the same form
PASS  [browser-gate-rows-end-own-bracket] the rows array ends at its own `]`, so a `;` or a statement after it is no part of the last row
PASS  [browser-gate-rows-end-continuation] something that continues the expression after the array's `]` (`].concat(more)`) is refused
PASS  [browser-gate-rows-end-semicolon] a `;` may follow the rows array's `]`
PASS  [browser-gate-rows-end-statement-start] a statement after the rows array starts with a name on a later line: `(`, `[` and `.` there continue the expression
PASS  [browser-gate-rows-end-in-instanceof] `in` and `instanceof` on the line after the rows array's `]` continue the expression
PASS  [browser-gate-script-file-name] a string that is a script's file name, wherever it sits in a row, is a script the row runs
PASS  [browser-gate-script-file-read-exempt] a script path that a call which only READS takes is a file, not a run
PASS  [browser-gate-script-file-root] a script file name is looked for at the repository root as well as under scripts/
PASS  [browser-gate-script-file-python] a `.py` file name is run by python3, not node
PASS  [browser-gate-regex-word-typeof] a `/` after `typeof` starts a regular expression
PASS  [browser-gate-regex-word-in] a `/` after `in` starts a regular expression
PASS  [browser-gate-regex-word-do] a `/` after `do` starts a regular expression
PASS  [browser-gate-regex-word-property] a word after a `.` is a property name, so a `/` after it is a division
PASS  [browser-gate-regex-word-remembered] the scanner remembers a keyword as the last significant token
PASS  [browser-gate-importer-called] the rows reader also reads the files that import `rows` from gate-checks.mjs
PASS  [browser-gate-importer-push] `rows.push(...)` in a file that imports rows is refused
PASS  [browser-gate-importer-copywithin] `rows.copyWithin(...)` in a file that imports rows is refused
PASS  [browser-gate-importer-alias] `{ rows as gateRows }` and `{ rows: r }` bind the array under another name
PASS  [browser-gate-importer-index-assign] `rows[0] = ...` in a file that imports rows is refused
PASS  [browser-gate-importer-length-assign] `rows.length = 0` in a file that imports rows is refused
PASS  [browser-gate-importer-reassign] `rows = []` in a file that imports rows is refused
PASS  [browser-gate-importer-non-braced] an import of gate-checks.mjs that is not `{ names }` cannot be attributed and is refused
PASS  [browser-gate-importer-shadow] a `const`/`let`/`var rows` in a function is a new variable, not a change to the import
PASS  [browser-gate-later-steps-github-path] a step that writes to `$GITHUB_PATH` changes the PATH of every later step and is unresolved
PASS  [browser-gate-later-steps-github-env] a step that writes a dangerous variable to `$GITHUB_ENV` changes what every later step runs and is unresolved
PASS  [browser-gate-later-steps-dangerous-names] every name dangerous_var knows (not only NODE_OPTIONS) written to `$GITHUB_ENV` is refused
PASS  [browser-gate-later-steps-npmrc] a step that names a `.npmrc` file sets npm's config for every later `npm run` and is unresolved
PASS  [browser-gate-later-steps-comment-cut] a mention in a trailing comment is no write
PASS  [browser-gate-later-steps-braces] `${GITHUB_ENV}` in braces is the same file as `$GITHUB_ENV`
PASS  [browser-gate-later-steps-wired] read_commands asks every command line what it writes for the steps after it
```

## Sweep entries touched (outbox/browser-gate-sweep-2026-11-12.mjs, NOT edited)

The CODE array has 428 entries. Each entry's `find` text was counted in the guard at 9043fa75 (1 time each) and in the final file: 13 entries no longer find it (count 0), none occurs more than once.
Index in the CODE array and name:

| index | name | the text that is gone | where it went |
|---|---|---|---|
| 13 | `a \`#\` inside a word starts a comment` | `elif c == "#" and (not out or out[-1].isspace() or out[-1] in ";&\|()"):` | `comment_start` (`elif c == "#" and was_top and boundary:`) |
| 22 | `a backslash-continued command is read line by line` | `if line.endswith("\\"):` | `logical_lines` (odd run of backslashes and `comment_start(text) is None`) |
| 47 | `the final step grammar is not applied` | `if grammar:` + `bad.append(f"the final step {name} must use only echo` | `final_step_problems` (`must be made only of these lines`) |
| 48 | `the final step may use any command` | `if head not in FINAL_HEADS:` | `final_line_problem` (generic reason, `exit`, `echo`, tests) |
| 49 | `the final step may use more commands (cat, false, true)` | `FINAL_HEADS = frozenset(...)` | removed with the head test |
| 50 | `exit may take any argument` | `elif head == "exit" and not (len(w) == 2 and re.fullmatch(r"[1-9][0-9]*", w[1])):` | `FINAL_EXIT` and the range test in `final_line_problem` |
| 51 | `a test may use file operators` | `elif head in ("[", "test") and any(x.startswith("-") for x in w[1:]):` | `FINAL_IF` (nothing but `"$NAME" OP WORD`) |
| 52 | `the final step may pipe and redirect` | `if stray:` + `bad.append(f"\`{line[:60]}\`: {stray[0]!r}` | `FINAL_ECHO` / `FINAL_ARG` (a redirect or pipe is no word of an echo) |
| 296 | `comments in the rows array are read as code` | `body = _blank_comments(text[at:end])` | `blanked = _blank_comments(text[at:])`, `body = blanked[:end]` |
| 297 | `the words inside a string are read as code` | `shape = _blank_strings(body)` | `shape_all = _blank_strings(blanked)`, `shape = shape_all[:end]` |
| 383 | `a \`/\` after a name or a \`)\` can start a regular expression` | `(prev == "" or prev in REGEX_AFTER or prev in ("=>", "return"))` | `js_tokens` (`prev == "=>" or prev in REGEX_AFTER_WORDS`) |
| 384 | `a \`/\` after \`=>\` does not start a regular expression` | `prev in REGEX_AFTER or prev in ("=>", "return")` | same |
| 385 | `a \`/\` after \`return\` does not start a regular expression` | `prev in REGEX_AFTER or prev in ("=>", "return")` | same |

(Entries 47 to 52 mutate the old tokeniser's clauses; the new clauses are mutated by the 17 `browser-gate-final-*` table entries instead.)

## Residual (CONTRIVED: only an input written to evade passes; each is filed as a candidate for the next CC-CMD, Rule 87.4)

Each input below was run on the final guard and PASSES (read clean), at this commit.

1. **A26, a regular expression after `)`**: row `() => { if (s) /it's/.test(s); return ok('node scripts/render-check.mjs') }`. `/` after `)` is a division or a regular expression depending on what the
   `)` closes; only a parser can tell (`(a) / 2` against `if (a) /re/`). Contrived: ordinary code puts a regular expression after `=`, `(`, `&&` or `return`; a bare regex statement after a control
   head with an apostrophe in it is written to hide a call. `await /it's/.test(s) && ok(...)` (and `yield`) passes for the same kind of reason: not in the task's list of keywords.
2. **A29, a name built at run time**: `V="NODE_OPTIONS=--require /tmp/x.cjs"` on one line and `echo "$V" >> "$GITHUB_ENV"` on the next (the `$GITHUB_ENV` line carries no `NAME=`); `N=NODE_OPTIONS`
   then `echo "$N=--require /tmp/x.cjs" >> "$GITHUB_ENV"`. Contrived: needs an indirection to write a name the guard looks for.
3. **A27, an alias or an element mutation in an importer**: `import { rows } from './gate-checks.mjs'` then `const r = rows` then `r.push({...})`; `rows.forEach(r => { r.browser = false })`. An importer outside
   `scripts/` is not scanned either. Contrived: an alias exists only to hide the push from a reader that looks for `rows.push`.
4. **A25, a script name built from pieces**: `() => cp.spawnSync(process.execPath, ['shot' + '.mjs'], { cwd: 'scripts' })` (the string is no whole file name), or a name that is no file when the guard runs.
   Contrived: a file name written in two literals.

## Noticed, not fixed (Rule 69)

- `scripts/check-doc-citations.mjs` fails at 9043fa75 (5 bare citations against a budget of 0), see above; measured: the 5 are in `outbox/review-round-5-findings-2026-11-16.md`, a file of another session (moved aside: `bare 0`).
- `strip_comment` (used by the command splitter, the later-step check, the required step's closed form and its npm-body check) treats a `#` inside `$( )` as text where bash calls it a comment: the reader sees more than bash runs, the safe direction, and a fixture pins one such input (`echo $( (a) # b ) ; exit 0`).
- `logical_lines` still `rstrip()`s each physical line before looking for the trailing backslash, so `echo a \ ` (a backslash and a space) is joined with the next line although bash reads an escaped
  space there. The joined text hides the next line's head as an argument. Measured on the final guard: the final step `echo "::error::x" \ ` then `exit 0` is read as one echo line and refused only because the
  run under bash exits 0 (`exit 0, so the job would be GREEN`); the required no-browser step refuses any line that does not start with `echo `, `node ` or `npm `. Not in the review; not touched.
