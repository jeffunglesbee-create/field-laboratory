# Alias cards: a reading filled one name's cards and left the other spelling empty

CC-CMD: `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md` (Task 3, below).
Found by main's verify run 40116546191 (e12a44a) and 40120271188 (2e7c60b):
`73 known venue(s) on this slate, 71 chip(s) filled`, identical on both.

## Cause, in the order it was established

1. Not a transient: two runs, same 73 and 71, 58 requests all answered 200, the
   page reporting nothing. (Rule 77: it was investigated, not called a flake.)
2. Which cards: of the 63 table venues on 2026-10-24's slate (field-archive D1,
   queried that day), exactly two pairs share a coordinate at the page's 3-decimal
   key: `DICK'S Sporting Goods Park` / `Dick's Sporting Goods Park`, and
   `Red Bull Arena` / `Sports Illustrated Stadium`. Both pairs are on the slate.
3. Mechanism, from source: `Venues.distinctLocations` keeps ONE name per place
   (so 73 cards need 58 requests), and `WeatherView.fillCards` then built a
   selector from that one name. The other spelling's cards had no reading.
4. Why now: `git log -S` puts `Dick's Sporting Goods Park` in the sourced block
   from `a4ff365`. The table had 3 alias groups at `4a0a6ab` and has 10 now
   (Camden Yards / Oriole Park, Angel / Angels, Rate Field / Guaranteed Rate,
   Minute Maid / Daikin, Optus / Perth Stadium, Dick's, Red Bull Arena / Sports
   Illustrated, City Ground / The City Ground, St Mary's / St. Mary's, NRG /
   Reliant). The page bug is older; my 301 rows made a slate with both spellings
   likely. This is a defect in work I landed, found by the check that exists to
   find it.

A second defect in the same function, found while reading it and not yet seen in
production: the selector was `.desk-card[data-venue="%s"]` with the name
unescaped. The sourced table holds `Johnny "Red" Floyd Stadium`; a card for it
would make `querySelectorAll` throw on an invalid selector, stopping every later
reading from being written.

## Fix

- `Venues.namesAt` (every table name at one place) and `Venues.servesCard`
  (does a reading for X belong on a card that says Y), both plain string
  comparison.
- `fillCards` reads the cards once and matches by name in code, so aliases are
  filled and no name is ever parsed as a selector.

## Verified

- F# suite 318/318 (4 new, each with a must-fail input): an alias reading fills the
  other spelling; the relation is symmetric (Red Bull Arena / SI Stadium); a
  double-quoted name is compared, not parsed; an unknown name serves only itself.
- Mutations, each caught: `venue-reading-serves-only-its-own-name` (the old
  behaviour), `venue-names-at-ignores-coordinate`.
- The DOM write itself (`fillCards`) has no node-side test; its proof is the live
  render check on a runner against the real slate. verify run 40121281654, on the
  session branch at 46487c6 with this fix: `Render check against the LIVE slate`
  success, where main's runs 40116546191 and 40120271188 had failed it at 73
  known venues / 71 chips on the same day's slate (both alias pairs on it). That
  run's one red step was the permanent history check, cleared separately by the
  boundary move. The chip count itself is in the passing step's log, which this
  environment cannot read; the step's pass is the evidence, not the number.

## Correction, 2026-10-24 (the owner, then measured)

This note and the first version of the fix treated "Red Bull Arena" and "Sports
Illustrated Stadium" as aliases of one ground, New Jersey's. They are not: the
New Jersey ground has traded as Sports Illustrated Stadium and the archive files
it that way from 2026-09-30; "Red Bull Arena" is RB Leipzig's. The table's
`Red Bull Arena` row was stale, not an alias. Fixed in the row, the Suite's
symmetry check (it used that pair; it now uses Minute Maid Park / Daikin Park,
with a must-fail that the two grounds do NOT serve each other), and the comment
in `Venues.namesAt`. See `outbox/cc-session-2026-10-24-red-bull-arena-row.md`.
The Dick's pair is still a true alias; "the other unfilled card" on that slate
was Sports Illustrated Stadium's, left empty because the stale row stole its
coordinate group.

## Related, not fixed here

`Red Bull Arena` and `Sports Illustrated Stadium` are one ground, and today's
Bundesliga RB Leipzig game at `Red Bull Arena` is in Leipzig:
`docs/CC-CMD-2026-10-24-venue-name-collisions.md`. Filling both cards from one
reading is right for the aliases and shows New Jersey weather on the Leipzig
card until that CC-CMD is decided.
