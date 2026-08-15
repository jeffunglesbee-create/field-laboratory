# Outbox — the measurement I built measured the wrong thing, and said so

**Date:** 2026-08-15
**Ships:** authority scoping and an instrument check in
`scripts/sport-convention-live-check.mjs`

## What the runner returned

`sport-convention` dispatched against real ESPN, run 1, commit `d729c35`:

```
  NFL      16 event(s)   espn=away-first  sample=PHI @ BAL
  CFL      1 event(s)    espn=away-first  sample=TAT @ WBB
  MLB      15 event(s)   espn=away-first  sample=CHW @ DET
  WNBA     3 event(s)    espn=away-first  sample=NY @ CON
  MLS      11 event(s)   espn=away-first  sample=RBNY @ ATL
  AFL      9 event(s)    espn=away-first  sample=COLL @ HAW

FAIL  laboratory names the same side first as ESPN, for every derivable sport
      → MLS: laboratory home-first, ESPN away-first (e.g. "RBNY @ ATL");
        AFL: laboratory home-first, ESPN away-first (e.g. "COLL @ HAW")
2/4 checks passed
```

**The good result first:** NFL and CFL are confirmed away-first, against 16 and
1 real events. The entries shipped in `d729c35` were written from a stated
convention and are now measured. That was the point of the exercise and it
worked.

## The result that matters more

ESPN says away-first for **all six leagues**, including Australian football.
AFL.com.au writes "Collingwood v Hawthorn" — home first — and association
football is home-first everywhere the game is played.

So `shortName` does not encode each sport's editorial convention. It is ESPN's
own uniform scoreboard format. **A source that returns the identical answer for
six different sports carries no per-sport information**, and the uniformity is
the tell.

Had I treated the failure as a laboratory bug and "fixed" it, the desk would now
write `COLL @ HAW` for Australian football on the authority of an American
scoreboard's house style — a real regression, introduced by a green check.

## What changed, and why it is not just weakening the check

Agreement is now asserted only where ESPN is a primary editorial source for the
league (NFL, CFL, MLB, WNBA). For MLS and AFL the divergence is **reported and
explicitly labelled UNVERIFIED**, because this check has no instrument for the
editorial convention of a sport ESPN merely republishes.

The obvious objection is that I relaxed a failing check until it passed. The
distinguishing test: if ESPN had said *home-first for MLS and AFL and away-first
for the rest*, I would have accepted it as authoritative, because a source that
discriminates is carrying signal. It did not discriminate. That is different
evidence, not a different standard.

To keep that honest rather than a story I told once, the file now asserts the
instrument itself:

```
check('ESPN is still uniform, so it still cannot adjudicate per-sport convention',
  derived.length === 0 || espnOrders.length === 1, ...)
```

If ESPN ever **does** start varying by sport, this fails and says
*"it may be an authority after all; revisit the authority flags."* The scoping
decision is now falsifiable by the same source that forced it, instead of a
comment nobody re-checks.

## Two defects of mine in the same file

- **I inverted the text/order comparison** while editing —
  `r.lab === 'away-first' ? !cowboysFirst : cowboysFirst`, backwards. That is
  precisely the transposition this check exists to catch, written into the check
  itself. Caught before dispatch, corrected, and commented at the site.
- **The instrument check claimed variance from an empty set.** With every league
  unreachable, `espnOrders.length === 1` is false, so it reported *"ESPN now
  VARIES by sport ()"* — a claim made from zero data. Now guarded: nothing
  derived reports "neither confirmed nor refuted".

## What remains unverified

MLS and AFL conventions. They rest on a stated editorial norm, exactly as NFL
and CFL did before this run, and this check cannot settle them. Adjudicating
them needs a source that is authoritative for those competitions —
`afl.com.au` and a league-side soccer fixture list — not more ESPN. Recorded as
open rather than quietly counted as agreeing.
