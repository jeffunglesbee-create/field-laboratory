# Task 4, "Yes to all": hand rows for the review venues (2026-11-12)

**Result.** 61 rows are built for your keep or revert: 60 grounds and 1 more spelling of a ground the table already has (Chase Field (NH), which takes Chase Field's row). They carry 240 of the 283 games and 227 of the 261 venue-days of the 71 review names with no row. 10 names get no row (43 games, 34 venue-days), each with its reason below.

**What you decide.** Say keep, or name the rows to revert. A row you do not name stays. `docs/CC-CMD-2026-11-09-venue-review-remainder.md` keeps Task 4 PARTIAL until you have, as it did for Manadon Sports Hub.

The evidence for each row is the comment above it in `src/Venues.fs` (between the markers `BEGIN hand rows 2026-11-12` and `END hand rows 2026-11-12`). This record summarises it and lists what to read first.

## The 61 rows

Games and days are the archive's, 2026-07-01..2026-11-11, from `outbox/venue-review-counts-2026-11-12.md`. "Sources" are the families that agreed on the point.

| name | games | days | point | roof | zone | sources |
|---|---|---|---|---|---|---|
| AIL Arena | 3 | 3 | 46.0235, 8.9610 | OpenAir | Europe/Zurich | nominatim + wikidata + wp-article |
| Allianz Stadium | 7 | 7 | 45.1095, 7.6416 | OpenAir | Europe/Rome | nominatim + wp-article |
| Almaty Ortalyk Stadium | 2 | 2 | 43.2384, 76.9243 | OpenAir | Asia/Almaty | nominatim + wp-article |
| American Express Stadium | 7 | 7 | 50.8617, -0.0835 | OpenAir | Europe/London | nominatim + wp-article |
| Arena Egnatia | 1 | 1 | 41.0767, 19.6617 | OpenAir | Europe/Tirane | nominatim + wp-article |
| Bloomfield Road | 4 | 3 | 53.8048, -3.0482 | OpenAir | Europe/London | nominatim + wikidata |
| Chase Field (NH) | 5 | 5 | 33.4455, -112.0667 | Retractable | America/Phoenix | the row of Chase Field |
| Children's Mercy Park | 2 | 2 | 39.1217, -94.8233 | OpenAir | America/Chicago | nominatim + wp-article |
| Clarence T.C. Ching Athletics Complex | 4 | 4 | 21.2941, -157.8176 | OpenAir | Pacific/Honolulu | nominatim + wp-article |
| Cotton Bowl | 1 | 1 | 32.7795, -96.7597 | OpenAir | America/Chicago | nominatim + wp-article |
| Coventry Building Society Arena | 6 | 6 | 52.4481, -1.4963 | OpenAir | Europe/London | nominatim + wp-article |
| Crabble Athletic Ground | 1 | 1 | 51.1379, 1.2851 | OpenAir | Europe/London | nominatim + wp-article |
| Crown Oil Arena | 2 | 2 | 53.6208, -2.1800 | OpenAir | Europe/London | nominatim + wp-article |
| De Kuip | 2 | 2 | 51.8939, 4.5231 | OpenAir | Europe/Amsterdam | nominatim + wp-article |
| DW Stadium | 2 | 2 | 53.5478, -2.6540 | OpenAir | Europe/London | nominatim + wp-article |
| EnviroVent Stadium | 1 | 1 | 53.9917, -1.5145 | OpenAir | Europe/London | nominatim + wp-article |
| Estadi de la FAF d'Encamp | 2 | 2 | 42.5335, 1.5759 | OpenAir | Europe/Andorra | nominatim + photon + wp-article |
| Estadio Universitario | 1 | 1 | 25.7228, -100.3120 | OpenAir | America/Monterrey | nominatim + wp-article |
| Europa Point Stadium | 3 | 3 | 36.1106, -5.3468 | OpenAir | Europe/Gibraltar | nominatim + wp-article |
| Field of Dreams | 1 | 1 | 42.4978, -91.0550 | OpenAir | America/Chicago | nominatim + wp-article |
| Gaughan Group Stadium | 5 | 5 | 51.5602, -0.0127 | OpenAir | Europe/London | nominatim + wp-article |
| GEHA Field at Arrowhead Stadium | 3 | 3 | 39.0489, -94.4839 | OpenAir | America/Chicago | nominatim + wp-article |
| Generali-Arena | 1 | 1 | 48.1623, 16.3875 | OpenAir | Europe/Vienna | photon + wp-article |
| Goodison Park | 1 | 1 | 53.4388, -2.9664 | OpenAir | Europe/London | nominatim + wp-article |
| Highmark Stadium | 6 | 6 | 42.7730, -78.7917 | OpenAir | America/New_York | nominatim + wp-article |
| Hillsborough | 4 | 4 | 53.4114, -1.5006 | OpenAir | Europe/London | nominatim + wp-article |
| Kenilworth Road | 2 | 2 | 51.8841, -0.4317 | OpenAir | Europe/London | nominatim + wp-article |
| McLane Stadium | 5 | 5 | 31.5582, -97.1157 | OpenAir | America/Chicago | nominatim + wp-article |
| Medinah CC (No. 3) | 5 | 5 | 41.9657, -88.0464 | OpenAir | America/Chicago | nominatim + wp-article |
| Miejski Stadion Pilkarski Raków | 1 | 1 | 50.7768, 19.1592 | OpenAir | Europe/Warsaw | nominatim + wikidata + wp-article |
| Mikheil Meskhi Stadioni | 2 | 2 | 41.7098, 44.7462 | OpenAir | Asia/Tbilisi | nominatim + wp-article |
| Mornflake Stadium | 4 | 4 | 53.0875, -2.4358 | OpenAir | Europe/London | nominatim + wp-article |
| Municipal Stadium-Poznan | 3 | 3 | 52.3976, 16.8579 | OpenAir | Europe/Warsaw | nominatim + wp-article |
| Nu Stadium | 30 | 20 | 25.7928, -80.2596 | OpenAir | America/New_York | nominatim + wp-article |
| Olimpico | 13 | 13 | 41.9338, 12.4548 | OpenAir | Europe/Rome | nominatim + wp-article |
| Olympia | 2 | 2 | 56.0497, 12.7074 | OpenAir | Europe/Stockholm | photon + wp-article |
| Our Lady of Lourdes Stadium | 5 | 5 | 30.2159, -92.0418 | OpenAir | America/Chicago | nominatim + wp-article |
| Parken Stadium | 3 | 3 | 55.7026, 12.5722 | Retractable | Europe/Copenhagen | nominatim + wp-article |
| Peninsula Stadium | 2 | 2 | 53.5136, -2.2768 | OpenAir | Europe/London | nominatim + wp-article |
| RAW Charging Stadium | 1 | 1 | 51.7739, -1.2278 | OpenAir | Europe/London | nominatim + wp-article |
| Reale Arena | 8 | 8 | 43.3014, -1.9736 | OpenAir | Europe/Madrid | nominatim + wp-article |
| Riazor | 6 | 6 | 43.3687, -8.4174 | OpenAir | Europe/Madrid | nominatim + wikidata |
| Rodney Parade | 3 | 3 | 51.5890, -2.9895 | OpenAir | Europe/London | os-postcode + wp-article |
| Stade Boréale | 3 | 2 | 45.5748, -73.7038 | OpenAir | America/Toronto | nominatim + photon + wp-article |
| Stade de France | 1 | 1 | 48.9244, 2.3601 | OpenAir | Europe/Paris | nominatim + wp-article |
| Stade Jean Bouin | 5 | 5 | 48.8432, 2.2529 | OpenAir | Europe/Paris | nominatim + wp-article |
| Stade Vélodrome | 6 | 6 | 43.2698, 5.3959 | OpenAir | Europe/Paris | nominatim + wp-article |
| Stadio Artemio Franchi | 6 | 6 | 43.7809, 11.2825 | OpenAir | Europe/Rome | nominatim + wp-article |
| Stanford Stadium | 8 | 7 | 37.4345, -122.1615 | OpenAir | America/Los_Angeles | nominatim + wp-article |
| TDECU Stadium | 5 | 5 | 29.7220, -95.3492 | OpenAir | America/Chicago | nominatim + wp-article |
| The Cherry Red Records Stadium | 3 | 3 | 51.4313, -0.1866 | OpenAir | Europe/London | nominatim + wp-article |
| The Completely-Suzuki Stadium | 4 | 4 | 51.9061, -2.0603 | OpenAir | Europe/London | photon + wp-article |
| The County Ground | 2 | 2 | 51.5645, -1.7708 | OpenAir | Europe/London | nominatim + wp-article |
| The Croud Meadow | 2 | 2 | 52.6886, -2.7493 | OpenAir | Europe/London | nominatim + wp-article |
| Ulker Stadyumu | 1 | 1 | 40.9877, 29.0370 | OpenAir | Europe/Istanbul | nominatim + wp-article |
| URSAPHARM-Arena an der Kaiserlinde | 4 | 4 | 49.3187, 7.1216 | OpenAir | Europe/Berlin | nominatim + wp-article |
| Vare Areena TN | 1 | 1 | 62.8846, 27.6717 | OpenAir | Europe/Helsinki | photon + wp-article |
| Via Del Mare | 5 | 5 | 40.3652, 18.2089 | OpenAir | Europe/Rome | nominatim + wp-article |
| Vodafone Park | 3 | 3 | 41.0393, 28.9945 | OpenAir | Europe/Istanbul | nominatim + wp-article |
| Wham Stadium | 3 | 3 | 53.7653, -2.3709 | OpenAir | Europe/London | nominatim + wp-article |
| Yager Stadium | 6 | 6 | 39.5194, -84.7329 | OpenAir | America/New_York | nominatim + wikidata + wp-article |

## Read these before saying keep

44 of the 60 grounds carry at least one flag. Every flag is computed from the saved pages; none is typed. Tier A is a thin point or a thin tie between the archive's name and the ground. Tier B is what a map or an article calls the ground when it differs from the archive's string. Tier C is a roof word the rule's first-sentence read does not see, read by hand (the next section).

### Tier A: 33 flags on 27 rows

| name | flag |
|---|---|
| AIL Arena | the venue name is not in the article's lead; it is tied by a Wikidata label ("AIL Arena") |
| Arena Egnatia | the OpenStreetMap witness (W338024660) is classed leisure/pitch, not leisure/stadium |
| Children's Mercy Park | the venue name is not in the article's lead; it is tied by a search hit on the article ("Children's Mercy Park") |
| Clarence T.C. Ching Athletics Complex | the OpenStreetMap witness (the sourcing run's recorded point) is classed leisure/pitch, not leisure/stadium |
| Clarence T.C. Ching Athletics Complex | home not tied to the ground: "Hawai'i" (4 games) |
| Coventry Building Society Arena | the OpenStreetMap witness (R1832945) is classed leisure/sports_centre, not leisure/stadium |
| DW Stadium | the venue name is not in the article's lead; it is tied by a search hit on the article ("DW Stadium") |
| EnviroVent Stadium | the OpenStreetMap witness (W102722693) is classed leisure/pitch, not leisure/stadium |
| EnviroVent Stadium | the venue name is not in the article's lead; it is tied by a search hit on the article ("EnviroVent") |
| Estadi de la FAF d'Encamp | the Photon witness (the sourcing run's recorded point) is classed leisure/pitch, not leisure/stadium |
| Estadi de la FAF d'Encamp | the OpenStreetMap witness (W1412155487) carries no name |
| Europa Point Stadium | home not tied to the ground: "Red Imps" (3 games) |
| Field of Dreams | the OpenStreetMap witness (N471267259) is classed tourism/attraction, not leisure/stadium |
| Gaughan Group Stadium | the venue name is not in the article's lead; it is tied by a search hit on the article ("Gaughan Group") |
| GEHA Field at Arrowhead Stadium | the venue name is not in the article's lead; it is tied by a search hit on the article ("GEHA Field") |
| GEHA Field at Arrowhead Stadium | home not tied to the ground: "Argentina" (2 games), "Colombia" (1 game), "Algeria" (1 game), "Ecuador" (1 game), "Tunisia" (1 game) |
| Generali-Arena | home not tied to the ground: "Vienna" (1 game) |
| Goodison Park | home not tied to the ground: "Preston" (1 game) |
| Medinah CC (No. 3) | the OpenStreetMap witness (W143789356) is classed leisure/golf_course, not leisure/stadium |
| Olimpico | the OpenStreetMap witness (W667711166) is classed leisure/pitch, not leisure/stadium |
| Olimpico | the OpenStreetMap witness (W667711166) carries no name |
| Parken Stadium | home not tied to the ground: "København" (3 games) |
| Peninsula Stadium | the venue name is not in the article's lead; it is tied by a search hit on the article ("Peninsula Stadium") |
| RAW Charging Stadium | the venue name is not in the article's lead; it is tied by a search hit on the article ("RAW Charging") |
| Reale Arena | the venue name is not in the article's lead; it is tied by a search hit on the article ("Reale Arena") |
| Rodney Parade | no OpenStreetMap-family witness (Nominatim or Photon): a postcode centroid of the OS postcode directory stands for the second family |
| Stade de France | home not tied to the ground: "Saints" (1 game) |
| Stanford Stadium | home not tied to the ground: "San Jose Earthquakes" (2 games), "San Jose" (1 game) |
| TDECU Stadium | the OpenStreetMap witness (W1350963741) is classed leisure/pitch, not leisure/stadium |
| The Completely-Suzuki Stadium | the venue name is not in the article's lead; it is tied by a search hit on the article ("Completely-Suzuki") |
| Ulker Stadyumu | the venue name is not in the article's lead; it is tied by a search hit on the article ("Ülker") |
| Vodafone Park | the venue name is not in the article's lead; it is tied by a search hit on the article ("Vodafone Park") |
| Vodafone Park | home not tied to the ground: "SC Freiburg" (1 game) |

### Tier B: 24 flags on 24 rows

| name | flag |
|---|---|
| AIL Arena | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Almaty Ortalyk Stadium | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Arena Egnatia | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Cotton Bowl | the Wikipedia article's title carries a qualifier: "Cotton Bowl (stadium)" |
| Crabble Athletic Ground | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| De Kuip | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Estadi de la FAF d'Encamp | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Estadio Universitario | the Wikipedia article's title carries a qualifier: "Estadio Universitario (UANL)" |
| Field of Dreams | the Wikipedia article's title carries a qualifier: "Field of Dreams (Dubuque County, Iowa)" |
| Miejski Stadion Pilkarski Raków | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Mikheil Meskhi Stadioni | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Municipal Stadium-Poznan | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Olimpico | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Olympia | the Wikipedia article's title carries a qualifier: "Olympia (Helsingborg)" |
| RAW Charging Stadium | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Reale Arena | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Stade Jean Bouin | the Wikipedia article's title carries a qualifier: "Stade Jean-Bouin (Paris)" |
| Stade Vélodrome | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| TDECU Stadium | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| The County Ground | the Wikipedia article's title carries a qualifier: "County Ground (Swindon)" |
| Ulker Stadyumu | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Vare Areena TN | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Vodafone Park | the OpenStreetMap-family witness carries neither the venue string nor the article title in its label |
| Yager Stadium | the Wikipedia article's title carries a qualifier: "Yager Stadium (Miami University)" |

## Roofs read by hand (Tier C): 11 readings on 10 rows

The rule reads the first sentence of the lead. Where a search of the article body found a roof phrase, or the lead has a roof word after its first sentence, a person read it. Each quote is found on a saved page by the verifier.

| name | where | class | quote | why |
|---|---|---|---|---|
| Bloomfield Road | phrase search | open | The plans included a 20,000 capacity stadium with retractable roof | the sentence is about plans ("The plans included") |
| Coventry Building Society Arena | phrase search | open | original design for the arena was for a state-of-the-art stadium with a retractable roof | the original design, past tense |
| De Kuip | phrase search | open | as well as adding a retractable roof. Construction was planned to start in summer 2015 | a planned expansion |
| Goodison Park | phrase search | open | The proposed stadium would have had a retractable roof | the sentence is about a proposal ("The proposed stadium would have had") |
| Highmark Stadium | phrase search | open | The plan included a $1.4 billion, 72,000-seat [[ retractable roof stadium]] | the sentence is about a plan ("The plan included") |
| Kenilworth Road | phrase search | open | envisioned by Kohler as a 20,000 all-seater indoor arena with a retractable roof and pitch | the sentence is about a proposal ("envisioned by Kohler") |
| Medinah CC (No. 3) | lead, after the first sentence | open | Moroccan domed clubhouse topped with minarets | the dome is the clubhouse's, not a roof over the courses |
| Parken Stadium | phrase search | retractable | The stadium, which features a [[ retractable roof]] | the article says the ground has it |
| Parken Stadium | lead, after the first sentence | retractable | The stadium, which features a retractable roof | the second sentence of the lead says the ground has one |
| Stade de France | phrase search | open | was to be built on a former horse racing track | a stadium that was to be built on a former horse racing track |
| Vodafone Park | combined search | open | ===Roof=== | the combined search matched the section heading; the phrase and infobox searches have no hit |

## The 10 names left out

Each stays out with the reason and the quotes the verifier finds on saved pages. Nothing is built for them.

| name | games | days | reason |
|---|---|---|---|
| Black Desert Resort Golf Course | 8 | 5 | only Photon answers (one golf-course point in Utah), Wikidata has no entity and Nominatim no result, and Wikipedia's title search for "Black Desert" lists two golf tournaments (Black Desert Championship (LPGA), Bank of Utah Championship) and no article titled for the course. |
| Flamingo Park | 1 | 1 | the run's two answers (Nominatim: Miami Beach; Photon: Saskatchewan) are 3443 km apart, and Wikipedia's page for the name lists a wildlife park (a former name), a historic district, a field in Miami Beach and a park in Rio, none an English football ground. |
| Mansfield Stadium | 1 | 1 | Wikipedia's Texas Health Mansfield Stadium has one point, to two decimals (32.55, -97.08); a saved OpenStreetMap search of the box around it names two stadiums (R L Anderson Stadium, Vernon Newsom Stadium, the latter 0.0264 degrees of latitude north of the point) and no object called Mansfield Stadium; the run's two OpenStreetMap answers are one object, a Mansfield Stadium in Bangor, Maine. |
| Memorial Stadium | 9 | 9 | the name is shared: Wikipedia's Faurot Field "at Memorial Stadium" (Columbia, Missouri; Missouri Tigers) and Memorial Stadium (Bristol; Bristol Rovers) are 6717 km apart, the archive lists Missouri and Bristol Rovers as home there, and the run's Wikidata lookup found 5 entities with the label. |
| RAMS Park | 2 | 2 | the roof class is unsettled: the article's retractable-roof sentences are future tense ("will feature a retractable roof", "would be opened without retractable roofs which will be installed at the end of the season"), its other roof lines are 5,500 tonnes of roof steel and solar panels on the roof, and no saved page says whether the roof retracts. |
| RELOC8 EM Community Stadium | 4 | 4 | the string is on no saved page: Wikipedia and a ground guide call Hayes Lane "the Copperjax Community Stadium", a saved search for "RELOC8" on the article has no hit, and the one fixtures site that carries the string refused the page reader (HTTP 403), so the tie to Hayes Lane would rest on the home team (Bromley) alone. |
| The Cliffs at Walnut Cove | 8 | 5 | only Photon answers, with "The Cliffs at Dellridge" (apartments in Nova Scotia); Wikidata has no entity and Nominatim no result, and Wikipedia's title search for "Walnut Cove" has three hits, none an article for the course. |
| The Stan Robinson Stadium | 1 | 1 | Wikipedia gives the name to two grounds, Stafford Rangers' at Marston Road in Stafford (an image caption; the Midland Football League table) and Willand Rovers' in Willand (Stafford Rangers F.C., 2022–23 Southern Football League, 2020–21 Southern Football League), so one row cannot be right for both; the archive's game lists Stafford as home and the run's OpenStreetMap object of the name is in Stafford. |
| The Wyatt Homes Stadium | 1 | 1 | Wikipedia's Wimborne Town F.C. article (50.80166667, -1.99666667) and OpenStreetMap's "Wimborne Town Football Club" (50.7948058, -1.9656258) are 0.0310 degrees of longitude apart, outside the rule's box of 0.02 degrees, no saved page contains the name "Wyatt Homes", and Photon's answer for the name was a school in Baltimore. |
| Yokohama Country Club | 8 | 5 | Wikipedia's title search for "Yokohama Country" has one hit, Yokohama Country & Athletic Club, and the run's two OpenStreetMap-family answers are one object with that name, a differently named club, so no pair of families agrees on a ground called Yokohama Country Club. |

## How it was checked

`node outbox/venue-hand-rows-2026-11-12.mjs` read only committed files and printed (full output in `outbox/venue-hand-rows-2026-11-12.txt`):

```
PASS  the saved pages agree wherever two of them answer one question
PASS  every spec entry resolves to a row (60 entries)
PASS  every alias row copies a row the table has and is backed by archive rows (1 aliases)
PASS  every name of the 71 is a row or has a reason, once (71 names)
PASS  every name left out has a one-line reason and a quote found on a saved page (10 names)
PASS  the archive rows saved here carry, per name, the games the counts record gives
PASS  no name is built twice
PASS  the roof searches find a roof where there is one (checked 5 of 5 controls)
PASS  each of the four roof search forms has a hit on some saved page (4 of 4 forms)
PASS  the saved Wikidata pages say P5624 is no roof property: its label is "pitting resistance equivalent number", 61 of 61 saved claim reads of it are empty, and the search for the items that carry it counts 9, with 2 of 2 hits shown whole reading stainless steel
PASS  src/Venues.fs holds exactly the derived rows between its hand-row markers (61 rows)
PASS  src/Suite.fs holds exactly the derived table between its markers
PASS  no built name is also a row of the generated block
13/13 checks passed
```

Coverage: 285 saved pages read, 60 spec entries resolved to 60 rows, 1 alias, 10 names left out, 71 of 71 names accounted for. The same script judges 29 doctored copies of its inputs, each caught by the check it was aimed at (`outbox/venue-hand-rows-selftest-2026-11-12.txt`). `scripts/mutation-check.mjs` holds four entries that break one of the rows in `src/Venues.fs` and expect the F# suite to fail. A second script, `outbox/venue-hand-rows-selftest-teeth-2026-11-12.mjs`, breaks copies of the verifier itself and requires the self-test to report each break (`outbox/venue-hand-rows-selftest-teeth-2026-11-12.txt`).

## What is not established

- That the saved pages are what the services answer today. They are the page reader's answers of 2026-11-12, kept in `outbox/venue-hand-rows-evidence-2026-11-12.json`; the verifier asks no service.
- That the selectors and the name needles pick the right object. A person chose each, and the verifier checks that each is found on a saved page; it cannot check that the page is about the right ground. That is what the flags and your reading are for.
- That nothing the session read and did not keep contradicts a row. The evidence file keeps the pages that the rows and the reasons cite; the page reader's other answers of the session were not kept.
- The zones. They are read from the evidence file (geo-tz/all 8.1.4), not recomputed by this verifier. Open-Meteo's own zone for each row's point was read before the commit and equals the declared zone for every row (outbox/venue-hand-rows-open-meteo-zones-2026-11-12.txt; read through a page-fetch tool, not from a runner). scripts/weather-live-check.mjs then compares the declared zone of every row of the table with Open-Meteo's own: verify runs it tolerant of an unreachable service and prints "checked N of M venues", and the daily sentinel runs it strict.
- The class given to each roof reading (Tier C). It is a person's reading of the quote; the verifier checks that the quote is on a saved page, not that the reading is right.
- That a card at any of these grounds shows a weather chip. No rendered page was read.
- Anything forward. The counts are past; a cup tie or a qualifying round does not recur on a schedule.

## Found outside this scope (Rule 69): the roof rule's Wikidata step reads a property that is not a roof

`roofOf` asks Wikidata for `wdt:P5624` (1 site in `scripts/venue-source.mjs`; its basis text `wikidata P5624 "..."` appears 4 times). The saved Wikidata page for that property (`wbgetentities`, 2026-11-12) says its English label is "pitting resistance equivalent number", its datatype is `quantity` and its description is "predictive measurement of a stainless steels resistance to localized pitting corrosion".

- 61 saved claim reads of P5624, on 61 Wikidata items, every one empty (`{"claims":{}}`).
- A Wikidata search for the items that carry P5624 counts 9. The saved page holds 899 characters and stops inside hit 3, so it is not whole JSON: it names Q28453931, Q3600978, Q7388539 and shows 2 whole, Q28453931 (snippet line "SAE 316L stainless steel") and Q3600978 (snippet line "SAE 304 stainless steel").
- The sourcing run's committed cache (`outbox/venue-source-cache.json`) holds 396 answers to that SPARQL: 396 answered, 395 carry the Wikipedia article, 0 carry a roof.
- `outbox/cc-session-2026-11-09-fit-c.md` (item 19) recorded the same null (387 answers then) and read it as "Wikidata names no roof for any row".

So Wikidata gave no roof for any of the 396 items the sourcing run asked about. The rule's own comment in `scripts/venue-source.mjs` says it combines "Wikidata P5624, the Wikipedia lead and the Roof field of the article's infobox"; one of the three has been empty in every cached answer, and the property it reads is the one labelled above. Not probed here: which Wikidata property, if any, carries a stadium's roof. That is the first step of Task 5 in `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, which changes no rule and no row until you approve it.

## Reproduce

```
cd /home/claude/field-laboratory && npm run build
node outbox/venue-hand-rows-2026-11-12.mjs | cmp - outbox/venue-hand-rows-2026-11-12.txt
node outbox/venue-hand-rows-2026-11-12.mjs record | cmp - outbox/venue-hand-rows-2026-11-12.md
node outbox/venue-hand-rows-2026-11-12.mjs --self-test | cmp - outbox/venue-hand-rows-selftest-2026-11-12.txt
node outbox/venue-hand-rows-selftest-teeth-2026-11-12.mjs | cmp - outbox/venue-hand-rows-selftest-teeth-2026-11-12.txt
node outbox/venue-hand-rows-2026-11-12.mjs rows   # the block between the markers in src/Venues.fs
node outbox/venue-hand-rows-2026-11-12.mjs suite  # the table between the markers in src/Suite.fs
```

