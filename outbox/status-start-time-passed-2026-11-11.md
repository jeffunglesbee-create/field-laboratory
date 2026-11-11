# A started row with no score says what is known (CC-CMD-2026-11-11-soccer-live-scores, Task 4)

2026-11-11. `src/Desk.fs` (`startTimePassedAt`, `startTimePassed`), `src/Scoreboard.fs` (`statusTextWith`), `src/Suite.fs` (10 cases), `scripts/mutation-check.mjs` (5 entries), the CC-CMD's wording.

## The measured bug

`Desk.gameStateAt` answers `Scheduled` for any row without both scores, so Man Utd v Aston Villa (start 16:30Z, no score in the archive) read `Scheduled 2026-11-08T16:30Z (parsed 16:30)` 45 minutes into play (`outbox/cc-session-2026-11-08-epl-forecast-on-cards.md`, Finding 1).

## What changed

A `Scheduled` row whose start time has passed now reads `Start time passed, no score served`. The wording says what the row supports and nothing more: a postponed fixture is also a row whose start time has passed and that has no score, so "kicked off" would be a claim the row does not make. `startTimePassedAt now game` is the pure reading (an absent start time is false, as in `notYetStartedAt`); `startTimePassed` is the wall-clock wrapper next to `gameState`; `Scoreboard.statusTextWith started game state` takes the fact as an argument so a test can ask for each reading. Every other status string is unchanged byte for byte, and four of them are pinned in the Suite: `Scheduled <raw> (parsed HH:mm)` (which the 2026-11-21 forecast probe parses with `^Scheduled (\S+)`), `Scheduled <raw> (UNPARSED)`, `Scheduled — no start time`, and `In progress` / `Final` / `Final / OT` with the start time passed.

## What was run

| check | result |
|---|---|
| `npm run build`, then `node build/VerifyMain.js` | 380 of 380 |
| the five `status-*` / `start-time-passed-*` table entries through the harness | 5 of 5 caught, plus the unmutated tree |
| the gate rows that render a card (`render checks pass on both captures`, `grouping and date navigation pass`, `games on a panel are separated from each other`, `tabs work and the pick score never renders`, `pick'em grades only finished games`, `game state is correct at fixed instants`) | all PASS, `PW_CHROMIUM` set, against the changed build |
| `node scripts/forecast-render-check.mjs` | 38 of 38 |

## Not run

The scored `npm run gate` and the deployed page. This changes what a started, unscored soccer card says; it does not make a score appear. The score arrives with Task 6.
