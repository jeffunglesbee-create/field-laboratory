# The live score on a real card (CC-CMD-2026-11-11-soccer-live-scores, Task 6, part 3)

2026-11-11. `scripts/live-score-render-check.mjs` (new), `src/LiveScore.fs` (`liveNoteFor`), `src/Scoreboard.fs` (the live node reads it), `src/Program.fs` (`__labSetReading`, behind `?simulate=1`), `src/Suite.fs` (2 cases), `package.json` and `.github/workflows/verify.yml` (a self-test step and a live step), `scripts/mutation-check.mjs` (8 entries), `src/Stats.fs` (a comment corrected).

## What it proves

A card of the committed 2026-10-10 slate is put in the state the archive would hold for a match in play (`Scheduled`, no score) with the page's own `__labSetState`, and then told what the live feed said with `__labSetReading`, the way the poll will through `CardHandle.SetReading`. The clock is fixed at 12:00Z, between the 11:30Z and 14:00Z kickoffs, so "the start time has passed" is a fact about a real row. 16 checks:

- every card of a soccer sport has the live node (empty at first paint) and no card of any other sport does;
- an unscored row whose start time has passed reads `Start time passed, no score served` and `—`, not `Scheduled` (this is also the page-level proof of the Task 4 wiring);
- a live reading gives the card the feed's score, `In progress`, the feed's clock beside it, and no forecast and no drama text;
- a full-time reading keeps the card `In progress` with the final score and says `Full time`, and does not open the drama slot;
- an unavailable reading says `live score unavailable` and gives the card back to the archive's answer; no reading clears the note;
- a card the archive has finalised is never taken back by a reading: `Final / OT`, its score, no note;
- a Scheduled card before kickoff keeps `Scheduled 2026-10-10T14:00Z (parsed 14:00)` byte for byte, and a reading that puts it in play removes its forecast;
- a pinned page makes no request to `/v2/games`; no page or console errors.

## What was run

| check | result |
|---|---|
| `node scripts/live-score-render-check.mjs --self-test` | 9 of 9 |
| `node scripts/live-score-render-check.mjs` against the built page, `PW_CHROMIUM` set | 16 of 16 |
| `npm run build` and `node build/VerifyMain.js` | 405 of 405 |
| the eight entries `live-card-*`, `status-start-time-passed-is-not-read-by-the-card` and `live-render-check-compares-nothing` through the harness, static server up | 8 of 8 caught, plus the unmutated tree |

## Not proved, and a correction

This does not prove that the poll asks the right route at the right moments or that the feed's real body decodes: the poll does not exist yet and the real live body is being captured tonight. And a correction to `outbox/stats-soccer-comeback-gate-2026-11-11.md`: it said this check would defend the Stats tab's call to `comebackMargin`. It cannot: the Stats tab renders from the games list, not from a card's reading, so a reading does not reach it. The note and the comment in `src/Stats.fs` now say so.
