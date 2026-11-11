# The live score's pure half (CC-CMD-2026-11-11-soccer-live-scores, Task 6, part 1)

2026-11-11. `src/LiveScore.fs` (new, after `Desk.fs`), `src/Laboratory.fsproj`, `src/Suite.fs` (a group of 21), `scripts/mutation-check.mjs` (9 entries).

## What it is

The part of the live score that needs no network, no clock and no DOM: what a card may be told, when it is worth asking, and which feed key to ask.

- `LiveReading`: `NoReading`, `LiveNow(home, away, clock)`, `FullTime(home, away)`, `LiveUnavailable why`. The feed's answer about one game, reduced to what a card can show.
- `liveSportKey`: the relay's `/v2/games` key for each of the laboratory's 16 soccer sports (the relay's `V2_LEAGUES` keys; each answered 200 on the deployed relay on 2026-11-11 and an unknown key answers 400 listing all sixteen. This note first cited `SPORT_CONFIG`, which holds three of them: corrected after review). A soccer sport added without a key fails a Suite check whose input is derived from the sport list.
- `LivePollMs = 60000`, `liveWindowAfterStart = 3 h`, `inLiveWindowAt`, `liveKeysAt`, `liveWorkAheadAt`: the poll's named conditions as pure functions. A card is in its window from its start time to three hours after it, inclusive at both ends; no start time is never in a window; one key per sport with a card in a window; no work ahead means the timer can stop.
- `foldReading archive reading`: folds a reading into the SAME three-case `GameState` the page already understands, so no fourth case is added. The archive's `Final` always wins, and a reading never makes a game `Final` (`FullTime` stays `InProgress`): `Final` is what opens the amnesty zone, the drama text and Pick'em grading. The fold happens in the card only; Pick'em and Stats read the archive and do not see a reading (this note first said the card, Stats and Pick'em "keep agreeing": corrected after review, parity filed as `docs/CC-CMD-2026-11-11-live-scores-tabs.md`). The first version had a second function, `stateWith`, that nothing in the page called, only the Suite; it was removed and the Suite folds `gameStateAt` itself.
- `liveNoteText`: the feed's clock, `Full time`, or `live score unavailable`, for a sibling node beside the score. The status line stays `In progress`, which the live grouping reads by exact text.

## What was run

| check | result |
|---|---|
| `npm run build` (no warnings), `node build/VerifyMain.js` | 401 of 401; the group "Live scores" is 21 of them, each carrying the input that must fail it |
| nine `live-*` table entries through the harness | 9 of 9 caught, plus the unmutated tree |

## Not here

The decoder of the feed (it needs a real live body, which `live-shape-capture` is getting tonight), the card's handles and sibling node, the poll itself in `src/Program.fs`, and the render check. Until they exist nothing on the page calls this module: it is staged for Task 6 part 2 and is not dead code, but it does nothing yet.


## Corrections after the independent review (2026-11-11)

- `liveWorkAheadAt`'s check never asked about DURING (its inputs were before the window and after it): split into three instants and two table entries (`live-work-ahead-stops-at-kickoff`, `live-work-ahead-ends-before-the-last-instant`) that fail on `now <= start` and `now < start + 3 h`.
- Fourteen of the sixteen keys were pinned by nothing: one Suite case now pins all sixteen by value, and three table entries mistype FA Cup, UEFA qualifying and World Cup keys.
- The comment that the archive finalises "15 to 45 minutes" after full time cited no measurement; it is not measured on a real match. The comment now says what is known (the archive's first score 115.5 to 135 minutes after kickoff) and that the capture's late samples are the first.
- The count above says 21 cases and 9 entries; the commit's later additions are in the notes of the commits that made them. The Suite is 422 of 422 after these corrections.
