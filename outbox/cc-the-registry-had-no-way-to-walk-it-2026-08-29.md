# 28 sports in the registry; the checks graded seven

**Date:** 2026-08-29
**Scope:** `src/Desk.fs`, `scripts/sport-registry-check.mjs`,
`scripts/docs-check.mjs`, `docs/JLAYER-PLAN.md`
**Doc:** *FIELD — Unification Specs v1.0*, Drive
`1YEh4YAHGyadpiaOO9LMo-w2tGZdRxj3JdU7jkBAbWYY`, May 24 2026, ACTIVE BLUEPRINT.

## The root cause it names, in the sibling product

> any time a new sport is added, or a rendering decision touches sport identity,
> a bug is possible because the identity logic exists in **at least 6 different
> places**.
>
> Sessions 9+10 bugs caused by: `AMERICAN_SPORTS has("MLS Soccer")` → wrong
> home/away order · `findESPNScore` requiring `periodPrefix="'"` → blocked 1H/2H
> soccer scores

Its **SPEC 1 — SPORT-DISPLAY-A** proposes one `SPORT_DISPLAY_RULES` object with
`homeFirst`, `separator`, `isSoccer`, `isAmerican` per sport, consulted by every
rendering decision. Status: *"Specced. Not built."*

## The laboratory built it, and then could not walk it

`Desk.sportMeta` **is** that object — `{ Label; Matchup; IsSoccer; Modelled;
Omission }`, one entry per sport, and stronger than the spec asks for: adding a
`Sport` case without a registry entry **does not compile**, asserted by
`check:proof`.

Earlier today I fixed `SOCCER_SPORTS = new Set(['MLS','EPL','La Liga','EFL
Cup'])` in the sentinel by replacing it with `sportMeta(sportOfString(n))
.IsSoccer`. That was this spec's defect, found independently and fixed the way
the spec prescribes.

Auditing for others found two more, and then the reason they exist:

```
scripts/docs-check.mjs           const SPORTS = ['MLB','MLS','WNBA','EFL Cup','NFL','CFL','AFL']
scripts/sport-registry-check.mjs const SEEN   = ['MLB','MLS','WNBA','EFL Cup','NFL','CFL','AFL']
```

(No line numbers: this commit replaced both lines, and a number pointing at
replaced code is what the citation check exists to stop. It caught this commit
at the pre-commit door — the same check added to that hook this morning, after
it had failed `verify` on three consecutive commits.)

**There was no enumeration to iterate.** `Palette.fs` has `allSemantics`,
`Typography.fs` has `allFonts` and `allRoles` — the pattern is used throughout
this codebase — and `Sport` had none. So every consumer transcribed.

The DU holds **28 cases**. The checks graded **seven**. A check named *"The sport
registry matches what production serves"* was looking at a quarter of the
registry, and `docs-check` claimed `sports.modelled = 7` as a fact about a
literal rather than about the registry.

## `allSports`

Added to `Desk.fs`: 27 named cases. `Unrecognised of raw: string` is
deliberately absent — it is not a sport, it is the honest answer for a
competition never seen, and it carries a payload so it is a function rather than
a value.

```
allSports: 27   modelled: 24   soccer: 15
unmodelled: PGA Tour, IPL, UFL
```

The doc claim moves **7 → 24**.

### Completeness is asserted, not trusted

Fable cannot reflect over a DU, so `allSports` is written by hand and would
silently miss a case added later — which is the same failure, one level up. The
check reads `src/Desk.fs`, counts the `| Case` lines in the `Sport` DU, subtracts
the payload-carrying one, and requires the two numbers to agree.

Teeth, by dropping `Sport.UFL` from the list and rebuilding:

```
FAIL  allSports covers every named case in the Sport DU
13/14 checks passed
```

## Two different questions, kept apart

`SEEN` was **not** replaced with `allSports`, and that restraint matters. It asks
*"is every sport production serves modelled"* — an observation, not a registry
walk. Replacing it would have silently changed the question.

Instead it is unioned with a real captured payload, the same treatment the
brief-type registry got this morning:

> Those seven were what the sentinel logged on two days in mid-August. The
> committed `/context/date` capture from 2026-08-29 carries eleven, six of which
> are not in the list above.

**Third instance of this shape today**, after the brief-type `SEEN` and the
four-competition `SOCCER_SPORTS`.

The registry-wide questions are new assertions alongside it: every entry
round-trips through its own label, and `allSports` is complete.

## One assertion was measuring its own literal

```js
check('only the association-football competitions are flagged as soccer',
  soccer.length === 2 && soccer.includes('MLS') && soccer.includes('EFL Cup'), …)
```

That is a property of the seven-element list, not of the registry, and unioning
the capture in would have broken it — correctly, and for the wrong reason.
Pinning a new count would just freeze a new number.

The invariant Rule 50 actually names is *gridiron must not inherit the soccer
flag*. Stated directly now, over eleven codes that are not association football,
so it holds however many competitions arrive.

## Verify

```
npm run check:sports   # 14/14, "every registry entry round-trips (27 sports)"
npm run check:docs     # 3/3, sports.modelled = 24
```
