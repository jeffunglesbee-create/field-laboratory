# Data provenance

Nothing in this directory is fabricated, hand-written, or shaped to make a
decoder pass. Both files are verbatim bytes from live `field-relay-nba`
responses, captured 2026-08-09.

## `context-2026-05-15.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-05-15
→ 200 application/json, 1015 bytes
```

Complete and untruncated — the whole response body, byte for byte.

**Why it is committed instead of fetched live.** This sandbox cannot reach
`*.workers.dev` directly; `curl` to the relay returns `403 CONNECT tunnel
failed`. The response was captured through the FIELD Handoff MCP's
`probe_relay_route`, which self-fetches on the worker and bypasses that block.
The browser in this environment is under the same restriction as `curl`, so a
page that fetched the relay directly could not render here at all.

**Why this date specifically.** It is the largest real response that survives
the probe tool's ~12KB display truncation intact. Busier dates return
100–190KB and come back cut off mid-object, which would mean reassembling JSON
by hand — that is where a "real" capture quietly turns into a fabricated one.
2026-05-15 predates the first captured brief, so `briefs`, `series`, and
`standings` are genuinely empty rather than trimmed.

**What it exercises, honestly.** Two real AFL games with:

- real double-encoded `drama_arc` strings (`"[15,15,36,53]"`)
- `opening_odds` / `closing_odds` genuinely `null`
- `went_to_ot` genuinely `null`
- `start_time` genuinely `null`
- `streams` genuinely `null`
- real non-null scores and `drama_peak`

**What it does not exercise.** Non-null odds, `went_to_ot = 1`, null scores, and
the seconds-less `start_time` format. Those cases are covered by
`games-2026-08-09.json` below, and the gap is called out rather than papered
over.

## `games-2026-08-09.json`

Two complete game objects lifted verbatim from:

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-08-09
→ 200 application/json, 186340 bytes
```

The full response is far past the truncation limit. Both objects were fully
present in the returned prefix and are copied **unmodified**; no field was
invented, completed, or adjusted. They were wrapped in the same `games.regular`
envelope shape the endpoint uses so the same decoder can read them. Only games
whose every byte was visible before the cut were taken — reassembling a
half-delivered object by hand is exactly where a "real" capture quietly becomes
a fabricated one.

They exist to cover exactly what 2026-05-15 cannot:

| Game | Covers |
| --- | --- |
| `MLB_2026-08-09_yankees_braves` | non-null nested-JSON odds, `went_to_ot: 1`, `drama_peak: 81`, seconds-less `start_time`, a **504-element** `drama_arc` string |
| `MLB_2026-08-09_whitesox_guardians` | **null scores** on a real scheduled game, null `drama_arc`, null `finalized_at` |

## Refreshing these

Re-probe the same routes and replace the files. If a field's shape has changed,
the decoders in `src/Desk.fs` should fail loudly rather than silently — that is
what they are for, and a decode failure on a refresh is a genuine finding worth
reporting, not a test to fix.

- `context-2026-08-29.json` — captured 2026-08-29 from `https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-08-29` by `scripts/capture-render-fixture.mjs`. 78 rows, 11 sports: Bundesliga, CFB, CFL, EPL, La Liga, Ligue 1, MLB, MLS, NFL, Serie A, WNBA. Unedited — a hand-modified fixture is an invented one.

- `context-2026-09-05.json` — captured 2026-09-05 from `https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-09-05` by `scripts/capture-render-fixture.mjs`. 126 rows, 8 sports: Bundesliga, CFB, EPL, La Liga, Ligue 1, MLB, MLS, Serie A. Unedited — a hand-modified fixture is an invented one.

- `tennis-live.json` — captured 2026-09-06 from `https://field-relay-nba.jeffunglesbee.workers.dev/bsd/tennis/matches/live` by `scripts/capture-tennis-fixture.mjs`. 11 live matches, 4 tournaments, 11 carrying sets_detail. Statuses seen: interrupted, live. Unedited — a hand-modified fixture is an invented one.

- `tennis-live.json` — captured 2026-09-06 from `https://field-relay-nba.jeffunglesbee.workers.dev/bsd/tennis/matches/live` by `scripts/capture-tennis-fixture.mjs`. 8 live matches, 3 tournaments, 8 carrying sets_detail. Statuses seen: interrupted, live. Unedited — a hand-modified fixture is an invented one.

- `tennis-draw.json` — captured 2026-09-06 from `https://field-relay-nba.jeffunglesbee.workers.dev/bsd/tennis/draw?tournament=77&season=2026` by `scripts/capture-tennis-draw.mjs`. Roland Garros 2026: 127 main-draw matches, 126 edges joined by winner identity, champion Mirra Andreeva. Ladder 64/32/16/8/4/2/1. Unedited — a hand-modified fixture is an invented one.

## `lineups-predicted.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/220230/lineups
→ 200 application/json, 5853 bytes
X-Lineup-State: predicted  X-Lineup-Fill: served
```

Captured by `scripts/capture-lineups-fixture.mjs predicted 2026-10-11`. Complete and
untruncated — the whole response body, byte for byte. The script refuses to write
if the relay's headers and the body disagree about the state, because the renderer
derives the state from the body (a committed fixture has no headers).

**What it exercises.**

- `lineup_status` genuinely `"predicted"`
- `beta` genuinely `true`
- sides `away, home` with 11 and 11 players and 12 and 12 substitutes
- `unavailable_players` present with 2 side(s)

**What it does not exercise.** The non-answers. `status-absent`,
`status-unrecognised`, `served-empty` and `upstream-failed` are not reachable by
capture — the vendor does not serve them on demand — so the decoder's branches for
them are covered by unit tests over synthetic bodies, which is a different and
weaker kind of evidence, and is said here rather than left to be assumed.

## `lineups-confirmed.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/5327/lineups
→ 200 application/json, 5973 bytes
X-Lineup-State: confirmed  X-Lineup-Fill: served
```

Captured by `scripts/capture-lineups-fixture.mjs confirmed 2026-10-10`. Complete and
untruncated — the whole response body, byte for byte. The script refuses to write
if the relay's headers and the body disagree about the state, because the renderer
derives the state from the body (a committed fixture has no headers).

**What it exercises.**

- `lineup_status` genuinely `"confirmed"`
- `beta` genuinely `false`
- sides `away, home` with 11 and 11 players and 9 and 9 substitutes
- `unavailable_players` present with 2 side(s)

**What it does not exercise.** The non-answers. `status-absent`,
`status-unrecognised`, `served-empty` and `upstream-failed` are not reachable by
capture — the vendor does not serve them on demand — so the decoder's branches for
them are covered by unit tests over synthetic bodies, which is a different and
weaker kind of evidence, and is said here rather than left to be assumed.

## `bdb-event-frames-2022-w2.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/nflverse/bdb_event_frames.json
→ 200, 1816808 bytes, X-Source: r2   (the relay's own verify, 2026-10-16T18:24:47Z)
sha256 6be5a28298239af6a5709929bbd0b52d0d96625d5f3ebfeb6482de0ae3f9d249
```

**Copied, not captured by a lab script.** This sandbox cannot reach
`*.workers.dev` (the agent proxy refuses the CONNECT), so the file was copied
byte for byte with `cp` — never parsed and re-serialised — from the artifact the
builder committed: jubilant-bassoon `outbox/nfl/bdb_event_frames.json` at
58b59a2a. That is the object the relay route serves from R2:

- **Builder:** jubilant-bassoon `scripts/build-bdb-frames.py` at commit 7726fab0,
  run 38945906448. Its report, `outbox/bdb-event-frames-build-latest.json`,
  records `artifact.sha256` as the hash above, `artifact.bytes` 1816808, and an
  R2 read-back of the same bytes with `sha256_matches: true`. The copy's sha256
  was computed after the copy and equals both.
- **Route:** field-relay-nba `outbox/verify-bdb-event-frames-latest.json`
  (relay commit 24cec24): 11 of 11 checks held at 2026-10-16T18:24:47Z on the
  deployed route: HTTP 200, 1816808 bytes, `X-Source: r2`, no `targetYear`. That
  verification counted the served bytes; it did not hash them, so "the served
  body equals this file" rests on the byte count plus the R2 read-back hash.
- `scripts/gravity-census.mjs` refuses to report unless this file's sha256 is
  the one recorded on the line above.

**Envelope.** `season` 2022 (a JSON number), `sourceDataset` "kaggle
alexandermeau/nfl-big-data-bowl-archived-data-2025", `week` 2, `events`
`ball_snap` and `pass_forward`, `playFilter` "ball_snap only on plays with
isDropback TRUE or a pass_forward frame; pass_forward on every play that has
one", `coordinateConvention` frame `offense-right`, units `yards` (left-direction
plays rotated 180 degrees by the builder), `scope` 7 of 16 games (gameIds
2022091500 and 2022091800 to 2022091805, 14 teams). No `targetYear`.

**What it exercises.** 1036 rows: 545 `ball_snap` instants and 491 `pass_forward`
instants, every release with its play's snap, 22 players per instant with
`nflId`, `team`, `pos`, `side`, `x`, `y`. 54 plays are snap-only (dropbacks with
no forward pass). In 32 snap instants, all in game 2022091803, two offensive
players carry the label C.

**What it does not exercise.**

- The ball. The builder keeps the football's rows for its convention check and
  does not emit them, so the target receiver and the release point are unknown.
- Role flags. `wasRunningRoute`, `wasInitialPassRusher`, `routeRan` and the
  targeted receiver are in the source dataset and not in the artifact, so route
  runners and coverage are line-geometry proxies (see `src/Gravity.fs`).
- 9 of the week's 16 games. Whole games were dropped in gameId order to stay
  under the relay's 2,000,000-byte ceiling.
- Any season but 2022 and any week but 2. The R2 key reads `nfl/2026/` because
  of the relay's routing year; nothing here reads it.

## `bsd-flow-finished-stats.json` and `bsd-flow-finished-incidents.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/bsd/r2/read?key=bsd/bundesliga/213708/stats.json
GET https://field-relay-nba.jeffunglesbee.workers.dev/bsd/r2/read?key=bsd/bundesliga/213708/incidents.json
data/bsd-flow-finished-stats.json: 20629 bytes, sha256 8b32776eb042ec96393bcc0565a23e647e2e628769ba23b5e743eaae7f9cafa2
data/bsd-flow-finished-incidents.json: 4859 bytes, sha256 cf327cb385aa3c18ef473d607b3c371fb047307f3f9f274bf50a48ad3ad59922
R2 upload 2026-10-10T15:30:26.790Z; captured 2026-10-17T00:06:14.539Z; run 38984743564
```

Captured by `scripts/flow-census.mjs --capture`: the R2 bytes as served, written as text and never re-serialised. Chosen by rule, not by hand: the newest-uploaded capture that recorded full time in regulation (FT at 90', no live or extra-time marker), read whole, holding at least one Flow run, one shared minute and one half-time separator.

**What it exercises.** Stage `full-time-seen`; 41 shotmap rows (41 positive xG, 0 estimated); 5 Flow run(s); 2 shared minute(s); separators at half time 1, full time 0.

**What it does not exercise.** A capture with no xG on a shot (those stay unread and are listed in outbox/flow-census-latest.json), an own-goal row or a shootout kick unless counted above, the witness (its only route is the event row, which is not part of a capture), and a capture taken in extra time.

## `bsd-flow-inplay-stats.json` and `bsd-flow-inplay-incidents.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/bsd/r2/read?key=bsd/europa/601226/stats.json
GET https://field-relay-nba.jeffunglesbee.workers.dev/bsd/r2/read?key=bsd/europa/601226/incidents.json
data/bsd-flow-inplay-stats.json: 14577 bytes, sha256 b1becb3e8565ee5751d41fe7ee32bdaea472a7eb84e834e4cf6adc493f4cf34f
data/bsd-flow-inplay-incidents.json: 2141 bytes, sha256 c4a96597e2925eb52cfa3434d6688ac3a667f8f049e04cbc356e607e3c352eb0
R2 upload 2026-10-15T20:55:55.909Z; captured 2026-10-17T00:06:14.539Z; run 38984743564
```

Captured by `scripts/flow-census.mjs --capture`: the R2 bytes as served, written as text and never re-serialised. Chosen by rule, not by hand: the newest-uploaded capture taken in play (a live period marker, no full time), read whole, holding at least one Flow run, uploaded at least 24 h before the run.

**What it exercises.** Stage `in-play`; 22 shotmap rows (22 positive xG, 0 estimated); 1 Flow run(s); 0 shared minute(s); separators at half time 1, full time 0.

**What it does not exercise.** A capture with no xG on a shot (those stay unread and are listed in outbox/flow-census-latest.json), an own-goal row or a shootout kick unless counted above, the witness (its only route is the event row, which is not part of a capture), and a capture taken in extra time.

<!-- nhl-second-wind:start -->
## `nhl-second-wind-pbp.json` and `nhl-second-wind-shifts.json`

```
GET https://api-web.nhle.com/v1/gamecenter/2026020115/play-by-play
→ 200 application/json, 149977 bytes, sha256 4947545b64ea06bd53643dc33ed1fd0705d3649c34331300b347d4889942aa4f
GET https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=2026020115
→ 200 application/json, 265898 bytes, sha256 5ec092661690c7c110fe18ba8ee7521c6ca7305c8e224732cbc25a0a0626ecb2
```

Captured by `scripts/capture-nhl-fixture.mjs`: game 2026020115, dated 2026-10-15 on
`/v1/scoreboard/now`, the newest game on the board whose own play-by-play is
regular season (gameType 2), FINAL or OFF with both scores, and has a play past
regulation. Both response bodies are written as received, byte for byte.

**What it exercises.**

- gameState `OFF`, final score 2-3
- 369 plays: 5 goals, 65 shots on goal, 44 missed, 44 blocked, 8 penalties
- 30 play(s) in period 4 or later, which the windows count apart and never window
- 747 shift-chart rows by typeCode: 517 747

**What it does not exercise.** A game in play: the witness refusals for LIVE,
CRIT, PRE, FUT and an unseen word are covered by inline bodies in the Suite. Nor
the relay's `/nhl` and `/nhl-stats` routes, which this capture bypasses. The
reference population (328 games of 2025-26) is not committed; its per-payload
hashes are in `outbox/second-wind-population-latest.json`.
<!-- nhl-second-wind:end -->

## `bdb-speed-2022.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/nflverse/bdb_speed.json
→ 200, 154615 bytes   (2026-10-18T16:11:38Z)
sha256 70472e9ac0ee3e15a6ac60af29a9df56f1b0040e6d8a04a702940ab05e3ca301
```

**Captured from the served route, by a runner.** The sandbox cannot reach
`*.workers.dev`, so jubilant-bassoon's `lab-bdb-capture.yml` (run 39143837171)
fetched it with `curl` and committed the bytes to its
`outbox/lab-bdb-capture/`. They were copied here with `cp`, never parsed or
re-serialised, and the sha256 above was recomputed after the copy and equals
that run's manifest. These are the served bytes, not the builder's committed
copy. The builders gained `sourceDataset` in jubilant-bassoon 39305c07 and
were re-run that day (`bdb-update.yml` run 39142923156, `nfl-ngs-update.yml`
run 39142925192).

**Envelope.** `season` 2022, `sourceDataset` "kaggle alexandermeau/nfl-big-data-bowl-archived-data-2025", `metric` max_speed_mph. 1648 rows keyed by BDB nflId: `name`, `team` (the 2022 club), `maxSpeedMph`, `maxSpeedYps`.

**What it exercises.** `src/Bdb.fs` through `scripts/bdb-census.mjs`, which
refuses to report unless this file's sha256 is the one recorded above.

## `bdb-tendency-fingerprint-2022.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/nflverse/bdb_tendency_fingerprint.json
→ 200, 3888 bytes   (2026-10-18T16:11:38Z)
sha256 f13c87b6191e1facc013e35f2856b7b7f0f755c8186e79ba0f625c8022891dc3
```

**Captured from the served route, by a runner.** The sandbox cannot reach
`*.workers.dev`, so jubilant-bassoon's `lab-bdb-capture.yml` (run 39143837171)
fetched it with `curl` and committed the bytes to its
`outbox/lab-bdb-capture/`. They were copied here with `cp`, never parsed or
re-serialised, and the sha256 above was recomputed after the copy and equals
that run's manifest. These are the served bytes, not the builder's committed
copy. The builders gained `sourceDataset` in jubilant-bassoon 39305c07 and
were re-run that day (`bdb-update.yml` run 39142923156, `nfl-ngs-update.yml`
run 39142925192).

**Envelope.** `season` 2022, the same `sourceDataset`, `metric` tendency_fingerprint. 32 rows keyed by team: `plays`, `dropbackRate`, `playActionRate`, `topFormation`.

**What it exercises.** `src/Bdb.fs` through `scripts/bdb-census.mjs`, which
refuses to report unless this file's sha256 is the one recorded above.

## `bdb-time-to-throw-2022.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/nflverse/bdb_time_to_throw.json
→ 200, 2373 bytes   (2026-10-18T16:11:38Z)
sha256 03e0099327a10cfa0e00a341ce24d1115bb4d8e35c7e5d8906e9367eb618b100
```

**Captured from the served route, by a runner.** The sandbox cannot reach
`*.workers.dev`, so jubilant-bassoon's `lab-bdb-capture.yml` (run 39143837171)
fetched it with `curl` and committed the bytes to its
`outbox/lab-bdb-capture/`. They were copied here with `cp`, never parsed or
re-serialised, and the sha256 above was recomputed after the copy and equals
that run's manifest. These are the served bytes, not the builder's committed
copy. The builders gained `sourceDataset` in jubilant-bassoon 39305c07 and
were re-run that day (`bdb-update.yml` run 39142923156, `nfl-ngs-update.yml`
run 39142925192).

**Envelope.** `season` 2022, the same `sourceDataset`, `metric` time_to_throw. 32 rows keyed by team: `dropbacks`, `avgTimeToThrow`.

**What it exercises.** `src/Bdb.fs` through `scripts/bdb-census.mjs`, which
refuses to report unless this file's sha256 is the one recorded above.

## `depth-charts-2026.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/nflverse/depth-charts.json
→ 200, 20937 bytes   (2026-10-18T16:11:38Z)
sha256 24eb9cdbe17ab707ee30dd78a40c6a14ea91f608521b6794485028e40f9ab8bb
```

**Captured from the served route, by a runner.** The sandbox cannot reach
`*.workers.dev`, so jubilant-bassoon's `lab-bdb-capture.yml` (run 39143837171)
fetched it with `curl` and committed the bytes to its
`outbox/lab-bdb-capture/`. They were copied here with `cp`, never parsed or
re-serialised, and the sha256 above was recomputed after the copy and equals
that run's manifest. These are the served bytes, not the builder's committed
copy. The builders gained `sourceDataset` in jubilant-bassoon 39305c07 and
were re-run that day (`bdb-update.yml` run 39142923156, `nfl-ngs-update.yml`
run 39142925192).

**Envelope.** `season` 2026, `sourceDataset` "nflverse depth_charts parquet". 32 teams, each a map from depth-chart position (`QB`, `RB`, `WR`, `TE`, …) to the starter's name. Current data: it changes weekly, so this capture is one week's chart.

**What it exercises.** `src/Bdb.fs` through `scripts/bdb-census.mjs`, which
refuses to report unless this file's sha256 is the one recorded above.

## `bsd-flow-event-213708.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/by-date?date=2026-10-10&league_id=5
→ 200; the row with `"id":213708`, 3178 bytes   (2026-10-18)
sha256 59f071155f8c8206c85a1c58462013ac2b8121ef379d63312faba7b5afc1f152
```

**The row as served, cut from the response by its own braces.** It is not
re-serialised. jubilant-bassoon `scripts/lab-flow-event-rows.mjs` (runs
39148931854 and 39149405673) wrote it to `outbox/lab-flow-event-rows/`, and it
was copied here with `cp`. FC Augsburg v FC Bayern München, `event_date` 2026-10-10T13:30:00+00:00, `status` finished, `period` FT.

**Why it is here.** `Flow.witnessAfterKickoff` takes a capture's own event row
as its only route to a witness, so `bsd-flow-finished-*` (whose `event_id` is 213708) is
drawn on the Metrics tab only with this row beside it.

**Measured while capturing.** The relay's `/bsd/events/by-date` ignores
`offset`: offset=50 returns page one, with `previous` null. A day with more than
50 events therefore hides the rest, which is why 213708 was found only with a
league filter.

## `bsd-flow-event-601226.json`

```
GET https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/by-date?date=2026-10-15&league_id=83
→ 200; the row with `"id":601226`, 2241 bytes   (2026-10-18)
sha256 b4e1ea2c6154b1f12c38ac3729323252b6c14472135a706bf5a1001dd27d4bfc
```

**The row as served, cut from the response by its own braces.** It is not
re-serialised. jubilant-bassoon `scripts/lab-flow-event-rows.mjs` (runs
39148931854 and 39149405673) wrote it to `outbox/lab-flow-event-rows/`, and it
was copied here with `cp`. GNK Dinamo Zagreb v RSC Anderlecht, `event_date` 2026-10-15T19:00:00+00:00, `status` finished, `period` FT.

**Why it is here.** `Flow.witnessAfterKickoff` takes a capture's own event row
as its only route to a witness, so `bsd-flow-inplay-*` (whose `event_id` is 601226) is
drawn on the Metrics tab only with this row beside it.

**Measured while capturing.** The relay's `/bsd/events/by-date` ignores
`offset`: offset=50 returns page one, with `previous` null. A day with more than
50 events therefore hides the rest, which is why 213708 was found only with a
league filter.

## `nhl-second-wind-population/`

```
GET https://api-web.nhle.com/v1/gamecenter/<id>/play-by-play
GET https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=<id>
ids 2025020001 + 4k, k = 0..327 (2025-26 regular season, every fourth game)
328 of 328 games written, 656 files, 131,448,424 bytes; run 39159881789
per-file sha256: nhl-second-wind-population/MANIFEST.json
```

**The census's own bytes.** `scripts/second-wind-population.mjs
--capture-population` (in `empowerment-data.yml`) kept every response body
the census decoded and wrote it verbatim. It stops the run if a written file's
sha256 is not the one the census recorded for that game. The same run
reproduced the census exactly:
- 328 of 328 games decoded and witnessed;
- 11,807 skater-games: Insufficient 11,232, PopulationRate 551, SecondWind 15,
  TrailingRate 9;
- 7/7 gates (`outbox/second-wind-population-latest.json`).

**Why it is here.** The owner chose this on 2026-10-18, option 1 of
`docs/CC-CMD-2026-10-18-second-wind-population-capture.md`. The Metrics tab
forms the Second Wind curve with `Stamina.staminaCurve` from these bytes on
its section's first expand, and draws one subject per state. One committed
game could not form a curve at all.

**Cost, stated.** 131 MB in the repository's history, and the same weight on
the deployed site, fetched by a browser only when that section is opened.


- `context-2026-10-10.json` — captured 2026-10-28 from `https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-10-10` by `scripts/capture-render-fixture.mjs`. 125 rows, 13 sports: Bundesliga, CFB, CFL, EPL, La Liga, Ligue 1, MLB, MLS, NBA, NHL, PGA Tour, Serie A, golf. Unedited — a hand-modified fixture is an invented one.

- `context-2026-10-10.json` — captured 2026-10-28 from `https://field-relay-nba.jeffunglesbee.workers.dev/context/date/2026-10-10` by `scripts/capture-render-fixture.mjs`. 125 rows, 13 sports: Bundesliga, CFB, CFL, EPL, La Liga, Ligue 1, MLB, MLS, NBA, NHL, PGA Tour, Serie A, golf. Unedited — a hand-modified fixture is an invented one.
