# The soccer predicates could see four competitions; the slate serves eight

**Date:** 2026-08-29
**Scope:** `scripts/cc-cmd-followup.mjs` — `SOCCER_SPORTS` only.

## What was reported as a regression

From `outbox/2026-08-28-spread-price-landed-and-two-regressions.md`:

```
REGRESSED  CC-CMD-2026-08-23-soccer-three-way-odds
           landed 2026-08-26 — no longer holds on /context/date/2026-08-27
REGRESSED  CC-CMD-2026-08-21-closing-odds-capture (surviving ask)
```

Both fatal, so the sentinel failed every run. That document listed three
candidate causes and refused to pick one without measuring. It named coverage
first — "35 of the 42 soccer games are UEFA qualifying; a book may not price
those" — and said the distinction "decides whether anything needs fixing, and
guessing it is the failure this repository documents most often."

## The cause was neither the books nor the relay

```js
const SOCCER_SPORTS = new Set(['MLS', 'EPL', 'La Liga', 'EFL Cup'])
```

Four competitions, transcribed once from a slate that happened to hold those
four. Every soccer predicate in the file — the three-way draw probe, the
opening-coverage probe, the brief-contamination scan — filters through it.

Measured against `data/context-2026-08-29.json`, a real `/context/date` payload:

```
OLD literal    soccer games seen: 35 | moneylines: 33 | carry draw: 33
NEW registry   soccer games seen: 50 | moneylines: 40 | carry draw: 40
```

Serie A, Bundesliga and Ligue 1 were invisible. So were both UEFA qualifying
competitions — the 35 of 42 games on the very slate the regression was called
on. The sentinel's own line for 2026-08-27 reads:

```
55 games — UEFA Europa Conference League Qualifying:23, UEFA Europa League
Qualifying:12, MLB:7, NFL:4, MLS:3, EFL Cup:2, La Liga:2, WNBA:2
```

42 soccer games, of which this set could see **7**.

## The ask itself holds, 40 of 40

Every soccer game on the 2026-08-29 slate that carries an opening moneyline
carries a draw:

```
soccer games: 50 | with opening_odds: 40
three-way (carries draw): 40 | two-way: 0
moneyline key shapes: { 'away+draw+home': 40 }

example  FC Dallas @ St. Louis CITY SC
{"source":"draftkings","moneyline":{"home":100,"away":225,"draw":270}}
```

And the per-competition coverage that "the relay stopped capturing soccer odds"
would predict is not there either:

```
league        games  open   ml  spread
MLS              28    26   26       0
EPL               4     4    4       0
Serie A           4     4    4       0
La Liga           3     3    3       0
Ligue 1           5     3    3       0
Bundesliga        6     0    0       0
```

The zero spread column across every soccer league is expected, not a defect:
`CC-CMD-2026-08-23-soccer-three-way-odds:206` says so in its own scope section —
"soccer has neither in this feed and this ask" does not cover it. The
2026-08-27 line `spreads=9 … none soccer` was reading a structural absence as a
failure.

## Fix

`SOCCER_SPORTS.has` now asks the registry:

```js
const isSoccerSport = name => sportMeta(sportOfString(String(name ?? ''))).IsSoccer
```

`Desk.sportMeta` carries `IsSoccer` for every competition, and adding a `Sport`
case without a registry entry does not compile — `check:proof` asserts exactly
that, 71/71. So this cannot drift the way the literal silently did. An
unrecognised competition answers `false`, the same conservative default the list
gave, arrived at honestly rather than by omission.

`drift-sentinel.yml:49` already runs `dotnet fable … --outDir build`, so the
`build/Desk.js` import is legal in the job that runs this file.

Self-test: 50/50.

## What this does NOT establish

**Whether the 2026-08-27 verdict flips.** The old set saw 7 soccer games that
day; the new one sees 42, of which 35 are UEFA qualifying. If those qualifying
ties carry a two-way "to advance" moneyline rather than a three-way match
market, the widened predicate could return `false` on more slates, not fewer.
That is a real possibility and no payload here can settle it — the fixture is a
single date, and this sandbox cannot reach `/context/date/2026-08-27`.

What is established is narrower and sufficient to land: the predicate was
measuring 35 of 50 soccer games while describing itself as measuring soccer.

**Unblocks on:** the next `drift-sentinel` run against a slate carrying UEFA
qualifying. If it reports `false` with a non-empty two-way count, the ask needs
a market-type distinction, not a wider set.
