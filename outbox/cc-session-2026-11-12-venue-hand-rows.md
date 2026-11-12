# Session 2026-11-12: Task 4, "Yes to all" — hand rows for the 71 review venues

Scope: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 4 ("Yes to all", Thursday 2026-11-12 08:55 ET, after "Task 4 approved" at 07:36 ET) and Task 5, which this work found. Claude Code in field-laboratory, branch `main`.

## Result

61 hand rows are built for the owner's keep or revert: 60 grounds and `Chase Field (NH)`, a second spelling that takes Chase Field's row. They carry 240 of the 283 games and 227 of the 261 venue-days of the 71 review names with no row. 10 names get no row (43 games, 34 venue-days), each with a reason and quotes from saved pages. The record the owner reads is `outbox/venue-hand-rows-2026-11-12.md`; each row's evidence is also the comment above it in `src/Venues.fs`. Task 4 stays PARTIAL until the owner says keep or names the rows to revert, as he did for Manadon Sports Hub ("Keep", Task 3).

"Yes to all" was read as the owner's yes to a hand row for each of the 71, the yes the CC-CMD's Not in scope asks for. No question about its scope was put to him.

While the rows were built the session found that the roof rule's Wikidata step reads P5624, a property whose Wikidata label is "pitting resistance equivalent number". It is filed as Task 5 in the same CC-CMD and waits for the owner's approval. It changes no rule and no row.

## Done condition (Rule 87) and its probe output

The Done-when's first clause (each of the 71 is a table row with its evidence, or a one-line reason it stays out) is met; the second (the owner's keep or revert) is his. The probes, run on the tree the first commit holds:

```
node outbox/venue-hand-rows-2026-11-12.mjs            -> 13/13 checks passed      (reads committed files only; 71 of 71 names accounted for: 61 rows, 10 left out)
node outbox/venue-hand-rows-2026-11-12.mjs --self-test -> 29 of 29 doctored copies caught by the check each was aimed at; 0 problem(s).
TZ=UTC node build/VerifyMain.js                       -> 477/477 checks held
node outbox/venue-hand-row-source-mutations-2026-11-12.mjs -> checked 7 of 7 source mutations of the hand rows; each red by exactly the hand-rows check; 10/10 checks passed
```

The deployed table is read after the push (Landing, below).

## HEAD progression

| step | HEAD |
|---|---|
| start of this work | `aa02004a` |
| after `git pull --rebase origin main` | `32ba1de2` (two bot commits since: `status: refresh`, `forecast: run 2026-11-12T15:35`; they touch `STATUS.md`, `outbox/INDEX.md` and `outbox/forecast-dry-run-latest.json` only) |
| this work | two commits: the rows with their evidence, then the landing record (hashes in Landing) |

## What was built

| file | what it is |
|---|---|
| `src/Venues.fs` | 61 rows between the markers `BEGIN hand rows 2026-11-12` and `END hand rows 2026-11-12`, after Manadon Sports Hub's row and outside the generated block, each preceded by its computed evidence comment (name, leagues, games, days, witnesses with coordinates, disagreeing points, roof and its basis, zone, flags) |
| `src/Suite.fs` | the check "the hand rows of 2026-11-12 are held at the roof, zone and point their evidence gives": a table of the 61 rows' own numbers read against `Venues.tryFind` and `Weather.coordKey`, with a must-fail input (Rodney Parade in the wrong zone) |
| `scripts/mutation-check.mjs` | four registry entries on the Allianz Stadium row: deleted, roof covered, point moved 0.001 degrees, zone changed |
| `outbox/venue-hand-rows-2026-11-12.mjs` | the verifier and generator. Reads committed files only. Modes: report (13 checks), `record`, `rows` and `suite` (the two blocks), `--self-test` (29 doctored copies of its inputs) |
| `outbox/venue-hand-rows-evidence-2026-11-12.json` | what the verifier reads: 285 saved pages, the 60 spec entries, 1 alias with its 11 archive series, the 5 roof-search controls, the 11 roof readings, the 10 left-out names with quotes, and the archive rows. 249,268 bytes |
| `outbox/venue-hand-rows-2026-11-12.md`, `.txt` | the record the owner reads, and the verifier's report |
| `outbox/venue-hand-rows-selftest-2026-11-12.txt` | the self-test output |
| `outbox/venue-hand-rows-selftest-teeth-2026-11-12.mjs`, `.txt` | breaks four copies of the verifier itself and requires its self-test to report each |
| `outbox/venue-hand-row-source-mutations-2026-11-12.mjs`, `.txt` | breaks 7 rows of `src/Venues.fs` one at a time, compiles, runs the F# suite and requires the failing set to be exactly the new check; restores the file by sha256 and rebuilds |
| `outbox/venue-hand-row-source-mutations-negatives-2026-11-12.txt` | two negative runs of that script (a named check that is not the one that fails; a mutation that changes nothing), each red as wanted |
| `outbox/venue-hand-rows-open-meteo-zones-2026-11-12.txt` | Open-Meteo's resolved zone for each of the 61 points, read before the commit (61 of 61 equal the declared zone), and 7 runs of the comparison on doctored inputs (1 control, 6 breaks), each as wanted |
| `docs/CC-CMD-2026-11-09-venue-review-remainder.md` | Status, a second Result under Task 4, Task 5, and a note under Not in scope |

## Premises (Rule 100), the one command that tested each

| premise | the command | what it said |
|---|---|---|
| "Yes to all" is the owner's yes to a row for each of the 71 | none; a reading of the words | recorded in the CC-CMD as a reading and not put to him |
| P5624 is a roof property (the rule reads it as one) | the saved `wbgetentities` page for P5624, read by the verifier's `p5624Of` | label "pitting resistance equivalent number", datatype `quantity`: refuted. Task 5 |
| the saved search page for items that carry P5624 is whole JSON | `JSON.parse` on it | `Unterminated string in JSON at position 899`: the page stops inside its third hit. The first draft of the record had printed "null hits; the first 0 returned". `p5624Of` now reads the page's head and the check fails if it holds less than the record says |
| the 61 saved claim reads of P5624 are on the items under the rows | counted against the evidence's Wikidata witnesses and article items | 59 of 61. Two (Q3986424, Q619076) are not. The record says only "61 reads on 61 items, every one empty" |
| the roof phrases at Bloomfield Road, Goodison Park, Highmark Stadium and Kenilworth Road are plans "for a different stadium" | the saved snippets | they say "The plans included", "The proposed stadium would have had", "The plan included" and "envisioned by Kohler", nothing about a different ground. The notes now quote those words, and Highmark's quote now includes its `[[ retractable roof stadium]]` |
| a Wikipedia title with a qualifier means the plain name is shared with other places | none the pages can answer | not a finding. The flag now prints the title (for example "Estadio Universitario (UANL)") |
| the `KNOWN_BAD` GEHA entry sits near Arrowhead | `scripts/venue-sourced-check.mjs` lines 72 to 77 | it is Barranquilla (10.9269, -74.8006); the Kansas City row cannot trip it. `check:venue-sourced` 6/6 and 10/10 |
| fit-c's item 19 says what the record quotes | the generator now matches its sentence by pattern | it does, and the generator refuses if the document changes |
| Wikidata gave a roof to some item the sourcing run asked about | `node -e` over `outbox/venue-source-cache.json` | `396 396 0` (answers, answered, with a roof) |
| the run's results cite Wikidata as the basis of a roof | `grep -c 'wikidata P5624' outbox/venue-source-results-latest.json` | `0`. Of the 393 roof bases the entries carry: 364 "inferred: the lead names no roof", 17 "wikipedia lead", 8 "the lead names no roof, but the article mentions", 3 "infobox roof" and 1 "no Wikipedia lead and no Wikidata roof" |
| one sampled row is enough to show the F# check holds all 61 | `outbox/venue-hand-row-source-mutations-2026-11-12.mjs` | 7 rows across the table, each red by exactly that check: 7 of 7 |
| the live weather check compares zones only for the grounds on the slate (the sentence my record and the CC-CMD carried) | read `scripts/weather-live-check.mjs` (`venues: toArray(allVenues)`, `for (const v of venues)`), `verify.yml` line 1373 and `drift-sentinel.yml` line 114 | it compares every row of `Venues.all`: 558 by `count` of the compiled `build/Venues.js`, one request each. The sentence was wrong and is corrected |
| each declared zone is the zone Open-Meteo resolves for the row's point | the 61 URLs `Weather.forecastUrl` builds, fetched through the Exa page-fetch tool (the shell is refused for api.open-meteo.com: CONNECT 403) | 61 of 61 equal, 0 different, 0 unanswered; the comparison exits 1 on each of 6 doctored inputs (`outbox/venue-hand-rows-open-meteo-zones-2026-11-12.txt`). Not a runner's reading |
| verify's weather step reaches Open-Meteo from a runner today, so a zone that differs would turn verify red | the job log of verify run 43192147628 (job 131093881079, 2026-11-12), by REST | `Checking 497 venue coordinates against Open-Meteo's resolved zone` and `checked 497 of 497 venues`, 17.8 s from 09:37:19 to 09:37:37 UTC, about 28 requests a second, all answered. So verify on the landing commit reads 558 rows. Open-Meteo's published free limits (open-meteo.com/en/pricing, read 2026-11-12) are 600 calls a minute, 5,000 an hour, 10,000 a day; that burst was answered in full, and what happens at those figures is not measured here. Runs created from 2026-11-11T17:30Z to the time of the query on 2026-11-12 (about 24 hours): 10 verify and 3 drift-sentinel |

## Mistakes found and fixed before the commit

1. The teeth script's third case failed on a pattern that could not match a nested quote; the output showed the intended message. The pattern is `".*"` now (read before it was changed).
2. `--only venue-hand-row` was refused (`--only` needs an exact id); the four entries were run with `--ids`.
3. A one-line `node -e` broke on an apostrophe inside its own quotes; the code moved to a file.
4. A qid check read raw store entries where page bodies were wanted and printed null for every article; redone from the evidence pages (58 of the 60 articles have an item).
5. Four rows were flagged "no OpenStreetMap witness" though Photon answered for them, and one flag printed "(undefined)". Both were found by reading the generated Tier A table; the flag now treats Nominatim and Photon as one family and names the witness.
6. A reason for The Wyatt Homes Stadium printed "undefined" because the epsilon was not exported; it is imported from `scripts/venue-source.mjs`.
7. The self-test's "applied" assertion could be satisfied by a page that was only re-serialised; it now requires the parsed page to differ.
8. Typed notes on the rows that were thought weak were replaced by flags computed from the saved pages, because a typed claim is a Rule 100 premise.
9. An `apply:` expression for the alias case was nonsense; it is a plain function.
10. The draft record said the P5624 search "has null hits" (above), said the claim reads were "under these rows" (above), called four roof phrases plans for a different ground (above), and carried a flag that asserted what no page says (above). Each was found by reading the record end to end and is fixed.
11. A note of mine placed the `KNOWN_BAD` GEHA entry near Arrowhead (above).
12. The record and the CC-CMD said the live weather check compares a declared zone with Open-Meteo's "for the grounds on the slate that day". The script loops over every row of the table. The sentence came from my own earlier summary, a copy, and the source was one `grep` away; I found it at the code-review gate while reading how the check treats a row, and it had hidden the premise that these 61 zones agree with Open-Meteo's, which was then tried against the service (above). Corrected in the verifier's text, the regenerated record and the CC-CMD.

## Integration state (Rule 65)

No relay or client contract is touched and no endpoint is served. The table's consumer is `Venues.tryFind` in the laboratory's weather chip. The rows reach the live page through `deploy.yml`; whether the deployed table holds them is read in Landing. No card at any of these grounds has been rendered with a weather chip, so the path data source to chip to DOM is not shown end to end here.

## What is not established

- That the saved pages are what the services answer today: they are the page reader's answers of 2026-11-12, and the verifier asks no service.
- That the selectors and name needles pick the right object. A person chose each; the verifier checks that each is found on a saved page.
- That nothing the session read and did not keep contradicts a row. The page reader's answers of this work were kept in a merge-only store in the session's scratch space (469 pages); the evidence file keeps the 285 the rows and reasons cite, selected by a script that also lives there and is not committed. Nothing committed needs it: the verifier reads the evidence file alone, and a change to a row's evidence is made by editing that file and re-running the verifier.
- The class given to each roof reading (11 readings on 10 rows): a person's reading of a quote. The verifier checks that the quote is on a saved page.
- The zones: read from `geo-tz/all` 8.1.4 (the sourcing run's own entry point), never recomputed by the verifier. Open-Meteo's own zone for each of the 61 points equals the declared zone (61 of 61, read through a page-fetch tool on 2026-11-12, not by a runner). A runner's reading is the `checked N of M venues` line of verify on the landing commit, recorded in the landing manifest.
- That a card at any of these grounds shows a weather chip, and anything forward: the counts are past.
- What reverting a row takes. The verifier checks that `src/Venues.fs` and the Suite table are exactly what the evidence derives, so removing a row at the owner's word means moving its entry in the evidence file to the left-out names (with his word as the reason), regenerating both blocks with `node outbox/venue-hand-rows-2026-11-12.mjs rows` and `suite`, and re-running the verifier. The first commit was not tested by doing that.

## Found outside this scope (Rule 69)

- **The roof rule's Wikidata step reads a property that is not a roof.** Filed as Task 5; the evidence is in the record's "Found outside this scope" section and in the CC-CMD. `outbox/cc-session-2026-10-22-outdoor-venue-sourcing.md` ("Roofs are from Wikidata P5624 and the Wikipedia lead") and Task 2's criteria 2 and 3 describe the property as a roof source; neither is edited.
- **A check that follows the machine's time zone** (`src/Suite.fs`, "before kickoff the status is 'Scheduled <raw> (parsed HH:mm)', byte for byte") and **the confidence gate that does not finish locally** are recorded in `outbox/cc-session-2026-11-12-venue-review-counts.md`; they are another session's and are not touched. This session ran the suite under TZ=UTC (477 of 477).

## Reproduce

```
cd /home/claude/field-laboratory && npm run build
node outbox/venue-hand-rows-2026-11-12.mjs | cmp - outbox/venue-hand-rows-2026-11-12.txt
node outbox/venue-hand-rows-2026-11-12.mjs record | cmp - outbox/venue-hand-rows-2026-11-12.md
node outbox/venue-hand-rows-2026-11-12.mjs --self-test | cmp - outbox/venue-hand-rows-selftest-2026-11-12.txt
node outbox/venue-hand-rows-selftest-teeth-2026-11-12.mjs | cmp - outbox/venue-hand-rows-selftest-teeth-2026-11-12.txt
TZ=UTC node build/VerifyMain.js | tail -1
node outbox/venue-hand-row-source-mutations-2026-11-12.mjs | cmp - outbox/venue-hand-row-source-mutations-2026-11-12.txt
node scripts/mutation-check.mjs --ids venue-hand-row-deleted,venue-hand-row-roof-covered,venue-hand-row-moved,venue-hand-row-zone-changed
```

`cmp` prints nothing when the files are identical. The source-mutations script takes about four minutes (nine compiles) and rewrites `src/Venues.fs` for the length of each, restoring it by sha256; the registry run takes about as long. The negatives file records two edited copies of that script that are not committed.

## Open

The owner's keep or revert on the 61 rows, and his approval of Task 5. Nothing is deferred: both are decisions, recorded in the CC-CMD's second Result under Task 4 and in Task 5.
