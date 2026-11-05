# Session record — clean-source-check names the heal (residuals Task 3)

Date 2026-11-05. Scope: `scripts/clean-source-check.mjs` and its table entries
(`docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 3).

## Premise commands, run first
- the real script over an injected copy of `src/Scoreboard.fs` printed the
  `git checkout --` advice with and without `.proof-state/active.json`;
- a scratch git repository: an uncommitted injection gave 8 lines of `git diff`
  and the checkout removed it; a committed one gave 0 lines of `git diff` and the
  marker survived the checkout.

## Built
Detail names `node scripts/proof-check.mjs` when `.proof-state/active.json`
exists, a `grep` for the lines when it does not; an eleven-clause `--self-test`
over eight fixture directories (red first: six of eleven fail on the old remedy
line); sixteen table entries, all caught through `--ids`.

## Not built (recorded, not deferred)
- proof-check's own no-state refusal still says `git checkout --`. Tracked as a
  separate change in the residuals CC-CMD.
