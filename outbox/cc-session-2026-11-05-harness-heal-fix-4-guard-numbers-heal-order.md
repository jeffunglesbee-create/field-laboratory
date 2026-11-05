# Session record: the guard's name list, its two numbers, the nested heal order and the seventh path are asserted

**Date:** 2026-11-05. **Scope:** review 6, lens "test vacuity", finding 6 (`tests-vacuity.json`, n 6), the parts that sit in the heal order, the state-directory guard and the diverged-world message: the review's m11, m24, m28, m29 and m34. Stream F3, commit 4. Touches `scripts/mutation-check.mjs` only: three new clauses, one extended, five table entries. No behaviour changed.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Reproduction (Rule 100): what survived, run through the harness, in place

The five mutants were added as table entries first and run with `node scripts/mutation-check.mjs --ids ...` on the tree as it was (171 clauses): `1/6 checks passed`, all five `mutation SURVIVED`.

| review's id | mutant | entry |
|---|---|---|
| m11 | `healHeld` heals the top state before the nested one | `heal-looks-at-the-top-state-before-the-nested-one` |
| m24 | `'world'` dropped from the guard's list of its own names | `state-dir-guard-refuses-a-lone-stash` |
| m28 | `holds.length > 4` becomes `> 5` (the ellipsis from the fifth entry) | `state-dir-guard-counts-the-fifth-wrong` |
| m29 | `holds.slice(0, 4)` becomes `slice(0, 3)` | `state-dir-guard-names-too-few` |
| m34 | `ks.length > 6` becomes `> 7` (a seventh path left out of the list and the count) | `refusal-drops-the-seventh-path` |

The review's m-numbers were not kept as files, so each mutant above is re-derived from its description in the finding (the line it changes and the change); the ids are my own.

## Clauses (self-test; 171 before, 174 after)

| clause | covers |
|---|---|
| a parent and the child it started both touched one file: the child is healed first | the child read the parent's mutated file as its original, so the file holds the child's change on the parent's mutation: nested first puts the parent's mutation back and the parent's heal puts the original back; top first, the parent's heal sees neither of its two hashes and refuses (1 file, 2 markers) |
| E27: a directory that holds only a stash (`world`) is used | the fifth of the guard's names, the one no other clause used |
| E27: the refusal names four entries and ends with `...` when there are more | five foreign entries read as the first four (sorted) and `, ...`; exactly four read as the four and no ellipsis (2 directories) |
| (extended) the refusal names six paths and counts the rest | adds the seven-path case: the first six and `and 1 more`, not the seventh |

## Red evidence (Rule 90)

Entries alone on the 171-clause tree: all five survive. With the clauses, through the harness: `6/6 checks passed` (baseline and the five caught), tree restored (`--stranded` exits 0). All five run `--self-test`.

## What the review said that I did not enter

m24 is called equivalent in practice by the heal-lens reviewer ("a world directory always sits beside active.json or run.json"). It is reachable only by a double kill: a run killed between making a stash directory and writing its marker, then the next run killed after it removed that stale lock and before it took its own. Narrow, but real and a one-line clause, so it is entered. m11 needs a parent and a child that mutate ONE file; no entry in the table does, so it is defensive today.
