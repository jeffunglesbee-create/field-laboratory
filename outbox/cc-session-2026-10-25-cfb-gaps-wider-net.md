# Covering Saturday's college football grounds: a wider net, and what it got wrong first

CC-CMD: `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md`, closed by this work.
Continues `outbox/cc-session-2026-10-24-home-team-rule.md`.

## Why

2026-10-24 (a Saturday) had 44 college football games. 32 of their grounds were
table rows; 12 were not (field-archive D1, read that day), so those games had no
weather chip. All 12 were in the sourcing run's review list with "no two
independent families agree". The owner chose to cover them and close the parent
CC-CMD on that.

## What the sources actually said (probe, run 40137851977)

`outbox/venue-third-sources-probe.json`. Three kinds of failure sat inside "no two
agree":

| kind | venues |
|---|---|
| OpenStreetMap agrees with itself, Wikidata has no entity for the exact string | Broadview, Veterans Memorial (AL), Kenan, UFCU, University Stadium (NM) |
| OpenStreetMap agrees on the WRONG place, Wikidata right | M. M. Roberts (OSM: Picayune; Wikidata and the team: Hattiesburg) |
| one source only | Flagler, Zoeller/Dix, Clemson, Casino Del Sol, DKR, and Ryan Field (Wikidata and OSM disagree) |

GeoNames (Open-Meteo's geocoder) returned nothing usable (an airfield for "Ryan
Field") and was dropped. What worked: finding the venue from the HOME TEAM (its
Wikipedia page, then its Wikidata home-venue claim) and asking OpenStreetMap what
stands at a point someone else proposed.

## The wider net (`lookupPlus`, `scripts/venue-source.mjs`)

Consulted only for a venue that did not already reach a decision, so no accepted
row can change. It adds points to the two families that already exist: the home
team's venue and Wikipedia's article for the venue name (Wikidata family), the
venue found under the team's own name for it in OpenStreetMap, and OpenStreetMap's
reverse geocode at those points (OpenStreetMap family). Acceptance is unchanged:
one point from each family within 0.02 degrees.

## What it got wrong, in the order it was found

None of these was found by the run passing.

1. **Calibration 40138491509: American Family Field flipped to the Phoenix
   spring-training complex.** Reverse-confirm accepted any shared word. Made strict
   (`named`: every significant word of OSM's name must be the venue's own).
2. **Run 40138766628: still wrong.** My explanation had been incomplete. The
   calibration now records which points made a flip (run 40138841163): the point's
   OWN label was an input to its confirmation, so the Phoenix complex confirmed
   itself. `confirmedBy(osmName, venueName)` takes the venue name only.
3. **Audit of the first sourcing run (40139033329), after calibration reported 0
   wrong: two wrong rows out of 50.** The calibration could not see either: neither
   is a table row with a known answer.
   - `GEHA Field at Arrowhead Stadium` placed in Barranquilla, Colombia: the archive
     lists a World Cup game with Colombia as the home team; its national team's
     home ground was accepted, and an OpenStreetMap search for that ground's own
     name agreed.
   - `St James Park` (Exeter) placed at Newcastle's ground: the home-team rule had
     picked Exeter's entity, then the article search and OpenStreetMap both
     returned the famous ground and agreed with each other.

   Fixes: a name that was ambiguous stays with the home-team rule and skips the net;
   the team path is for CFB/NFL-only venues and a national team's page is not a team
   page; and a point reached only through the home team must also be reached by the
   venue's own name (`tiedToVenue`). Permanent guard: `check:venue-sourced` fails if
   a row with either of those names sits on those points (`KNOWN_BAD`).

One more of mine: the first run of the slate mutation printed PASS while the build
was broken (a list alignment error in the new Suite check), so it proved nothing.
It was re-run on a tree that compiled and the unmutated tree's pass was read.

## Final numbers

- Calibration (run 40141582803): 47 undecided table rows asked, 26
  flipped correct, **0 flipped wrong**, 21 still undecided; accepted wrong 0.
- Sourcing (run 40141634179): 372 accepted (was 324), 70 in review.
- The 48 new rows were each checked against where the place is (city, region, zone).
  Zones are from geo-tz, not Open-Meteo.
- Strict weather check on the whole table, no flag: 481 of 481 (40141818452), then
  483 of 483 after the two hand rows (40145474574; one venue needed its single
  retry and answered).
- Suite 320/320. Eleven mutations registered, each caught:
  `venue-team-page-not-football`, `venue-team-page-without-home-name`,
  `venue-team-venue-own-family`, `venue-generic-word-confirms`,
  `venue-reverse-confirms-on-shared-words`, `venue-point-confirms-itself`,
  `venue-team-path-any-sport`, `venue-team-point-not-tied`,
  `venue-national-team-page`, `venue-known-bad-placement-ignored`,
  `venue-cfb-slate-row-deleted`.

## The last two grounds, accepted by the owner

No two independent sources would confirm them. The owner accepted both with the
evidence beside them in `src/Venues.fs`:

- **Ryan Field** (Northwestern) 42.0654, -87.6915: OpenStreetMap forward and
  reverse both name it, 1501 Central Street, Evanston. Wikidata's point is 2.5 km
  north and OpenStreetMap calls it a parking lot.
- **M. M. Roberts Stadium** (Southern Miss) 31.3289, -89.3314: Wikidata and the
  team's own home-venue claim agree; OpenStreetMap's name search returns a
  same-named stadium in Picayune and has no named object at the Hattiesburg point.

Result: all 44 of 2026-10-24's college football grounds are table rows. The Suite
holds that as a check ("every venue on the 2026-10-24 college football slate is in
the table"), which is the parent CC-CMD's amended condition 2.

## Limits, said where they are read

- The wider net accepts a point two ways of finding it agree on. For a name that
  was never ambiguous in Wikidata but is generic, OpenStreetMap and Wikipedia can
  both return the prominent ground. St James Park was the instance; the guards are
  the ambiguity skip and the known-bad list, not a proof that no other exists.
- The 26 calibration flips are mostly rows the home-team rule had already placed,
  so they show the net agrees with them, not that it is independently right. The
  hand-reviewed rows that flipped were three golf courses.
- The audit of the 48 is mine, against where the places are. It found two wrong
  rows and is not a proof about the other 46.
- The DOM write for chips is proven by the live render check on the landing
  commit, recorded in the commit's verify run.
