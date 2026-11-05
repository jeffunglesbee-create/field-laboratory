# Session record: a state directory that holds only a source mutation's backup is used

**Date:** 2026-11-05. **Scope:** review 6, lens "harness heal", finding 3 (`harness-heal.json`, n 3). Stream F3, commit 5. Touches `scripts/mutation-check.mjs` only: the state-directory guard, one shared helper, one clause, two new table entries and one re-anchored.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100), before and after

Scratch repository, real script (the previous commit's file):

- Before: `mkdir .mutation-state; echo orig > .mutation-state/docs_gate-rows.txt; node scripts/mutation-check.mjs --only known-survivor` printed `.mutation-state already holds files this harness did not write (docs_gate-rows.txt), and it empties its state directory: give MUTATION_STATE_DIR one that is absent or empty. Nothing was touched.` and exited 2; `--heal` printed the same and exited 2. Reproduced as the reviewer reported.
- After (this commit's file, same commands): the run starts (`Mutation testing 1 invariant(s)`); `--heal` prints `Nothing to heal: no run left a mutation applied.` and exits 0, leaving the backup where it was for the next run's first clear.

## What was built

`backupName(file)` is the one definition of the name a source mutation's backup has in the state directory (the file's path with its slashes flattened). The run that writes the backup and the guard that must recognise it both call it. The guard accepts a directory when ONE of its entries is one of the five names it already knew or the backup name of a file in the table (every table entry that has a `file`, not only the selected ones: the stranded backup may be from a different `--only`). Why that is safe: the marker is written before the file is touched and the backup before the marker, so a directory holding a backup and nothing else belongs to a run killed before it changed anything; there is nothing to heal and nothing to lose. A file that is not a backup of a table file is still foreign.

The message was not changed: for a foreign file it is true.

## Clause (self-test; 174 before, 175 after)

E27: a directory holding only `docs_gate-rows.txt` (the backup of a file the table mutates) is used by a run, and `--heal` over another such directory exits 0 saying there was nothing to heal; a directory holding `docs_not-a-file-in-the-table.txt` is still refused (exit 2, the file named) (3 directories).

## Red evidence (Rule 90) and entries

Through the harness: `node scripts/mutation-check.mjs --ids <5 ids>`: `6/6 checks passed` (baseline and the 5 caught), tree restored (`--stranded` exits 0). New: `state-dir-guard-refuses-a-lone-backup` (the backup-name test removed) and `state-dir-guard-takes-any-underscore-for-a-backup` (any name with an underscore passes). Re-anchored: `state-dir-guard-refuses-its-own-state`, whose find ended at the old closing of the condition (the mutation, an empty list of names, is the same). All run `--self-test`.

## Not verified

A backup of a file that is in the table but written by an older table (a renamed entry's file) is foreign to a newer one; harmless, since the older table's runs are gone by then.
