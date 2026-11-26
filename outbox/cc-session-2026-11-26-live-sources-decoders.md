# Live sources: the two BSD live feeds decoded for "is it live" (Task 6b, first half)

**Date:** 2026-11-26. **CC-CMD:** `docs/CC-CMD-2026-11-26-single-page-composition.md` (owner requirement: "we should always know when anything is live").

## Built

`src/LiveSources.fs` (new, after `LiveFeed.fs` in the fsproj): `decodeTennis`, `decodeSoccer`, `stateOf`, `drawLiveness`, `feedText`, and the types `Source`, `Liveness` (`Live` | `UnknownWord`), `FeedState` (`Answered` | `Unavailable`), `DrawLiveness`.

## Verified

- Against the REAL captures of 2026-11-26 23:38Z (`outbox/live-capture-bsd-tennis-live-20261126-2338Z.json`, `...bsd-events-live...`), inline in `Suite.fs` group "Live sources": 11 rows, each holding on its good input and failing on its counter. `npm run check:verify`: 561/561.
- Six source mutations, each run alone with `node scripts/mutation-check.mjs --only <id>`, each turned the suite red (`PASS [id] ...` = the mutation was caught): tennis unknown word read as Live; soccer unknown word read as Live; a failed feed read as `Answered []`; an unreadable feed making the draw not-live; a draw joined by any tournament; the text hiding an unreadable feed.
- `node scripts/mutation-check.mjs --anchors`: 2254 of 2257 anchors checked, 0 stale.

## STAGED (nothing on the page calls it yet)

- **What is staged:** every function above. No page code calls them.
- **What blocks it:** Task 6b's other half (fetching the two routes every poll and drawing a `Live now` line) and Task 6c (the draw section reading `drawLiveness`). Both are the next commits.
- **What unblocks it:** a `Live now` line on the Tonight surface that renders `feedText` for both feeds, and the draw section reading `drawLiveness`.
- **Verify when unblocked:** a runner capture of the deployed page showing a `Live now:` line whose tennis count equals the number of `status:"live"` rows in a same-minute capture of `/bsd/tennis/matches/live` (`scripts/live-sources-probe.mjs` already captures that).

## Not decided here, and why

The staleness threshold. The soccer feed's `last_updated` was 80 s old at the first sample (23:32:32Z fetch, 23:31:12Z stamp) and under 50 s at the second. Two observations are not a basis for a threshold (Rule 100), so `LastUpdated` is carried verbatim and nothing here turns an old stamp into UNKNOWN. Task 6d needs a census of observed ages first.

## What is NOT claimed

- Golf liveness: `/v2/games?sport=pga` answers 200 with no `games` array; the golf routes were not probed.
- Doubles: no doubles match was in the capture. A match with no player objects is labelled `match <id> (players not named in this payload)`, which is a named fallback and untested on a real payload.
- Soccer `period` words other than `1st_half`, and tennis status words other than `live`, have never been observed.
