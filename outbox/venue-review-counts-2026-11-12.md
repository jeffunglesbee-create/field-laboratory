# The review venues the table does not carry, and how often each is on a slate (Task 4, Step 1)

Session 2026-11-12, field-laboratory. Governing record: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 4. Written by `outbox/venue-review-counts-2026-11-12.mjs` from `outbox/venue-review-counts-rows-2026-11-12.json`.

**Checked 75 of 75 review names** (71 with no table row, 4 with one), in the archive's games 2026-07-01..2026-11-11: 134 calendar days, 134 with games, 4906 games in all. The 71 names with no row carry **283 games on 261 venue-days** (a venue-day is one name on one slate day), 5.8% of the window's games.
Every one of the 71 has at least one game in the window (control 1 refuses a name with none: each was drawn from the archive's games of that window). Nothing here adds a row; the owner decides each venue from these numbers.

## The population, and why it is 71 and not 66

The CC-CMD's Task 4 says 66. Read from git by `outbox/venue-review-population-2026-11-12.mjs`, output in `outbox/venue-review-population-2026-11-12.txt`, at three commits: at `87b6bbb1`, the CC-CMD's first commit (2026-11-09 09:08 ET), the review list held 70 names and 3 of them were already table rows (M. M. Roberts Stadium, Ryan Field and St James Park, hand rows of 2026-10-25), so 67 had none; the CC-CMD's 66 is those 67 less U.S. Bank Stadium, which Task 1 takes. At `3429152d` (2026-11-09 15:02 ET, which puts the 2026-11-09 source fill's accepted rows into the table, run 42682560865) the list held 67: Johan Cruijff Arena, U.S. Bank Stadium and Wembley Stadium had left it, each a table row and in `accepted` at that commit, which leaves 64. The 2026-11-10 sourcing run (42861596952) took the list from 67 to 75: 8 names entered, 7 with no row (Crabble Athletic Ground, EnviroVent Stadium, Flamingo Park, RAW Charging Stadium, Stade de France, The Stan Robinson Stadium, The Wyatt Homes Stadium) and Manadon Sports Hub, which received a hand row on 2026-11-11 (`7e1a7e59`), after that run. All 8 are among the 18 rows of `outbox/venue-candidates-gained-2026-11-10.json`, the grounds the archive gained after the candidates file was built on 2026-10-22. 64 + 7 = 71, and 71 + 4 with a row = 75.

## By days in the window

| days in the window | names | games | share of the 283 games |
|---|---|---|---|
| 1 day | 17 | 17 | 6.0% |
| 2 to 4 days | 30 | 84 | 29.7% |
| 5 to 9 days | 22 | 139 | 49.1% |
| 10 to 19 days | 1 | 13 | 4.6% |
| 20 or more days | 1 | 30 | 10.6% |

## By what held each one back

The sourcing rule's own reason (the last column of the table below), grouped. A name held on roof has a position the results file lists sources agreeing on; the other groups need the position settled first.

| held because | names | games | venue-days |
|---|---|---|---|
| no two independent families agree on the position | 52 | 220 | 199 |
| roof not settled (position agreed) | 9 | 29 | 28 |
| ambiguous name | 8 | 25 | 25 |
| no source answered with a point | 2 | 9 | 9 |

## The 71, most days first

`games` is the number of archive rows with exactly that venue string (a card each); `days` the distinct slate days among them. `sport(s)` and `home` are the sourcing run's own columns for the name. `held because` is the sourcing rule's one-line reason for holding the name; for a ground the owner decides to leave out it is the candidate for the line that says why.

| # | venue | sport(s) | home | games | days | first | last | held because |
|---|---|---|---|---|---|---|---|---|
| 1 | Nu Stadium | MLS | Miami (+1 more) | 30 | 20 | 2026-07-22 | 2026-11-07 | no two independent families agree (wikidata, nominatim, photon, wp-article) |
| 2 | Olimpico | Serie A, UEFA Champions League | Lazio (+1 more) | 13 | 13 | 2026-08-24 | 2026-11-07 | no two independent families agree (wikidata) |
| 3 | Memorial Stadium | EFL Cup, EFL Trophy, CFB | Missouri (+1 more) | 9 | 9 | 2026-08-08 | 2026-11-10 | ambiguous name (5 candidates) |
| 4 | Reale Arena | La Liga, UEFA Europa League | Real Sociedad | 8 | 8 | 2026-08-29 | 2026-11-08 | no two independent families agree (nominatim, photon) |
| 5 | Stanford Stadium | MLS, CFB | Stanford (+2 more) | 8 | 7 | 2026-07-25 | 2026-10-23 | no two independent families agree (nominatim, photon) |
| 6 | Allianz Stadium | Serie A, UEFA Europa League | Juventus | 7 | 7 | 2026-08-29 | 2026-11-01 | no two independent families agree (wikidata, nominatim, photon) |
| 7 | American Express Stadium | EPL, UEFA Europa Conference League Qualifying, UEFA Europa Conference League | Brighton | 7 | 7 | 2026-08-23 | 2026-11-08 | no two independent families agree (nominatim, photon) |
| 8 | Coventry Building Society Arena | EPL, EFL Cup | Coventry | 6 | 6 | 2026-08-29 | 2026-10-31 | roof: the lead names none, the article mentions a retractable roof |
| 9 | Highmark Stadium | NFL | Bills | 6 | 6 | 2026-08-15 | 2026-11-01 | roof: the lead names none, the article mentions a retractable roof |
| 10 | Riazor | La Liga | Deportivo | 6 | 6 | 2026-08-17 | 2026-11-02 | no two independent families agree (wikidata, wp-article) |
| 11 | Stade Vélodrome | Ligue 1, UEFA Europa League | Marseille | 6 | 6 | 2026-08-21 | 2026-11-01 | no two independent families agree (wikidata, nominatim, photon) |
| 12 | Stadio Artemio Franchi | Serie A | Fiorentina | 6 | 6 | 2026-08-29 | 2026-11-08 | no two independent families agree (wikidata, nominatim, photon, wp-article) |
| 13 | Yager Stadium | CFB | Miami OH | 6 | 6 | 2026-09-12 | 2026-11-10 | ambiguous name (2 candidates) |
| 14 | Black Desert Resort Golf Course | golf | Bank of Utah Championship | 8 | 5 | 2026-10-01 | 2026-10-05 | no two independent families agree (photon) |
| 15 | The Cliffs at Walnut Cove | golf | Biltmore Championship Asheville | 8 | 5 | 2026-09-17 | 2026-09-21 | no two independent families agree (photon) |
| 16 | Yokohama Country Club | golf | Baycurrent Classic | 8 | 5 | 2026-10-08 | 2026-10-12 | no two independent families agree (nominatim, photon) |
| 17 | Chase Field (NH) | MLB | Diamondbacks | 5 | 5 | 2026-07-04 | 2026-07-19 | no two independent families agree (nominatim, photon) |
| 18 | Gaughan Group Stadium | EFL Cup, EFL Trophy | Leyton Orient | 5 | 5 | 2026-08-08 | 2026-11-07 | no two independent families agree (nominatim, photon) |
| 19 | McLane Stadium | CFB | Baylor | 5 | 5 | 2026-09-12 | 2026-11-07 | no two independent families agree (wikidata, nominatim, photon, team-venue, wp-article) |
| 20 | Medinah CC (No. 3) | golf | Presidents Cup | 5 | 5 | 2026-09-24 | 2026-09-28 | no source answered with a point |
| 21 | Our Lady of Lourdes Stadium | CFB | Louisiana | 5 | 5 | 2026-09-05 | 2026-11-07 | no two independent families agree (nominatim, photon, team-venue) |
| 22 | Stade Jean Bouin | Ligue 1 | Paris FC | 5 | 5 | 2026-08-30 | 2026-11-01 | ambiguous name (7 candidates) |
| 23 | TDECU Stadium | CFB | Houston | 5 | 5 | 2026-09-05 | 2026-11-07 | no two independent families agree (wikidata, team-venue, wp-article) |
| 24 | Via Del Mare | Serie A | Lecce | 5 | 5 | 2026-08-31 | 2026-11-01 | no two independent families agree (wikidata, wp-article) |
| 25 | Clarence T.C. Ching Athletics Complex | CFB | Hawai'i | 4 | 4 | 2026-09-05 | 2026-10-17 | no two independent families agree (nominatim, photon) |
| 26 | Hillsborough | EFL Cup, EFL Trophy | Sheffield Wed | 4 | 4 | 2026-08-08 | 2026-11-11 | no source answered with a point |
| 27 | Mornflake Stadium | EFL Cup, EFL Trophy | Crewe | 4 | 4 | 2026-08-08 | 2026-11-10 | no two independent families agree (nominatim, photon) |
| 28 | RELOC8 EM Community Stadium | EFL Cup, EFL Trophy | Bromley | 4 | 4 | 2026-08-08 | 2026-11-10 | no two independent families agree (photon) |
| 29 | The Completely-Suzuki Stadium | EFL Cup, EFL Trophy | Cheltenham | 4 | 4 | 2026-08-08 | 2026-11-07 | no two independent families agree (photon) |
| 30 | URSAPHARM-Arena an der Kaiserlinde | Bundesliga | Elversberg | 4 | 4 | 2026-08-29 | 2026-10-30 | no two independent families agree (wikidata, wp-article) |
| 31 | Bloomfield Road | EFL Cup, EFL Trophy | Blackpool | 4 | 3 | 2026-08-25 | 2026-10-27 | roof: the lead names none, the article mentions a retractable roof |
| 32 | AIL Arena | UEFA Europa Conference League Qualifying, UEFA Europa Conference League | FC Lugano | 3 | 3 | 2026-08-20 | 2026-11-05 | roof: no Wikipedia lead and no Wikidata roof |
| 33 | Europa Point Stadium | UEFA Europa Conference League Qualifying, UEFA Europa Conference League | Red Imps | 3 | 3 | 2026-08-20 | 2026-11-05 | no two independent families agree (wikidata, photon, wp-article) |
| 34 | GEHA Field at Arrowhead Stadium | FIFA World Cup, NFL | Colombia (+2 more) | 3 | 3 | 2026-07-03 | 2026-08-15 | no two independent families agree (wikidata, wp-article) |
| 35 | Municipal Stadium-Poznan | UEFA Europa League Qualifying, UEFA Europa League | Lech Poznan | 3 | 3 | 2026-08-20 | 2026-10-22 | no two independent families agree (photon, wp-article) |
| 36 | Parken Stadium | UEFA Europa Conference League Qualifying, UEFA Europa Conference League | København | 3 | 3 | 2026-08-27 | 2026-11-05 | roof: the lead names none, the article mentions a retractable roof |
| 37 | Rodney Parade | EFL Trophy | Newport | 3 | 3 | 2026-10-06 | 2026-11-07 | no two independent families agree (wikidata, wp-article) |
| 38 | The Cherry Red Records Stadium | EFL Cup, EFL Trophy | Wimbledon | 3 | 3 | 2026-08-08 | 2026-10-27 | no two independent families agree (wikidata, nominatim, photon) |
| 39 | Vodafone Park | UEFA Europa League Qualifying, UEFA Europa League | Besiktas | 3 | 3 | 2026-08-20 | 2026-10-22 | no two independent families agree (wikidata, nominatim, photon) |
| 40 | Wham Stadium | EFL Trophy | Accrington | 3 | 3 | 2026-09-22 | 2026-11-07 | no two independent families agree (nominatim, photon) |
| 41 | Stade Boréale | MLS | FC Supra du Québec (+1 more) | 3 | 2 | 2026-07-08 | 2026-09-01 | no two independent families agree (nominatim, photon) |
| 42 | Almaty Ortalyk Stadium | UEFA Europa League Qualifying, UEFA Europa Conference League | Kairat Almaty | 2 | 2 | 2026-08-20 | 2026-10-22 | no two independent families agree (nominatim, photon) |
| 43 | Children's Mercy Park | MLS | Kansas City | 2 | 2 | 2026-07-22 | 2026-08-01 | no two independent families agree (wikidata, photon) |
| 44 | Crown Oil Arena | EFL Trophy | Rochdale | 2 | 2 | 2026-09-22 | 2026-11-03 | no two independent families agree (nominatim, photon) |
| 45 | DW Stadium | EFL Trophy | Wigan | 2 | 2 | 2026-08-18 | 2026-09-22 | no two independent families agree (wikidata, nominatim, photon) |
| 46 | De Kuip | UEFA Champions League | Feyenoord | 2 | 2 | 2026-10-14 | 2026-11-03 | roof: the lead names none, the article mentions a retractable roof |
| 47 | Estadi de la FAF d'Encamp | UEFA Europa Conference League Qualifying, UEFA Europa Conference League | Inter D'Escaldes | 2 | 2 | 2026-08-27 | 2026-10-22 | no two independent families agree (photon) |
| 48 | Kenilworth Road | EFL Trophy | Luton | 2 | 2 | 2026-09-22 | 2026-11-07 | roof: the lead names none, the article mentions a retractable roof |
| 49 | Mikheil Meskhi Stadioni | UEFA Europa League Qualifying, UEFA Europa Conference League | Iberia 1999 | 2 | 2 | 2026-08-27 | 2026-10-22 | no two independent families agree (nominatim, photon) |
| 50 | Olympia | UEFA Europa Conference League | Mjällby | 2 | 2 | 2026-10-15 | 2026-11-05 | no two independent families agree (photon) |
| 51 | Peninsula Stadium | EFL Cup, EFL Trophy | Salford City | 2 | 2 | 2026-08-08 | 2026-09-22 | no two independent families agree (wikidata, nominatim, photon) |
| 52 | RAMS Park | UEFA Champions League | Galatasaray | 2 | 2 | 2026-10-13 | 2026-11-03 | roof: the lead names none, the article mentions a retractable roof |
| 53 | The County Ground | EFL Trophy | Swindon | 2 | 2 | 2026-09-15 | 2026-09-22 | no two independent families agree (wikidata, nominatim, photon) |
| 54 | The Croud Meadow | EFL Trophy | Shrewsbury | 2 | 2 | 2026-10-06 | 2026-10-27 | no two independent families agree (photon, wp-article) |
| 55 | Arena Egnatia | UEFA Europa League Qualifying | Egnatia | 1 | 1 | 2026-08-20 | 2026-08-20 | no two independent families agree (wikidata, photon, wp-article) |
| 56 | Cotton Bowl | CFB | Oklahoma | 1 | 1 | 2026-10-10 | 2026-10-10 | ambiguous name (2 candidates) |
| 57 | Crabble Athletic Ground | FA Cup | Dover | 1 | 1 | 2026-11-07 | 2026-11-07 | no two independent families agree (wikidata, photon, wp-article) |
| 58 | EnviroVent Stadium | FA Cup | Harrogate | 1 | 1 | 2026-11-07 | 2026-11-07 | no two independent families agree (photon) |
| 59 | Estadio Universitario | MLS | Club Tigres | 1 | 1 | 2026-08-12 | 2026-08-12 | ambiguous name (8 candidates) |
| 60 | Field of Dreams | MLB | Twins | 1 | 1 | 2026-08-13 | 2026-08-13 | ambiguous name (2 candidates) |
| 61 | Flamingo Park | FA Cup | Cray | 1 | 1 | 2026-11-08 | 2026-11-08 | no two independent families agree (nominatim, photon) |
| 62 | Generali-Arena | UEFA Europa Conference League Qualifying | Vienna | 1 | 1 | 2026-08-27 | 2026-08-27 | ambiguous name (3 candidates) |
| 63 | Goodison Park | EFL Cup | Preston | 1 | 1 | 2026-08-08 | 2026-08-08 | roof: the lead names none, the article mentions a retractable roof |
| 64 | Mansfield Stadium | MLS | FC Dallas | 1 | 1 | 2026-08-06 | 2026-08-06 | no two independent families agree (nominatim, photon) |
| 65 | Miejski Stadion Pilkarski Raków | UEFA Europa Conference League Qualifying | Raków | 1 | 1 | 2026-08-27 | 2026-08-27 | no two independent families agree (wikidata, photon, wp-article) |
| 66 | RAW Charging Stadium | FA Cup | Oxford City | 1 | 1 | 2026-11-06 | 2026-11-06 | no two independent families agree (photon) |
| 67 | Stade de France | NFL | Saints | 1 | 1 | 2026-10-25 | 2026-10-25 | ambiguous name (3 candidates) |
| 68 | The Stan Robinson Stadium | FA Cup | Stafford | 1 | 1 | 2026-11-08 | 2026-11-08 | no two independent families agree (nominatim, photon) |
| 69 | The Wyatt Homes Stadium | FA Cup | Wimborne | 1 | 1 | 2026-11-08 | 2026-11-08 | no two independent families agree (photon) |
| 70 | Ulker Stadyumu | UEFA Champions League | Fenerbahce | 1 | 1 | 2026-09-10 | 2026-09-10 | no two independent families agree (photon) |
| 71 | Vare Areena TN | UEFA Europa Conference League Qualifying | KuPS Kuopio | 1 | 1 | 2026-08-27 | 2026-08-27 | no two independent families agree (photon) |

## The 4 review names that already have a row

Counted with the others. They are not part of the decision; Manadon Sports Hub is the one whose count is known independently (control 3).

| venue | sport(s) | home | games | days | first | last |
|---|---|---|---|---|---|---|
| M. M. Roberts Stadium | CFB | Southern Miss | 5 | 5 | 2026-09-05 | 2026-11-05 |
| Ryan Field | CFB | Northwestern | 4 | 4 | 2026-10-02 | 2026-11-07 |
| St James Park | EFL Trophy | Exeter | 2 | 2 | 2026-09-08 | 2026-10-06 |
| Manadon Sports Hub | FA Cup | Plymouth | 1 | 1 | 2026-11-09 | 2026-11-09 |

## Controls: three records that did not come from this statement

1. **The candidates file** (`data/venue-source-candidates.json`, built from this archive on 2026-10-22 and extended 2026-11-10 with 17 grounds gained since). For each of the 75 names: the games counted here are at least the file's, no more games were created before 2026-10-22 than the file counted, and the last date here is not before the file's. A name that the archive had spelled differently, or a window that missed a table, fails it.
2. **Step 0's two thin days** (`outbox/venue-red-days-rows-2026-11-09.json`: 2026-09-28 and 2026-11-09). Step 0 listed the review names it saw on them by a different statement. 2 of 2 are present here, and each day lies inside that name's first..last dates.
3. **Manadon Sports Hub.** The 2026-11-11 session read the same archive and found one row, `FA Cup_2026-11-09_e401931098` (`outbox/cc-session-2026-11-11-manadon-row.md`). Here: 1 game, 1 day, 2026-11-09.

## Method, and its coverage

- Checked 75 of 75 embedded names, 79 of 79 saved rows (75 venue rows and the `all`, `wsum`, `win` and `chk-rv` rows). One database, two tables (`regular_season_games` and `postseason_games` together), one window 2026-07-01..2026-11-11.
- A game is a row. The window holds 4906 rows and 4906 distinct ids, so no game is in both tables; at the named venues, 295 rows and 295 distinct ids.
- The review list is `review` of `outbox/venue-source-results-latest.json` (sourcing run 42861596952, 2026-11-10T17:12:32.969Z): 75 names, 459 candidates. "Has a row" is membership in the table the page loads: 497 names in `build/Venues.js`, equal to the 497 read from `src/Venues.fs`.
- Matching is exact, as the page's `known.has(v)` is: `s.venue = rv.n` compares bytes in SQLite unless a column is declared COLLATE. Neither table's `CREATE TABLE` carries one and no other object does (`sqlite_master`, read 2026-11-12 and saved in the rows file as `ddl`; `analyze` refuses the rows if that record says otherwise), so a trailing space or another case is a different name.
- The names were embedded in the statement with an index each and re-computed inside the database: n, characters, a position-weighted code-point sum, index-weighted lengths and the longest name all equal (row `chk-rv`). The statement is 3573 bytes, sha256 `a7f0627d77a8594f1f7517e9ed3f46b0a753b8bc24770049b3b49d30836f429b`, printed by `node outbox/venue-review-counts-2026-11-12.mjs sql 2026-07-01 2026-11-11`; the saved rows name the same length and hash, and `report` refuses to write when they do not.
- The rows were saved by hand from the connector's output. They are checked mechanically: each row is internally consistent, the typed columns sum to the `all` row the database computed, and the index-weighted sums (`wsum`: the counts, and the first- and last-date offsets) equal the database's, so a number in the wrong row does not survive. That the text run through the connector is the printed text is not provable from here; the list checksum and the three controls stand in for it.
- A second path to the figures: `outbox/venue-review-counts-recompute-2026-11-12.mjs` rebuilds every total and every table row from the statement text, the saved rows, `src/Venues.fs` and the results file, does not import the script that wrote this file, and compares the result with this file's text (its output: `outbox/venue-review-counts-recompute-2026-11-12.txt`). Its refusals, and those of the population recount, were made to fire on doctored inputs by `outbox/venue-review-counts-mutations-2026-11-12.mjs` (its output: `outbox/venue-review-counts-mutations-2026-11-12.txt`).

## Not established

- **Anything forward.** These are past counts. A qualifying round or a one-off event (the sport column shows which) does not recur on a schedule, and a count over a window that includes the summer says nothing about how often a ground is on the slate in January.
- That the archive's venue strings are the page's `data-venue` strings on every day (Step 0's premise 1). Controls 1 to 3 hold names against three records; none renders the page.
- Whether a card at one of these grounds showed a weather chip on the day. By the page's rule a card whose venue is not a table row has none, but no rendered page was read.
- Which venues belong in the table. The numbers say how often a ground is on a slate; they do not say the ground's position, roof or zone, which is what the sourcing rule held back (the last column). The decision is the owner's.
- The upper end of the window (the last complete day) is a choice made here. The candidates file's own window has no upper end.
