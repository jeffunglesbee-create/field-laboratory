# The venue table: playground's reviewed keys, and NHL/NBA arenas recorded as indoor

CC-CMD: `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md`.
Files: `src/Venues.fs`, `src/Suite.fs`, `scripts/render-check.mjs`,
`scripts/mutation-check.mjs`. Base: main `87292ed`.

## The owner's choice, and the measurement that reshaped it

The owner chose **option 1** (extend the table from playground's reviewed keys).
Reading the source changed what that alone could do:

- field-playground `src/data/weather.js` `VENUE_COORDS` at `7e205a6` holds
  **103 keys** (the lab header said 98). It has MLB, MLS, EPL/European soccer,
  AFL, tennis/cricket and golf. It has **no NHL, NBA, NFL or CFB venue**. Its
  own comment says the NBA arenas are left out on purpose: "fully enclosed, no
  roof of any kind, zero outdoor weather relevance ever".
- So option 1 alone covers 2 of the 26 venues on the 2026-10-20 slate (Anfield,
  Etihad Stadium). An NHL/NBA-only slate would still fail the check.

That was put back to the owner as a question. The answer: **record arenas as
indoor.** That is option 2's distinction, built on option 1's data.

## What was built

1. **64 entries from playground**, with coordinates and roofs copied as
   playground has them. A script parsed `VENUE_COORDS` and compared every added
   row on lat, lon and roof: **64 of 64 equal, 0 mismatches**. The five
   playground keys not copied are places this table already has under another
   name: Oriole Park (Camden Yards), MCG (Melbourne Cricket Ground), Children's
   Mercy Park (Sporting Park) and Dick's Sporting Goods Park (DICK'S Sporting
   Goods Park). The fifth, TIO Stadium, sits 2.5 km from this table's Marrara
   Oval, and which of the two is right was not established. The table goes from
   45 entries to 109. Each new row declares an IANA zone, written here. The
   runner's `weather-live-check` verifies the zones, so they are UNVERIFIED
   until that run (below).
2. **`Venues.isIndoorArena`**, a set of 70 exact names: every distinct `venue`
   string `field-archive` holds for NBA and NHL since 2025-10-01 (D1
   `cc49101c…`, regular_season_games + postseason_games, queried 2026-10-20).
   The list in the source was diffed against the query result: identical, 70 of
   70. It works on names, not keywords: "Allianz Arena" is open air and stays in
   the table.
3. **`render-check`**: `observableVenues` = the real venues that are not
   recorded arenas. If every real venue on a slate is an arena, the check prints
   `::warning::every real venue on this slate is a recorded indoor arena (N: …)`
   and skips, loudly. Otherwise "the venue table covers at least one venue on
   this slate" asserts as before, now over the non-arena venues, and its detail
   says how many arenas were not counted. An outdoor venue the table lacks is
   still a failure.
4. **Two Suite checks.**
   - "every venue on the 2026-10-20 slate is accounted for": the 26 names from
     verify run 39446347687's annotation. Each must be a table entry, a
     recorded arena, or on a named not-yet-carried list.
   - "no table venue is also recorded as an indoor arena".

## Still not covered (named in the Suite check, not hidden)

UEFA: Şükrü Saracoğlu Stadium, Baku Olympic Stadium, Olimpico, Estádio do
Dragão, Stadio Diego Armando Maradona, Parc des Princes, MHPArena. CFB: Pitbull
Stadium, Delaware Stadium, Joan C. Edwards Stadium. NFL and CFB in general are
not in playground. **A slate whose only outdoor venues are these still fails
the live render check**, as the owner's choice intends: that is a real coverage
gap in the product. A midweek day with CFB plus NHL/NBA and no UEFA is that
shape. Covering them needs coordinates from a source, not memory. That is
`docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md`, filed with this.

## Mutations

| mutation | caught by |
|---|---|
| delete `Anfield` from the table | Suite: the 2026-10-20 slate is accounted for (313/314) |
| delete `Bell Centre` from the arena list | the same Suite check (312/314) |
| `observableVenues` ignores the arena list | render-check: the indoor-arena predicate cases |
| `observableVenues` drops a `table.has(v) ||` clause | **survived**. The clause was redundant given the disjointness check, so it was removed rather than kept as untestable code |

Three are registered in `scripts/mutation-check.mjs`
(`venue-table-loses-anfield`, `indoor-arena-unrecorded`,
`arena-predicate-ignored`). The first two ran `--only` and printed PASS.

## Build and checks, in the worktree

`dotnet fable`: 0 warnings; `node build/VerifyMain.js` 314/314;
`render-check` on `context-2026-05-15` 19/19.
