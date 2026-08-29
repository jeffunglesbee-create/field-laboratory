# Reading is a simulation of execution

**2026-08-29** · `CLAUDE.md`, `package.json` (`check:sports`)

## The question

Nine defects in one session, four detectors built, and the fifth defect walked
past all four. "A value whose name and its measurement disagree" describes them
and explains nothing, which is why the detectors kept being reactive.

## The cause

**Reading is a simulation of execution, and every one of these bugs lived exactly
where the simulation and the execution diverge** — substring matching, path
resolution, JSON shape, promise rejection paths.

| what was read | what one command said |
|---|---|
| fixtures at `public/data/`, present locally | `git ls-files` — untracked; `public/` is gitignored build output |
| `detectSportClass`'s football branch, and "CFB is football" | `node -e` — `'cfb'` matches none of `nfl`/`football`/`cfl` |
| what `/context/date` "should" return | a consumer destructures `games.regular` / `games.postseason` |
| `epa_table.json`, by its name | the 1120 entries are under `.ep`; every lookup returned `?? 0` |
| a local artifact file | the run — the file was yesterday's |
| the `CLOSED` heading convention | 15 of 18 docs use a `**Status:**` line |
| a passing deploy gate | `EXPECTED = 21`, and the table now has 22 |

**Seven of nine.** The two that do not fit are honest counter-examples and both
are purely local: a vacuous ternary (`a ? x : x`), caught by reading, correctly;
and two overlapping tree-mutating scripts, which is process discipline rather
than verification.

What separates the seven: **a cross-boundary fact — a sibling directory's tracked
status, another repo's payload shape, a function's runtime behaviour, a
workflow's real state — asserted from local reading.**

## Why the existing rule did not catch it

field-relay-nba's Rule 87 already says *"Never write from memory — probe it."*
Two things blunted it:

1. **It is scoped to "every CC-CMD".** Today's failures happened in ordinary
   commits, outside that ceremony, so it never applied.
2. **field-laboratory has no such rule at all** — verified by grep, not memory,
   which is the only way this document is allowed to make that claim.

And "DO NOT ASSUME" does not cover it, which is the point: reading the code *is*
verification in that rule's letter. Believing I was obeying it did not help.

## The rule, and its one question

> **A cross-boundary fact is not verified by reading. If one command answers it,
> not running that command is the defect, however obvious the reading looks.**
>
> **Is this the source, or a copy of the source?**

A copy is almost always locally true. That is what makes it convincing.

## The rule caught a fifth instance, minutes after being written

`Sport.Bundesliga`, added and compiled 71/71 that morning, rendered as
**`BUNDESLIGA · 6 · UNMODELLED SPORT`**.

`npm run build` is `dotnet fable … && node scripts/build-site.mjs`, and only the
second half had been run. `build-site.mjs` assembles `public/` from whatever is
in `build/`, so the page came from F# compiled before the commit — and I read
that page as the source's behaviour while writing the paragraph forbidding
exactly that.

**The confirming detail would have been invisible to a boolean check:**

```
stale build:  Union Berlin vs Frankfurt     <- UnknownConvention's separator
fresh build:  Union Berlin v  Frankfurt     <- HomeVersusAway's
```

An assertion of the form "Bundesliga appears on the page" passes on the stale
build. The separator is what proves the case took effect rather than merely
existing.

## What now renders, for the first time

`npm run check:sports` renders `data/context-2026-08-29.json` — 78 rows, 11
sports — and passes **17/17** with **zero UNMODELLED sections**:

```
MLS · 28   MLB · 15   CFB · 8   BUNDESLIGA · 6   LIGUE 1 · 5
EPL · 4    SERIE A · 4   LA LIGA · 3   NFL · 2   WNBA · 2   CFL · 1

CFB          AVIVA STADIUM  ·  North Carolina @ TCU
Bundesliga   STADION AN DER ALTEN FÖRSTEREI  ·  Union Berlin v Frankfurt  ·  3–3
```

`North Carolina @ TCU` is `AwayAtHome`. `Union Berlin v Frankfurt` is
`HomeVersusAway` with home named first, and that ground is Union Berlin's.

Before today every `Sport` case since AFL was compiler-verified and
render-unverified. `npm run check` still renders the two-AFL-row fixture and is
untouched; `check:sports` is additive.
