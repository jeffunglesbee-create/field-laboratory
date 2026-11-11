# The live-score poll (CC-CMD-2026-11-11-soccer-live-scores, Tasks 6 and 7)

2026-11-11. `src/Program.fs` (a marked region), `scripts/check-live-score-poll.mjs` (new), `scripts/live-score-render-check.mjs` (extended), `package.json` and `.github/workflows/verify.yml` (one step), `scripts/mutation-check.mjs` (12 entries).

## What it is

The laboratory's only timer, on the owner's ruling of 2026-11-11 ("Auto-poll while a match is live"). In `src/Program.fs`, between `// ── live score poll: begin` and `// ── live score poll: end`:

- one `setInterval`, every `LiveScore.LivePollMs` (60 s); one immediate tick at start, so a viewer who opens the page during a match does not wait a minute;
- a request only while the tab is visible, only for a sport key with a card inside its live window (kickoff to three hours after it), at most one request per key per tick and none while the previous one for that key is in flight;
- the timer stops when no soccer card has a window now or ahead, and when the slate is re-rendered (`disposePrevious`); none starts on a page pinned to a capture (`?data=`);
- the answer goes to each in-window card of that key through `CardHandle.SetReading`; a request that fails, or a body that cannot be read, is `LiveUnavailable` with the reason and shows `live score unavailable` on the card. No fallback and no last-good value: a stale score is a wrong one.

## What says so afterwards

`scripts/check-live-score-poll.mjs` reads the region out of the F# source by its markers and checks 14 claims: one region, exactly one `setInterval` and no other recurrence term, one `clearInterval` in the stop function, the period is `LiveScore.LivePollMs` and that is 60000, the visibility gate, the window, the stop condition, the in-flight guard, one fetch, no poll on a pinned page, the stop on re-render, and that it is the only timer and there is no socket or event source anywhere in `src/*.fs`. It prints what it read (53 files, the region's 60 lines). It cannot see a timer a library arms on its own; the browser half is the render check.

`scripts/live-score-render-check.mjs` now also drives an UNPINNED page with the relay's routes mocked and a fake clock (`clock.install`, so a tick is `fastForward`): one request at load for `?sport=epl&date=2026-10-10`; a live body gives `1–0`, `In progress`, `34'`; a tick later a final body gives `2–1` and `Full time`; a 503 and a non-JSON body each say `live score unavailable`; a hidden tab asks for nothing; a visible one asks again; once the card's window has passed no more requests. 25 checks.

## What was run

| check | result |
|---|---|
| `npm run build` (no warnings), `node build/VerifyMain.js` | 419 of 419 |
| `check-live-score-poll.mjs --self-test` / the scan of `src/` | 15 of 15 / 14 of 14 |
| `live-score-render-check.mjs` against the built page, `PW_CHROMIUM` set | 25 of 25 |
| eight `poll-*` entries expecting the poll check, four expecting the render check | 12 of 12 caught, plus the unmutated tree |
| `check:forecast-pull-only` (22), `check:lineups-pull-only` (14), workflows, citations, docs | pass |

## Not proved

That the real relay's body of a game in play decodes: the scripted bodies use the keys of two real probes (2026-11-11) and this test's own values for a game in play. The first real live body is being captured tonight (`live-shape-capture`, 19:10Z to 20:50Z), and this is not landed on `main` until it shows the decoder's assumptions. Also not measured: what the poll costs the relay under real viewers (the CC-CMD's arithmetic is the bound; the relay-side cache is filed in `docs/CC-CMD-2026-11-11-v2-games-bsd-cache.md`).
