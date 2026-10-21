# Claude Code Command — docs/ZONE-PROOF.md draws the same conclusion its source comment was corrected for

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-20 by CC, found while executing
`docs/CC-CMD-2026-10-16-relay-date-keying-comment-corrections.md`, whose scope
was `src/*.fs` comments only
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** DONE 2026-10-21. `docs/ZONE-PROOF.md` corrected in three places, not one: the conclusion at line 22, the "Genuinely unknown" framing, and the same over-claim repeated under "What this does not claim" ("rules out UTC", and zone geometry as the AFL reason). Session doc: `outbox/cc-session-2026-10-21-zone-proof-overreach.md`.

## What is wrong

`docs/ZONE-PROOF.md` lines 13-22 state the 18-game measurement and conclude
"consistent with ET and inconsistent with UTC". The `src/Desk.fs` comment that
said the same was corrected on 2026-10-20: the test cannot see a UTC-keyed row,
because such a row scores *same-utc-day* (equal), and equal is also what correct
ET keying gives every game that does not cross UTC midnight. "None start
earlier" therefore holds under ET keying, UTC keying, and any mixture. The
measurement bounds the direction of the offset; it does not say which keying a
row used. Thirteen CFL rows were UTC-keyed while it stood (fixed 2026-10-19).

The doc also frames the question as "genuinely unknown ... three continents",
which the per-row table in the first CC-CMD has since answered.

## Task

1. Probe first: re-read `docs/ZONE-PROOF.md` and the corrected comment in
   `src/Desk.fs` (the one containing "What that test CANNOT see"); confirm the
   conclusion sentence is still as quoted above.
2. Replace "consistent with ET and inconsistent with UTC" with what the test
   does establish (the direction), add what it cannot see, and point at the
   per-row form: 847 ET, 0 UTC, 0 neither, measured 2026-10-20 against live
   `field-archive`, with the CFL history. Keep the measurement and the
   `MLB:starts-after-date=6 ...` block.
3. Do not touch any `src/` file, and do not change the doc's other sections.

## Done condition

`grep -n "inconsistent with UTC" docs/ZONE-PROOF.md` prints nothing, `npm run
gate` scores >= 95 on a runner, and the doc carries the 2026-10-20
measurement with its date.
