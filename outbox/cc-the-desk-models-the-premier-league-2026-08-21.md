# Outbox — the desk models the Premier League

**Date:** 2026-08-21
**Ships:** `Sport.EPL` in `src/Desk.fs` — union case, `sportMeta` entry,
`sportOfString` mapping

## What this is

The English Premier League, added to the sport registry the day it first
appeared on the desk. The 2026-27 season opened on 2026-08-21, and the live page
rendered Arsenal v Coventry at the Emirates under the banner
`EPL · 1 · UNMODELLED SPORT`. This clears that banner: EPL is now a modelled
soccer competition, home first, like MLS / EFL Cup / La Liga.

## Model-on-observation, with the observation in hand

Every soccer entry in this registry was added when the drift sentinel first saw
the competition, citing that observation — La Liga names 2026-08-16. EPL follows
the same rule and is not added a day before it was served. The evidence is the
live desk itself:

- The game row is in `/context/date/2026-08-21`, joined to the clean cron brief
  `game_live_epl_401879301` ("Arsenal hosts Coventry at Emirates Stadium").
- Home/away read off the render, not assumed: **Arsenal (home) is named first**,
  matching ESPN's `homeAway` (Arsenal home at the Emirates). The relay did not
  transpose the sides, so `HomeVersusAway` is correct rather than a guess — the
  distinction the AFL transposition made this registry care about.

## The label, and the one place a case fold is warranted

The archive serves `sport: "EPL"` (the `sport` on the game row and on the brief —
game rows and briefs share one vocabulary, the way "La Liga" and "EFL Trophy"
appear identically in both). The fetch layer's slug is lowercase `epl`.
`sportOfString` accepts **both** `"EPL"` and `"epl"`: they are one competition,
and a case difference is not a second sport. This is spelled out as an explicit
two-arm match rather than a blanket `.toLowerCase()`, so it cannot silently merge
two genuinely different labels — the failure `Rule 53` records — while still
being robust to whichever layer's label reaches the desk.

## What did NOT need to change

Following the La Liga precedent exactly: `sportMeta` and `sportOfString` only.
`sport-registry-check`'s frozen `SEEN` list (the 2026-08-14/15 observation set)
is left untouched, and its "exactly two soccer competitions" assertion still
holds because it counts `SEEN`, not the full model — La Liga sits outside `SEEN`
too. The compiler still refuses a `Sport` case with no `sportMeta` entry
(`docs/SPORT-PROOF.md`), which adding `EPL` with its entry satisfies.

## Verified

Build clean, zero F# warnings. `sportOfString "EPL"` and `"epl"` both resolve to
`Modelled = true`, `IsSoccer = true`, and render "Arsenal v Coventry" (home
first). `sport-registry-check` 8/8 — the added case did not disturb the existing
assertions. `check:proof`, `check:unused`, `check:import-purity`, `check:secrets`
green.

## The third leg

This is the laboratory's half of the three-part EPL landing the relay session
carried: seed (the game row reaches `/context/date`) and label contract (the
`sport` arrives declared) are relay-side and shipped; modelling the declared
label is here. The banner is the honest interim state between them — FIELD saying
"observed, not yet modelled" rather than guessing a convention — and it clears
only once the real label has been seen, which is now.
