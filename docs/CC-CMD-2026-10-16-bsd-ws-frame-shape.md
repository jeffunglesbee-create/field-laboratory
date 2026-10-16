# Claude Code Command — capture one raw BSD WebSocket `livedata` frame shape

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-relay-nba executes it (the BSD token is a relay secret); the
artifact is read by field-laboratory
**Filed:** 2026-10-16, by CC, from empowerment Task 0
**Status:** FILED, not started.

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
