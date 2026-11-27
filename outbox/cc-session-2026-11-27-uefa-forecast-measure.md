# CC session 2026-11-27 — UEFA forecast on tonight's cards: the data measured, nothing built or written

**Repo:** field-laboratory (the measurements ran in field-relay-nba's `archive-league-history-backfill.yml`, `dry_run` true).
**Spec:** `docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md`. **Owner words:** "Laboratory and tonight" (the surfaces), then "Yes" to "whether you want a UEFA forecast on tonight's cards"; earlier, "Seems like full season UEFA history would be extremely valuable", which the owner then said was "not a build directive but a discussion point".
**HEAD progression:** lab `96b19b1f` -> the commit that carries this file. No code changed. No smoke or SW_VERSION (lab docs only).

## What was read, and what it said

- **The lab's surfaces (source read, nothing run):** the lab's `tab-tonight` view and its Desk decode `/context/date/<date>` payloads and read `/v2/games`, one day at a time, and model the six UEFA labels as soccer for rendering; it consumes no season history. The one lab feature that needed a full season was the EPL forecaster: the archive held 26 of 380 matches, so it replayed and fitted on last season from an outside source (openfootball). No UEFA forecaster is specified in the lab (the UEFA mentions in the EPL forecaster CC-CMD are about EPL clubs' European places).
- **The data (Task 0, read-only dry runs, field-relay-nba artifacts):** ESPN lists **186 Champions League, 186 Europa League and 150 Conference League completed matches for 2025-09-01 to 2026-04-30, and the archive holds none (522)**; the archive's earliest UEFA row is 2026-05-05. The counts equal the competition format's arithmetic (144 + 16 + 16 + 8 + 2, and 108 + 16 + 16 + 8 + 2). For 2026-05-01 to 11-25, ESPN lists 57 Conference League matches and the archive holds 55 (the other two competitions were completed on 2026-11-27 with 4 rows written on the owner's word).

## Verified end to end (Rule 61), and STAGED (Rule 74)

- **Verified:** the counts above, from committed artifacts (`outbox/archive-league-history-backfill-uefa-*-2026-11-27T*.json` in field-relay-nba).
- **STAGED, Task 1 of the CC-CMD:** last season's 522 rows plus the 2 Conference League May rows. Blocked by: the owner's word for a production write of 524 rows. Unblocked when: the owner says to write them. Verify: `read-archive-label-dates.yml` `like` = `UEFA%` reads 279, 279 and 225 rows for the three competitions, and a dry run over 2025-09-01 to 2026-04-30 prints `alreadyArchived` equal to `completed`.
- **STAGED, Tasks 2 to 4:** the pre-registered fit, the UEFA line on a card, the live-card proof; each blocked on the one before and on the owner's Rule F scope confirmation (the CC-CMD says what it read: modelled, pull-only, Rule A not cleared).

## Errors, matter-of-fact

- I read the owner's "Seems like full season UEFA history would be extremely valuable" as a go-ahead and dispatched a production write (UEFA Champions League Qualifying, 2026-06-01 to 08-31, `dry_run` false). The owner said it was a discussion point. Cancelled the same minute: run `45949223836`, its Backfill step skipped, no artifact committed, no rows written (the archive stayed at 342 UEFA rows, read 2026-11-27 02:00Z). A statement of value is not a build directive; the next write waits for a sentence that names it.
- One of three dry-runs dispatched together was cancelled by the workflow's one-pending-run concurrency rule; re-dispatched alone.
