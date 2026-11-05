# Session record — proof-check's no-state refusal stops advising a checkout (clean-source follow-up 1 of 2)

Date 2026-11-05. Scope: the `proceed` branch of `scripts/proof-check.mjs`, its `--self-test`, and nine table
entries in `scripts/mutation-check.mjs`. This is the half `outbox/cc-session-2026-11-05-gate-residuals-clean-source.md`
recorded under "Not built" (residuals Task 3).

## Premise commands, run first (Rule 100)
- `node scripts/proof-check.mjs` over `src/Scoreboard.fs` with a proof function injected and no `.proof-state/`:
  `proof-check: src/Scoreboard.fs contains injected proof code (the proof functions) and no run state exists.` /
  `Restore it (git checkout -- src/Scoreboard.fs) before re-running.`, exit 1, file unchanged.
- A scratch git repository: with the injection committed, `git checkout -- f.fs` left 1 marker line; with an
  uncommitted edit added, the same checkout left 0 lines of it. Both flaws of the old advice reproduced.
- Shared wording place: `grep -rn "discards every uncommitted\|nothing to restore from" scripts/ .githooks .github package.json`
  matched only `scripts/clean-source-check.mjs`. There is none, and clean-source-check must keep working when proof-check
  is what broke, so the wording is kept by eye in both and nothing was created to share it.

## Built
The refusal now says to delete the lines, how to find them with a grep that works on a committed injection (the
target's `let private __proofN` header and the indented lines under it; the registry's `    | NHL` line directly above
`    | Unrecognised of raw: string`, shown by `grep -n -B1`), and names a checkout only for an uncommitted injection,
saying it discards every uncommitted edit. Plural for both files. Run by hand over both files injected, the two greps
printed `146:let private __proof0 (g: Game) =` and `345-    | NHL` / `346:    | Unrecognised of raw: string`.

Self-test 103 to 106 clauses (three new: target only, registry only, both; each runs the real script with no state).
Red first: against the unchanged refusal text, 103/106, the three new clauses FAIL with
`Restore it (git checkout -- src/Scoreboard.fs) before re-running.`, `Restore it (git checkout -- src/Desk.fs) ...`
and `Restore them (git checkout -- src/Scoreboard.fs src/Desk.fs) ...`. With the change, 106/106.

Nine entries (`proof-check-stray-*`), each applied to a copy with its find asserted unique, then run through
`node scripts/mutation-check.mjs --ids ...`: baseline 0 failing, 9 of 9 caught. By clause, the 9 mutants turned
red 3, 3, 2, 2, 3, 2, 2, 3, 1 of the new clauses, never an old one.

## Not verified
- The wording was not run on a GitHub runner; the greps were run with GNU grep only.
- Whether any existing reader parses the refusal's second line: none found by grep in `scripts/`, `.githooks`, `.github`.
