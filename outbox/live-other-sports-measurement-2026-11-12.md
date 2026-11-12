# Other-sports live measurement, readings 1 and 2 of 2 (2026-11-12 01:00Z and 02:00Z), the table of docs/CC-CMD-2026-11-11-live-scores-other-sports.md Task 1

Method (Rule 73): `live-shape-capture.yml` on `main`, dispatched by the authoring session's 01:00Z and 02:00Z reminders; ET evening of 2026-11-11 (20:00 ET), NBA and NHL games in play. Counts below were computed from the two committed files by a script that reads `v2.body.games` and `joins` (scratch script, not committed), and checked against each file's own `summary` and `coverage`.

| sport | file | capturedAt | games in feed | live | pre | final | `checked N of M` (the file's `coverage`) | live with an unscored archive row | archive rows scored with no `finalized_at` | `feedShapeSeen` | `proved` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| nba | `live-capture-nba-2026-11-11-0100Z.json` (run 43131457238) | 2026-11-12T01:00:52.632Z | 10 | 3 | 7 | 0 | checked 10 of 10 games joined to an archive row; 3 live | 3 of 3 | 0 of 10 | true | true |
| nhl | `live-capture-nhl-2026-11-11-0101Z.json` (run 43131532908) | 2026-11-12T01:01:26.970Z | 6 | 2 | 4 | 0 | checked 0 of 6 games joined to an archive row; 2 live | not measured (0 of 2 joined) | not measured (0 matched) | true | false |
| nba | `live-capture-nba-2026-11-11-0200Z.json` (run 43138363682) | 2026-11-12T02:00:40.761Z | 10 | 7 | 3 | 0 | checked 10 of 10 games joined to an archive row; 7 live | 7 of 7 | 0 of 10 | true | true |
| nhl | `live-capture-nhl-2026-11-11-0201Z.json` (run 43138441745) | 2026-11-12T02:01:19.542Z | 6 | 2 | 4 | 0 | checked 0 of 6 games joined to an archive row; 2 live | not measured (0 of 2 joined) | not measured (0 matched) | true | false |

Coverage, said where the result is read (Rule 91): the NBA row is over all 10 games of the feed; the NHL row is over 0 of 6, because the NHL feed's id is `nhl:<nhleGameId>` and carries no `espnEventId`, so the capture's join (by ESPN event id) matched nothing. The NHL "not measured" cells are not zeros.

Not in this table: any sport but the two; any `final` game (none in either feed at this reading); what the cards say on the deployed page. Reading 2 (02:00Z) is the last two rows; the comparison with soccer's state words, clocks and archive rows is in the CC-CMD's `Task 1 result (nba, nhl)`.
