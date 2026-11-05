# Session record: the diverged-world refusal stops telling a person to put the stash back first

**Date:** 2026-11-05. **Scope:** review 6, lens "harness heal", finding 1 (`harness-heal.json`, n 1). Stream F3, commit 2. Touches `scripts/mutation-check.mjs` only (`healAt`'s `stop`, its diverged-world call, two clauses, three new entries and one re-anchored).

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), on this clone at the previous commit

Scratch repository, real script: `MUTATION_KILL_AT=world-applied node scripts/mutation-check.mjs --only outbox-stub` (exit 137), then `echo 'MY NEW WORK AFTER THE KILL' > outbox/cc-session-2000-01-01-one.md`, then `--heal`. Exit 1, and the refusal ends: `...a path it touched is neither as it was nor as the mutation left it (outbox/cc-session-2000-01-01-one.md): it changed after the kill. Nothing was run. Put back from .mutation-state/world/outbox-stub only the paths that are still as the mutation left them; its restore command would overwrite the ones listed. What a world mutation moved aside is in .mutation-state/world: put it back first, because deleting .mutation-state deletes the only copy.` The stash holds both write-ups, so "put it back first" is an instruction to copy the stash over the file the sentence before it protects. Reproduced exactly as the reviewer reported.

## What was built

`stop` in `healAt` takes a third argument, `listsPaths`. The diverged-world refusal with recorded paths (the edited and the matches-HEAD shapes) passes it. Over a stash that holds files that refusal now ends: `Then delete <dir> to clear this: it holds the only copy of what was moved aside, so take anything you still need out of <dir>/world first.` The sentence before it, unchanged, already says to put back only the paths that are still as the mutation left them. Every other refusal keeps its wording:

- The unreadable-marker refusal over a stash still says "put it back first" (existing clause kept): there is no list of paths for it to contradict.
- The refusal for a marker killed before it recorded its paths (`touched` absent or `{}`) still says it: its own text says the mutation may have made the changes, and what it moved aside is in the stash. Left alone (touch-only); noted below as adjacent.
- Source and empty-stash refusals are untouched.

The existing entry `world-refusal-offers-the-restore-command` anchored on the closing of the changed call, so its find is shortened to the sentence before the backtick; its mutation is the same.

## Clauses (self-test; 167 before, 169 after)

| clause | covers |
|---|---|
| a refusal that lists paths a person owns does not say to put the stash back first | unit scenarios over a stash that holds a file: an edited path, and a path that matches a HEAD that moved (2 shapes); the new sentence is present, "put it back first" absent, the earlier "only the paths that are still as the mutation left them" present, stash and state kept |
| E4 (real script), next to the edited-write-up clause | the refusal after `--only outbox-stub` is killed and a write-up is rewritten: same assertions on the real text, and both originals still in the stash |

## Red evidence (Rule 90)

Mutant `? (listsPaths` to `? (false` (the old suffix back), applied in place and restored: `FAIL  A REFUSAL THAT LISTS PATHS A PERSON OWNS DOES NOT SAY TO PUT THE STASH BACK FIRST ...` and `FAIL  E4: ...and its refusal does not tell a person to put the stash back over the edit ...` (plus two clauses that start a child self-test and read its status, which the mutant also fails). Unmutated: 169/169.

Through the harness, `node scripts/mutation-check.mjs --ids <the 5 ids>`: `6/6 checks passed` (baseline, 3 new entries, the re-anchored entry, and `refusal-over-a-stash-says-delete`), tree restored. All five run `--self-test`.

## Adjacent, not touched

The `touched`-absent refusal ("The mutation itself may have made those changes ... What it moved aside is in <stash>") ends with the generic "put it back first". For a person who did edit one of the paths, that is the same contradiction in a milder form; its text does say the two cannot be told apart. A decision for the owner, not a fix for this item.
