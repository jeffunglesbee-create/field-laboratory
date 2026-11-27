# Task 6c: the draw says whether its tournament is live, and the Live now line links the live draws

**Date:** 2026-11-27. **CC-CMD:** `docs/CC-CMD-2026-11-26-single-page-composition.md` (owner: "go ahead with Task 6c"; requirement: "we should always know when anything is live"). Scoping read from `drawUrl`, `DrawView.fs`, `Draw.fs` and recorded in the CC-CMD before building.

## What was built

- `src/LiveSources.fs`: `LiveItem.TournamentName` (tennis, from `tournament.name`; for display only, never for a join), `liveTournaments` (id, name, live match count, grouped by id), `drawLivenessLine` (the state word and the sentence for one `DrawLiveness`).
- `src/DrawView.fs`: `setLiveness`, and `render` now records `data-finished`. Rules: a match in play shows the draw even on a FINISHED capture (the feed is the later fact: `data-collapse` is removed); not-live collapses an UNFINISHED draw for the one-page view and never overwrites a finished draw's own reason; unknown changes only the line, so a feed that did not answer never hides a draw.
- `src/Program.fs`: `applyDrawLiveness` (only for `?draw=<id>`; the panel's default is a committed capture of a finished tournament and has no live question), re-applied after the draw loads (a render rewrites the mount) and after every poll answer; `showLiveDraws` writes one link per live tournament, `?draw=<id>&tab=draw`, rewritten only when the set changed. A pinned page, or a feed not yet heard from, is UNKNOWN with that reason, never "not live".
- `index.html`: `#live-now-draws` under the Live now line; links are 44 px tap targets in `--text`; `.dv-live`.

## Verified locally (2026-11-27)

| check | result |
|---|---|
| `check:verify` | 571/571 (10 new rows against the real 2026-11-26 captures, incl. a third match for grouping) |
| `live-score-render-check.mjs` / self-test | 106/106 (12 new checks) / 12/12 |
| `check-live-score-poll.mjs` | 20/20 |
| `check:computed-chrome`, `tab-check`, `check:metrics`, `live-tabs-check`, `check`, `check:hard`, `check:render-sports`, `check:no-launch` | 25/25, 85/85, 35/35 + 18/18, 15/15, 19/19 x3, 58/58 |
| mutation anchors | 2271 of 2274 checked, 0 stale |
| six new mutation entries, each run alone | all caught: live does not outrank finished; not-live overwrites finished; liveness not applied after load; link to the wrong id; tournaments not counted; state words swapped |

The browser scenario drives an UNFINISHED draw (the committed Roland Garros capture with its Final's winner removed, so `isComplete` is false) and the FINISHED capture, against the real tennis capture (tournament 904: two matches in play; 215: one; 999: none), and a failing feed, and a pinned page.

## Not verified, stated plainly

- **The deployed page.** `scripts/live-now-deployed-probe.mjs` now also compares the page's live-tournament links with the relay's live tournament ids (sorted, distinct, either of two readings around the page read), 12 new self-test rows. It has NOT been triggered for this commit: it would read the old page before `deploy` finishes and report a false DISAGREE. Done condition: after `verify` and `deploy` are green for this commit's SHA, push `outbox/.trigger-live-now-deployed-probe`; the manifest's `verdict` is `PASS` and `drawLinks.verdict` is `AGREE`.
- **A draw page on the deployed site.** The probe checks the links, not `?draw=<id>` itself: nothing here loaded a real live tournament's draw from the relay. The relay's draw route for tournaments 904 and 215 was not read. The unfinished payload in the test is the finished one with a winner removed, not a real mid-tournament draw.
- **Staleness** (Task 6d) and **golf** are unchanged and still open.
