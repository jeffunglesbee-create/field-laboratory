# Session record: the printed `git checkout` says it does nothing once the injection is staged (R2, commit 3)

**Date:** 2026-11-06. **Scope:** the checkout sentence in `scripts/proof-check.mjs` (no-state refusal) and `scripts/clean-source-check.mjs` (remedy), their clauses, and seven table entries in `scripts/mutation-check.mjs`. Finding L10 of the seventh review. New file because `check:staged-outbox` wants an `outbox/` path in any commit that stages `scripts/`.

## Premise commands, run first (scratch git repository, one tracked file, three states)

| state of the injected line | `git checkout -- f` | the file after |
|---|---|---|
| unstaged, plus an unrelated unstaged edit | ran | both gone |
| staged (what the pre-commit hook scans) | ran | injection still there, `git status --short` still `M ` |
| staged, plus a later unstaged edit | ran | the later edit gone, injection still there |
| committed, plus an unstaged edit | ran | the edit gone, injection still there |
| a staged edit and an unstaged injection | ran | injection gone, staged edit kept |

So the old sentence ("If the injection is uncommitted, ... discards every uncommitted edit") was true only of an unstaged injection, and it discarded UNSTAGED edits only.

## Built

Both tools now print: `git checkout -- <files> puts the file back to what is staged: it removes an injection only while that injection is neither staged nor committed (the pre-commit hook sees it staged, where the checkout changes nothing), and it discards every unstaged edit to the file` (`each file` / `those files` for two). The clauses that pinned the old text pin the new one, through a hand-typed copy of the sentence in each self-test (proof-check 123 clauses before and after, clean-source 21 before and after). Three existing entries per tool were re-anchored and now break the new text; two new entries (`proof-check-stray-checkout-ignores-staging`, `clean-source-checkout-ignores-staging`) put the old claim ("uncommitted") back.

## Red evidence

- The old claim put back in proof-check: `119/123`, four clauses fail (the three planted-state clauses and the separated-probe clause). In clean-source: `16/21`, five fail. Unmutated: `123/123` and `21/21`.
- Eight entries through `--ids`: `9/9 checks passed`.

## Not verified

The git behaviour is measured once (the table above), not re-asserted by a clause: a clause for it would test git, not this repository.
