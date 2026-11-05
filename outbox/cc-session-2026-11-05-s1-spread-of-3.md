# Session record: a regular expression after a spread and after the of of a for-of header (stream S1, finding scanner-diff 2)

Rule 67 record for one commit. Date 2026-11-05.

## Reproduction

    f(.../`/.exec(x))<newline>Date.now()            reads 0 (merged tree, and the 4eceb98 scan)
    var a = [.../`/.exec(x)]<newline>Date.now()     reads 0
    for (const m of /`/g.exec(y)) {}<newline>Date.now()   4eceb98 reads 1, merged tree reads 0

The first two: `.` was not in the punctuation list and `isPropertyDot` excludes `...` for keywords, so nothing ever told the scan that a spread is followed by an expression; the backtick in the regular expression opened a template that swallowed the rest of the file. The third is the `of` that residuals Task 10 item 16 took out of the keyword list, so that `var of = 4; of / 2` divides.

The reviewer's generator with `SPREAD=1` (spread shapes in calls and arrays), seed 4 at 6,000 programs: 865 divergences from the acorn oracle with the scanner as it was, 1 after (the `await` limitation at the end of this note). Seeds 1 to 14 at 6,000 programs after: 1 in total. The generator now also asks V8 whether each program parses, because acorn tokenizes an optional-chained keyword property followed by a line feed and a slash wrongly.

## What was built

- A slash after `...` begins a regular expression.
- `of` is a keyword where an operator can stand and a name where an expression begins, decided the way acorn decides it: it is the keyword when a slash could not begin a regular expression in front of it (`allowedAfter` on the text before the `of`). `for (x of /re/...)`, `for (const [a] of ...)` and `for await (... of ...)` are regular expressions; `= of / 2`, `in of / 2`, `; of / 2`, `if (x) of / 2`, `return of / 2`, `f(...of / 2)` divide, and so does `of / 2` at the start of the text.
- `regexAllowed` now reads the window and hands the text to `allowedAfter`, which the `of` rule calls on the text before it.
- Eleven STRIPS pairs; two clock-count inputs (a backtick in a regular expression after a spread and after the `of` of a for-of header, each followed by two bare reads).
- Six table entries: `spread-then-regex-read-as-division`, `for-of-regex-read-as-division`, `of-keyword-and-name-swapped`, `of-always-the-keyword`, `of-head-not-trimmed`, `of-head-cut-short`. `kw-of-back` (put `of` back in the keyword list) would have become an equivalent mutant if the `of` rule ran before the keyword list; the rule runs after it, and the entry is CAUGHT.

## Red evidence

Against the scanner as it was: `stripped text ... (5 wrong of 164)` and `wanted 2/0, got 0/0` for both new count inputs (the rest of the file was lost). With the change: 25 of 25. All 103 table entries on strip-non-code.mjs through the harness: 104 of 104 CAUGHT. Each new entry is killed by the clause that names its construct (checked by applying each to a copy and reading the failing clauses).

## Not covered (stated in the scanner)

`for (const {a} of /re/...)`: a `}` is read as the end of a block, so the `of` after a destructuring pattern in braces is read as a name. Separately, `await` is a keyword to this scan everywhere; in a script, outside an async function, it is an identifier (`var await = 4; await / 2`) and a slash after it divides. That one was there before and is not changed here.
