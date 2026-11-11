# A card drawn before kickoff kept `Scheduled` after it (review semantics:F1, rules:F6)

Date: 2026-11-11. Found by the independent review of the live-score commits; both lenses that found it reproduced it, and the skeptic
reproduced it a third time against the real compiled card (`build/Scoreboard.js`, the browser build of solid-js, a controlled clock).

## The defect

The card's text is a function of the WALL CLOCK as well as of the game's state: a started row with no score reads
`Start time passed, no score served` (Task 4), and the model line is drawn only while the kickoff is ahead. The text was computed inside
memos over `shown`, and `shown` is `LiveScore.foldReading state reading`. For `NoReading` and `LiveUnavailable` that function returns the
archive's state object itself, which a Solid memo (compared with `===`) does not announce. So a page opened at 12:00Z for a 14:00Z match,
and answered at 14:05Z by a feed that failed or had nothing for the game, kept `—`, `Scheduled 2026-10-10T14:00Z (parsed 14:00)` and the
model line, beside a note saying `live score unavailable`. That is the symptom the feature exists to remove, and it is the only state a
page opened before kickoff can be in until a score arrives. Task 4's text only ever appeared on a card first drawn after kickoff.

Measured against the compiled card at 14:05Z: before the fix the status stayed `Scheduled 2026-10-10T14:00Z (parsed 14:00)` and the
forecast line stayed; a control card first drawn at 14:05Z read `Start time passed, no score served` with no forecast.

## The fix (`src/Scoreboard.fs`)

`heard` is a count, bumped by every `CardHandle.SetReading`. `shownNow ()` reads it and then `shown ()`; the score, status and drama memos and
the forecast effect read `shownNow`, so every answer from the feed makes the card re-read the clock. It is a count, not a timer: nothing
recurs, and the pull-only checks (`check:forecast-pull-only`, `check:live-score-poll`) still pass.

## Why nothing saw it, and what sees it now

`live-score-render-check.mjs` fixed the clock BEFORE the page loaded, and drove state with `__labSetState`, which for the cases it used
allocates a new state object and forces the memo to re-run. No card was ever drawn early and read late. The new scenario draws the
pinned EPL card at 12:00Z as Scheduled with the model line, moves the clock to 14:05Z, tells the card `unavailable`, then `none`, and
expects `Start time passed, no score served`, no forecast, and the reason (or nothing) beside it.

Rule 90: four new table entries each break one link (the `heard` read in `shownNow`, the bump in `SetReading`, the status memo reading
`shown`, the forecast reading `shown`) and the render check goes red on each; the three existing entries and `forecast-card-on-every-card`
were re-anchored to the renamed line (their claims are unchanged) and caught again. `check:mutation-anchors`: 0 stale.

Checks run on the built tree: `live-score-render-check` 30 of 30, `forecast-render-check` 38 of 38, `state-check` 11 of 11, `pickem-check`
24 of 24, F# suite 419 of 419, `check:live-score-poll` 14 of 14.

Not covered: the same card in a real browser at a real kickoff. The first such page is the 2026-11-17 19:35Z probe run.
