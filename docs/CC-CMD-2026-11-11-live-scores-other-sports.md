# Claude Code Command — live scores for the sports that are not soccer

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-11 by CC, as the follow-up the soccer live-scores CC-CMD names under "Not in scope" (Rule 87.4: work found out of scope is filed, not carried)
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** FILED 2026-11-11. Nothing here is built, and nothing here is measured: the first task is a measurement. Blocked on the soccer feature being proved on a real match (its Done condition) and on the owner saying whether other sports are wanted.

---

## Why this exists

`docs/CC-CMD-2026-11-11-soccer-live-scores.md` gives the soccer cards a live score by joining the relay's `/v2/games` feed onto the archive row. The owner's decision of 2026-11-11 was "live soccer scores", so its scope is the soccer sport keys only. `Desk.gameStateAt` is sport-agnostic: any row without both scores reads `Scheduled`, whatever the sport. Whether the other sports have the same gap on the deployed page is **not known**: for soccer the archive has been measured to hold no in-play score (966 rows since 2026-08-01, none with a score and no `finalized_at`), and no such count exists for NBA, NHL, MLB or the rest. A comment in `src/Desk.fs` says the relay's live ingest set `finalized_at` for MLB on 2026-08-09 and its backfill never did; the relay-side reading on 2026-11-11 was that the ingest paths now stamp in both. Neither was re-measured for these sports.

## Task 1 — measure, on a live evening (unblocked, armed)

The capture the soccer work built is sport-agnostic: `live-shape-capture.yml` takes a `sport` key and a `date`, and writes `outbox/live-capture-<sport>-<date>-<HHMM>Z.json` with the feed body, the archive row each game joins to, and a coverage line. Run it during live NBA, NHL and MLB games (in season: NBA and NHL tonight, any evening) and read, per sport, the count of games whose feed state is `live` and whose archive row has no score, and the count whose archive row already has one with no `finalized_at`. Ids that are not `espn:<id>` (the NHL feed uses `nhl:<id>`) cannot join by ESPN event id; the capture lists them as unmatched and says how many. **Artifact:** the committed capture files and a table in `outbox/` of live games by sport, with `checked N of M`.

*Armed 2026-11-11:* one-shot reminders to the authoring session dispatch `live-shape-capture.yml` for `nba` and `nhl` (ET day 2026-11-11) at 01:00Z and 02:00Z on 2026-11-12, when games are in play; the first review of those files is this task's artifact. (Found by review: Task 1 was called unblocked and nothing armed it.)

## Task 2 — decide (owner), then build only what Task 1 shows is a gap

If a sport's in-play cards read `Scheduled` or `Final` while the match is live, the soccer overlay (`applyLive`, the poll, the `Full time` marker) is the shape to reuse, with the sport key mapping extended and each sport's own state words read from its own capture, not assumed from soccer's. The comeback line on the Stats tab already belongs to the non-soccer sports and needs nothing.

## Not in scope

Anything for soccer (the other CC-CMD); a relay change; push or notification of a score (ADR-002 Rule A).
