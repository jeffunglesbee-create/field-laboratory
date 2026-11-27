# CC session 2026-11-27: `HELD` joins the closed vocabulary of a CC-CMD's status

Owner, 2026-11-27: "Vocabulary" (the choice offered: add `HELD` to the vocabulary of `scripts/cc-cmd-status-check.mjs`, or reword the status to `BLOCKED`).

## Why

`guards` on `main` was red since 13ef6cc0 (run 45996406351): `docs/CC-CMD-2026-11-26-single-page-composition.md` opens its status with `HELD`, which was not a word of the closed vocabulary (`every status opens with a word from the closed vocabulary`). Its status line is an owner ruling: the page is a separate website in a new repository, and until that repository exists and is attached no further site work lands here. That is paused, not finished, and not a block on this repository's own work.

## What was built

`scripts/cc-cmd-status-check.mjs`: `HELD` is in `NONTERMINAL`. Non-terminal on purpose: a held ask is an open ask for the audit this file exists for (2026-08-27: ten open asks reported where three were), and the closing-section contradiction rule still applies to it. Three self-test rows (it is a word, it is not terminal, a held document with a closing section is the contradiction). Self-test 14/14; the real run lists the document as `OPEN ... HELD` and passes 5/5.

`scripts/mutation-check.mjs`: two entries (`cc-cmd-status-held-in-vocabulary`, `cc-cmd-status-held-is-terminal`). Each mutant was applied to a copy and failed the self-test on the row named for it: `HELD is a word of the vocabulary`, `...and it is not terminal: a held ask is an open ask`. `--anchors`: `checked 2273 of 2276 mutation anchors; 0 stale`. No existing entry targets this file (0 before), so none went equivalent.

## What this does not do

It does not judge whether the page belongs here or in the new repository (the ruling is the owner's, and it is in the CC-CMD). It adds one word and nothing that reads the word.

## Order of events, said plainly

Landed after local evidence and before a scored `verify-full`, because `main`'s `guards` was red and other sessions' pushes were showing it. The scored run is dispatched on `main` after the landing; its result is the last line of this note.

Scored: `verify-full` run `46008900658` on `a5806b03` (dispatched on `main`): earned 530 of 530, failing [], skipped [], notApplicable [], mutation baseline failing 0 (116 run of 2275 mutations), 8 of 8 shards; `guards` run `46008865346` and `verify` run `46008865441` green on the landing.
