# Session record: the injected block's instruction gives its real extent (R2, commit 5)

**Date:** 2026-11-06. **Scope:** the block instruction printed by `scripts/proof-check.mjs` (the no-state refusal and the "carrying" message, now one text) and `scripts/clean-source-check.mjs`, their clauses, and seven table entries in `scripts/mutation-check.mjs`. Finding L12 of the seventh review. New file because `check:staged-outbox` wants an `outbox/` path in any commit that stages `scripts/`.

## Premise commands, run first

- `layout()` writes `let private __proofN (g: Game) =\n<body indented by four>\n\n` directly above the anchor line `let private dramaText (g: Game) (state: GameState) =`, so the text between the first header and the anchor is the blocks, each followed by one blank line.
- Applying the old instruction literally ("each header and the indented lines under it") to a three-block layout() output in a file shaped like `src/Scoreboard.fs` (a doc comment above the anchor): the result differs from the original by 4 lines (a blank line after each block, plus the one inside the second block's body). The reviewer counted the real corpus the same way: 133 cases, none with a blank inside, so 133 blank lines left on a full injection, and every `src/Scoreboard.fs` line number below the anchor shifted by that many.
- Deleting every line from the first header down to the line above the anchor gives the original back byte for byte.

## Built

- Both tools say: `the injected block ... (every line from the first "let private __proofN" header down to the line directly above "let private dramaText (g: Game) (state: GameState) =", the blank line after each block included; grep -n "let private __proof" <file> finds the headers)`. In `proof-check.mjs` the no-state refusal now takes its text from `removalOf` (it carried a second copy of the old wording), so the refusal and the "carrying" message cannot differ.
- `clean-source-check.mjs` learns the anchor (`ANCHOR`), asserted against `proof-check.mjs`'s source in the existing check that already asserts `MARKER` (still 5 checks; its title and the clause that drifts it now cover both).
- One new clause per tool (proof-check 125 before, 126 after; clean-source 23 before, 24 after). The proof-check clause applies BOTH instructions to what `layout()` really writes and asserts the extent restores the file byte for byte, that the old words do not, and by how many lines; the clean-source clause pins the printed text.
- Table: three new entries (`proof-check-block-extent-is-headers-only`, `clean-source-block-extent-is-headers-only`, `clean-source-anchor-drift-unchecked`), four re-anchored.

## Red evidence

The old wording put back at both print sites: proof-check `122/126` (the extent clause among the four failures), clean-source `22/24` (the extent clause and the two-kinds clause). Unmutated `126/126` and `24/24`. Eight entries through `--ids`: `9/9 checks passed`.

## Not verified

The extent is shown on `layout()` output, not on a stranded copy of the real `src/Scoreboard.fs`.
