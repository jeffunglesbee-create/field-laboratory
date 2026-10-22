# Venue sourcing, stages 2-4: 301 outdoor venues sourced into the table

CC-CMD: `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md`. Stage 1 (the
acceptance rule and its calibration) is `outbox/cc-session-2026-10-21-venue-sourcing-rule.md`.
The owner chose full sourcing (about 360 venues).

## What landed

- **301 sourced rows** in `src/Venues.fs`, between generated `BEGIN sourced` /
  `END sourced` markers, written by `node scripts/venue-sourced-check.mjs --write`
  from `outbox/venue-source-results-latest.json` (venue-source run 39832949207,
  row for row identical to run 39820977221, against which the weather check and
  calibration below ran). None was typed by hand.
- **141 candidates in review**, deliberately not in the table: 92 where no two
  independent families agreed, 36 ambiguous names, 10 roof doubts, 3 where no
  source answered. The list is in the results artifact's `review` array, each
  with its reason and every source's answer.
- **Six golf rows corrected** (Quail Hollow, Harbour Town, TPC Scottsdale,
  Muirfield Village, East Lake, Royal St George's). The calibration (run
  39708856185) had all three sources agreeing on a different point for each; a
  reverse geocode of the table's own point (run 39802669644) found a residential
  street for five and open water for Harbour Town. These were the calibration's
  six "accepted-WRONG": the table was wrong, not the rule.
- **Nine WNBA arenas** recorded as indoor.
- The Suite's slate list shrinks to the two ambiguous names left
  (`Olimpico`, `Stadio Diego Armando Maradona`); the other eight are table rows.
- `check:venue-sourced` in verify: no network, asserts the table and the
  artifact agree in both directions.

## The candidate list

`data/venue-source-candidates.json`: 442 venue names from field-archive D1
games since 2026-07-01, minus names already in the table, recorded arenas,
placeholders and WNBA.

## Defects found by auditing each run, not by the run passing

Every one was a row the rule had ACCEPTED.

| run | defect | what showed it | fix |
|---|---|---|---|
| 39800985192 | Johan Cruijff Arena read "open" | its lead names no roof; the body says retractable | `BODY_ROOF`: a body mentioning a moving roof refuses the open inference (De Kuip, Parken, RAMS Park also to review) |
| 39811977108 | Fargodome read "open" | lead: "an indoor athletic stadium"; the classifier wanted "indoor stadium" | `\bindoor\b`; a name ending "dome" read open is review |
| 39816569585 | Wembley Stadium, San Mamés, Tammelan Stadion took the DEMOLISHED predecessor's Wikidata entity and article | leads in the past tense ("The first Wembley Stadium ... was") | `FILTER NOT EXISTS { ?item wdt:P576 ?gone }`, and a past-tense lead is review as a second witness |
| 39820492235 | 19 zones wrong (Oslo as `Europe/Berlin`, Amsterdam as `Europe/Brussels`, Reykjavik as `Africa/Abidjan`) | the flagless weather check, 409 of 409 venues answered | `geo-tz/all` instead of the default 1970-merged set; locally it changed exactly those 19 rows and no others |

| 39821284339 | the calibration read 409 of 410 rows | `Johnny "Red" Floyd Stadium`: the table reader's `[^"]+` stopped at the escaped quote, and the output said nothing | the reader takes escapes, and calibration prints and asserts `calibrating N of N table rows` |
| (cache) | `outbox/venue-source-cache.json` was 8.2 MB, 3.5 MB of it whole article bodies kept to test one regex | `wc -c` before committing it to main | cache only the lead sentence and the matched roof words; retired key kinds dropped on load |
| (cache) | a lead naming no roof was accepted "open" when the article body had not answered, so the roof check never ran | reading the branch while slimming the cache | that is review now, not open |
| 39824953597, 39831144540 | with the guard above in place, 104 and then 36 rows went to review as "no Wikipedia lead" | the reason, once recorded: Wikipedia HTTP 429, one six-second retry | `Retry-After` honoured (else 10, 20, 40 s backoff), Wikipedia paced at one call a second, and a roof with no answer now names the source and the status. Run 39832949207: 301 accepted, none lost to 429 |

The coordinates were right in every case. San Mamés and Tammelan resolved to
the standing ground at the same point once the filter applied; Wembley went to
review (its body mentions its retractable roof).

## Verified

- `venue-source.mjs --self-test` 29/29; `venue-sourced-check.mjs --self-test` 7/7.
- F# suite 314/314 on the sourced table.
- Mutations, each caught (`--only <id>`):
  `venue-sourced-row-deleted` (check:venue-sourced),
  `venue-sourced-slate-row-deleted` (the CC-CMD's Task 2 mutation: Parc des
  Princes deleted, the Suite's slate check fails),
  `venue-source-past-tense-ignored`, `venue-source-reader-skips-escaped-quote`,
  `venue-source-bodyless-open-accepted`.
- **Flagless weather check, whole table** (run 39821217745, on run 39820977221's rows,
  `outbox/venue-weather-check-latest.txt`): `checked 410 of 410 venues`, 12/12,
  every row resolving to the zone it declares. The run before the zone fix
  (39820492235) failed the 19 rows in the table above, which is what the check
  is for.
- **Calibration of the final rule** (run 39823256904): `calibrating 410 of 410
  table rows`; 386 accepted-correct, **0 accepted-WRONG**, 23 review, 1 none.
  Read with care: 301 of those rows are the rule's own output, so for them this
  is self-consistency after the P576 and zone changes, not independent truth.
  The independent measurement is the 109 hand-reviewed rows: 85
  accepted-correct, 0 wrong, 23 review, 1 none. The run before it (39821284339)
  read 409 of 410 and said nothing, which is the reader defect in the table.

## Not verified

- Done condition 2 (a green verify on a day whose only outdoor venues were UEFA
  or CFB) needs such a day to occur after this lands. It is checked by the
  verify run on main that day, not by anything in this session.
- Roofs are from Wikidata P5624 and the Wikipedia lead. 286 of 301 are "open,
  inferred: the lead names no roof"; the body check and the dome-name check
  narrow that, but a stadium whose article never mentions its roof would read
  open. The weather a fixed-roof stadium shows is the outside weather, so the
  failure mode is a wrong "outdoors" label, not a wrong temperature.

## Cache

`outbox/venue-source-cache.json` is 3.2 MB on this branch (main had 0.6 MB from
stage 1; it reached 8.2 MB before the slimming above). It is committed by design
(stage 1: a re-run asks nothing it already knows). Successful answers only.
