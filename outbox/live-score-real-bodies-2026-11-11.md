# The first real bodies of a soccer match in play (2026-11-11, EFL Trophy 19:00Z)

Rule 73: each line says what was observed, how, and under what conditions. Method for the committed files: `live-shape-capture.yml` dispatched on `main` with
`sport=efltrophy date=2026-11-11` (it GETs `/v2/games` and `/context/date/<date>` once and commits `outbox/live-capture-efltrophy-2026-11-11-<HHMM>Z.json`).
Method for the direct reads: `mcp__FIELD_Handoff__probe_relay_route` (the sandbox cannot reach `*.workers.dev`; curl returned HTTP 000).

| when (UTC) | method | what the feed said | what the archive row said |
|---|---|---|---|
| 19:18:54 | capture `1918Z` (run 43086012087) | both games `state: "live"`, 0-0, clock `18'`, `periodNum` 1, `situation` an object, `isHalftime: false` | `home_score`, `away_score`, `finalized_at` null on both (the archive premise) |
| 19:54:02 | capture `1954Z` (run 43091429614) | both `live`, 3-0 and 0-2, clock `45'+3'`, `periodNum` 1, `periodLabel` `45'`, `isStoppage: true`, `isHalftime: true` (no half-time state word) | null on both |
| ~20:34 | direct read | both `live`, 4-2 and 0-2, clocks `74'` and `76'`, `periodNum` 2, `isHalftime: false`, `isStoppage: false` (NOT a committed capture) | not read |
| ~20:58 | direct read | both `state: "final"`, 5-2 clock `90'+3'` and 0-4 clock `90'+8'`, `periodNum` 0, `periodLabel` `""`, `situation: null` | not read |
| 20:59:30 | capture `2059Z` (run 43099150234) | both `final` (same scores and clocks) | null on both: `finalWithArchiveUnscored` 2 of 2 |
| ~21:10 | direct reads `/context/game/<id>` | not read | 401911177 `finalized_at` 21:00:26, 5-2; 401906340 `finalized_at` 21:00:28, 0-4; `game_recap` briefs created 21:00:27 and 21:00:29 |
| 21:21:25 | capture `2121Z` | both `final` | scored on both: unscored 0 of 2 |

Keys of a live game: `id`, `espnEventId`, `sport`, `league`, `state`, `start`, `home`, `away`, `clock`, `periodNum`, `periodLabel`, `venue`, `round`, `situation`
(`elapsed`, `isStoppage`, `isHalftime`, `isShootout`, `manAdvantage`, `homeSOT`, `awaySOT`, `hasStats`), `matchEvents`, `streams`, `winProb`, `openingWP`, `wpDelta`,
`recentWPHistory`, `openingAdvanceProb` (and `_crunch` late in the match). A `final` game carries `id` through `situation: null`, `matchEvents` and `streams` and none of the win-probability keys.
The page reads `espnEventId`, `state`, `home.score`, `away.score`, `clock` and `situation.isHalftime`; the win-probability keys are the relay's and are not read.

## What this settles

- The feed shape the stack assumed (state `live`, integer scores, a string clock) is what the relay serves. The page's and the probe's decoders read all three committed bodies unchanged.
- At half time there is no state word: `situation.isHalftime` is the only signal (the Half time marker, owner approved).
- The flag clears in the second half and the clock continues (direct read at ~20:34Z).
- The Full time gap is real on a real match: feed `final` with an unscored archive row for at least 1.5 minutes (20:58Z to 20:59:30Z observed, ending 21:00:26Z), at most one `*/15` tick.
  The archive finalised 120.4 minutes after kickoff, inside CC-CMD fact 3's 115.5 to 135 range and inside the 3 h window.

## What it does not settle

- One match, two games, one tick. The gap's width is a sample. Extra time and a shootout were not seen, and neither was stoppage time of the second half while live.
- The capture runs at 20:20Z to 20:50Z did not happen: run 43096288444 (dispatched 20:28:44Z) ended `startup_failure` after 9 minutes queued (GitHub-side; no job ran), and the routines for those slots did not dispatch.
  The 19:10Z, 19:45Z, 20:20Z, 20:50Z, 21:00Z and 21:12Z routines each fired late or not at all; the captures that exist were dispatched by the authoring session's redundancy reminders (19:18Z, 19:54Z, 20:58Z, 21:22Z).
- The poll has still not run against a real match: the stack is not on `main`.
