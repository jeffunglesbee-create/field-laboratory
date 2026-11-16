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
