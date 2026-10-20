# Claude Code Command — verify's live-slate render check is red on any day whose slate has no venue the table knows

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory (reads `field-playground` for the source of any venue added)
**Filed:** 2026-10-20 by CC, found when a comments-only commit's `verify` run failed
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** **DONE 2026-10-20**, landed as `4a0a6ab` (main). The owner chose
option 1. Playground turned out to carry no NHL/NBA/NFL/CFB venue, so the
owner then chose to record arenas as indoor (option 2's distinction, built on
option 1's data). See "Owner's choice" below.

---

## What was measured

`verify`'s step "Render check against the LIVE slate" fails on the 2026-10-20 slate.

| run | commit | result |
|---|---|---|
| 39437657525 | `88ae65d`, a comments-only change | red at this step, every other step green |
| 39446347687 | `39572f8`, current main, none of that change | **the identical failure** |
| 39357483890 | `483d0cf`, main, started 2026-10-20 02:10Z (22:10 ET on 10-19, so the previous day's slate) | green |

The failure is the slate, not any commit. (Main's `verify` at `7505a58`, run
39454054451, also failed a second, unrelated step, "Weather against the LIVE
Open-Meteo API", on a transient per-venue request; that is
`docs/CC-CMD-2026-10-17-weather-live-http-outage.md`, not this.) Both red runs print the same four
FAILs, from `scripts/render-check.mjs`:

```
FAIL  the venue table covers at least one venue on this slate
      → Bell Centre, Prudential Center, … (26 venues) — none of them in the 45-entry table
FAIL  every card whose venue the table knows carries a live chip
      → 0 known venue(s) on this slate, 0 chip(s) filled. …
FAIL  every live chip reads as a temperature and nothing else   → []
FAIL  every live chip carries a real roof caveat                → []
```

The last two print `[]` because `filled.length > 0` is part of their predicate and
nothing filled. They are the first check's consequence, not independent findings.

**It was not the Open-Meteo outage.** In the same run, `weather-live-check`
reported `UNREACHABLE: fetch failed` (run 39437657525, 14:18Z) and was tolerated;
on main about an hour later (run 39446347687, 15:16Z) it answered 200 and passed
12/12. The render check's
own line reads `open-meteo (start+duration): no request recorded`: the page made
no weather request because it had no venue to ask about. That is a different
failure from `docs/CC-CMD-2026-10-17-weather-live-http-outage.md`, which stays
open on its own terms.

## The table, measured

`src/Venues.fs` holds 45 entries, counted from the file: the MLB parks
(Fenway Park … Tropicana Field), the AFL grounds (S.C.G. … Marvel Stadium) and a
few MLS/other stadiums (BC Place, Lumen Field, America First Field, Providence
Park, Allianz Field, Dignity Health Sports Park, Sporting Park, DICK'S Sporting
Goods Park). Its header calls it "a working subset, not playground's full 98
keys". It carries **no NFL, NHL, NBA, CFB or UEFA venue.**

The 2026-10-20 slate is NHL, UEFA Champions League, CFB and NBA: 26 real venues,
none in the table.

## Why this is a design question, not just a bug

The check's own comment is deliberate: with no known venue, `filled.length ===
expected` is `0 === 0` and three checks go green having proven nothing, so "the
table covers at least one venue on this slate" is a check in its own right. That
is right for what it guards. What it cannot tell apart is two different facts:

1. **A venue that should have weather and the table lacks.** Today's slate has
   these: Pitbull Stadium, Delaware Stadium and Joan C. Edwards Stadium (CFB),
   Anfield, Etihad Stadium, Estádio do Dragão, Olimpico, Parc des Princes and
   others (UEFA). The page shows no weather chip for them. That is a real
   coverage gap in the product.
2. **A venue that should get no weather chip at all.** An indoor arena (Bell
   Centre, Madison Square Garden, Rogers Place …). `Venues.fs` says production
   answers "does this venue get weather?" with `isOutdoorVenue`, and the table
   exists to make that data. No chip here is expected.

The check calls both "none of them in the table" and fails. Because the table has
no NFL/NHL/NBA/CFB/UEFA entries, **every day on which no game is played at one
of those 45 venues fails it**. `verify` runs on every `src/**` and `scripts/**`
push, so a push touching either goes red on such a day. How many days that is
was not counted; the next step is to count it, from the sport mix of the last
30 slates against the table, before choosing an option.

`verify-full`, the gate, is unaffected: its render rows run on committed
captures. Measured: it passed 530/530 on `bb68495` (run 39352388469), a different
tree and an earlier slate, so this shows the gate's design and not that it would
pass today.

## Options

1. **Extend the table from playground's reviewed keys (recommended).** Add the
   outdoor venues the product serves, taking coordinates and roof types from
   `field-playground`'s hand-reviewed table (`Venues.fs` header: assembled from
   a Wikidata/Nominatim/Photon/Overpass probe sequence), never from memory. Add
   indoor arenas too only if the owner wants a weather chip on them (they would
   carry the "fixed roof" caveat the roof check already accepts). The coverage
   check then keeps its meaning. Work: one probe of playground's keys, one
   `Venues.fs` extension, Suite coverage for the new roof/alias cases, a
   `weather-live-check` run for the new coordinates (it already verifies every
   entry's zone against Open-Meteo). About 2-3 hours, one `verify-full`.
2. **Make the check say which kind of miss it is.** Venues the table records as
   indoor or declared non-weather are `observable = false`, as placeholders
   already are (printed loudly, never a silent pass); a slate fails only when it
   names a venue that SHOULD get weather and the table lacks. Needs a recorded
   fact (indoor / unknown) per miss, which means option 1's data work anyway.
3. **Keep the check as it is and accept a red `verify` on those days.** Nothing
   to build, and `verify` stops meaning "is this commit correct" for months.

Whichever is chosen must not turn "the table covers nothing on this slate" into a
quiet pass: the existing check exists because that shape keeps recurring.

## Done conditions

1. The owner's choice is recorded under this heading.
2. `verify` on main is green on a slate with no MLB/AFL/MLS venue. The artifact
   is a `verify` run id on such a day (the next NHL/NBA-only weekday, for
   example), not a statement.
3. A mutation that deletes one added venue from the table is caught.
4. `npm run gate` >= 95.

## Owner's choice (2026-10-20)

Option 1, then "record arenas as indoor" once the probe showed that playground
has no arena, NFL or CFB venue. What was built, and the measurements behind it:
`outbox/cc-session-2026-10-20-venue-coverage.md`.

Done conditions:

1. Recorded above.
2. `verify` green on main on the 2026-10-20 slate (NHL, NBA, UEFA and CFB; no
   MLB, AFL or MLS venue): run 39503750847, at `82769f5`.
3. Deleting a venue the slate needed (`venue-table-loses-anfield`) or an arena
   (`indoor-arena-unrecorded`) is caught. Both are registered mutations.
4. Gate 530/530 (`verify-full` run 39489924109).

Still uncovered: UEFA outside England, Munich, Freiburg and Strasbourg; CFB;
NFL. Filed as `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md`.
