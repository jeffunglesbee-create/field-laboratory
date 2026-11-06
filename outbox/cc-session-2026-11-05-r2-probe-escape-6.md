# Session record: a union that really ends `| NHL` is told how to get past the probe scan (R2, commit 6)

**Date:** 2026-11-06. **Scope:** the adjacent-probe instruction in `scripts/proof-check.mjs` and `scripts/clean-source-check.mjs`, one clause in each, and five table entries in `scripts/mutation-check.mjs` (three new, two re-anchored). Finding L13 of the seventh review. New file because `check:staged-outbox` wants an `outbox/` path in any commit that stages `scripts/`.

## Premise commands, run first

- A scratch copy with `src/League.fs` holding `type League = | NFL | NHL | Unrecognised of raw: string`: `node scripts/clean-source-check.mjs` failed (`4/5`, `League.fs`) and printed "Delete the probe case (the line `| NHL` directly above ...)" with "`node scripts/proof-check.mjs` has nothing to restore from and refuses"; `node scripts/proof-check.mjs` over the same tree (stub `dotnet`) ran and exited 0, because it reads only `src/Scoreboard.fs` and `src/Desk.fs`. So the "refuses" claim was false there, and the remedy told a person to delete a real case.
- `dotnet fsi` 10.0.113: a union with `| NHL` then `/// the raw label` then `| Unrecognised of raw: string` runs; the same case twice (`| NHL ... | NHL`) is `error FS0037: Duplicate definition of union case 'NHL'`.

## Decision (with its evidence)

The union CAN legitimately end so: `Sport` in `src/Desk.fs` is reordered by an ordinary edit, and the scan reads every source file, so any union with a case called NHL last matches. So the text gives a way out instead of denying the case. The separated form (`| NHL` twice in one declaration) cannot be real (FS0037), so it gets none.

## Built

- Both tools' instruction for the adjacent probe ends: `; if it is a real case instead, because a union of yours ends in it, keep it and put any line between the two (a doc comment will do): lines that are not adjacent no longer match`.
- clean-source no longer says proof-check "refuses" in the no-state remedy: the claim is true only for the two files proof-check reads. The remedy says it "has nothing to restore from", which is true everywhere.
- The limit is stated in both headers (`probeOnRegistry`'s comment in proof-check, a new paragraph in clean-source's), with the measurements above. proof-check's committed-registry self-test clause now says what to do if it fires.
- One clause per tool, both RUN the way out: a union that really ends `| NHL` is refused (clean-source: fails the scan; proof-check: refuses with no state) with the instruction, and the same union with a doc comment between the two is clean (clean-source `5/5`) or not refused (proof-check goes on to its checks). proof-check 126 before, 127 after; clean-source 24 before, 25 after.
- Table: `proof-check-probe-escape-unsaid`, `clean-source-probe-escape-unsaid`, `clean-source-claims-proof-check-refuses`; two proof-check entries re-anchored.

## Red evidence

The three mutations put back: clean-source `20/25` (the new clause and four that type the instruction or the "refuses" claim fail), proof-check `124/127` (the new clause and two that type the instruction). Unmutated `25/25` and `127/127`. Seven entries through `--ids`: `8/8 checks passed`.

## Not verified

Only `dotnet fsi` was used for the compile claims; the full project build was not run on a reordered `Sport`.
