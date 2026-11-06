# Session record: clean-source's checkout sentence is plural for two files; the hook comment quotes no timing (R2, commit 2)

**Date:** 2026-11-06. **Scope:** `scripts/clean-source-check.mjs`, two table entries and two re-anchored ones in `scripts/mutation-check.mjs`, and a comment in `.githooks/pre-commit`. Finding L14 of the seventh review. New file because `check:staged-outbox` wants an `outbox/` path in any commit that stages `scripts/`.

## Premise commands, run first

- `bothKinds` and `probeKinds` fixtures (a block in one file and a probe in another; a probe in each of two files) printed `If the injection is uncommitted, git checkout -- src/B.fs src/D.fs also removes it but discards every uncommitted edit to the file`: singular for two files, and the clause pinned the singular (`also removes it`). proof-check prints `injections are ... them ... files` for the same state.
- The hook comment said the hook takes about 21 s, 13 s of it the mutation self-test, and quoted 13 s again for that self-test, both dated 2026-11-04. The self-test then had 118 clauses (`docs/GATE-TIMING.md`); on this clone today it has 190 and a measured run took 25 s wall under load (a shared 4-core container, not idle).

## Built

- `many = dirty.length > 1` in the scan; the sentence is `If the injections are uncommitted, git checkout -- A B also removes them but discards every uncommitted edit to the files` for two files and unchanged for one. The two clauses that pinned the singular for two files now pin the plural (21 clauses before, 21 after).
- Table: `clean-source-checkout-singular-for-two-files` (`many = false`) and `clean-source-checkout-plural-for-one-file` (`many = true`); the finds of `clean-source-checkout-cost-unsaid` and `clean-source-checkout-unconditional` moved with the text.
- Hook comment: both timing figures, and the `0.2 s` for `--anchors`, are gone, with the reason in the comment and a pointer to `docs/GATE-TIMING.md` for measured figures. Cited none rather than re-measuring: the figure goes stale whenever a clause is added.

## Red evidence

- `many = false` (the old behaviour): `19/21`, the two plural clauses fail. `many = true`: `18/21`, three singular clauses fail. Unmutated `21/21`.
- The four entries through `--ids`: `5/5 checks passed`.

## Not verified

The hook comment is prose; nothing pins that it stays figure-free.
