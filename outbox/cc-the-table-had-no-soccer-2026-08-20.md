# Outbox — the venue table had no soccer

**Date:** 2026-08-20
**Ships:** eight MLS venues added to `src/Venues.fs`

## What was red

The post-deploy `live-check` (render-check against the live site) failed on four
weather assertions, and had on every scheduled run since ~04:03Z:

```
FAIL  the venue table covers at least one venue on this slate
      → BC Place, Lumen Field, America First Field, Providence Park,
        Allianz Field, Dignity Health Sports Park, Sporting Park,
        DICK'S Sporting Goods Park — none of them in the 37-entry table
FAIL  every card whose venue the table knows carries a live chip → 0 known
FAIL  every live chip reads as a temperature → []
FAIL  every live chip carries a real roof caveat → []
```

Today's slate (2026-08-20) is all MLS — eight soccer games. The venue table
carried MLB and AFL venues and no soccer venue at all, so zero venues on the
slate were covered, no weather chip could fill, and the three downstream chip
checks failed on empty arrays behind the coverage check.

## This is the check working, not a new bug

`render-check` asserts `expected > 0` directly, with a comment that says why: a
slate with no covered venue makes `filled.length === expected` a vacuous
`0 === 0` that would pass having proven nothing. So table coverage is its own
assertion — "measured against the slates actually rendered" — exactly so an
all-soccer day surfaces as a gap instead of a green nothing. It did its job.

The fix the repo's rules point to is the table, not the check: no fallbacks,
only fixes.

## The names are the payload's, not the reference list's

Lookup in `Venues.fs` is EXACT, not fuzzy — that is the whole point of the table
versus production's keyword matcher. So the entries must key on the exact string
the relay's `venue` field carries. Probed from `/context/date/2026-08-20`:

```
BC Place · Lumen Field · America First Field · Providence Park · Allianz Field
Dignity Health Sports Park · Sporting Park · DICK'S Sporting Goods Park
```

`data/production-venue-names.json` has the longer `"Stadium, City"` forms and
different spellings — `"Children's Mercy Park"` where the payload writes
`"Sporting Park"`, title-case `"Dick's"` where the payload writes all-caps
`"DICK'S"`. An exact-match table keyed on the reference list would have missed
all eight. Keyed on what the payload actually says, it resolves 8/8.

## Provenance, stated plainly

The existing coordinates come from playground's hand-reviewed table. Playground
carries no soccer venues, so these eight are transcribed from public stadium
facts instead — coordinates to four decimals, roof type, and the IANA zone each
should resolve to. Seven are open air; BC Place has a retractable roof, which is
also the first MLS row to exercise the `Retractable` case.

Transcription is where a silent wrong answer lives, so it was checked against the
same independent source every other row passes: Open-Meteo's resolved timezone
for the coordinates given. All eight match what they declare —

```
BC Place                   America/Vancouver      ✓
Lumen Field                America/Los_Angeles    ✓
America First Field        America/Denver         ✓
Providence Park            America/Los_Angeles    ✓
Allianz Field              America/Chicago        ✓
Dignity Health Sports Park America/Los_Angeles    ✓
Sporting Park              America/Chicago         ✓
DICK'S Sporting Goods Park America/Denver         ✓
```

BC Place is the sharpest row — it is the one that crosses into Canada, and a
coordinate that had drifted south would resolve to `America/Los_Angeles` rather
than `America/Vancouver`. It resolves to Vancouver, so the point is genuinely in
British Columbia. The runner's `weather-live-check` re-runs this same comparison
on every venue as a verify step; Open-Meteo answered from the runner again as of
02:33Z today, so the check validates rather than tolerating-unreachable.

## Verified

Build clean, zero F# warnings. Table grew 37 → 45; all eight MLS names resolve
via `tryFind` and their coordinates pass `coordinates()`. Every declared zone
matches Open-Meteo's resolved zone (probed directly). The four `live-check`
weather assertions go green once the site is deployed with this table — the
coverage check now finds eight known venues on the slate, and the chips fill for
them the same way they already do for MLB and AFL venues on other days.

## What this does not touch

No change to the weather fetch, the roof-caveat text, the chip rendering, or the
check. Only the table gained rows. The `Sport` registry still does not model
some observed leagues (EFL Trophy, La Liga) — that is the drift-sentinel's open
issue and a separate piece of work.
