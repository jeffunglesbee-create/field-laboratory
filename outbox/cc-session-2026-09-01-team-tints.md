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
