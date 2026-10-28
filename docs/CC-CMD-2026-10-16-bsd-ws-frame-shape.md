# Claude Code Command — capture one raw BSD WebSocket `livedata` frame shape

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-relay-nba executes it (the BSD token is a relay secret); the
artifact is read by field-laboratory
**Filed:** 2026-10-16, by CC, from empowerment Task 0
**Status:** DONE 2026-10-28. Recorded from four live matches in seven windows; verdict below. Second sample (tracked league) captured the same evening. Session doc: `field-relay-nba/outbox/cc-session-2026-10-28-bsd-ws-frame-shape.md`.

## Why

Empowerment Task 0.2 (`docs/CC-CMD-2026-10-15-empowerment-metrics.md`) asks
whether soccer data carries off-ball XY. Its probe
(`outbox/empowerment-gravity-probe-latest.json`) read every coordinate path in
the R2 captures, which hold the REST endpoints only. One vendor surface was
NOT read, because nothing in FIELD stores it: the BSD WebSocket `livedata`
feed on the `websocket_plus` tier.

The relay's own handler says the shape has never been seen
(`field-relay-nba src/ambient-do.js`, `_bsdOnFrame`): "the actual BSD raw WS
frame shape for coordinates can't be verified without a live connection". It
keeps only the LAST element of `frame.coordinates[]`, so even a feed that
carries several players per frame would reach FIELD as one point.

The owner's lock stands either way ("REJECTED for soccer, locked … Do not
revisit for soccer without a new data source"). This command does not reopen
it. It says whether the one unread surface could ever be that new source.

## Probe block (run first, against HEAD)

```bash
git log --oneline -5
grep -n "_bsdOnFrame\|frame.coordinates\|websocket_plus" src/ambient-do.js src/index.js | head -20
```

## Task

During a live BSD soccer match whose `/bsd/events/live` row has
`websocket_plus === true`, record raw `livedata` frames VERBATIM, before
`_bsdOnFrame` distils them: at least 60 frames, or 10 minutes. Either a
runner holding the BSD token as an Actions secret, or a temporary tally inside
`_bsdOnFrame` exposed on a read-only route; neither may push anything.

## Done condition

`outbox/bsd-ws-frame-shape-latest.json` exists and states, from the recorded
frames:

1. `Object.keys(frame)` union and counts by `frame.type`.
2. `Array.isArray(frame.coordinates)` and the distribution of its length.
3. The key union of a coordinate element, and whether any element carries a
   player or team identifier (`player_id|pid|id|team|side|home`).
4. For each `frame.uts`, the count of distinct identifiers.
5. For empowerment Task 2 (Tactical Lock), two more facts:
   - every restart event type the frames carry, with counts: any `frame.type`
     or field value naming a throw-in, goal kick, free kick, corner or foul;
   - the clock grain of `frame.uts`: its unit, and the smallest nonzero step
     between consecutive frames.

   Together these say whether a 4-minute window could exclude dead time. The
   R2 captures cannot: they have no clock below the minute on any shot and no
   restart incident type (field-relay-nba run 38962367310,
   `outbox/empowerment-premises-latest.json`, `soccer.T`).

**Verdict:** if any frame holds 2 or more identified coordinates at one `uts`,
the WS feed is off-ball-instant and 0.2's population note becomes a NOT MET
for that surface. If every element is identifier-less (a ball trail), 0.2's
MET extends to the WS surface. Record which, with the frame count.

## Result, 2026-10-28 (Rule 73: date, method, conditions)

Method: `field-relay-nba/scripts/bsd-ws-capture.mjs` on a GitHub runner, runs 40619557017 and
40621873322 (plus a 109 s first window, 40619254199), subscribing to event 602466 (Boyacá Chicó v Junior
Barranquilla, Categoría Primera A, `websocket_plus: true`, second half in play). Artifact:
`field-relay-nba/outbox/bsd-ws-frame-shape-latest.json` (also `-602466.json`), raw frames beside it as
`bsd-ws-frames-602466-*.jsonl`. Coverage, in the artifact's own words: `334 frames over 600.6 s from 1 event
(602466, Categoría Primera A); the verdict describes this match on this tier, not every match`.

1. **Keys and types.** `ingest_debug` 300, `event` 25, `livedata` 8, `subscribed` 1 in the final window.
2. **`frame.coordinates`.** On `livedata` frames only; an array on 8 of 8 (14 of 14 over both full windows),
   length 0 on every one.
3. **Coordinate elements.** None exist, so there is no element key and no player or team identifier to find.
4. **Distinct identifiers per `uts`.** 0 at every `uts`.
5. **Restarts and clock.** Typed incidents are `situation` on the livedata frame: `freekick`, `corner`,
   `substitution`, `shotofftarget` seen. Throw-ins, goal kicks and fouls are cumulative counters in
   `event.stats.{home,away}`, not events. `uts` is epoch seconds, smallest step 16 s between incident frames;
   the incident match clock has `second: 0` on 8 of 8 (minute grain).

**Verdict: `COORDINATES-EMPTY`.** This is neither branch of the spec's verdict. No frame held 2 or more
identified coordinates (so 0.2's population note is not NOT MET for this surface), and no frame held any
coordinate at all (so "every element is identifier-less, a ball trail" is not shown either: a trail needs
elements). The vendor's "ball x/y about every 5 s" was not observed; livedata here is incident commentary, 6 to
8 frames in ten minutes.

**What it does not say.** One league: Categoría Primera A, Colombia's top division, which is outside the leagues the relay tracks. A match in a tracked league may differ; that is the second sample.

Two things found on the way, filed as `field-relay-nba/docs/CC-CMD-2026-10-28-bsd-ws-fanout-field-names.md`:
the relay's fan-out reads `frame.minute` and `frame.period`, which the frames do not have, and the client reads
`_bsdBallPos.x` where the relay sends `coords`.

## Second sample (2026-10-28, same evening)

Method: the same recorder, `field-relay-nba/scripts/bsd-ws-capture.mjs`, on events with BOTH `live_websocket` and
`websocket_plus` true (the first sample's selection tested only the second flag; see the relay session doc).
Artifacts per capture: `field-relay-nba/outbox/bsd-ws-frame-shape-<event>-<time>.json`, raw frames beside them.

| event | league | window | livedata | window lengths 0 / 1 / 4 |
|---|---|---|---|---|
| 602466 | Categoría Primera A | 02:12 to 02:46Z | 14 | 14 / 0 / 0 |
| 602352 | DFB Pokal | 17:20Z (1st half) | 82 | 16 / 6 / 60 |
| 602352 | DFB Pokal | 18:12Z (2nd half) | 84 | 19 / 24 / 41 |
| 602347 | DFB Pokal | 17:32Z (1st half) | 65 | 12 / 12 / 41 |
| 210143 | Serie A (a tracked league) | 17:49Z (1st half) | 147 | 25 / 28 / 94 |

Over all four (392 livedata frames): `coordinates` is a SLIDING WINDOW of up to four `{x, y}` integers, NEWEST FIRST
(216 of 233 consecutive pairs prepend, 0 append); 1014 elements, every one exactly `{x, y}`, no identifier of any kind;
window lengths 4 on 236, 1 on 70, 0 on 86. Frame of reference: one shared pitch with the home side defending x=0 and
attacking toward x=100 in the first half of four matches, and the same in the one second half measured (event 602352:
a home goal at x=93, away shots at x=11 to 19). `situation` takes seventeen values including `freekick`, `throwin`,
`goal_kick`, `corner`, `goal`, `goalkeeper_saved`, `temporary_interruption` and `gameon`; `uts` is epoch seconds with a
1 s smallest step and `time.second` is real outside Primera A.

**Verdict for 0.2: `IDENTIFIER-LESS`**, on the surface as it is served for the tracked tier. No frame holds an
identified coordinate, so the WebSocket surface is NOT off-ball-instant. It is also not a continuous ball track: the
points are recent positions at incidents. Primera A, the same two flags, carried none at all. Coverage varies by match.

**What it does not say.** Four matches, one evening, three competitions. Another league, another tier or a World Cup
match may differ; one second half is thin evidence for the frame of reference.
