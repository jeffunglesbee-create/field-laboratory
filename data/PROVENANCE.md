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
