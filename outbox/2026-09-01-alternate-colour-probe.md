# Can a club's alternate colour recover a card that renders plain?

## Why this exists, and a correction to how the three losses were explained

The regeneration note said the three cards that lost their tints were "two
blacks, two whites, two reds". Two thirds of that is wrong. Measured:

| club | brand | tint | ΔE to page text `#ece8f8` | reads as a colour |
|---|---|---|---|---|
| D.C. United | `#000000` | `#7d7d7d` | 41.2 | yes |
| LAFC | `#000000` | `#7d7d7d` | 41.2 | yes |
| Spurs | `#ffffff` | `#ffffff` | **11.1** | **no** |
| Newcastle | `#000000` | `#7d7d7d` | 41.2 | yes |
| Union Berlin | `#DA0308` | `#cb5457` | 66.8 | yes |
| Frankfurt | `#ffffff` | `#ffffff` | **11.1** | **no** |

Only D.C. United v LAFC is a same-colour pair, and it is an exact one: ΔE **0.0**.
Spurs v Newcastle and Union Berlin v Frankfurt measure 47.6 and 71.5 apart —
comfortably distinguishable. They render plain because **Spurs and Frankfurt are
white, and white is the page's own text colour**, so neither reads as a tint and
the partner drops with it, a card never being one-sided.

Two causes, reported as one. The pairwise rule was doing its job on one card and
`readsAsColour` was doing its job on two.

## The population is thirty, not three

All 78 cards of the frozen capture, by the reason each is plain:

| | cards |
|---|---|
| both sides tint | 36 |
| **one side's brand is white** | **12** |
| **both read, closer than the floor** | **18** |
| one club missing from the table | 8 |
| neither club in the table | 4 |

The 8 are spelling drift — `Los Angeles Football Club` against `LAFC`,
`Minnesota United FC` against `Minnesota` — a coverage problem with a known fix
and no design change. The 30 are the colour question.

## The mechanism is already fetched and thrown away

`generate-team-colours.mjs:237` reads
`alt: brandOf({ color: t.alternateColor })` for every club, and the table stores
only the primary.

An alternate is the club's own published colour, so using it is not the sin
`resolveCollisions` committed. What made that rule wrong was **scope**: it
reassigned globally, dropping a club from every matchup to fix the handful where
it actually collided. Per card, only when the primary fails, is the same idea at
the scope the pairwise design already won on — and the same scope the desk
itself has, since it shows matchups and never a league table.

## What the probe measures, and what it refuses to

For each card it builds both clubs' candidate lists — primary first, deduped —
and takes the first combination that satisfies the page's own predicate:
`teamTint` derives a legible tint for each, `readsAsColour` holds for both, and
`distinguishable` holds between them. The predicate is imported from `build/`,
not restated, so it cannot drift from what renders.

**The rule, stated:** the combination that changes the fewest primaries wins; on
a tie, the first-named side keeps its primary. It has to be stated rather than
emergent, because a club appearing in its alternate on one card and its primary
on another is a weaker identity signal, and this rule decides how often that
happens.

**It reports only colours ESPN actually serves.** D.C. United's real identity is
black, red and white, and ESPN offers two fields. A third colour that is true but
unsourced is exactly the fabrication this project refuses, so if a club's two
fields do not recover its card, that is the finding. The probe also prints every
field name ESPN returns on a team, so "there was no third colour" is a
measurement rather than an assumption.

`not-observable` is a third state and never averaged into either side: a club
ESPN did not resolve is a coverage gap, and reporting it as a colour failure
would send the next session to the wrong place.

## Teeth

20 self-tests, and each mutation drops the count:

| mutation | result |
|---|---|
| candidate dedupe removed | 19/20 |
| the fewest-changes ordering removed | 19/20 |
| a club with no colour collapses into a colour failure | 19/20 |
| `already` reported as `recovered` | 19/20 |

**The ordering mutation survived the first pass at 19/19.** With two candidates a
side — all two ESPN fields can give — the nested loop already emits
`(0,0) (0,1) (1,0) (1,1)`, whose change-counts are non-decreasing by accident, so
the rule was stated in a comment and enforced by nothing. The test now records
the sequence of combinations tried against three candidates a side and asserts it
is monotone. No current source produces three, but a rule the data only happens
to satisfy is not a rule.
