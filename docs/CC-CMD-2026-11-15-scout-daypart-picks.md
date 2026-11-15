# Claude Code Command — Deep Cuts: a Scout's Pick per daypart, explored before it is built

**Branch:** main — commit directly, no feature branch, no PR
**Repo:** field-laboratory (LAB-FIRST-A: the computation lives here; nothing in the client or the relay)
**Filed:** 2026-11-15 by CC. The owner's word, the same day, choosing option B for the single pick: "B, and keep C for later, Opus has had a good idea with that and it deserves to be explored later."
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** HELD for exploration. Questions 1 (clusters from kickoff times), 5 (its own section) and 6 (Deep Cuts) answered 2026-11-15; 1b (the clustering method) and 2 to 4 open. Not to be built until they are answered. Filing is not permission to build.

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
2. **Whose clock?** FIELD's ET day (what `fieldDayAt` uses) or the viewer's local time.
3. **Empty dayparts:** said, or left out? On the slate above, most hours have no qualifier.
4. **A game across a boundary:** assigned by start time only, or eligible in every daypart it is still playing in?
5. **Relation to the single pick:** ANSWERED 2026-11-15 by the owner: "option c, should not replace any section of picks; it's its own thing." It is a separate section; Field's Pick, Scout's Pick and Pick'em stay as they are.
6. **Its name.** ANSWERED 2026-11-15 by the owner: **Deep Cuts**. The working name had been "What to Watch", set aside because that exact string is already a bold section header in the client's series-preview prompt (`jubilant-bassoon/src/legacy/field.js` 35199, `**What to Watch** — 2 sentences ...`), and "watch" is the word ADR-002's summary of the patent claim uses for element 4 ("Displays a **recommendation** (watch/skip/switch)"). The name is not the claim test (all four elements are, `docs/ADR-002-CONTEXT.md`), and no legal verdict is made here (Rule 45).

## Constraints any build must keep

- ADR-002 / RUWT: pull only. A per-daypart pick must never become a notification at the start of each daypart (field-relay-nba CLAUDE.md, Rule A). Boolean gates, no composite score shown, as now.
- The 2026-11-15 choosing rules stand: gate precedence, nearest to even, ties named, finished games skipped.

## Done condition (once the questions are answered)

To be written with the answers: a check over a real captured slate whose per-daypart choices are stated in a table computed by hand, each comparison mutated red, and a browser read of the panel. Not written now, because the dayparts themselves are not yet defined.
