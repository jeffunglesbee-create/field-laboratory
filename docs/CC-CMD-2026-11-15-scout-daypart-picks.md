# Claude Code Command — Deep Cuts: a Scout's Pick per daypart, explored before it is built

**Branch:** main — commit directly, no feature branch, no PR
**Repo:** field-laboratory (LAB-FIRST-A: the computation lives here; nothing in the client or the relay)
**Filed:** 2026-11-15 by CC. The owner's word, the same day, choosing option B for the single pick: "B, and keep C for later, Opus has had a good idea with that and it deserves to be explored later."
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** HELD for exploration. Questions 1 and 2 (the owner's standard ET windows), 5 (its own section) and 6 (Deep Cuts) answered 2026-11-15; weekend morning windows added the same day, 7pm moved to 7:30pm 2026-11-16; open: the shared 11:00 edge, games in no window, and 3 to 4. Not to be built until they are answered. Filing is not permission to build.

---

## What C is

Today Scout's Pick is one game for the slate (`Scout.chooseScoutAt`: gate precedence, then nearest to even, level games named, finished games skipped so the pick rolls forward). C would add one Scout's Pick **per daypart**: the best hidden game in each part of the day, chosen by the same rules within that part.

It was raised in chat as option (c), next to (a) "no change" and (b) "skip finished games". (b) was built the same day (`outbox/scout-rolling-pick-2026-11-15.md`).

## What exists to build on (read 2026-11-15, field-laboratory main)

- `Scout.chooseScoutAt (now) (games) (seriesEntries)` returns `Chosen | AllFinished | NoneQualify`. A per-daypart version could call it once per daypart's games without changing its rules.
- `Desk.Game.StartTime` (parsed `start_time`, ISO with no seconds) and `Desk.fieldDayAt`, which already puts a day in FIELD's canonical ET zone.
- The client's "Conflict" chip (jubilant-bassoon `docs/CC-CMD-2026-06-15-client-features.md`: "when 3+ games share a time slot") is the only existing notion of a slot in either repo, and it is per start time, not per daypart. A search of both repos for "daypart" found none.

## Measured, to ground the questions

The 2026-11-14 slate, ARCHIVE_DB `regular_season_games`, `start_time` by ET hour (UTC-5, valid after 2026-11-01), 75 games with a start time:

| ET hour | games | sports |
|---|---|---|
| 12 | 10 | CFB |
| 13 | 5 | NHL, CFB |
| 14 | 2 | CFB |
| 15 | 14 | NHL, CFB |
| 16 | 3 | CFB |
| 17 | 3 | CFB |
| 18 | 3 | CFB |
| 19 | 21 | NBA, NHL, CFB |
| 20 | 4 | NBA, NHL |
| 21 | 4 | NHL, CFB |
| 22 | 5 | NHL, CFB |
| 23 | 1 | CFB |

One Saturday in CFB season. Slot boundaries drawn from it would be drawn from one day of one sport mix; a weekday, a soccer morning and a summer MLB slate are different shapes.

## Questions for the owner (each changes what gets built)

1. **Where do dayparts come from?** Fixed clock boundaries (e.g. afternoon / evening / late), or clusters in each slate's own start times (the 12, 15 and 19 ET peaks above)? Fixed boundaries are numbers someone chooses, which the 2026-11-15 ruling on choosing ("nothing arbitrary or invented") argues against; clusters come from the data but move night to night.
   ANSWERED 2026-11-15 by the owner: **clusters from each slate's kickoff times.** Measured the same day on 2026-11-14 (ARCHIVE_DB, `start_time` grouped exactly, 74 games in 25 distinct kickoff slots): kickoffs run every 15 to 60 minutes from 17:00Z to 04:00Z (noon to 11pm ET) with no gap longer than 60 minutes, and the 60-minute gap occurs three times (18:00 to 19:00Z, 19:00 to 20:00Z, 01:00 to 02:00Z). One further game on that date's slate kicks off 2026-11-15T18:00Z, a day later (the rescheduled CFB row recorded in field-relay-nba `docs/CC-CMD-2026-10-16-cfl-archive-date-keying.md`). So the clustering METHOD is still open (1b): every method has a setting, and on this slate the ones without a chosen number give
   - split at the slate's largest gap: with the next-day game in, the largest gap is 14 h and the whole Saturday is one cluster; with games outside the slate's FIELD day left out, four clusters of 14 / 2 / 48 / 10 games (12 to 1pm, 2pm, 3 to 8pm, 9 to 11pm ET);
   - anchor on the slots carrying more games than the slate's average slot (2.96): eight anchors (12:00, 13:00, 15:00, 15:30, 19:00, 19:30, 20:00, 22:00 ET), each game joining its nearest.
   A gap threshold would give the familiar noon / 3:30 / 7:30 windows, and is a chosen number.
   SUPERSEDED the same day by the owner's standard format: **"12pm, 3pm, 7pm, and 10pm with an hour on each side", all 7 days**, i.e. ET windows 11:00-13:00, 14:00-16:00, 18:00-20:00, 21:00-23:00. They do not overlap, so an edge kickoff (13:00, 20:00) belongs to one window only. Measured on ARCHIVE_DB `regular_season_games`, 2026-10-16 to 2026-11-14 (1,254 games with a start time; ET from UTC by the US switch, EDT before 2026-11-01, EST after):
   - **1,037 in a window (83%), 217 in none (17%); 292 exactly on an edge.**
   - Outside, by ET kickoff: 10:00 47 (EPL, Serie A, Ligue 1, FA Cup), 20:30 27 (NBA, NHL, MLS, CFB), 09:00 22, 09:30 20 (Bundesliga, NFL London), 17:00 14, 13:30 12, 16:25 9 and 16:05 5 (NFL late), 20:15 8 and 20:20 4 (NFL night), 10:30 8, 16:30 6, 16:15 6, 10:15 6, 08:00 6, 07:30 4, 06:30 3, and smaller.
   - Outside, by league: FA Cup 34 of 40, Bundesliga 25 of 36, EPL 23 of 40, Serie A 22 of 50, MLS 22 of 75, NFL 28 of 57, La Liga 16 of 41, CFB 18 of 297, NBA 13 of 200, NHL 3 of 207. The UEFA competitions fit (Champions League 36 of 36, Europa 35 of 36, Conference 35 of 36).
   Open with it: whether a window is added for European weekend mornings (119 games kick off before 11:00 ET, a few of them NFL London at 09:30), and what happens to a game in no window (left out of Deep Cuts, or joined to the nearest).
   ANSWERED the same day by the owner: **"730am and 10am weekends as well for European soccer"**, i.e. on Saturdays and Sundays (the ET day) two more windows, 06:30-08:30 and 09:00-11:00. Measured again on the same 30 days:
   - **1,154 in a window (92%), 100 in none**: 64 on weekends, 36 on weekdays.
   - Still outside, by ET kickoff: 20:30 27 (16 weekday, 11 weekend: NBA, NHL, MLS, CFB), 17:00 14 (weekend: CFB, MLB, MLS, NBA, NHL), 16:05/16:15/16:25/16:30 25 (weekend NFL late games, CFB, MLS, CFL), 13:30 12 (7 weekend: CFB, MLS, La Liga, EPL, Bundesliga; 5 weekday Serie A), 20:15/20:20 12 (NFL night), 17:30 3, 10:30 2 (weekday Europa / Conference), 00:00 4 (PGA Tour), 16:05 1 (weekday Ligue 1).
   - **The 10am window ends at 11:00, where the 12pm window begins**, so a weekend 11:00 kickoff is in two windows: 5 such games in the 30 days. Which one it belongs to is open.
   Still open: the 11:00 edge, and the 100 games in no window.
   CHANGED 2026-11-16 by the owner: **the 7pm window moves to 7:30pm**, i.e. 18:30-20:30 ET. Measured on the same 30 days before the change was agreed: it gains 39 games (20:30 27 NBA, NHL, MLS, CFB; 20:15 8 and 20:20 4 NFL night games) and loses 17 (18:00 15 NHL, CFB, NBA; 18:15 2 CFB): **1,176 of 1,254 in a window (93.8%), 78 in none.** It still ends before the 10pm window begins (21:00), so it shares no edge.

   ANSWERED 2026-11-16 by the owner: **a weekend 11:00 kickoff belongs to the 10am window** (5 games in the 30 days). On weekdays there is no 10am window, so 11:00 belongs to the 12pm window. Asked the same day, measured, not changed: moving the 3pm window to 3:30pm (14:30-16:30) gains 26 (16:05 5 NFL, Ligue 1; 16:15 6 CFB; 16:25 9 NFL; 16:30 6 MLS, CFB, CFL) and loses 32 (14:00: La Liga, EFL Trophy, Ligue 1, NHL, MLS, CFB), 1,170 inside against 1,176.

   CHANGED 2026-11-16 by the owner: **the afternoon becomes 12pm / 2pm / 4pm**, i.e. 11:00-13:00, 13:00-15:00, 15:00-17:00, replacing 11:00-13:00 and 14:00-16:00. Measured before it was agreed: 1,228 of 1,254 in a window (97.9%), 26 in none (18:00 15, 00:00 4 PGA Tour, 17:30 3, 18:15 2, 10:30 2 weekday Europa / Conference). The alternative asked about the same day, 2pm plus 3:30pm, reached 1,214 but put 135 games in both windows, and was not taken. Two new shared edges: **13:00 (56 games) and 15:00 (102, including the midweek Champions League slot)**, each open: which window it belongs to.

   **The windows, as they now stand (ET):** every day 11:00-13:00, 13:00-15:00, 15:00-17:00, 18:30-20:30, 21:00-23:00; Saturdays and Sundays also 06:30-08:30 and 09:00-11:00. Shared edges, all ruled: 11:00 on weekends to the 10am window; **13:00 to the 12pm window and 15:00 to the 4pm window** (owner, 2026-11-16).

   The 26 in no window, read row by row the same day: 4 are PGA Tour rows whose `start_time` is local midnight ET with no `home` or `away` (a tournament dated, not a tee time; two of them carry a start the day before their `date`). They have no sides and no moneyline, so no gate can qualify them and they never reach Deep Cuts. The other 22 are each 30 minutes or less from a window: 17:30 (3) is 30 min after the 4pm window; 18:00 (15) and 18:15 (2) are 30 and 15 min before the 7:30pm window; weekday 10:30 (2) is 30 min before the 12pm window. No kickoff in the 30 days sits equidistant between two windows (17:45 would). Whether they join the nearest window is the owner's to confirm.
2. **Whose clock?** ANSWERED by the standard format: ET, the same windows every day. FIELD's ET day (what `fieldDayAt` uses) or the viewer's local time.
3. **Empty dayparts:** said, or left out? On the slate above, most hours have no qualifier.
4. **A game across a boundary:** assigned by start time only, or eligible in every daypart it is still playing in?
5. **Relation to the single pick:** ANSWERED 2026-11-15 by the owner: "option c, should not replace any section of picks; it's its own thing." It is a separate section; Field's Pick, Scout's Pick and Pick'em stay as they are.
6. **Its name.** ANSWERED 2026-11-15 by the owner: **Deep Cuts**. The working name had been "What to Watch", set aside because that exact string is already a bold section header in the client's series-preview prompt (`jubilant-bassoon/src/legacy/field.js` 35199, `**What to Watch** — 2 sentences ...`), and "watch" is the word ADR-002's summary of the patent claim uses for element 4 ("Displays a **recommendation** (watch/skip/switch)"). The name is not the claim test (all four elements are, `docs/ADR-002-CONTEXT.md`), and no legal verdict is made here (Rule 45).

## Constraints any build must keep

- ADR-002 / RUWT: pull only. A per-daypart pick must never become a notification at the start of each daypart (field-relay-nba CLAUDE.md, Rule A). Boolean gates, no composite score shown, as now.
- The 2026-11-15 choosing rules stand: gate precedence, nearest to even, ties named, finished games skipped.

## Done condition (once the questions are answered)

To be written with the answers: a check over a real captured slate whose per-daypart choices are stated in a table computed by hand, each comparison mutated red, and a browser read of the panel. Not written now, because the dayparts themselves are not yet defined.
