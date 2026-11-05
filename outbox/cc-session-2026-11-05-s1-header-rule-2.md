# Session record: the header rule reads its keyword the way every other keyword is read (stream S1, finding scanner-diff 0)

Rule 67 record for one commit. Date 2026-11-05, on the merged tree, after the applyMutation commit.

## Reproduction

The reviewer's three inputs, each followed by a bare clock read, counted with the 4eceb98 scan (`git show 4eceb98:scripts/row-confidence.mjs`, its `clockCounts`) and with the merged tree's:

    o. if (1) / 2 + Date.now()          4eceb98 reads 1    merged tree reads 0
    o.<newline>while (1) / 2 + Date.now()   reads 1        reads 0
    éif(1) / 2 + Date.now()             reads 1            reads 0

After the change all three read 1. The cause was a one-character ASCII lookbehind `(?<![\w$.#])` in front of the header keyword: it did not skip white space after a dot and did not know a non-ASCII letter.

## What was built

- `endsInKeyword` takes the set of words as a second argument (default: the keywords a regular expression can follow). The header test calls it with `if`, `while`, `for`, `with` over the forty characters before the parenthesis, with `await` set aside only after `for`. A method, a private name and a longer name are therefore calls whichever way they are spelled.
- Seven STRIPS pairs (`o. if`, `o.<lf>while`, `o?.with`, `éif`, `a`+U+0301+`if`, `await (x)`, `x = await (y)`) and five counts items (a method named if, while, with after a dot and a space; while after a dot and a line feed; `éif`) in the DIVIDES clause.
- Table: `hdr-ascii-lookbehind` (the old one-character lookbehind put back) and `hdr-await-alone-is-a-header` are new. Fifteen `hdr-*` entries and two keyword entries (`identifier-first-hit-only`, `row-scan-forgets-regex-after-return`) were re-anchored on the new text; the five old lookbehind entries now mutate the call site into a regular expression missing one piece, so each fixture that pinned a piece is still pinned.

## Differential against a real tokenizer

acorn 8.18.0 over scripts/*.mjs: 171 files, 0 divergences in the stripped text, the blanked text, the comment blank and the clock counts (before and after). The reviewer's generator, seeds 1 to 3 at 4,000 programs each, found 8, 6 and 12 divergences before the change, every one the `o.<newline>if` shape. After the change seeds 1 to 8 at 6,000 programs each found none, apart from one program that acorn itself tokenizes wrongly (`o?.instanceof`, a line feed and a regular expression: V8 rejects that program, acorn accepts it).

## Red evidence

Against the scanner as it was: `FAIL WHAT THE SCANNER LEAVES IS EXACTLY WHAT IT SHOULD, for 153 inputs ... (4 wrong of 153)` and `FAIL A DIVISION AFTER A PRIVATE NAME ... wanted 1/0, got 0/0`. With the change both pass (25 of 25). All 97 table entries on strip-non-code.mjs go through the harness: 98 of 98, every one CAUGHT. The two new entries are killed by the clauses named above, not by a syntax error.

## Not verified

A keyword more than forty characters before its parenthesis is not seen (documented in the scanner).
