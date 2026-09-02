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

---

## The reading, and the bug it exposed in the probe itself

Run 33564289570, ESPN read 2026-09-02 00:00 UTC.

```
  ESPN team fields observed: abbreviation, alternateColor, color, displayName,
    id, isActive, isAllStar, links, location, name, nickname, logos,
    shortDisplayName, slug, uid
  colour-ish fields: alternateColor, color

  78 card(s)
    already          39
    recovered        26
    still-plain       5
    not-observable    8
```

**There is no third colour.** Two fields, measured rather than assumed: `color`
and `alternateColor`. A club with three real identity colours — D.C. United is
black, red and white — has two of them here, and the third is not available from
this source at any price.

Alternates are near-universal: 30/30 MLB, 32/32 NFL, 32/32 NHL, 30/30 MLS, 20/20
EPL, 18/18 Bundesliga. CFL is the one league with **none** (0 of 9).

### 26 of 78 cards recover, including two of the three that started this

```
EPL          Newcastle v Spurs        -> #000000 / #0b1426  (was #000000 / #ffffff)
Bundesliga   Frankfurt v Union Berlin -> #272726 / #da0308  (was #ffffff / #da0308)
MLB          Red Sox v Yankees        -> #bd3039 / #132448  (was #0d2b56 / #132448)
MLS          Chicago Fire v Seattle   -> #ff0000 / #2dc84d  (was #7ccdef / #2dc84d)
```

Spurs takes its navy, Frankfurt its black. Both are the club's own second
colour — nothing invented.

### Five cards no combination fixes

```
MLS      Vancouver Whitecaps v Sporting KC  #ffffff/#12284c vs #a7c6ed/#0a2240
EPL      Hull v Coventry                    #f28800/#ffffff vs #87cced/#ffffff
Ligue 1  Angers v Auxerre                   #1a1a1a/#ffffff vs #ffffff/#1a1a1a
NFL      Lions v Colts                      #0076b6/#bbbbbb vs #003b75/#ffffff
```

Angers and Auxerre are the clearest case: the same two colours in opposite order.
No choice from this data separates them, and plain is the honest rendering.

### THE PROBE MIS-RESOLVED D.C. UNITED, AND THE CARD THAT PROMPTED IT WAS NEVER MEASURED

`sameTeam` is a subset test over `tokens`, which drops every word of two
characters or fewer. `D.C. United` therefore reduces to the single token
`united`, which is a subset of Atlanta United, Minnesota United, Newcastle United
and every other `* United` club. `findTeam` returned the FIRST match.

Confirmed by direct call, not inferred:

```
sameTeam('D.C. United', 'Atlanta United FC')     -> true
sameTeam('D.C. United', 'Minnesota United FC')   -> true
sameTeam('D.C. United', 'Newcastle United')      -> true
```

And the signature is in the probe's own output: `D.C. United` and
`Atlanta United` came back with **identical** candidate lists,
`#9d2235 / #aa9767`, which is Atlanta's pair.

I reported those as D.C. United's colours. They are not. The card the question
was about — LAFC v D.C. United — was scored against Atlanta United and is not a
measurement of anything.

**The committed table is NOT affected.** Its rows come from ESPN's own
`displayName` and `shortDisplayName` directly (`generate-team-colours.mjs:233`),
with no fuzzy matching, so `"MLS", "D.C. United", "#000000"` is ESPN's real
value. The fuzzy resolver appears in the generator only in the slate sweep, which
attaches the relay's spellings — and the last run resolved zero, so nothing
entered the table through it. The exposure there is latent, not realised: a slate
spelling reducing to a generic token would inherit the wrong club's colour, and
that is an invented identity rather than a missing one.

### The fix, scoped

`findTeam` now resolves EXACT first, then UNIQUE subset, then nothing.
`Dream` still resolves to `Atlanta Dream` — one club answers to it, which was
always the point. `United` against two United clubs resolves to nothing, because
picking one invents a colour.

20 self-tests, and the mutations bite: ambiguity picking the first match drops to
18/20, removing the exact pass drops to 17/20.

**`sameTeam` is unchanged**, so `sameFixture` and the duplicate-fixture watcher
behave exactly as before. They have the same exposure — two different `* United`
fixtures would read as one — and it wants its own probe rather than a change
smuggled in beside this one.

### One limit stated rather than asserted away

Because `tokens` drops `D.C.`, that club's token set is exactly `{united}` — the
same as the bare word. No rule inside `findTeam` can separate them; the tokeniser
is where that would live, and changing it moves `sameTeam` and the watcher with
it. Harmless today (no relay spelling is the bare word, and it lands on the right
club anyway) and asserted so it stays visible if the tokeniser ever changes.

### Therefore the 26 is provisional

Every card whose name reduces to a generic token was scored against the wrong
club. The mechanism looks strong and the direction is not in doubt, but the
number is re-run material, not a result.

---

## The corrected reading — run 33564534891, matcher fixed

```
    already          38
    recovered        27
    still-plain       5
    not-observable    8
```

**All three cards that started this recover, and each takes the club's own second
colour:**

| card | candidates | rendered |
|---|---|---|
| LAFC v D.C. United | `#000000/#c7a36f` vs `#000000/#d61018` | `#000000` / **`#d61018`** |
| Newcastle v Spurs | `#000000/#0b1b3d` vs `#ffffff/#0b1426` | `#000000` / **`#0b1426`** |
| Frankfurt v Union Berlin | `#ffffff/#272726` vs `#da0308/#d4d4d4` | **`#272726`** / `#da0308` |

**D.C. United's ESPN pair is `#000000` and `#d61018` — black and RED.** The
question that prompted this probe guessed red, and it is there. The earlier run
reported `#9d2235 / #aa9767` for that club, which was Atlanta United's pair
arriving through the broken matcher; it also mis-attached D.C. United's own
`#d61018` to Minnesota United, and both readings are now consistent.

What the fix moved: `already` 39 -> 38 and `recovered` 26 -> 27, because
LAFC v D.C. United had been scored as `already` against Atlanta's red and is in
truth a recovery. Two CFB cards moved from partly-resolved to `0/0` — ambiguous
matches correctly refusing to resolve rather than picking a club.

### The prize, stated as a range rather than a number

The page renders **36** tinted today. The probe resolves through ESPN with the
fixed matcher and finds **38** already workable, so two cards are spellings the
committed table does not carry — a coverage gap, not a colour one. Adding the
alternate mechanism reaches **63 of 78** where the table has both spellings, and
61 where it does not.

The 8 `not-observable` are ESPN coverage: the CFB endpoint serves 50 teams and
this slate reaches well past them, and CFL resolves nothing at all — the same
league that has no alternates.

### The five that stay plain are the argument that the rule is honest

```
Ligue 1  Angers v Auxerre   #1a1a1a/#ffffff  vs  #ffffff/#1a1a1a
```

The same two colours in opposite order. No combination of what the source
provides separates them, and a page that showed a difference here would be
inventing one.
