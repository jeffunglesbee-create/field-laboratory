# A soccer match in progress carries no comeback line (CC-CMD-2026-11-11-soccer-live-scores, Task 3)

2026-11-11. `src/Stats.fs` (`comebackMargin`), `src/StatsView.fs` (the call), `src/Suite.fs` (two cases), `scripts/mutation-check.mjs` (two entries).

## Why

The Stats tab's comeback line is written in runs and innings: `N-run gap`, `needs an inning`. `Stats.liveMargin` has no sport gate, so the first soccer row that reads `InProgress` would print a baseball sentence about a football match. Nothing can put a soccer row in progress today (the archive never holds an in-play soccer score), and the live-score overlay will, so the gate comes first.

## What changed

`Stats.comebackMargin sport state` returns `None` for any sport whose `sportMeta` says `IsSoccer`, and `liveMargin state` otherwise. `StatsView.renderReport` calls it with `report.Sport` instead of calling `liveMargin` directly.

## What was run

| check | result |
|---|---|
| `node build/VerifyMain.js` after `npm run build` | 371 of 371 (two new cases: an EPL match in progress has no margin and an MLB game does, each with its counterexample) |
| `stats-soccer-comeback-line-ungated` (the gate removed) and `stats-comeback-gate-drops-baseball` (the gate answers None for everything) through the harness | both caught, plus the unmutated tree: 3 of 3 |

## Not defended yet

The view's CALL is not defended: a change that puts `liveMargin` back in `StatsView.fs` is not caught by anything that exists today, because no render check has a soccer match in progress on the Stats tab. The comment in `Stats.fs` says so and claims only the function. Task 6's render check (`scripts/live-score-render-check.mjs`, a soccer card flipped to in progress, the Stats tab read) is what defends the call; until it exists this is a stated gap, not a covered one.
