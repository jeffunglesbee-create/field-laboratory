# Claude Code Command — capture one raw BSD WebSocket `livedata` frame shape

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-relay-nba executes it (the BSD token is a relay secret); the
artifact is read by field-laboratory
**Filed:** 2026-10-16, by CC, from empowerment Task 0
**Status:** DONE 2026-10-28 for ONE match, with its limit stated: the artifact exists and answers facts 1 to 5, verdict `COORDINATES-EMPTY`. A second sample, from a top-flight match, is `field-relay-nba/docs/CC-CMD-2026-10-28-bsd-ws-top-flight-sample.md` (automated wake 2026-10-28T11:20Z). Session doc: `field-relay-nba/outbox/cc-session-2026-10-28-bsd-ws-frame-shape.md`.

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

## Second sample

Pending: written by the 2026-10-28T11:20Z wake.
