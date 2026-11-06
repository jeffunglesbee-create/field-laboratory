# Session record: the printed greps find the line on a CRLF tree (R2, commit 4)

**Date:** 2026-11-06. **Scope:** the probe greps printed by `scripts/proof-check.mjs` and `scripts/clean-source-check.mjs`, two clauses in each, and nine table entries in `scripts/mutation-check.mjs` (five re-anchored, four new). Finding L11 of the seventh review. New file because `check:staged-outbox` wants an `outbox/` path in any commit that stages `scripts/`.

## Premise commands, run first

- The real clean-source scan over a fixture whose lines end in CRLF and whose probe is written the way `probeRegistry` writes it (bare newline): it fired (4/5) and printed `grep -n -B1 "^    | Unrecognised of raw: string$" src/D.fs`; run by `sh`, that grep exited 1 with no output (`cat -A` shows the real line ends `string^M$`).
- `git ls-files --eol src/Desk.fs src/Scoreboard.fs`: `i/lf w/lf`, no `.gitattributes`. The repository is LF today; the case is a Windows checkout with autocrlf.

## Built

- Every `$`-anchored grep the two tools print now ends `[[:space:]]*$` (POSIX, in a basic regular expression, so it matches with or without the carriage return, and with trailing blanks): the adjacent probe's `grep -n -B1 "^    | Unrecognised of raw: string[[:space:]]*$"` and the separated probe's `grep -n "^    | NHL[[:space:]]*$"`, in both tools.
- The clauses that typed the old text type the new. Two new clauses per tool RUN the printed grep with `sh` over a registry with LF line ends and one with CRLF line ends and assert the lines it prints (the adjacent probe: the probe line and the last case; the separated probe: both `| NHL` lines). The scan or refusal itself is also run on the CRLF registry (it fires). Messages say `2 greps run` and `asserted: <grep exists>` (Rule 91). proof-check 123 clauses before, 125 after; clean-source 21 before, 23 after.
- Table: four new entries put the plain `$` back at each of the four print sites (`*-grep-misses-a-carriage-return`); five existing entries re-anchored.

## Red evidence

With the plain `$` put back everywhere (message AND the clauses' typed copies, so that only the new clauses can notice): clean-source `21/23`, the two new clauses fail with `CRLF []`; proof-check `123/125`, the two new clauses fail with `CRLF []`. Unmutated: `23/23` and `125/125`. Nine entries through `--ids`: `10/10 checks passed`.

## Adjacent defect, not fixed (Rule 69)

`probeDuplicated` (in both tools) compares lines with `=== '    | NHL'`, so on a CRLF registry the union's own `| NHL` line (`...\r`) never counts and a probe a sport has been added in front of is not found. Measured 2026-11-06: a CRLF `src/Desk.fs` with the bare-newline probe and a `MyNewSport` line after it, `node scripts/clean-source-check.mjs` printed `5/5 checks passed`. The adjacent probe is found on CRLF (the site match does not depend on the carriage return). Not reachable today (the tree is LF).

## Not verified

The greps were run with GNU grep on Linux only.
