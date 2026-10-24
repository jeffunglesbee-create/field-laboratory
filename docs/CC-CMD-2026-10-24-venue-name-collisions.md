# Claude Code Command — one venue name, two grounds: find every table row that serves the wrong city

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-24 by CC, from the home-team calibration in `outbox/cc-session-2026-10-24-home-team-rule.md`
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** FILED, not started. Task 2 is an owner decision.

---

## Related, read before building (BUILD-ON-A)

Searched 2026-10-24 by content (`Red Bull Arena`, `two grounds`, `collision`,
`same name`, `tryFind`) across `docs/CC-CMD-*.md` and `outbox/*.md`. Nothing
covers one name serving two grounds.

- `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md` (PARTIAL): built the table
  rows this checks and the home-team rule it reuses. Builds on it; undoes
  nothing in it.
- `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md` (DONE): the indoor-arena
  list. Option 2 below reuses its mechanism.
- `outbox/2026-09-03-mls-pair-discriminators.md` is the OPPOSITE case: one ground
  filed under two names (`Sports Illustrated Stadium` and `Red Bull Arena` for
  Harrison). Its own text: "neither of them two grounds". Not this.

## What was measured

The table is keyed by venue name alone (`Venues.tryFind`, and the page's
`data-venue`). Some names are two grounds. Measured 2026-10-24, calibration run
40119203719 (`outbox/venue-source-calibration-latest.json`, `homeTeam` block):

- `Red Bull Arena` is one table row, Harrison NJ (40.7367, -74.1503).
- The archive also files RB Leipzig home games under `Red Bull Arena`
  (field-archive D1, queried 2026-10-24: Red Bull NY x6, RB Leipzig x5,
  Crystal Palace x1). The home-team rule picks Wikidata Q210466, Leipzig
  (51.3458, 12.3481), for those games. Nominatim agrees with Leipzig for that
  name.
- So a Leipzig game shows New Jersey weather. That is the same wrong-city chip
  the ambiguity guard exists to prevent, arriving by a different door.

One collision in 155 venue/home pairs over the 73 hand-reviewed venues that have
archive homes. **Not measured:** the other 337 table rows (301 sourced
by the earlier runs, plus the 23 added by the home-team rule). The 23 were
checked for other home teams on 2026-10-24 and show none at a different ground
(`Nissan Stadium` with Ole Miss and `Estadio Banorte` with Club América and
World Cup teams are each one ground), but that is one day's archive, not a
guarantee.

## Task 0 — probe (run first, write nothing)

1. `git log --oneline -5`, then `grep -rn "archive" scripts/*.mjs | head` to find
   how scripts here read field-archive. Do not write the query from memory.
2. For every table venue, list every home team the archive holds for that exact
   name, all dates.
3. Run `chooseByHome` (`scripts/venue-source.mjs`) for each (venue, home) pair
   over that name's Wikidata candidates, and compare the pick with the table
   row, as `--calibrate` already does for the 73.

## Task 1 — measure every row, on a runner

Extend `--calibrate`'s home-team phase from `data/venue-homes-table.json` (73
venues) to all table rows. Commit `outbox/venue-collisions-latest.json`: per
venue, the homes seen, the pick, its distance from the row, and a verdict
(`same ground`, `collision`, `abstain`). The artifact prints its denominator:
`checked N of M table venues`.

## Task 2 — decide how a collision is served (owner)

A name that is two grounds cannot be one row. The page looks a venue up by name,
so any fix changes a lookup key: a structural change (Rule 9 in the client's
CLAUDE.md applies by analogy; do not choose alone). Options to put to the owner,
recommendation first:

1. Key the lookup by (venue, home) for the collided names only; every other row
   is unchanged.
2. Record the collided names as having no weather, as indoor arenas are
   recorded, until a key exists.
3. Leave them and print the list on every verify, so it is visible.

## Done conditions

1. `outbox/venue-collisions-latest.json` committed, its denominator equal to the
   table's row count.
2. Every `collision` row is either fixed by the option the owner chose, or the
   owner's decision is recorded in this file.
3. `npm run gate` >= 95.
