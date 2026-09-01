# Team colours on the desk: the hue, not the hex

2026-09-01. Asked for team names in team colours. Built as a derivation, because
the direct version is unreadable.

## The measurement that shaped it

Fifteen real club colours against `bg` (`#060514`):

```
Yankees navy  #132448  1.32      LAFC black     #000000  1.04
Astros navy   #002D62  1.49      Lakers purple  #552583  1.90
Dodgers blue  #005A9C  2.83      Storm green    #2C5234  2.27
```

**13 of 15 fail AA for small text. 7 fail even the 3.0 floor `palette-check`
already enforces on every token here.** Navy on near-black is the ordinary case
in American sport, and LAFC's black is literally invisible. Rendering a team name
in its own hex hides one team in three.

## What was built

`Palette.teamTint : string -> Token option` — holds the hue, clamps the
saturation, raises the lightness until the result clears 4.5:1.

```
Yankees navy    #132448  1.32  ->  #4f76ca  4.59  AA
Dodgers blue    #005A9C  2.83  ->  #367fb4  4.67  AA
Lakers purple   #552583  1.90  ->  #985ecf  4.65  AA
LAFC black      #000000  1.04  ->  #787878  4.58  AA
Sounders green  #5D9741  5.74  ->  #5d9741  5.74  AA   (already legible, untouched)

0/15 fail.  15 of 15 tints distinct.
```

It returns a `Token`, so the seal holds: the private constructor still means no
component can spell a hex.

### The saturation cap is derived, not chosen

This palette is semantic — gold means MUST, amber means CAUTION, red means wrong
— so a decorative colour entering the same visual field is a larger hazard than
legibility. The four chromatic semantics measure **0.54, 0.66, 0.92, 1.00**;
QUIET smoke is 0.13 and is excluded, because capping below IT would make every
club grey.

`teamTintSaturationCap` computes the minimum of the chromatic four **from the
registry itself** — 0.54 — so a team tint is always less saturated than any
colour that carries meaning, and the rule cannot drift if a semantic is retuned.

### Three properties are public because they are the claim

`contrastWithBg`, `hueOf`, `saturationOf`. "The hue is preserved" is the entire
justification for showing a derived colour, so it has to be checkable rather than
asserted in a comment.

### None is a third state, not a fallback

A missing or malformed club colour yields no tint and renders as ordinary text.
A default tint would put a colour on the page that no source supplied.

## Verification

Six suite cases, **every MustFail the raw brand hex** — the thing that was asked
for and that measurement rejected. A check whose counterexample is "just use the
team's colour" cannot go green on a build that quietly does. Suite 95 -> 101.

The compiler caught one thing reading would not have: `System.Uri.IsHexDigit` is
outside Fable's supported subset.

## Not done yet

**The data does not exist.** No colour field in the relay payload, and no team
table in either repo. ESPN's team endpoints are the plausible source and are
blocked from this sandbox, so a generator has to run in CI — the same shape as
`Scouting.fs`, which is already generated from a real source by a script.

**Nothing renders yet.** The matchup line is one string; colouring it means
splitting home and away into spans in `Scoreboard.fs`.

Both are the next commit. The derivation is complete and proven on its own, and
is committed separately so that proof stands whatever the data source turns out
to cover.


## Coverage: the number that decides whether this ships

The derivation cannot conjure a brand hex, so the remaining question is how much
of the desk it can reach. Two measurements, and the second is the answer:

1. **Per league** — does ESPN serve teams, and do they carry `color`?
2. **Per slate** — of the rows the desk actually renders, how many resolve
   **both** team names to a tint?

A league with perfect colour data whose team names do not match the names
`/context/date` serves contributes nothing to the page. Name drift is this
session's recurring subject — `Dream` vs `Atlanta Dream` — so the match runs
through the same subset-based `sameTeam` the collision probe is mutation-proven
against, never string equality.

**The slug list is a hypothesis, tried and reported.** A 404 reads `unavailable`,
which is deliberately not the same as zero coverage: averaging a slug typo in
with a real zero would publish a mistake as a fact about the sport. Golf and
PGATour are absent because they have no teams, and IPL because it lives on a
different API — guessing a slug there would manufacture a failure that says
nothing.

**One side tinted is its own bucket.** A row where only one team resolves must
not render half a matchup in colour: one coloured name beside a plain one reads
as emphasis, not identity. `both` is the addressable fraction.

The probe imports the **compiled** palette rather than reimplementing the tint
maths, so the number it reports is about the code the page runs.

11/11 self-test. Exercised end to end against a stub covering all three buckets:
a subset name match (`Dream` -> `Atlanta Dream`) landing in `both`, a half match
in `one side only`, and a colourless league in `neither`.


## The coverage result: 77.1%, and three of the misses were mine

`outbox/team-colour-coverage-2026-09-01T19-44-40-527Z.txt`, slate 2026-08-30:

```
per league — 21 tried, 20 covered
  MLB 30/30   NBA 30/30   WNBA 15/15   NFL 32/32   CFB 50/50   NHL 32/32
  MLS 30/30   EPL 20/20   LaLiga 20/20  SerieA 20/20  Ligue1 18/18
  UCL 36/36   UEL 36/36   UECL 36/36   EFLCup 92/92  EFLTrophy 64/64
  AFL 19/19   UFL 8/8     FIFAWorldCup 48/48
  CFL  9 team(s)  0 coloured   none      <- the only real gap

per slate — 48 rows
  both sides tinted : 37 (77.1%)
  one side only     :  0 (0.0%)
  neither           : 11 (22.9%)
      La Liga 3   Serie A 3   Ligue 1 3   golf 1   CFL 1
```

**Nine of the eleven misses were a defect in the probe, not a data gap.** La
Liga, Serie A and Ligue 1 all report `covered` at 20/20, 20/20 and 18/18 in the
same artifact. They missed because the lookup was keyed on the F# union member
name — `LaLiga` — and the payload says `La Liga`, with the space.

`Desk.fs` says so outright, in comments read earlier the same day:

> The relay labels it "La Liga", with the space

and the same for Serie A and Ligue 1. A union member name is a name in the F#;
the label in the data is a different string, and only one of them is what
`/context/date` serves. Reading both and still keying on the wrong one is the
session's own recurring shape.

**The per-sport miss report is what surfaced it.** A bare 77.1% would have read
as a data problem in three European leagues, and the next step would have been
investigating ESPN's soccer coverage — which is perfect.

Corrected coverage, pending the re-run: **46 of 48 rows, 95.8%**, with only golf
(no teams) and CFL (ESPN serves no colours) genuinely out of reach.

`0 one side only` is worth keeping: the resolution is per-league, not per-team,
so a row either gets both names or neither. The half-coloured matchup the design
was worried about does not occur in practice.

Each entry now carries every label the payload might use, and a check asserts the
three spaced forms — dropping one takes the suite 14/14 -> 13/14.


## The generator: fuzzy here, exact at runtime

`Desk.fs` states this repo's position on normalisers outright:

> a normaliser is a place for two spellings to silently become one

> accepting a spelling that has never been served is how a normaliser starts

and `Venues.fs` follows it — *"Aliases are separate entries with the SAME
coordinates"*. That is the opposite of the subset matching the coverage probe
uses, and the precedent is right: the fuzzy match runs **once, in the generator**,
where its output is a table a person can read in a diff. At runtime the lookup is
string equality, and a spelling not in the table yields no colour rather than the
nearest one.

That is the whole difference between a generator and a normaliser: this file can
be wrong in a way that shows up.

### The payload's spellings are keys too

ESPN publishes `Atlanta Dream`; the relay serves `Dream` on some rows and
`Atlanta Dream` on others. A table holding only ESPN's spelling would resolve
half the desk, so a real slate is swept and every name it serves is emitted
beside ESPN's `displayName` and `shortDisplayName`.

### Two refusals

**A name resolving to two different colours is dropped, not picked.** Two clubs
sharing a spelling is exactly where a silent choice would be wrong; the conflict
is reported instead.

**A table below 300 entries is refused outright.** A near-empty table compiles,
renders nothing, and reads as a design decision — indistinguishable from "no team
has a colour". If something upstream failed, that is what needs fixing.

### The workflow is atomic because it has to be

The module returns `Palette.Token`, so it must be registered in the fsproj. A
commit adding the registration without the file, or the file without the
registration, leaves `main` unable to compile. Both happen in one commit, after a
real `npm run build` and `check:verify` have proved the pair works — the workflow
cannot push a tree it has not compiled.

Dispatch-only, deliberately: a colour table regenerating on a schedule would
rewrite the page's palette with nobody reading the diff.

### Verified locally before any run

12/12 self-test. The generator was driven against a stub serving 400 synthetic
teams: 1922 entries across 32 leagues, sorted, floor cleared. Registered in the
fsproj and compiled — the generated tuple-list F# is valid and `Palette.Token`
resolves. Then driven at runtime:

```
tryBrand  "AFL" "afl City 0"       -> #005A9C
tryTint   "AFL" "afl City 0"       -> #367fb4
tryTint   "AFL" "Nonexistent Club" -> none
tryTint   "MLB" "afl City 0"       -> none   (league-scoped, as intended)
```

**That stub table is not committed.** The names were invented, and inventing data
is what this project refuses. The fsproj change was reverted with it; the real
table only ever comes from the workflow.


## The first real table exposed a bigger problem than legibility

1702 entries, 31 leagues, generated and committed by the workflow. Measured
immediately, because a table that compiles is not a table that works:

```
Bundesliga  #ffffff -> Augsburg, Monchengladbach, Cologne, Eintracht Frankfurt
            #da0308 -> Union Berlin, Leverkusen, Freiburg, Mainz
La Liga     #ffffff -> Racing, Rayo Vallecano, Real Madrid, Sevilla
EPL         #ffffff -> Fulham, Leeds, Spurs
MLB         #000000 -> White Sox, Giants, Pirates
WNBA        clean — 15 colours, 15 clubs
```

**ESPN's `color` for European football is the KIT, not the club.** Real Madrid
and Sevilla both play in white, so ESPN says white for both. That is correct and
useless: four clubs rendering one tint tells a reader nothing, and implies a
relationship that is not there.

Bundesliga had **9 distinct colours across 34 entries**. The feature would have
shipped looking finished and communicating almost nothing in three of the five
biggest football leagues.

Legibility was the problem I set out to solve. This one is larger, and only the
real data showed it — the fifteen hand-picked colours I measured at the start
were all American, all distinct, and all reassuring.

### The rule: a colour identifying two clubs identifies neither

`alternateColor` is tried first, since a club whose primary is taken usually has
a distinct secondary. A club whose **both** colours are taken is dropped and
renders as plain text.

That is the same refusal `buildEntries` already makes on the other axis — one
name carrying two colours is dropped rather than picked — applied symmetrically.
Neither is a fallback; both are the honest answer when the data cannot say.

A `canon` key decides what counts as "another club", because a club must not
collide with its own second spelling. And the slate's spelling joins its club's
candidate rather than becoming a new one, so it inherits whatever colour that
club resolved to.

### Verified

16/16, with four cases on the collision rule itself: the second white club takes
its alternate; a club whose both colours are taken is dropped rather than forced;
two spellings of one club are not a collision; the same colour in two different
leagues is not a collision.

Exercised against a stub where twelve clubs per league share white and differ on
their alternates — eleven resolve, one drops, per league.

## The render, and three defects only the page could show

**Pairwise, not global.** Two clubs sharing a colour confuse a reader only when
they appear together, and the desk shows matchups, never a league table. The
global rule cost roughly a hundred clubs their colour permanently to fix
collisions most of them never had; `resolveCollisions` is kept and still tested,
but the runner no longer calls it. The table went back to every club's real
colour and the constraint moved to render time.

`Palette.distance` is CIE76 on Lab, because two clubs in *shades* of red are as
confusing as two in the same red and `<>` on the hex would call that fine.
`tintSeparationFloor` is the closest pair among the five semantics — 32.9 — the
smallest separation this page already asks anyone to distinguish.

### The three defects, and what caught each

**1. The wrong surface.** `teamTint` targeted `bg` (`#060514`). Team names sit
inside `.desk-card`, which paints `card` (`#0b0920`), and a flipped card paints
`card2`. Blue Jays derived to `#3b78c4` — 4.49 on `bg`, **4.35 on the card it
actually sat on**. The F# suite measured against `bg` by construction, so it
agreed with the bug. Only the rendered check could catch it. Now targets `card2`,
the lightest of the three, so clearing it clears all three.

**2. Quantisation after the check.** The loop tested the float triple and then
rounded to hex, so a candidate that just cleared 4.5 could land at 4.49 once it
became a colour. What renders is the hex, so the hex is what has to clear.

**3. The null league.** `league` is null on exactly the dash-scheme MLS rows —
the entire top of the desk — while `sport` carries `MLS` on all of them. Keying
on `League` alone rendered every MLS card plain and looked like a data gap. The
coverage probe already handled this with a fallback and the handling was not
carried across. **Third time this session** that reading the right field in one
place and the wrong one in another cost a measurement.

### And one the screenshot showed that no check would have

Sporting Kansas City derived to `#aec7e6`, a pale blue measuring **18.2 against
`text`**. On the page it read as unstyled — so Vancouver's blue beside it read as
EMPHASIS. That is the precise failure the both-or-neither rule exists to prevent,
arriving through a door that rule does not watch: it compares the two tints to
*each other* and never to the colour a plain name would have been.

`readsAsColour` closes it, on the same floor, because it is the same question.
Inventing a second threshold would have been picking a number to fit an
impression.

Cost: 45 tinted cards down to 31. That is the price of not showing a colour that
is not one.

### Left alone deliberately

San Diego FC derives to `#6e7f82`, measuring 42.1 against `text` — above the
floor, and to my eye still muted beside LA Galaxy's blue. The metric says it is
fine and one impression is not a reason to move a derived threshold. Recorded
here so a second observation has something to agree or disagree with.

### Verification

106/106 suite. 7/7 on the rendered page at 1200x900, asserting: every tint
painted the colour it declared; every one clears AA against the real background
(lowest 4.75); no card is one-sided; and **tints appear only on matchup names** —
never in the pick panel, the pick'em rows or the stats headers, which all still
call plain `matchupText`. Colours are for matchups, not standings.

Screenshot: `outbox/team-tints-2026-09-01T20-14-42-209Z.png`.
