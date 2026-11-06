# Session record: the scan's cost, and a script it cannot finish (stream S1, finding scanner-diff 7)

Rule 67 record for one commit. Date 2026-11-05. Method and conditions are stated because the figures are measurements (Rule 73): node 22.22.0, a container with 4 cores shared by several jobs (load average about 2), so none of them is an idle figure.

## Reproduction

Cost. `scanNonCode` over text of `a / b / c;` lines: 51 KB 39 ms, 102 KB 93 ms, 205 KB 1.5 s, 307 KB 4.2 s; one line of `a/b/c...` 205 KB 3.7 s; text with no slash 307 KB 10 ms. Regex-dense text (`if (x) /a/g.test(y);`) 307 KB 0.8 s. The real tree: all 170 scripts under scripts/ (3.06 MB) in 111 ms; the largest, `mutation-check.mjs` (598 KB, 5,657 slashes), in 29 ms. The cost is per slash and grows with the output so far (slicing the end of a string built by appending), so the figure that matters is size times slashes, not bytes. The residuals CC-CMD item 4 says "306 KB takes 27 ms"; that is true of code with few slashes and says nothing about a file full of them, which is where it is two orders of magnitude worse.

Depth. Template expressions nested 2,847 deep scan and 2,848 do not (bisected); parentheses and braces 200,000 deep scan, they are not recursion. Today's behaviour, with 5,000 nested expressions put into `scripts/zone-check.mjs` of a scratch copy and `node scripts/row-confidence.mjs` run there: the scorer ends with `RangeError: Maximum call stack size exceeded` and a stack trace from `scanCode`, exit 1, no row scored. Nothing is swallowed and nothing scores 100, but the message names neither the script nor the limit, and one unreadable script costs every row its score.

## What was built

- The scanner's documentation has a COST AND LIMITS paragraph with the figures above, their date, method and conditions.
- `scanNonCode` turns the stack overflow into a RangeError that says "template expressions nested more than the call stack allows (about 2,800 levels on node 22)" and that the scan stops rather than return a text it did not finish. Every consumer of the scanner gets it.
- `nondeterminism` records an objection for a script whose scan throws (`scripts/zone-check.mjs: cannot be scanned (strip-non-code: template expressions nested more than the call stack allows ...)`), and the row drops below the bar with that message; with the same 5,000-deep file in the scratch copy the row scored 70 of 100 and every other row was scored.
- One clause: a 5,000-deep nest is an objection that carries the limit, a nest of 50 is the control and its read is counted. The label prints the depth and says what it does not cover.
- Three table entries: `row-scan-stack-overflow-unnamed`, `row-scan-unscannable-script-scores-clean`, `row-scan-unscannable-script-hides-the-reason`.

## Item 10.4, the output buffer, stays not built

Corrected trigger. The residuals CC-CMD gave "a 1.3 MB file of nothing but divisions". Measured, the cliff is between 102 KB (93 ms) and 205 KB (1.5 s) of slash-dense text, so the trigger is a script named by a gate row that is larger than about 100 KB and has a slash in every few characters, or any single scan that takes more than a second. Today the maximum is 29 ms and the whole tree 111 ms.

## Red evidence

`row-scan-stack-overflow-unnamed` against the clause: `scan threw "Maximum call stack size exceeded"`. `row-scan-unscannable-script-scores-clean`: `objections []` for the deep script. `row-scan-unscannable-script-hides-the-reason`: the objection without the scanner's message. Against the previous self-test, which has no such clause, the first mutant survives (exit 0). With the change the self-test is 27 of 27 and the real run scores 23 of 23 rows at or above 95. All 216 table entries on strip-non-code.mjs and row-confidence.mjs through the harness: 217 of 217 CAUGHT. Differential against acorn: 171 files, 0 divergences.
