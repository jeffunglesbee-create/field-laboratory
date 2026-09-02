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

---

## Steps 2 and 3, and the measured result

**36 -> 62 of 78 cards tint.** The probe's range was 61-63; the page renders 62.

The regeneration (`b9df02e`) carries 1701 entries, 75 of them with no alternate.
Spot-checked against the probe's reading:

```
"MLS", "D.C. United", "#000000", "#d61018"
"MLS", "LAFC",        "#000000", "#c7a36f"
"EPL", "Spurs",       "#ffffff", "#0B1426"
"Bundesliga", "Frankfurt", "#ffffff", "#272726"
```

`Scoreboard` now calls `Palette.choosePair` with both clubs' full lists. The
three conditions are unchanged and still all bind; they are asked of each
combination rather than of one.

### The sixteen that stay plain are three different facts

Only one of them is about colour, and the pin comment says so rather than
reporting a number:

| | cards |
|---|---|
| **no combination works** | 5 — Angers v Auxerre, Vancouver v Sporting KC (both spellings), Hull v Coventry, Lions v Colts |
| **ESPN does not serve the club** | 7 — six CFB fixtures past the 50 teams that endpoint returns, plus Montreal v Winnipeg |
| **the table lacks that spelling** | 4 — `Los Angeles Football Club`, `Minnesota United FC`, `New York City Football Club`, `Atlanta United` |

The last group is why the page renders 62 rather than the 65 the probe resolved
through ESPN directly. It is a COVERAGE gap and it has a known fix — the slate
sweep, which resolved zero rows on the 2026-08-31 slate and wants a slate where
those clubs actually play.

Every other assertion held on the render: no card one-sided, every tint painted
the colour it declared, AA cleared on the card surface and on the page ground,
no tint reading as the plain text colour, tints only on matchup names, no page
errors.

### What the three that started this now render

```
LAFC v D.C. United        #000000 / #d61018
Newcastle v Spurs         #000000 / #0b1426
Frankfurt v Union Berlin  #272726 / #da0308
```

Each is the club's own second colour.

---

## The last hop, which was not asserted anywhere

Everything above proves the tints on the BUILT page: `check:team-tints` runs in
`verify` against `localhost:8080`. `live-check` runs `render-check.mjs` against
the deployed worker, but never the tint check — so "62 of 78 tint" was true of a
copy, and the served page asserted nothing about colour at all.

That is precisely the shape `CLAUDE.md` opens with. Its fifth instance is the
Bundesliga case: behaviour read off a local build, attributed to the source, and
the build predated the commit. The tell was one separator character — `vs` where
the fresh build renders `v` — and a boolean check asserting "Bundesliga is on the
page" would have passed on the stale build.

`public/` is a copy. `build/` is a copy. The worker's response is not.

`live-check` now runs `team-tint-render-check` against
`https://field-laboratory.jeffunglesbee.workers.dev/?data=context-2026-08-29`.
The capture is reachable there because `build-site.mjs` copies `data/` into
`public/` and no `.assetsignore` excludes it, so the pin is the same 62,
measured one hop further out.

### Landed and green

| | |
|---|---|
| verify 258 | the resolver fix |
| verify 260 | generator, `choosePair`, wiring, pin at 62 |
| guards 115 | |
| deploy 630 | |
| live-check 632 | the deployed page renders — without, until now, any claim about its colours |

---

## The slate sweep, and the one gap it cannot close

Dispatched `generate team colours` with `date=2026-08-29` — the capture's own
day, and a day the relay really served those spellings.

```
- 1705 entries across 31 league(s)
- slate swept for the relay's own spellings: 2026-08-29 (81 row(s), 4 resolved)
```

**62 -> 65 of 78**, with no code change at all. 65 is the number the
alternate-colour probe resolved through ESPN directly, predicted before the sweep
ran; prediction and measurement agree.

Three of the four resolved spellings reach a card here — Minnesota United FC v
Orlando City, Toronto FC v New York City Football Club, Atlanta United v
Charlotte FC. Incidentally confirming the earlier diagnosis: the table now
carries `"MLS", "Atlanta United", "#9d2235", "#aa9767"`, which is the pair the
broken matcher had been handing to D.C. United.

### `Los Angeles Football Club` cannot be swept, and that is correct

```
sameTeam('LAFC', 'Los Angeles Football Club') -> false
```

No shared token. `tokens` keeps words of three characters or more, so ESPN's
`LAFC` is `{lafc}` and the relay's spelling is `{los, angeles, football, club}`.
Subset matching cannot bridge an acronym to its expansion in either direction.

That result was printed in this session hours ago, in the very self-test written
to prove the matcher — and read past. It is the correct behaviour: a matcher
that bridged those two would be inferring an identity rather than observing one,
which is the whole thing `Desk.fs` refuses when it says "a normaliser is a place
for two spellings to silently become one".

The remedy is an explicit alias — a fact someone writes down, which then appears
as an ordinary readable row in the generated table rather than as matcher
behaviour. Not taken here: it is an addition to the generator's INPUT, and it
wants its own decision rather than arriving inside a sweep.

The short spelling `LAFC v D.C. United` renders `#000000 / #d61018` today, so the
fixture is coloured on the desk; it is the long-spelling duplicate row that stays
plain.

### The thirteen that remain

| | cards |
|---|---|
| no combination works | 5 |
| ESPN does not serve the club | 7 |
| the table lacks that spelling | 1 — `Los Angeles Football Club` |
