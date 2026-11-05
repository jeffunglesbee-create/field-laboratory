# Session record: the seventh path, the edges of the status window, the state-directory guard's bounds

**Date:** 2026-11-05. **Scope:** fix stream F2, review 6, finding tests-vacuity 3. Commit 6 of 8. New file for `check:staged-outbox`; existing outbox files are not edited.

## Reproduction (Rule 100), on a frozen copy of this clone at d4bcd69, before this stream's first commit

Five mutants, each applied to the copy, each one `node scripts/mutation-check.mjs --self-test` (165 clauses, the self-test of d4bcd69): the refusal's bound `ks.length > 6` to `> 7` (m34), the status window's `> 128` to `>= 128` (m21) and `< 160` to `< 256` (m22), the state-directory guard's `holds.length > 4` to `> 5` (m28) and `holds.slice(0, 4)` to `slice(0, 3)` (m29). **All five: 165/165.** The clause for the refusal tests 8 paths and 6, never 7; E27 lists two names; no clause runs `run()` on a status near 128 or 160.

## The inference question, decided

The review: `run()` reads a status in 129..159 as "ended by a signal", 63 scripts still exit with a failure COUNT (`process.exit(summarize())`), so a mutation that fails 129 to 159 clauses of one would be read as a kill and stop the gate. Is the right fix to rely on `e.signal` alone?

**No, and the premise that makes it urgent is not true on this tree.**

- The signal field alone loses the case the window exists for. Probed 2026-11-05 on Node 22 with `execSync`: `sleep 5 & kill -KILL $!; wait $!` ends with `status 137, signal null`, `kill -KILL $$` ends with `signal SIGKILL, status null`, `exit 130` ends with `status 130, signal null`. The table's expectations run through `sh -c`, and a shell reports a child that was killed (the OOM killer, a browser crash) as 128 plus the signal. The commit that added the window (8656882) says so, and E24's `expect-child-killed` clause is that case. Without the window that kill is a caught mutation again.
- The count "63" is `docs/early-exit-budget.txt` (the number of early `process.exit(summarize...)` report exits that `check:exit-drains` budgets), not a count of scripts that exit with a failure count. `grep -rn "process.exit(summarize())" scripts/*.mjs`, outside the checker's own text, the harness table and `checks.mjs`, finds two scripts: `draw-render-check.mjs` and `verify-render-check.mjs`, each with 4 `check(` calls before the exit, so a count above 4 cannot happen. `finish()` in `checks.mjs` maps every other outcome to 0 or 1, and most of the others exit `summarize() === 0 ? 0 : 1`.
- `grep -rnE "process\.exit\((12[89]|1[3-5][0-9])\)|exit (12[89]|1[3-5][0-9])\b"` over `scripts/` and `.github/` finds nothing: no script exits in the window on purpose.

So the window stays, unnarrowed. The remaining hazard is a command that exits 129..159 on its own (`exit 130` does) and stops the run instead of counting as caught; it is real but needs a script that does so, and none does. It is written in the comment on `lastSignal` and pinned by the clause below (130 is in the pinned window on purpose, so changing it is a decision). Editing the two raw-count exits was not done: neither can reach the window.

## What was built

- Three clauses at the end of the REAP group and after the E24 group: the refusal over 7 edited paths lists the first six and "and 1 more" and not the seventh; the status window (`run('exit N')` for 1, 127, 128, 129, 130, 159, 160 and 255: 129, 130 and 159 read as killed, the other five as failures that answered); the state-directory guard over 5 foreign files names `a.txt` to `d.txt` and "...", and over exactly 4 names the four and no "...".
- Table: `refusal-hides-the-seventh-path`, `status-window-takes-git-fatal`, `status-window-has-no-top`, `state-dir-guard-counts-five`, `state-dir-guard-names-three`.
- The comment on `lastSignal` says why the window stays and what it costs.

## Red evidence (Rule 90)

On copies of the tree with the clauses present (`177/177` unmutated); the two nested-self-test clauses fail whenever an inner unit clause does and are not counted:

| mutant | the clause that fails |
|---|---|
| m34 | `THE REFUSAL COUNTS THE SEVENTH PATH` |
| m21 (`>= 128`) | `RUN: ONLY 129 TO 159 READS AS A COMMAND THAT WAS KILLED` |
| m22 (`< 256`) | the same |
| `> 129` and `< 159`, the other two edges (no table entry) | the same |
| m28 | `STATE-DIRECTORY GUARD: IT NAMES THE FIRST FOUR ENTRIES ...` (176/177) |
| m29 | the same (176/177) |

Through the harness, the five new entries: see the commit message.

## Not verified

A status that really comes from a killed browser or the OOM killer was not produced; `exit N` stands for the status. The 63-script claim was refuted by grep on this tree, not by running every script's failure paths.
