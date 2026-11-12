# Claude Code Command — live scores for the sports that are not soccer

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-11 by CC, as the follow-up the soccer live-scores CC-CMD names under "Not in scope" (Rule 87.4: work found out of scope is filed, not carried)
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** FILED 2026-11-11. Nothing here is built. Task 1 has its two readings (2026-11-12 01:00Z and 02:00Z, `Task 1 result (nba, nhl)` below); neither held a `final` NBA or NHL game. Blocked on the soccer feature being proved on a real match (its Done condition) and on the owner saying whether other sports are wanted.

---

## Why this exists

`docs/CC-CMD-2026-11-11-soccer-live-scores.md` gives the soccer cards a live score by joining the relay's `/v2/games` feed onto the archive row. The owner's decision of 2026-11-11 was "live soccer scores", so its scope is the soccer sport keys only. `Desk.gameStateAt` is sport-agnostic: any row without both scores reads `Scheduled`, whatever the sport. Whether the other sports have the same gap on the deployed page is **not known**: for soccer the archive has been measured to hold no in-play score (966 rows since 2026-08-01, none with a score and no `finalized_at`), and no such count exists for NBA, NHL, MLB or the rest. A comment in `src/Desk.fs` says the relay's live ingest set `finalized_at` for MLB on 2026-08-09 and its backfill never did; the relay-side reading on 2026-11-11 was that the ingest paths now stamp in both. Neither was re-measured for these sports.

## Task 1 — measure, on a live evening (unblocked, armed)

The capture the soccer work built is sport-agnostic: `live-shape-capture.yml` takes a `sport` key and a `date`, and writes `outbox/live-capture-<sport>-<date>-<HHMM>Z.json` with the feed body, the archive row each game joins to, and a coverage line. Run it during live NBA, NHL and MLB games (in season: NBA and NHL tonight, any evening) and read, per sport, the count of games whose feed state is `live` and whose archive row has no score, and the count whose archive row already has one with no `finalized_at`. Ids that are not `espn:<id>` (the NHL feed uses `nhl:<id>`) cannot join by ESPN event id; the capture lists them as unmatched and says how many. **Artifact:** the committed capture files and a table in `outbox/` of live games by sport, with `checked N of M`.

*Armed 2026-11-11:* one-shot reminders to the authoring session dispatch `live-shape-capture.yml` for `nba` and `nhl` (ET day 2026-11-11) at 01:00Z and 02:00Z on 2026-11-12, when games are in play; the first review of those files is this task's artifact. (Found by review: Task 1 was called unblocked and nothing armed it.)

### Task 1 result (nba, nhl)

**Reading 1 of 2, 2026-11-12 01:00Z (ET evening of 2026-11-11, games in play).** Reading 2 (02:00Z) follows the paragraphs of this reading. Method (Rule 73): `live-shape-capture.yml` dispatched on `main` for `nba` (run 43131457238, `capturedAt` 01:00:52.632Z) and then for `nhl` (run 43131532908, `capturedAt` 01:01:26.970Z), `date` 2026-11-11; both runs `success`; files `outbox/live-capture-nba-2026-11-11-0100Z.json` and `outbox/live-capture-nhl-2026-11-11-0101Z.json`; in both, `error` null, `/v2/games` 200, `/context/date/2026-11-11` 200 with 21 archive rows. The table and its counts are in `outbox/live-other-sports-measurement-2026-11-12.md`.

| | NBA | NHL |
|---|---|---|
| `summary.byState` | `live` 3, `pre` 7 | `live` 2, `pre` 4 |
| `coverage` | `checked 10 of 10 games joined to an archive row; 3 live` | `checked 0 of 6 games joined to an archive row; 2 live` |
| join key in the feed | `espnEventId`, on 10 of 10 games | none: the id is `nhl:<nhleGameId>`, no game carries `espnEventId`; 0 of 6 joined |
| live games whose archive row has no score | **3 of 3** (`liveWithArchiveScoreNull` 3) | not measured by the capture: its `liveWithArchiveScoreNull` is 0 because 0 of 2 live games joined, which is not a count of unscored rows |
| matched archive rows with a score and no `finalized_at` | 0 of 10 | not measured (0 matched) |
| `gap` | `final in the feed with an unscored archive row: 0 of 0 final game(s)` | the same line |
| `feedShapeSeen` / `proved` | true / true | true / **false** |

**The shapes seen (one live game's exact keys, from the files).** NBA live game: `id, espnEventId, sport, league, state, start, home, away, periodNum, periodLabel, clock, venue, situation, linescores, round, streams`; `state` `live`, integer scores (the three: 46 to 47, 43 to 43, 54 to 35), `clock` `2:03`, `5:49` and `6:27`, `periodNum` 2, `periodLabel` `Q2`, `situation` `{ quarter, clock, possession }` with `possession` null in all three. NBA `pre` game: scores `0` and `0` (integers), `clock` `0.0`, `periodNum` 0, `periodLabel` `NS`, `situation` null. NHL live game: `id, nhleGameId, sport, league, state, start, home, away, periodNum, periodLabel, clock, venue, winProbState, winProbLabel, winProb, openingWP, wpDelta, recentWPHistory`; no `situation`, no `espnEventId`, no `linescores`; `state` `live`, integer scores (0 to 2 and 0 to 0), `clock` `01:13` and `11:57`, `periodNum` 1, `periodLabel` `P1`, read 61 and 31 minutes after the listed starts (00:00:00Z and 00:30:00Z); whether that clock counts down or up is not determined here. NHL `pre` game: scores `null` and `null`, `clock` `""`, `periodNum` 0, `periodLabel` `""`. Soccer's `pre` games carry score 0 and clock `0'` by the relay's adapter (the soccer captures held no `pre` game), so the three sports' `pre` shapes differ from one another.

**A direct read, not a capture (about 01:02Z, `probe_relay_route` on `/context/date/2026-11-11`).** The tool returned the first 12 KB of a 179,189-byte body, which holds the 10 NBA rows and the first NHL row in full. The NHL row `NHL_2026-11-11_e401892690` (Sabres v Lightning) has `home_score` and `away_score` null, `finalized_at` null, `start_time` `2026-11-12T00:00Z` and `espn_event_id` `401892690`; the feed's game for those teams is `nhl:2026020293`, `live`, 0 to 2. No column of that row carries the NHL game id (`nhleGameId`). That is a team-name pairing, used here as a reading and not as a design (the soccer CC-CMD joins by event id, never by name); the other NHL rows were not read.

**What this shows.** NBA has the same gap soccer has, in the one reading: 3 of 3 live games, 61 minutes after their start, have an integer score and a `Q2` clock in the feed and no score in the archive. NHL cannot use soccer's join: the one NHL archive row read carries an ESPN event id, the feed's NHL games do not, and that row has no score while its game is live. The NHL feed has no `espnEventId` to join on and the archive row has no `nhleGameId`, so an NHL overlay would need a different join, which is Task 2's to decide. **What it does not show:** what an NBA or NHL card says on the deployed page (not read in this task); any `final` game (none was in the feed, so the `Full time` gap is not measured for these sports); NHL's archive state beyond one row; MLB and every other sport (out of season or not read); any other time of day.

**Reading 2 of 2, 2026-11-12 02:00Z.** Method as for reading 1: `live-shape-capture.yml` on `main` for `nba` (run 43138363682, `capturedAt` 02:00:40.761Z, file `outbox/live-capture-nba-2026-11-11-0200Z.json`) and then `nhl` (run 43138441745, `capturedAt` 02:01:19.542Z, file `outbox/live-capture-nhl-2026-11-11-0201Z.json`), `date` 2026-11-11; both runs `success`; in both files `error` is null, `/v2/games` 200, `/context/date/2026-11-11` 200 with 21 archive rows.

| | NBA | NHL |
|---|---|---|
| `summary.byState` | `live` 7, `pre` 3 | `live` 2, `pre` 4 |
| `coverage` | `checked 10 of 10 games joined to an archive row; 7 live` | `checked 0 of 6 games joined to an archive row; 2 live` |
| live games whose archive row has no score | **7 of 7** | not measured (0 of 2 joined) |
| matched archive rows with a score and no `finalized_at` | 0 of 10 | not measured (0 matched) |
| `gap` | `final in the feed with an unscored archive row: 0 of 0 final game(s)` | the same line |
| `feedShapeSeen` / `proved` | true / true | true / **false** |

Live games: NBA, in play from 00:00Z and 01:00Z starts: `periodNum` 4 (one game, `Q4`), 3 (two, `Q3`) and 2 (four, `Q2`), `clock` `8:57`, `30.6`, `1:28`, `2:38`, `1:21`, `2:44`, `6:17`, integer scores (the first game 91 to 77). NHL: `P2` (`periodNum` 2) at `02:42` and `10:11`, integer scores (2 to 4 and 0 to 1), no `situation` key.

**How the in-play NBA and NHL games compare with soccer's (from the two readings and the soccer captures of 2026-11-11).**

| | soccer (`efltrophy`, 19:18Z to 21:21Z) | NBA | NHL |
|---|---|---|---|
| `state` words | `pre`, `live`, `final`; a break is `live` with `situation.isHalftime` | `pre`, `live` seen; `final` not seen in either reading | `pre`, `live` seen; `final` not seen |
| `clock` | minute text, `18'`, `45'+3'`, `90'+8'` | `M:SS`, and `SS.t` under a minute (`30.6`); `periodLabel` `Q2` to `Q4` seen | `MM:SS` (`01:13`, `11:57`, `02:42`, `10:11`); `periodLabel` `P1`, `P2` seen |
| archive row while the game is live | score null, `finalized_at` null (2 of 2 at 19:18Z) | score null, `finalized_at` null: 3 of 3 at 01:00Z, 7 of 7 at 02:00Z | not measurable by event id (0 of 2 joined at each reading) |
| a `pre` game's score and clock | `0` and `0'` by the relay's adapter (no `pre` game in the soccer captures) | `0`, `0.0`, `NS` | `null`, `""`, `""` |
| the feed stays `pre` after the listed start | not read | yes: Utah v Orlando, start 02:00Z, read `pre` 40.8 s after it | yes: Edmonton v Philadelphia, start 02:00:00Z, read `pre` 79.5 s after it |

**What reading 2 adds.** The NBA gap held with more games in play: 7 of 7 live games unscored in the archive, up from 3 of 3, an hour apart. The NBA `situation` is `{ quarter, clock, possession }` with `possession` null in all ten live readings of the two files. **Not shown by either reading:** a `final` NBA or NHL game (so the `Full time` gap of fact 3 of `docs/CC-CMD-2026-11-11-soccer-live-scores.md` is not measured for these sports); a game in a break (an NBA half time or an NHL intermission), so whether a break is its own state word is not observed; whether the NHL `clock` counts down or up (two readings of each game do not settle it here); the NHL archive state beyond the one row of reading 1; what any NBA or NHL card says on the deployed page.

## Task 2 — decide (owner), then build only what Task 1 shows is a gap

If a sport's in-play cards read `Scheduled` or `Final` while the match is live, the soccer overlay (`LiveFeed.readingFor`, `LiveScore.foldReading`, the poll, the `Full time` marker) is the shape to reuse, with the sport key mapping extended and each sport's own state words read from its own capture, not assumed from soccer's. The comeback line on the Stats tab already belongs to the non-soccer sports and needs nothing.

## Not in scope

Anything for soccer (the other CC-CMD); a relay change; push or notification of a score (ADR-002 Rule A).
