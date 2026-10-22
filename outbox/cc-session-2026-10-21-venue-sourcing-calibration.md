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

## Second calibration run, with the pacing fixed (run 39710229238)

No source went unanswered. Of 109: 93 accepted (86 matching the table, 7 disagreeing),
15 review, 1 none. The 7 disagreements are the 6 golf clubs above plus **Red Bull Arena,
6,780 km from the table.** Wikidata, Nominatim and Photon all agreed on the Salzburg
stadium; the table means New Jersey's. That is a wrong accept of a different kind from
the golf cases: not a table error but a **homonym**. Every source returns the globally
famous match for a name, so cross-family agreement cannot catch it. Name-only matching is
unsafe for a list that includes CFB (many same-named grounds) and any international
football.

## Arbiter, first version (run 39711129097): five decisive, two unreadable, one flaw

For each disagreement it asked OpenStreetMap for the extent of the named place and tested
which point lies inside. In five cases the sources' point is inside a 0.1 to 2.7 km extent
and the table's point is outside it: Harbour Town 12.6 km, Royal St George's 8.2 km,
Muirfield Village 6.3 km, East Lake 3.2 km, TPC Scottsdale 2.4 km. Two were unreadable:
the Overpass queries for Red Bull Arena and Quail Hollow Club timed out, because they
scanned the planet for a common name.

The first version also had a flaw that the Red Bull case exposes: it only looked at the
place the SOURCES chose. Applied to Red Bull Arena it would have reported "the table is
outside the extent", blaming the table for a homonym. Two weaker points on the five: the
TPC Scottsdale extent was the Champions Course (Photon's label) where the tournament uses
the Stadium Course, and the Royal St George's extent was 0.1 km, a building rather than
the course.

## Arbiter, second version (this commit)

- **Local, not global.** Overpass is asked for the name within 25 km of a point, which
  cannot time out scanning the planet.
- **Two-sided.** The question is put at both ends: is there a place of this name where the
  TABLE says, and is there one where the SOURCES say. Verdicts: `same-place` (both, under
  3 km apart), `two-places` (both, farther apart: a homonym), `table-supported` (table end
  only), `table-outside` (sources' end only), `neither-inside`, `no-extent`.
- Self-test 19 of 19. Three arbiter mutations caught, each with the baseline line checked:
  the earlier "PASS" of two mutations during the edit was a crashing self-test, which the
  harness counts as caught; the baseline line read FAIL and my grep had hidden it.
- Not yet run on a runner in this form.

## What this does to the plan

The rule needs a location prior for new venues, not only agreement among sources. The
archive's `home` column names the team that plays at each venue, and Wikidata records a
team's home venue, so anchoring a venue to its team distinguishes the two Red Bull Arenas.
That is a design change to stages 2 and 3, not a tweak.

