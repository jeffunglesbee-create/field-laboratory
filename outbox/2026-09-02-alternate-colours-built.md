# The per-card colour choice, built

Three commits, sequenced so `main` compiles at every one of them.

## What ships in this first commit

**`scripts/generate-team-colours.mjs`** now emits a four-tuple —
`(league, name, hex, alternate)` — and a `tryColours` accessor. The alternate is
dropped when it equals the primary: a club whose two ESPN fields hold the same
value has one colour, not a choice, and carrying it twice would make "the
alternate did not help" and "there was no alternate" the same state at render
time, which is exactly the confusion the probe had to be fixed for.

**`Palette.choosePair`** takes both clubs' colour lists and returns the pair to
render, or `None`.

> The combination that changes the fewest primaries wins; on a tie, the
> first-named side keeps its primary.

Stated and sorted rather than left to enumeration order. The probe that measured
this had the identical rule in a comment and enforced by nothing — with two
candidates a side the naive nested loop emits the right order by accident — and a
mutation deleting its sort passed 19/19. That is why this one is a `List.sortBy`
and why the suite asserts the rule with a card where the FIRST side is the one
that must move.

The three conditions are unchanged and all three still bind: each side derives a
legible tint, each reads as a colour rather than as the text it replaces, and the
two are tellable apart.

### Not a fallback

An alternate is the club's own published colour, so a card using it still shows
that club's identity. What it may not do is invent. When no combination
satisfies the three conditions both sides go plain — which is why Angers v
Auxerre, the same two colours in opposite order, stays plain and should.

## Teeth

Suite 106 -> 110. Every new check carries the counterexample that would have
passed under the old behaviour:

| check | holds | must fail |
|---|---|---|
| an alternate recovers a pair the primaries cannot | LAFC `#000000/#c7a36f` v D.C. United `#000000/#d61018` | both `#000000`, no alternates |
| the fewest-changes combination wins, first side first | LAFC v D.C. United — first keeps its primary | Spurs `#ffffff/#0b1426` v Newcastle `#000000` — first must move |
| no combination means both plain | Angers v Auxerre | Angers v Union Berlin |
| a club with no colours yields None | `[]` v `[#000000]` | `[#da0308]` v `[#000000]` |

The generator gains five: a distinct alternate is carried, an alternate equal to
the primary is not a choice, a missing alternate leaves one colour, the emitted
module is a four-tuple, and a one-colour club emits an empty alternate rather
than a repeat. 16 -> 21.

## Sequencing, and why it is three commits

`src/TeamColours.fs` is generated, so the new table shape cannot appear in the
same commit as the generator that produces it. The order that keeps `main`
compiling:

1. **this commit** — the generator emits the new shape, `Palette.choosePair`
   exists and is exercised by the suite. The committed table is still the old
   three-tuple and nothing reads `tryColours`, so everything compiles.
2. **the regeneration** — dispatch `generate team colours`. The new table lands
   carrying alternates. Its commit is `[skip ci]`, which matters here: between
   this step and the next, `tryColours` is public with no consumer and
   `check:unused` would report it. No run is created, and the next push is green.
3. **the wiring** — `Scoreboard` calls `choosePair`, and the render pin moves
   from 36 to whatever step 2 actually produces.

Step 3's number is deliberately not predicted here. The probe measured 63 of 78
against ESPN with a fixed matcher; the page resolves through the table with exact
equality, and the two differ by whatever spellings the table does not carry. The
pin gets the measured number, not the expected one.

## One process note

`check:mutation` was started to prove the new checks and it mutates `src/*.fs`
in place while it runs. Three files — `Pick.fs`, `Scoreboard.fs`, `Stats.fs` —
were carrying injected mutations on disk at the moment this commit was being
staged, and a `git add -A` would have committed them.

Caught by reading `git status` before committing rather than after. The run was
stopped and all three restored from HEAD; `check:mutation` runs in `verify`
anyway, so nothing is lost by not completing it locally. Rebuilt and re-run
afterwards: suite 110/110, generator 21/21, unused 1/1.

Worth naming because the failure mode is silent: a mutation is a small, valid
edit to real source, so a committed one compiles, and the check that would catch
it is the one that put it there.
