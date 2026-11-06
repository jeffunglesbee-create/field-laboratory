# Session record: a multi-line block comment is a line end in the stripped text (stream S1, finding scanner-diff 3)

Rule 67 record for one commit. Date 2026-11-05.

## Reproduction

    var a = 1; a /*<lf>*/ ++/`/.lastIndex<newline>Date.now()    reads 0

A comment that holds a line terminator counts as one for automatic semicolon insertion, so the `++` here is a prefix and the slash after it begins a regular expression. The scanner replaced every block comment with one space, the `++` test (which stops at a line end) never saw the line end, read the `++` as a postfix and the slash as division, and the backtick opened a template that took the rest of the text. The same for a carriage return, U+2028 and U+2029 in the comment. acorn's text: `a   ++0.lastIndex` and the read after it.

## What was built

- A block comment that holds a line feed, a carriage return, U+2028 or U+2029 leaves a line feed in the stripped text; one that holds none still leaves one space. `blankNonCode` and `blankComments` work from spans and are unchanged.
- Seven STRIPS pairs (a line feed, a CR LF, a CR, U+2028 and U+2029 before a `++` and a regular expression; a one-line comment before a `++` that still divides; a comment of several lines leaves one line feed) and one clock-count input.
- Table: three new entries (`comment-with-a-line-end-is-a-space`, `comment-line-end-is-a-line-feed-only`, `every-comment-is-a-line-end`); `row-scan-keeps-block-comments` and `exit-blank-keeps-block-comment` were re-anchored on the new line.
- The acorn oracle of the differential now writes the same line feed for such a comment.

## Effect on the tree

`clockCounts` of every script under scripts/ (170), before this change and after: no difference in reads, captures or network use. A capture split by a multi-line comment (`const NOW = /*<lf>*/ new Date()`) is not recognised as one any more, because the capture pattern is bound to one line; nothing in the tree has the shape, and the failure is in the safe direction (a read that is not a capture is flagged).

## Red evidence

Against the scanner as it was: `FAIL ... for 171 inputs ... (6 wrong of 171)` and `a backtick in a regular expression after a prefix ++ that follows a block comment holding a line feed: wanted 2/0, got 0/0`; self-test 23 of 25. With the change: 25 of 25. Differential against acorn 8.18.0: 171 files and 32 minimal inputs 0 divergences. All 106 table entries on strip-non-code.mjs through the harness: 107 of 107 CAUGHT.
