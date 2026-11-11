# The feed's decoder and the reading for a card (CC-CMD-2026-11-11-soccer-live-scores, Task 6, part 4)

2026-11-11. `src/LiveFeed.fs` (new, after `LiveScore.fs`), `src/Laboratory.fsproj`, `src/Suite.fs` (a group of 14), `scripts/mutation-check.mjs` (9 entries).

## The shape it reads, as served

Two probes on 2026-11-11 of the relay's `/v2/games` (`?sport=epl&date=2026-11-08`, five finished games; `?sport=efltrophy&date=2026-11-11`, tonight's two matches before kickoff): a body `{ sport, date, games: [...], count, source, ts }`; a game `{ id: "espn:401879240", espnEventId: "401879240", sport, league, state, start, home: { name, abbr, score }, away: { ... }, clock, periodNum, periodLabel, venue, round, situation, matchEvents, streams }`. A game not yet started reports `state: "pre"`, `score: 0` (an integer, not null) and `clock: "0'"`; a finished one `state: "final"` and a clock such as `90'+9'`.

## What it does

- `decodeFeed`: the games of a body, reduced to `{ EspnEventId, State, HomeScore, AwayScore, Clock }`. A body with no `games` list, a game with no `espnEventId` or no `state`, or a body that is not JSON is an error that says so; nothing reads as an empty slate.
- `feedPath key day`: the route and query. The day is always the ET field day, because the relay's default is the UTC day.
- `readingFor feed game`: the join is by ESPN event id (the archive says `Man Utd`, the feed `Manchester United`). `pre` is no reading and its score 0 is never read; `live` with both scores is `LiveNow` with the feed's clock verbatim (an empty clock is none); `final` with both scores is `FullTime`; a card with no ESPN event id, a feed with no game for the card, a state word this page does not read, and a live or final game with no score each give `LiveUnavailable` with the reason.

## What was run

| check | result |
|---|---|
| `npm run build` (no warnings), `node build/VerifyMain.js` | 419 of 419; the group "Live feed" is 14, each with its counterexample (one had none and the harness refused it: its predicate varied only one of the two scores) |
| nine `feed-*` table entries through the harness | 9 of 9 caught, plus the unmutated tree |

## Not known, and the gate on landing this

**No body of a game IN PLAY has been captured.** The state word `live` and the keys of a game in play are the relay adapter's, read in its source (`adaptESPNWCSoccer`), not observed; the test bodies are excerpts of the two probes above with `matchEvents` and `streams` left out. `live-shape-capture` takes the real one tonight (2026-11-11 19:10Z to 20:50Z, EFL Trophy). Until a capture shows `state: "live"` with integer scores, a clock string and an archive row with no score, this decoder is not landed on `main` and the poll that calls it is not built. If tonight's keys differ, this file changes first.
