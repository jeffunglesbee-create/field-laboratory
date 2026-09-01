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
