# The relay's drama 0 is a mark, and the stats panel now says so

**Date:** 2026-11-15. **Repo:** field-laboratory. **Files:** `src/Desk.fs`, `src/Scoreboard.fs`, `src/StatsView.fs`, `scripts/drama-reading-check.mjs`, `package.json`, `.github/workflows/verify.yml`.
**Trigger:** owner-pasted proposal 2 of 5 ("DRAMA = 0 dead air"), approved 2026-11-15. The proposal's remedy (a client-computed pre-game tension score) is not built: showing an interest level before or during a game is ADR-002 PROHIBITED #3. This fixes what the symptom actually was.

## What was measured

- `field-relay-nba/scripts/drama-backfill.mjs:361`: for a game with no `espn_event_id`, or a sport `classifySport` returns `other` for (only MLB, WNBA, AFL and soccer are scored), it writes `drama_peak = 0, drama_arc = null`. CC-CMD-2026-11-03 records 0 as the intended "cannot be scored" mark.
- ARCHIVE_DB (`cc49101c`), 2026-11-15, every row with a peak, both tables: 2,101 with peak 0 and arc the string `null`; 2,827 with a positive peak and a list of points; no other combination.
- Since 2026-08-15, in-season finals with a positive peak: CFB 0 of 733, NBA 0 of 251, NFL 0 of 176, NHL 0 of 395; MLB 624 of 627, WNBA 98 of 98, MLS 241 of 241, EPL 100 of 100. In November, 15 overtime finals carry the mark.
- The laboratory decoded the 0 as a peak; `StatsView` printed "DRAMA 0" under every one of those finals.

## What changed

`Desk.DramaReading = Scored of SealedDrama | NotScored`, decided at the decode boundary from the arc: peak 0 with no arc is `NotScored`; anything else is a reading (a 0 that carries an arc stays `Scored`). `StatsView` writes "not scored by the relay" for the mark, still behind the amnesty witness (finals only). `Scoreboard` treats the mark as no peak; those rows have no arc, so it rendered nothing for them before and still renders nothing.

## Proof

| check | result |
|---|---|
| `npm run check:drama-reading` (new; on the committed `context-2026-10-10.json`: 73 marks, 35 scored, 124 games) | 9/9 |
| same, with the `0.0, NotPresent -> NotScored` case deleted | 6/9 (three red), restored to 9/9 |
| `check:state` 11/11, `check:spark` 18/18, `check:pick` 24/24, `check:tabs` 61/61, `check` / `check:hard` / `check:render-sports` 19/19 each, `check:script-orphans`, `check:workflows` 71/71 | green |
| browser read of `#panel-stats`, `?data=context-2026-10-10` | 71 "not scored by the relay", 0 "DRAMA 0", 106 DRAMA rows (71 + 35) |

## Residuals

- Two golf rows on that capture are marks but read as Scheduled (no away score), so they get no drama row; the check counts them in its output. Golf's state reading is existing behaviour and untouched.
- The relay has no drama model for NBA, NHL, NFL or CFB. That is a product gap on the relay side, not built or filed here.
