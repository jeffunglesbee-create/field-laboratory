# The Live now line, and the one timer extended (Task 6b, second half)

**Date:** 2026-11-26/27. **CC-CMD:** `docs/CC-CMD-2026-11-26-single-page-composition.md`. **Owner requirement:** "we should always know when anything is live."

## The ruling this amends, and who made it

The page's one timer was bound by the owner's ruling of 2026-11-11 ("Auto-poll while a match is live"): it polls only a sport with a card inside its live window, stops when no card has a window, and does nothing on a pinned page. Asked on 2026-11-27 how the two BSD live feeds should be read, the owner chose **"Extend the one timer"** over a once-per-render read or a deferred timer. So, by the owner's decision: the timer no longer stops for want of a card window; it also asks `/bsd/tennis/matches/live` and `/bsd/events/live` every tick while the tab is visible. Still pull-only (ADR-002 Rule A), still none on a pinned capture, still ONE timer, ONE fetch call and ONE in-flight guard.

## Built

- `src/Program.fs`: `bsdFeeds` (two routes, keys `bsd:tennis` / `bsd:soccer`, which cannot be a sport key); the tick builds one request list (card keys, then the BSD feeds) and one fetch; a BSD answer is kept by source in `liveSourceStates`; `showLiveNow` writes `#live-now`, only when the text changed (it is a polite live region); a pinned page writes "not read on a pinned capture".
- `src/Scoreboard.fs`: `CardHandle.IsLive`, so the line can count cards.
- `index.html`: `#live-now`, above every panel, on every surface; one CSS rule using the declared `--text` token.
- `scripts/check-live-score-poll.mjs`: the claim "the timer stops when no window is ahead" is replaced by four (no `liveWorkAheadAt`, started unconditionally; the two routes on the one fetch; each answer kept by source and shown; the pinned statement). Self-test 46/46, with a fixture per claim. One claim was found unable to fail (it matched the definition of `refreshLiveNow`, not a call) and was tightened before use.
- `scripts/live-score-render-check.mjs`: the two checks that encoded the old rule now say the timer is KEPT; every unpinned scenario mocks the BSD routes (none reaches the real relay); a new scenario (i) drives the line from the real 2026-11-26 captures.

## Verified (local, 2026-11-27)

| check | result |
|---|---|
| `check-live-score-poll.mjs` live scan / self-test | 20/20 / 46/46 |
| `live-score-render-check.mjs` / self-test | 94/94 / 12/12 |
| `check:verify` | 561/561 |
| `check:computed-chrome`, `tab-check`, `check:metrics`, `live-tabs-check` | 25/25, 85/85, 35/35 + 18/18, 15/15 |
| `check`, `check:hard`, `check:render-sports` | 19/19 each |
| `check:workflows` | 71/71 |
| mutation anchors | 2259 of 2262 checked, 0 stale (7 poll entries re-anchored to the new text, 5 added) |
| the 12 poll mutation entries, each run alone | all caught |
| three extra breaks of the browser scenario (line never refreshes; pinned page silent; tennis route mistyped) | each turned `live-score-render-check` red; restored 94/94 |

## What the page now says (from the scenario, against the real captures)

`Live now — scoreboard cards: 2 live · BSD tennis: 3 live · BSD soccer: 1 live`; a feed that does not answer: `BSD tennis: unknown (the feed did not answer: ...)`; one answering junk: unknown with the decoder's own reason; recovery restores the counts; a pinned page: "not read on a pinned capture" and zero BSD requests.

## Not verified, stated plainly

- **The deployed page.** Nothing here ran against the live site. Done condition for this commit: `verify` on its SHA concludes `success`; then a runner capture of the deployed page shows `#live-now` with a tennis count equal to the `status:"live"` rows of a same-minute capture of the route.
- **Cost, not measured:** each visible unpinned page now makes two more relay requests a minute (the relay caches each 25 s). Not read from a dashboard.
- **Browsers:** the scenarios ran in Chromium only.
- **Task 6c (the draw gated by `drawLiveness`) is NOT built.** `LiveSources.drawLiveness` exists and is tested, but the draw section still collapses on `Draw.isComplete` ("tournament finished"), which says finished, not live. STAGED: unblocked by reading the draw's tournament id in `DrawView` and passing the BSD tennis state to it; verify with a render scenario using the captured tournament ids 904 and 215.
- **Staleness (Task 6d):** the soccer feed's `last_updated` is carried, not judged. UNKNOWN today means a failed or unreadable feed only.
- **Golf** has no live source here. `/v2/games?sport=pga` returned 200 without a `games` array.
