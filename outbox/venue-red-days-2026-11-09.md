# Red days in the last 60 days under today's venue table (Task 4, Step 0)

Session 2026-11-09, field-laboratory. Governing record: `docs/CC-CMD-2026-11-09-venue-review-remainder.md`, Task 4. Written by `outbox/venue-red-days-2026-11-09.mjs` from `outbox/venue-red-days-rows-2026-11-09.json`.

**0 of 60 days would have gone red** with the 485-row table and 79 recorded arenas, window 2026-09-11 to 2026-11-09.
**1 of 60 without the U.S. Bank Stadium row** (2026-11-09): the day verify did go red, which is the row's reason to exist.
**2 day(s) rest on a single table row** (2026-09-28 Mon, Soldier Field; 2026-11-09 Mon, U.S. Bank Stadium). Every other day with an observable venue has two or more.

## What this prices

Adding any or all of the 66 review venues still outside the table would have removed **0 red days** from this window, because there were 0. The row that removed a red day from it is U.S. Bank Stadium (2026-11-09), added the same day.
That is a statement about the past 60 days and cannot be read forward: see "Not established". What it does say is where the table is thin: the days above, each of which a single bad row (a wrong name, a removed row) would have turned red.

| day | sole covered ground | other observable venues that day | of which in the sourcing run's review list |
|---|---|---|---|
| 2026-09-28 Mon | Soldier Field | Medinah CC (No. 3) | Medinah CC (No. 3) |
| 2026-11-09 Mon | U.S. Bank Stadium | Manadon Sports Hub | none |

## The days, by verdict

| verdict | days |
|---|---|
| RED: an observable venue, none in the table | 0 |
| thin: exactly one covered venue | 2 |
| covered: two or more covered venues | 58 |
| arenas only: every real venue is a recorded arena (the check prints a warning and skips) | 0 |
| placeholders only: no real venue (the check prints a warning and skips) | 0 |
| no games in the archive | 0 |

Over the 60 days with an observable venue, covered venues per day: minimum 1, median 17, maximum 129.

## Controls: the instrument reproduces two real days and one count

Run by the script before it prints anything; it refuses to write this file if any of the first two fails.

1. **A real red day.** Without the U.S. Bank Stadium row, 2026-11-09 rests on that row alone, its observable venues are Manadon Sports Hub and U.S. Bank Stadium and it has 11 distinct recorded arenas, in a table of 484 rows. Verify run 42621717589 went red that day with exactly "Manadon Sports Hub, U.S. Bank Stadium — none of them in the 484-entry table (11 recorded indoor arena(s) not counted)" (`outbox/venue-us-bank-stadium-2026-11-09.md`, section 1; the script checks that the file holds that block).
2. **A real green day.** 2026-11-08 is covered with 35 covered venues, so it does not rest on U.S. Bank Stadium, and verify run 42507928169 (`d9554f3`, 2026-11-08 18:02Z) passed the step that day (same file, section 1; the script checks that the file holds that sentence).
3. **A count.** The archive holds 14 games on 2026-11-09; the step log of verify run 42631741258 printed `decoded 14 game(s) for 2026-11-09` (same file, section 5; the script reads the number from there). They agree.

## Method, and its coverage

- Checked 60 of 60 calendar days in 2026-09-11..2026-11-09; 2775 archive games (`regular_season_games` and `postseason_games` together; one database, one venue table, one arena list, one window). No day in the window was empty.
- Classification, in the statement: a game is a placeholder (NULL, or "TBC", "TBD", "—", "-", "" after trimming), an arena (one of 79), a table row (one of 485, exact name, as the page's `known.has(v)` is) or other. A day is red when it has an observable venue (arena and placeholder excluded) and no table row. Games in this window: 72 placeholder, 640 arena, 1860 table, 203 other.
- The lists are the page's own: the table from `build/Venues.js` `all`, the arenas read from `src/Venues.fs` and from the compiled literal, which agree, each recognised by `isIndoorArena`. They were embedded in the statement and re-computed inside the database: n, characters and a position-weighted code-point sum all equal (rows `chk-tbl`, `chk-arena`).
- The day rows were saved by hand from the connector's output and are checked mechanically: each row's games equal its four classes, the typed rows sum to the `all` row the database computed (2775, 72, 640, 1860, 203, 617, 1744, 188), and the database's day count equals the saved rows.
- The statement is 15401 bytes, sha256 `06550b964c5b95d167dc21b89c8bb8dac6f9ad8467f3932b21951a741d77587d`, printed by `node outbox/venue-red-days-2026-11-09.mjs sql 2026-09-11 2026-11-09`; the saved rows name the same length and hash, and `report` refuses to write when they do not. That the text run through the connector is that text is not provable from here; the list checksums, the partition and the controls are what stand in for it.

## Not established

- **Anything forward.** The table's sourced rows came from this same archive: the candidates file is built from the archive's venues, so a window of the archive is partly covered by construction. A ground the archive has not captured yet cannot show here. The count is how the table has fared against the past, not a forecast of red days.
- That the archive's venue strings are the page's `data-venue` strings on every day (premise 1). Controls 1 and 3 compare one day: its venue names and its game count.
- Which of the 66 review venues still outside the table appeared on any slate, or how often. This file counts days, not venues; the thin days above list the review venues that were present.
- Whether any thin day would have been saved by a second covered ground: only the review venues listed in the thin-days table could have, and the owner decides whether they go in.

## Every day

| day | | games | arena venues | placeholder games | table venues | other observable venues | verdict |
|---|---|---|---|---|---|---|---|
| 2026-09-11 | Fri | 24 | 0 | 0 | 24 | 0 | covered |
| 2026-09-12 | Sat | 144 | 0 | 4 | 129 | 7 | covered |
| 2026-09-13 | Sun | 54 | 0 | 0 | 48 | 4 | covered |
| 2026-09-14 | Mon | 17 | 0 | 0 | 17 | 0 | covered |
| 2026-09-15 | Tue | 31 | 0 | 2 | 27 | 2 | covered |
| 2026-09-16 | Wed | 35 | 0 | 0 | 32 | 3 | covered |
| 2026-09-17 | Thu | 32 | 5 | 1 | 20 | 6 | covered |
| 2026-09-18 | Fri | 45 | 3 | 1 | 37 | 2 | covered |
| 2026-09-19 | Sat | 141 | 10 | 2 | 115 | 8 | covered |
| 2026-09-20 | Sun | 75 | 12 | 0 | 54 | 6 | covered |
| 2026-09-21 | Mon | 15 | 10 | 0 | 4 | 1 | covered |
| 2026-09-22 | Tue | 54 | 15 | 0 | 29 | 9 | covered |
| 2026-09-23 | Wed | 23 | 6 | 0 | 16 | 0 | covered |
| 2026-09-24 | Thu | 33 | 16 | 1 | 15 | 1 | covered |
| 2026-09-25 | Fri | 29 | 4 | 2 | 20 | 1 | covered |
| 2026-09-26 | Sat | 124 | 14 | 2 | 91 | 4 | covered |
| 2026-09-27 | Sun | 47 | 4 | 0 | 38 | 2 | covered |
| 2026-09-28 | Mon | 2 | 0 | 0 | 1 | 1 | thin |
| 2026-09-29 | Tue | 11 | 7 | 0 | 4 | 0 | covered |
| 2026-09-30 | Wed | 11 | 5 | 0 | 5 | 0 | covered |
| 2026-10-01 | Thu | 16 | 9 | 1 | 5 | 1 | covered |
| 2026-10-02 | Fri | 14 | 6 | 2 | 4 | 1 | covered |
| 2026-10-03 | Sat | 77 | 14 | 2 | 54 | 6 | covered |
| 2026-10-04 | Sun | 29 | 9 | 0 | 15 | 2 | covered |
| 2026-10-05 | Mon | 13 | 9 | 0 | 3 | 1 | covered |
| 2026-10-06 | Tue | 36 | 13 | 0 | 17 | 6 | covered |
| 2026-10-07 | Wed | 18 | 10 | 1 | 7 | 0 | covered |
| 2026-10-08 | Thu | 25 | 16 | 1 | 6 | 1 | covered |
| 2026-10-09 | Fri | 21 | 8 | 3 | 8 | 1 | covered |
| 2026-10-10 | Sat | 125 | 20 | 2 | 84 | 4 | covered |
| 2026-10-11 | Sun | 47 | 7 | 1 | 34 | 4 | covered |
| 2026-10-12 | Mon | 18 | 8 | 2 | 6 | 2 | covered |
| 2026-10-13 | Tue | 39 | 21 | 0 | 16 | 2 | covered |
| 2026-10-14 | Wed | 51 | 9 | 0 | 25 | 3 | covered |
| 2026-10-15 | Thu | 64 | 13 | 0 | 45 | 6 | covered |
| 2026-10-16 | Fri | 24 | 14 | 2 | 7 | 1 | covered |
| 2026-10-17 | Sat | 121 | 15 | 2 | 81 | 8 | covered |
| 2026-10-18 | Sun | 43 | 2 | 0 | 35 | 5 | covered |
| 2026-10-19 | Mon | 11 | 5 | 0 | 6 | 0 | covered |
| 2026-10-20 | Tue | 26 | 14 | 0 | 11 | 1 | covered |
| 2026-10-21 | Wed | 29 | 14 | 0 | 14 | 0 | covered |
| 2026-10-22 | Thu | 57 | 14 | 2 | 33 | 8 | covered |
| 2026-10-23 | Fri | 29 | 13 | 4 | 10 | 2 | covered |
| 2026-10-24 | Sat | 120 | 19 | 4 | 78 | 2 | covered |
| 2026-10-25 | Sun | 57 | 11 | 2 | 38 | 5 | covered |
| 2026-10-26 | Mon | 20 | 13 | 2 | 5 | 0 | covered |
| 2026-10-27 | Tue | 28 | 15 | 1 | 8 | 4 | covered |
| 2026-10-28 | Wed | 57 | 16 | 1 | 26 | 1 | covered |
| 2026-10-29 | Thu | 33 | 14 | 2 | 14 | 1 | covered |
| 2026-10-30 | Fri | 23 | 13 | 2 | 7 | 1 | covered |
| 2026-10-31 | Sat | 119 | 18 | 5 | 82 | 1 | covered |
| 2026-11-01 | Sun | 51 | 9 | 2 | 29 | 6 | covered |
| 2026-11-02 | Mon | 29 | 19 | 1 | 8 | 1 | covered |
| 2026-11-03 | Tue | 26 | 11 | 0 | 10 | 5 | covered |
| 2026-11-04 | Wed | 31 | 18 | 0 | 13 | 0 | covered |
| 2026-11-05 | Thu | 52 | 13 | 0 | 34 | 5 | covered |
| 2026-11-06 | Fri | 26 | 12 | 2 | 10 | 2 | covered |
| 2026-11-07 | Sat | 151 | 18 | 4 | 94 | 25 | covered |
| 2026-11-08 | Sun | 58 | 13 | 3 | 35 | 6 | covered |
| 2026-11-09 | Mon | 14 | 11 | 1 | 1 | 1 | thin |

To reproduce: `npm run build`, `node outbox/venue-red-days-2026-11-09.mjs sql 2026-09-11 2026-11-09`, run the statement on `field-archive` (`cc49101c-0569-4d41-8e7a-be139cde4f26`) through the D1 connector, save the returned rows in the shape of `outbox/venue-red-days-rows-2026-11-09.json`, then `report`. `selftest` (output in `outbox/venue-red-days-selftest-2026-11-09.txt`) shows each check refusing a doctored copy of those rows.
