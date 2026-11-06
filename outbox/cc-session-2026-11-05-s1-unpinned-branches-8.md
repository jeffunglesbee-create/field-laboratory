# Session record: two scanner branches no clause pinned (stream S1, finding scanner-diff 1)

Rule 67 record for one commit. Date 2026-11-05.

## Reproduction

The reviewer's battery of 193 mutants of the scanner (operators flipped, numerals moved by one, returns inverted, branches skipped) left two alive against every consumer self-test and the 23-row run. Both were applied to this tree and the self-test of the row scorer run: exit 0 for each.

- `src.indexOf('*/', i + 2)` changed to `i + 3`. For `const NOW = new Date() /**/ ; const x = Date.now() /* y */` the real scan leaves the second read; the mutant lets `/**/` run on to the closer of the next comment, and the bare `Date.now()` between them is hidden. The existing pair `a /*/ b */ c` pins `i + 1` only.
- `src[s + 1] === '/'` changed to `src[s + 0] === '/'` in `blankComments`. Every span that starts with a slash is then a comment, including a regular expression: `const re = /new Date\(\)/; run('node scripts/a.mjs')` loses its regular expression. The two consumers (check-script-orphans, short-circuit-check) hold no fixture with a regular expression in it, so both stayed green.

## What was built

- A STRIPS pair and a clock-count input for the empty block comment (`a /**/ b /* c */ d` leaves `a   b   d`; the bare read between the two comments is counted: `3/0`).
- One clause for `blankComments`, 11 inputs: a line comment, a block comment, one of several lines, an empty one, and a comment inside a template expression are blanked with their line feeds kept; a regular expression that names a script, a regular expression that begins with `=`, a string, a string that begins with `//` and one that begins with `/*` are kept; a regular expression and a comment after it on one line. The clause prints its denominator.
- Four table entries: `row-scan-empty-block-comment-runs-on`, `blank-comments-takes-a-regex-for-a-comment`, `blank-comments-misses-block-comments`, `blank-comments-takes-a-string-for-a-comment` (the last also exists for check-script-orphans, this one is killed by the scorer's own clause).

## Red evidence

Each entry applied to a copy fails its clause: `an empty block comment ends at its own closer ... left "a   d", wanted "a   b   d"` and `wanted 3/0, got 2/0`; `a regular expression that names a script is not a comment: left "x =                       ; y"`; `a block comment becomes spaces: left "a /* c */ b"`; `a string that begins with two slashes is not a comment: left "x =      ; y"`. With the change the self-test is 26 of 26 (one clause more). All 110 table entries on strip-non-code.mjs through the harness: 111 of 111 CAUGHT. Differential against acorn: 171 files and generator seeds 1 to 3 at 4,000 programs, 0 divergences.
