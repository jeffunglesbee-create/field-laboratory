# Outdoor venue sourcing, Task 0: the work priced against the red days it removes

CC-CMD: `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md`. Task 0 only. No code,
no table row, no probe run. A decision for the owner follows the numbers.

## What was measured, and how

Source: `field-archive` D1 (`cc49101c-0569-4d41-8e7a-be139cde4f26`),
`regular_season_games`, read-only, 2026-10-21. The two name sets came from
`src/Venues.fs` at `b573ae9` by script, not by hand: the 109 table entries
(`at "..."` lines) and the 70 recorded indoor arenas (`indoorArenas`).

The live check fails a slate when it has at least one real venue that is not a
recorded arena and **none** that the table knows (`expected === 0` with
`observableVenues` non-empty, `scripts/render-check.mjs`). The archive's `venue`
strings stand in for the page's `data-venue` values; both come from the relay,
but this is an approximation of a slate, not the slate.

## The 31 days, 2026-09-21 to 2026-10-21

Columns: distinct venues / known by the table / recorded arenas / neither.

```
09-21 15/2/10/3    09-22 53/13/12/28  09-23 22/14/6/2    09-24 32/12/15/5
09-25 25/15/4/6    09-26 109/27/14/68 09-27 44/24/3/17   09-28 2/1/0/1
09-29 11/3/7/1     09-30 10/3/3/4     10-01 15/1/8/6     10-02 11/1/6/4
10-03 74/5/14/55   10-04 26/5/9/12    10-05 13/2/9/2     10-06 36/2/13/21
10-07 17/4/10/3    10-08 23/1/16/6    10-09 17/0/7/10    10-10 108/16/20/72
10-11 45/12/7/26   10-12 16/2/8/6     10-13 39/2/21/16   10-14 37/15/9/13
10-15 64/11/13/40  10-16 22/1/14/7    10-17 104/20/15/69 10-18 42/11/2/29
10-19 11/1/5/5     10-20 26/2/14/10   10-21 26/3/14/9
```

- **Red days: 1 of 31**, 2026-10-09 (0 known, 7 arenas, 10 neither). That Friday
  held five CFB stadiums (CEFCU, Husky, L&N Federal Credit Union, LaVell
  Edwards, Maverik), three European grounds (Signal Iduna Park, La Rosaleda,
  Stade Bollaert-Delelis), Yokohama Country Club (golf), and one WNBA arena.
- **Six more days sit one venue from red**, with exactly 1 known venue: 09-28,
  10-01, 10-02, 10-08, 10-16, 10-19. So 7 of 31 days (23%) are at 0 or 1 known
  venues. A rename or removal of one table row on such a day turns it red.
- **2026-10-20, the day the work was filed against, now has 2 known venues**
  (Anfield and Etihad Stadium are in the table since the playground import), so
  that day no longer fails. The CC-CMD's premise was true when it was written.

## What full coverage would cost

Distinct venues the table does not know, in the same 31 days, by sport:
CFB 138, EFL Trophy 41, NFL 28, UEFA Champions League 25, UEFA Europa League 18,
Serie A 18, UEFA Europa Conference League 17, La Liga 17, Ligue 1 14, EPL 14,
Bundesliga 14, then WNBA 5, MLS 5, golf 4, MLB 2, 'wnba' 1. About **360 names**,
most of them CFB, which the CC-CMD scopes as "UEFA, CFB, NFL". The CC-CMD names
ten venues; the archive shows the real size is more than thirty times that.

Each venue needs a geocode from a source (the playground probe on a runner, per
Task 1), a roof type, a declared zone, a Suite entry, and a live zone check.

## One gap that is not a stadium

`Michelob ULTRA Arena` (WNBA) is on the 10-09 list as "neither". It is not in
`indoorArenas`, whose provenance covers NBA and NHL only. WNBA has 5 such
unknown venues in the window plus one in lower-case `wnba`. They are probably
indoor arenas, but that is not established by the archive, so none was added.

## The decision, with a recommendation

1. **Close on the measurement (recommended).** 1 red day in 31, against about
   360 venues. This is the template the weather CC-CMD used: its Task 0 allowed
   closing "with that count as its artifact and no code".
2. **A bounded slice.** Cover only the venues behind the 7 thin days. It
   removes no red day by itself: the next thin day will have different
   stadiums.
3. **Full sourcing, about 360 venues.** A multi-session job and a product
   decision (a weather chip on every CFB and European ground), which is the
   thing this was filed to ask.

The standing risk is the 6 days at one venue. A cheaper guard than data is the
check saying how thin a slate is, which is a different CC-CMD.

## Not established

- That the page's `data-venue` strings equal the archive's `venue` strings on
  every game. The 109-name match is exact-string, as in the page.
- That the next 31 days look like these: the window is the NFL/CFB/UEFA season,
  so winter will differ.
