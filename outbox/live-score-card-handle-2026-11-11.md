# A card can be told what the live feed said (CC-CMD-2026-11-11-soccer-live-scores, Task 6, part 2)

2026-11-11. `src/Scoreboard.fs` (`CardHandle`, a reading signal, `shown`, the live note node), `src/LiveScore.fs` (`foldReading`), `src/Program.fs` (the test affordance reads the handle), `src/Suite.fs` (2 cases), `scripts/mutation-check.mjs` (two anchors moved).

## What changed

- `Scoreboard.render` returns a `CardHandle` `{ Id; Game; SetState; SetReading }` instead of a bare state setter, and `renderSlate` returns the handles in DOM order. The page finds a card by its game id, not by a position in a list. Only `Program.exposeForTesting` used the old setters; it now calls `handle.SetState`.
- The card has a second signal, the feed's `LiveReading`, and a memo `shown = LiveScore.foldReading (state ()) (reading ())`. The score, status, drama and forecast nodes read `shown`, so a reading that adds a score turns a started `Scheduled` card into `In progress` with that score, and the archive's `Final` always wins: a reading never makes a game `Final`, so the amnesty zone (drama text, sparkline, Pick'em grading) stays closed until the archive says the game is over.
- A sibling node `desk-card__live` (`data-testid="live"`) shows the feed's clock, `Full time`, or `live score unavailable`. Only a card of a sport the feed is asked about has it, so every other card keeps its structure byte for byte. The status line stays `In progress`: the live grouping reads that exact text.

## What was run

| check | result |
|---|---|
| `npm run build` (no warnings), `node build/VerifyMain.js` | 403 of 403 |
| the six card-rendering gate rows, `forecast-render-check` (38/38), `brief-flip-check` (20/20), `lineups-render-check` (71/71) against the new card structure | all pass, `PW_CHROMIUM` set |
| the three `live-*` entries on `foldReading` and `forecast-card-on-every-card` through the harness, with the static server up | 4 entries caught, and the harness's own check that the unmutated tree passes: the "5 of 5" this row first said counted that baseline check as a fifth entry (found by review 2026-11-11) |
| anchors | two entries moved (`forecast-card-on-every-card` reads `shown`, `live-reading-beats-archive-final` reads the new line); 0 stale |

## Not defended yet

The WIRING is not defended by any check that exists: nothing fails if the card's score memo goes back to reading `state ()`, or if the live node stops reading the reading. The pure functions are. `scripts/live-score-render-check.mjs` (the next commit of Task 6) drives a real card through the handle and is what defends the wiring; until it exists this commit claims the pure half and the structure, not the behaviour on a page.

## Correction (fix-review wf_ae397945-0b8, card F16)

`CardHandle` is `{ Game; SetState; SetReading }`: `Id` was removed in 5415065 because nothing read it. The page does not find a card by its game id; the poll joins a feed game to a card through
`h.Game.EspnEventId` inside `LiveFeed.readingFor`, and the test affordance finds a card by its position in the handle list.
