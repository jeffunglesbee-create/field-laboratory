# Outbox — One null side blanked the whole slate

**Date:** 2026-08-13
**Trigger:** `live-check` red on the deployed page, runs at `fc11e4f`, `3c1e1bd`, `8629021`, `f248d33`

## What was failing

```
Error at: `$.games.regular.[18].away`
Expecting a string but instead got: null
FAIL  card count matches decoded game count
      → decoded NaN, rendered 0
FAIL  the venue table covers at least one venue on this slate
      → no cards with a venue — none of them in the 37-entry table
FAIL  every card whose venue the table knows carries a live chip
      → 0 known venue(s) on this slate, 0 chip(s) filled
11/18 checks passed
```

`Desk.fs` decoded both game lists with `Decode.list gameDecoder`, which is
all-or-nothing, and `gameDecoder` took `home` and `away` as
`Required.Field ... Decode.string`. One row on the live slate arrived with
`away: null`, so the entire payload failed to decode, **zero cards rendered**,
and the four checks after it failed against a page with nothing on it.

The row is not malformed. PGA Tour rows carry NULL for both sides because a golf
event has no two teams — the relay's own duplicate-cleanup outbox records the
same fact from the other direction, noting that a dedupe on
`(sport, date, home, away)` would false-merge PGA rows precisely because both
sides are NULL.

So a correct row that this scoreboard cannot draw took down every row it could.

## Why neither obvious fix

**Crash on one** was the behaviour. A payload is a set of independent rows; one
row this desk cannot draw is not a reason to draw none of them.

**Invent a name** is what `Pick.fs:160` already does —
`Optional.Field "home" |> Option.defaultValue "—"`. That renders a card for a
matchup that does not exist, with a dash where a team should be, and nothing
records that it was made up. It is the fabrication this repo exists to refuse,
and it is worse than the crash because it looks like it worked. It was not
copied, and it is now a known defect on the Pick path rather than a pattern.

## The fix

Decode what can be decoded; **count** what cannot. `Decode.oneOf [ gameDecoder
|> Decode.map Some; Decode.succeed None ]` accepts an un-drawable row without
understanding it, and the count travels with the payload as `DeskPayload.Unnamed`.

`Program.fs` appends it to `decode-status` whenever it is non-zero — *"decoded 18
game(s) for 2026-08-13 · 1 row(s) not drawn — sides not named"*. Appended, never
folded into the game count, because `decoded N` is what every check parses and
turning a blank page into a wrong number is harder to notice than the blank page
was.

## What the check actually asserts

The failure mode of this fix is a **silent skip** — rows vanish and the page
looks healthy. So the assertion is not "it doesn't crash", it is the conservation
law:

```
rows submitted === games decoded + rows counted unnamed
```

`scripts/unnamed-check.mjs`, five slates across that law plus four specific
regressions. Two of them exist because the law alone is too weak: an
implementation that counts EVERY row as unnamed satisfies it and renders the
blank page again through the new code path, and an implementation that hardcodes
`Unnamed = 1` satisfies it on the failing case only. Postseason is asserted
separately because the original bug was in `regular`, and a fix applied to one
list and not the other would pass everything else.

## Teeth, measured

The pre-fix decoder was restored in place, rebuilt, and the check re-run:

```
old decoder: 3/9 checks passed
new decoder: 9/9 checks passed
```

Recorded because a check that has only ever run against the fixed code proves
nothing, and this repo's history is largely a catalogue of checks that passed
without testing what they claimed to.

One check — "a clean slate counts zero unnamed" — passes on both, because the
old code had no counter and `undefined === 0` was not what it compared. It is
kept: it is the assertion that stops the count becoming furniture that is always
on the page and therefore never read.

## Not fixed here

- **`Pick.fs`'s `defaultValue "—"`** invents team names on the pick path. Same
  payload, same NULL sides, different and worse handling. Left alone rather than
  changed in a commit about the desk decoder; it needs its own pass and a
  decision about what a pick card should do with an event that has no two sides.
- **Whether a golf event should render at all.** Counting it as un-drawable is
  correct for a scoreboard keyed on two teams. Whether the desk should grow a
  representation for field events is a design question, not a regression.
