# Half time (owner approved 2026-11-11, "Half time approved")

## Why

The capture of 19:54:02Z (`outbox/live-capture-efltrophy-2026-11-11-1954Z.json`) is the first real half-time body:
both EFL Trophy games `state: "live"`, clock `"45'+3'"`, `periodNum` 1, `periodLabel` `"45'"`, `situation: { elapsed: 45, isStoppage: true, isHalftime: true, ... }`,
scores 3-0 and 0-2, archive rows still unscored. There is no half-time state word. The card's note was the feed's clock, so it would have read `45'+3'`, the same
as stoppage time in play (at the one sample, about six minutes into the break; its length and the clock at its start and end were not measured). The owner approved a `Half time` note. The relay sets `isHalftime` exactly when ESPN's status name is
`STATUS_HALFTIME` (relay `adaptESPNWCSoccer`, read 2026-11-11 in the scratchpad copy of `origin/main`); `situation` is an object for a live game and null otherwise.

## What changed

| where | what |
|---|---|
| `src/LiveScore.fs` | a new reading `HalfTime of home * away`; `foldReading` folds it to `InProgress` like `LiveNow` and `FullTime` (never `Final`); `liveNoteText` says `Half time` |
| `src/LiveFeed.fs` | `FeedGame.IsHalftime`, decoded from `situation.isHalftime` (absent, null, a null `situation` and false all read false; a value that is not a boolean, or a `situation` that is not an object, fails the feed by name, like a string score); `readingFor` returns `HalfTime` for a LIVE game with both scores and the flag, and nothing else reads the flag |
| `src/Program.fs` | the test affordance `__labSetReading` accepts `halftime` |
| `src/Suite.fs` | 13 cases: the two real bodies of 19:18Z and 19:54Z as excerpts (decode, and read as `LiveNow(0,0,"18'")` and `HalfTime(3,0)`), the flag in every shape, the flag ignored on a `final` and a `pre` game, half time with no score is unavailable, the fold, the note, the reason class |
| `scripts/live-score-render-check.mjs` | 63 checks (was 58): the pinned page at half time (Half time, In progress, no drama, no reason), and scenario (h) through the poll: the flag is per game (the other league's card keeps its clock), and one tick later with the flag clear the note is the clock again |
| `scripts/live-score-probe.mjs` | the probe's decoder reads the flag (`halftimeOf`); `judgeCard` wants `Half time` at half time and the clock otherwise; the manifest gains `halfTimeMarker` (informational, like `fullTimeMarker`; the Done condition is unchanged); self-test 63 checks (was 56) |
| `scripts/check-live-probe-keys.mjs` | 10 bodies for the flag (true, false, null, absent, null situation, string and numeric flags, string, numeric and list situations); the compared shape now includes the flag; 72 checks (was 61) |
| `scripts/mutation-check.mjs` | 14 new entries (`live-halftime-*`, `live-probe-halftime-*`, `live-probe-decode-*`, `live-probe-half-time-marker-missing`); four existing entries re-anchored because the lines under them gained a neighbour |

## Measured

Suite 470/470 (was 457). 18 mutations run (14 new, 4 re-anchored): baseline 4 of 4 passing, 18 of 18 caught (2 m 50 s). Anchors 0 stale of 1433 checked.
Real bodies: both decode with the page's and the probe's decoders (checked at 19:20Z and 19:55Z before the code existed, and again by the new Suite cases).

## Not known

What the feed says in the second half after the break: seen once, in a direct read at about 20:34Z that is NOT a committed capture (`isHalftime` false, `periodNum` 2, clocks `74'` and `76'`), so no committed body shows the flag clearing;
the render check's scenario (h) assumes the flag clears, and the Suite pins only the decoder, so a body that kept the flag true after the restart would show `Half time` for the second half.
