# Three comments that stated the relay's `date` keying, corrected

CC-CMD: `docs/CC-CMD-2026-10-16-relay-date-keying-comment-corrections.md`.
Comments only: `src/Program.fs` (1) and `src/Desk.fs` (2). No code token moved.

## TASK 0, probed before editing

- **The three quoted blocks** matched the files at HEAD `9d19298`, byte for
  byte, at `Program.fs:48-49`, `Desk.fs:53-57` and `Desk.fs:103-106`.
- **The companion had already landed.** field-relay-nba's
  `CC-CMD-2026-10-16-cfl-archive-date-keying` is DONE (2026-10-19): writer
  fixed in `e6a5078e`, 13 rows migrated and verified 13 of 13, and
  `scripts/check-archive-date-keying.mjs` live in `guards.yml` and
  `deploy.yml`. The CC-CMD's instruction for exactly this case was to write
  CORRECTION 3's closing sentence in the past tense, which is what was done,
  and to say which state was found: this one.
- **The measurement, re-run against live `field-archive`**
  (`cc49101c-0569-4d41-8e7a-be139cde4f26`, 2026-10-20), the CC-CMD's own SQL:

  | sport | rows where UTC day differs from ET day | keyed ET | keyed UTC |
  |---|---|---|---|
  | CFB | 100 | 100 | 0 |
  | CFL | 13 | 13 | 0 |
  | FIFA World Cup | 6 | 6 | 0 |
  | MLB | 334 | 334 | 0 |
  | MLS | 133 | 133 | 0 |
  | NBA | 36 | 36 | 0 |
  | NFL | 36 | 36 | 0 |
  | NHL | 84 | 84 | 0 |
  | WNBA | 105 | 105 | 0 |
  | **all 9 sports** | **847** | **847** | **0** |

  847 ET, 0 UTC, 0 neither: the shape the CC-CMD said must hold, minus the
  13 UTC rows it expected to be gone. CFL went from 0 ET and 13 UTC to 13 ET
  and 0 UTC, with the same 13 rows. AFL: **138 of 138 rows have an empty
  `start_time`**, as claimed.

## What was written

Where the CC-CMD's text had a fact that is now past, it was dated and put in
the past tense; where it quoted a count, the count carries its date.

1. **`viewedDate`** (`Program.fs`): "today in UTC" is gone. The comment now says
   "the FIELD-zone day", keeps the history of why the old wording was wrong
   twice over, and cites 847 of 847 (2026-10-20) with the 13 CFL rows as a
   fixed past defect.
2. **The ZONE-PROOF comment** (`Desk.fs`, item 1): the 18-game measurement is
   kept. Added: what it cannot see (a UTC-keyed row scores *equal*), the
   discriminating per-row form, `821 ET, 13 UTC, 0 ambiguous at 2026-10-17`, the
   fix and migration date, the guard's name, and the 2026-10-20 re-measurement.
3. **`fieldDayOfIso`** (`Desk.fs`): the assertion is stated with its measured
   history (821 of 834, then 847 of 847), the "every sport observed" overclaim is
   named and withdrawn, and the AFL caveat's real reason is given: the column is
   empty, so there is nothing to compare, whatever the zone geometry.

## Verified

- **No behaviour change, by diff:** every changed line in `git diff` is a
  `///` line or blank. Measured by filtering the diff for any `+`/`-` line that
  is not a doc comment: none.
- **No angle brackets, no ampersands** in the new comment text, so no XML
  doc-comment warning can arise under the build's warnings-as-errors. The
  `verify` run is the only compile this environment has (no .NET here).
- **Nothing else cites the old wording:** grep over `scripts/`, `docs/`,
  `outbox/` for the old phrases finds only `docs/ZONE-PROOF.md` (below) and
  historical session docs, which are records and stay as written.

## Found, and filed rather than fixed

`docs/ZONE-PROOF.md` lines 13-22 draw the same over-reaching conclusion
("consistent with ET and inconsistent with UTC") and frame the zone as
"genuinely unknown". It is outside this CC-CMD's scope (`src/*.fs` comments
only), so it is filed as `docs/CC-CMD-2026-10-20-zone-proof-overreach.md`,
docs-only and free of CI cost, per Rule 87.4.

## Not covered

- **The comments are not executable.** Nothing here can fail if they drift
  again; the CC-CMD says so, and says the guard that can is the relay's
  `check-archive-date-keying.mjs`, which this does not duplicate.

## Gate and landing

- `verify-full` run 39437651991 on `88ae65d` scored **530/530 (100)**, mutation
  baseline 0 failing across 173. The comment edits are on main as a cherry-pick
  of `beb2191`, then the gate's two record commits.
- **`verify` (run 39437657525) was RED on that tree, and is not caused by it.**
  The failing step is "Render check against the LIVE slate": today's NHL / UEFA /
  CFB / NBA slate names 26 venues and none is in the 45-entry venue table
  (MLB, AFL, some MLS). `verify` on main HEAD `39572f8`, which carries none of
  these edits, fails with the identical four FAILs (run 39446347687). The build
  and compiler-warning steps passed on this tree, which is the only compile
  check a comments-only change has. Filed with options and a recommendation as
  `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md`; no check was loosened.
  The first guess, an Open-Meteo outage, was wrong: the log's own lines
  (`open-meteo: no request recorded`, `0 known venue(s) on this slate`) refuted
  it, and the weather step answered 200 on main an hour later.
- Landing this commit started a `verify` run on main (39454054451, `7505a58`).
  It failed **two** steps, not one: the live-slate check above, and "Weather
  against the LIVE Open-Meteo API" (`Fenway Park: request failed — fetch
  failed` at the per-venue zone check, 11/12). The second is a transient
  third-party request and is the older, open
  `docs/CC-CMD-2026-10-17-weather-live-http-outage.md`, to which the
  recurrence is now appended. The prediction made while waiting, "red only at the
  live-slate step", was wrong by one step; the other 79 steps passed.
  Until the venue CC-CMD is done, any `src/**` or `scripts/**` push on a day
  with no game at a table venue fails the live-slate step the same way.

