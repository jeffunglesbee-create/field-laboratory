# Session record: F# double-backtick identifiers in the lineups scanner (stream S1, finding checkers 0)

Rule 67 record for one commit. Date 2026-11-05.

## Reproduction

The F# compiler's own line tokenizer (FSharpLineTokenizer, `dotnet fsi` against the SDK's FSharp.Compiler.Service.dll) was run over 16 snippets and the verdict on the timer compared with the scanner's:

    let ``a (* b`` () = ()<lf>let go () = window.setInterval(f, 1000)      compiler: code   scanner (4eceb98): timer seen   scanner (merged tree): timer hidden
    let ``a // b`` () = window.setInterval(f, 1000)                        compiler: code   4eceb98 hidden   merged tree hidden
    let ``a " b`` () = ()<lf>(* setInterval(f, 1) *)<lf>let x = "s"        compiler: comment   merged tree: timer seen (a false alarm: the quote opened a string)

Five of the 16 disagreed before the change: a name holding `(*` (no closer anywhere), `//`, a lone quote, a name that never closes, and a name after a comment. The first is a regression against 4eceb98, whose regular expression needed a closing `*)` before it blanked anything; the second was hidden then too. `grep -c '``' src/*.fs`: no F# source in the tree has a double-backtick name, so nothing real was affected, and `codeOnly` of all 49 sources is the same before and after.

## What was built

- `codeOnly` reads a double-backtick identifier as text: from the opening to the next `` on the same line, or to the end of the line when none closes (which is what the compiler's tokenizer does with the rest of the line). A `(*`, `//` or quote in it opens nothing. Inside a comment a name is not special, as in the compiler (its `*)` ends the comment, its `(*` nests).
- Seven fixtures, each also run through the compiler's tokenizer (all seven agree): five where the timer is code (a name holding `(*` with no closer, one holding `//`, one that never closes, one unclosed name followed by a name with `(*` on the next line, a name with `*)` inside a comment) and two where it is a comment (after a name with a lone quote; a name with `(*` inside a comment). The documentation lists the names among what is read.
- Three table entries: `lineups-backtick-names-unread`, `lineups-unclosed-name-pairs-across-lines`, `lineups-unclosed-name-skips-two-characters`. The reviewer proposed skipping "just past the two opening characters" for a name that does not close; the compiler reads the rest of the line, so the scanner does, and the entry for the reviewer's version is the third.

## Red evidence

`lineups-backtick-names-unread` (the rule removed) fails `A TIMER IS STILL SEEN AFTER EACH CONSTRUCT ... 4 of 17 hidden` and `A TIMER INSIDE A COMMENT IS NOT ONE ... 1 of 9 flagged: a comment after a double-backtick name that holds a lone quote`; the second entry fails the `... 1 of 17 hidden: an unclosed name does not pair with the name on the next line`, the third `... 1 of 17 hidden: a double-backtick name that never closes`. The self-test is 29 of 29 (the two clauses grew from 12 and 7 fixtures to 17 and 9). All 23 table entries on check-lineups-pull-only.mjs through the harness: 24 of 24 CAUGHT, `lineups-two-prefix-characters-unread` among them by its own fixture (see the applyMutation commit).
