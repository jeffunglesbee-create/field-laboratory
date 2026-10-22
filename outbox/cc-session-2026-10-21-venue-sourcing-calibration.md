# Venue sourcing, calibration: the pre-registered criterion failed, and the premise under it was wrong

CC-CMD: `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md`. First calibration run:
`venue source` run 39708856185 on main, committed as `fd67c97`
(`outbox/venue-source-calibration-latest.json`).

## What was predicted, and what happened

Before the run, the criterion was written into the script: of the venues the rule
accepts, **zero** may disagree with the table (`check 'NO accepted point is wrong'`).
It failed, and the workflow said so.

| of the 109 table venues | count |
|---|---|
| accepted by the rule | 80 |
| accepted and matching the table (within 0.02 degrees per axis) | 74 |
| accepted and **disagreeing** with the table | **6** |
| review (no two independent families agreed) | 28 |
| none (no source found anything) | 1 |
| a source went unanswered | 15, all `wikidata: HTTP 429` |
| the two OSM front ends agreed alone and were wrong | 5 |

The last row is the independence rule earning its place: five venues where
Nominatim and Photon agreed with each other and were away from the table were
refused rather than accepted.

## The six disagreements

All six are golf clubs, and in all six **all three sources agree with each other**
and return the same labelled entity: Quail Hollow Club (3700 Gleneagles Road,
Charlotte) 6.9 km from the table, Harbour Town Golf Links (11 Lighthouse Lane,
Hilton Head) 13.4 km, Muirfield Village Golf Club (5750 Memorial Drive, Dublin)
8.0 km, Royal St George's Golf Club (Sandwich, Kent) 8.2 km, East Lake Golf Club
(2575 Alston Drive, Atlanta) 3.7 km, TPC Scottsdale 2.9 km.

By class, defined AFTER seeing the result and so a description, not a result:
the 91 non-golf venues gave 71 accepted, all matching, 0 disagreeing, 20 review;
the 19 golf clubs gave 3 accepted matching, 6 disagreeing, 8 review, 1 none.

## The premise that was wrong

The calibration treats the table as truth, because I described it as
"hand-reviewed". `src/Venues.fs` itself says otherwise: the MLS rows are
"transcribed from public stadium facts", and the golf rows are copied from
field-playground's `src/data/weather.js` `VENUE_COORDS` with no review note
beside them. So a disagreement is not proof the rule was wrong. For the six, the
sources agreeing on a named, addressed place while the table sits 3 to 13 km
away makes the table the likelier error. That is an inference, not a
measurement, and these rows feed the live weather chip.

## What was changed after seeing the result, and what was not

Changed, because they were defects of this script and not of the rule:

- **Pacing.** 15 of the 28 review cases were Wikidata 429s at a 300 ms gap with
  one retry. Now: Retry-After honoured, 8/16/32 s backoff, four attempts, gaps of
  1.2 s (search) and 1.5 s (SPARQL).
- **A name.** `accepted-WRONG` is now `accepted-DISAGREES`, with `kmFromTable`.
- **An arbiter** (`--adjudicate`): for each disagreement, ask OpenStreetMap for
  the named place's extent and test which point is inside it. Pure logic, self-test
  18 of 18, two mutations caught.

NOT changed: the 0.02 degree threshold and the independence rule. Moving either
to make the six pass would be fitting the rule to the table it is being tested on.

## Open, and the limits of the arbiter

- Whether the six are table errors. The arbiter run decides what the extents say;
  it shares OpenStreetMap data with two of the three sources, so it is a third
  look at geometry, not an independent survey.
- No table row was changed. The six rows are production data copied from another
  repo; correcting them is an owner decision and goes to its own CC-CMD with the
  adjudication as evidence.
