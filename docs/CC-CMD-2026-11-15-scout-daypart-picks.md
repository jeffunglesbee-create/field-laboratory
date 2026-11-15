# Claude Code Command — a Scout's Pick per daypart, explored before it is built

**Branch:** main — commit directly, no feature branch, no PR
**Repo:** field-laboratory (LAB-FIRST-A: the computation lives here; nothing in the client or the relay)
**Filed:** 2026-11-15 by CC. The owner's word, the same day, choosing option B for the single pick: "B, and keep C for later, Opus has had a good idea with that and it deserves to be explored later."
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** HELD for exploration. Not to be built until the owner answers the design questions below. Filing is not permission to build.

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
2. **Whose clock?** FIELD's ET day (what `fieldDayAt` uses) or the viewer's local time.
3. **Empty dayparts:** said, or left out? On the slate above, most hours have no qualifier.
4. **A game across a boundary:** assigned by start time only, or eligible in every daypart it is still playing in?
5. **Relation to the single pick:** does the per-daypart view replace it, sit beside it, or appear only when the owner asks for it?

## Constraints any build must keep

- ADR-002 / RUWT: pull only. A per-daypart pick must never become a notification at the start of each daypart (field-relay-nba CLAUDE.md, Rule A). Boolean gates, no composite score shown, as now.
- The 2026-11-15 choosing rules stand: gate precedence, nearest to even, ties named, finished games skipped.

## Done condition (once the questions are answered)

To be written with the answers: a check over a real captured slate whose per-daypart choices are stated in a table computed by hand, each comparison mutated red, and a browser read of the panel. Not written now, because the dayparts themselves are not yet defined.
