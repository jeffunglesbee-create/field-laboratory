# Session record — whether a row passes the exempt flag is read from the whole command and the whole row (review 7, C4)

Date 2026-11-05. Scope: `scripts/row-confidence.mjs` (`declIn`/`declOf`, `commandsOf`,
`passesFlag`), 18 new table entries and two re-anchored ones in `scripts/mutation-check.mjs`.

## Reproduction, run first
In a scratch copy, each edit made to `scripts/gate-checks.mjs`, then `node scripts/row-confidence.mjs`.
Control, `--url https://example.test/x` appended to the first drift-check command: `70/100`, exit 1.
The same flag hidden three ways gave `23/23 rows at or above 95`, exit 0 each time:
a double-quoted argument first (`--file "data/context-2026-05-15.json" --url ...`), a command written
after a blank line of the row, and two strings joined by `+`. The skeptic's extra finding also
reproduced: a whole SCRIPT (`mutation-await.mjs` added to the REJECT row) after a blank line stays 100.
Severity medium holds: no current row has a quoted argument before an exempt flag or text after a blank
line (checked below), so it is a latent hole, not a wrong verdict today.

## Built (the skeptic's smaller fix, with one correction)
- `declIn(source, rowName)`: a row's declaration runs to the next row's `{ name:` or the `]` that closes
  the table, not to the first blank line. `declOf` is `declIn` over the gate's source. Per-row script lists
  for all 23 rows are identical before and after (compared by script: 0 differ).
- `commandsOf`: a command runs to the next script path or the next `ok(`, `fails(` or `all(` call. The
  skeptic's cut was the next `scripts/`; that would hide a flag after `--file scripts/x.json`, so the cut
  is a script PATH (`scripts/<name>.mjs`), the same pattern `scriptsIn` uses.
- `passesFlag`: tokens split at whitespace and at all three quote characters, so `'--url` from a `' + '`
  join is `--url`.
- Two clauses: 18 commands (12 pass the flag, 6 do not) and 4 declaration extents on a table written for
  the case; two end-to-end cases added to the exemption clause (13 cases to 15).
- 18 entries, one per guard (each quote kind, the next-script cut, the ok/fails/all cuts, the word
  boundary, whitespace-only and single-space splits, `some` to `every`, and the four ends of a declaration).
  Two existing entries re-anchored because their `find` text moved (`network-exempt-reads-the-rest-of-the-row`,
  `network-exemption-goes-stale`).

## Red evidence
By hand, 20 mutants of the new code against `--self-test`: 19 caught, 1 survived, and the survivor is
equivalent (`split(/[\s'"`]/)` without the `+` quantifier yields empty tokens, which match nothing). Three
non-equivalent mutants survived the first clause set (drop `fails`, drop `all`, drop the `\b`) and the three
cases `fails(`, `all(` and `book(` were added for them. Through the harness: `node scripts/mutation-check.mjs
--ids <the 18 plus the two re-anchored>` printed `PASS` for each and `21/21 checks passed`. End to end, the
three hiding shapes and the whole-script case in the scratch copy now give `70/100`, exit 1.

## Not verified
- Arguments built at run time (a variable, the environment, a template's expression) are still not seen;
  the clause label says so.
- A call followed by a text that is not an `ok(`, `fails(` or `all(` call is read as that command's arguments
  (`ok('node a.mjs') && other('--url')` would count `--url` for `a.mjs`): fail-closed, a red row.
