# Outbox — NFL and CFL modelled; golf deliberately not

**Date:** 2026-08-15
**Ships:** `NFL`/`CFL` in `src/Desk.fs`, `scripts/sport-registry-check.mjs`,
`scripts/sport-convention-live-check.mjs`, `.github/workflows/sport-convention.yml`,
one mutation, one verify step

## What was wrong

`drift-sentinel` reported `unmodelled: NFL, CFL, golf` on 2026-08-14 and again
on 2026-08-15. Laboratory modelled AFL, MLB, MLS, WNBA and EFL Cup; everything
else fell to `Unrecognised`.

That is not cosmetic. `sportMeta` gives an unrecognised sport
`UnknownConvention`, and `matchupText` then renders `"%s vs %s"` with the home
side first — so for **NFL, a sport client/relay treats as first-class, the desk
named the visiting side second on every card**, regardless of which side the
relay called home.

## What shipped

`NFL` and `CFL` are now registry entries with `Matchup = AwayAtHome`, the same
convention already recorded for MLB and WNBA.

`scripts/sport-registry-check.mjs` asserts the registry's **content**, not its
shape: that every sport production serves is modelled, that labels round-trip,
that `matchupText` and `orderByMatchup` agree for all seven, and that only the
two association-football competitions carry `IsSoccer`. Both halves are
exercised because those are the two that once disagreed and printed
"Sydney v Collingwood 75-81" with 75 belonging to Collingwood.

Teeth: flipping NFL to `HomeVersusAway` gives **6/8, exit 1**; removing its
parser line gives **5/8, exit 1**; restored, **8/8, exit 0**. Registered as
mutation `nfl-convention-flipped` — a mutation no compiler objects to, which is
the point: the registry still has an entry and every match is still exhaustive,
so only a content check can catch it.

## golf is unmodelled on purpose

The relay packs a tournament and a round into `home`/`away`:
`golf_2026-08-14_fedexstjudechampionship_r2` rendered as
**"FedEx St. Jude Championship vs R2"**. Those two fields are not opponents.

Every `Matchup` case this type has asserts a contest between two sides, so
modelling golf under any of them would have the desk state, in its own voice,
that a tournament played a round. Leaving it `Unrecognised` keeps
`Modelled = false`, which is true.

The real fix is a fourth `Matchup` case for events that are not two-sided, and
that is its own change. Inventing a convention in a hurry is exactly what
produced the transposition recorded above `orderByMatchup`. The registry check
pins golf as unmodelled so a later "everything is modelled" green cannot be
reached by modelling it wrongly.

## The correction worth recording

I first wrote the NFL and CFL entries from a **stated** convention — "gridiron,
North American, visitor first" — because ESPN is unreachable from this sandbox
(`curl https://site.api.espn.com/...` returns HTTP 000 at the agent proxy). I
recorded the basis in a comment and moved on.

That was the wrong call, and it was called out: a runner has egress. "Cannot be
tested here" is a reason to test it somewhere else, not a reason to assert.

`scripts/sport-convention-live-check.mjs` derives the convention instead of
assuming it. For each ESPN event it reads which competitor is `homeAway: home`,
which is `away`, and where each abbreviation falls in ESPN's own `shortName`.
Nothing hardcodes "@" or "vs" as meaning anything — the **order** is measured,
because the order is the claim `Matchup` makes. Then it asks the compiled
`orderByMatchup` which side laboratory names first and requires agreement.

Refusals built in: a league with no games today is reported unverified and does
**not** count as agreement; a league whose own events disagree fails rather than
voting; and if nothing at all was derived, that is a failure — run locally it
reports `0 of 6 derived; 6 unreachable` and exits 1 rather than reporting the
three downstream comparisons as passing, which they vacuously do.

**Dispatch-only for now, deliberately.** It has never run against a real ESPN
payload, and its derivation depends on that payload's shape. Wiring an unproven
network check straight into `verify` is how main goes red for a reason that has
nothing to do with the commit. Once a dispatch confirms the shape it moves into
`verify` beside the other live checks — and if ESPN disagrees with the entries
shipped here, the entries are what change.
