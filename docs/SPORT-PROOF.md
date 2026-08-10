# Sport as a union: the compiler enforcing FIELD's Rule 50

FIELD's Rule 50 (SPORT-DISPLAY-A) says it plainly:

> **SPORT_DISPLAY_RULES is the single source of truth for sport identity.**
> Sport display conventions (home/away order, separator, score format, period
> prefix, table label, FD code, ESPN endpoint, isSoccer) must be declared in
> `SPORT_DISPLAY_RULES` — one entry per sport. Do NOT add new sport-specific
> checks outside this registry.

It then lists the patterns it exists to eliminate, each annotated *"all caused
Session 9/10 bugs"*:

```
AMERICAN_SPORTS.has(sport)      SOCCER_SPORT_SET.has(sport)
sportName.includes("MLS")       FD_LEAGUE_MAP[sport]
ESPN_STANDINGS_MAP[sport]
```

**Status: Specced, not yet built.** Verified against production's own code map:
`SPORT_DISPLAY_RULES` is absent, while `SPORT_COLORS`, `SPORT_ICONS`,
`SPORT_CHIP_LABELS`, `SPORT_META` and `ESPN_SPORTS` are all present — five
separate string-keyed registries, which is the condition Rule 50 was written to
end. Rules 51 (`SPORT_PERIOD_PREFIXES`), 52 (`buildSection`) and 53
(`resolveGameScore`) are the same shape and equally absent. See
`docs/PRODUCTION-CLAIMS.md` for the evidence and its limits.

A registry is a convention. In F# it can be a fact.

## The bug this found immediately

This laboratory inherited the weakness it was built to study. `Sport` was a
`string`, and the card rendered every fixture as:

```fsharp
sprintf "%s @ %s" game.Away game.Home
```

`Away @ Home` is the American convention. Applied to AFL it is simply wrong: a
Sydney home game against Collingwood rendered as **"Collingwood @ Sydney"**,
which reads as a Collingwood home game. Both committed captures went through it,
every check stayed green, and the rendered output was on the live page.

Nothing caught it because a `string` carries no convention with it. Home/away
order is the *first* field Rule 50 lists, and this is why.

## The mechanism

```fsharp
type Matchup =
    | AwayAtHome        // NFL, NBA, MLB, NHL
    | HomeVersusAway    // AFL, and association football
    | UnknownConvention // the sport is not modelled

[<RequireQualifiedAccess>]
type Sport =
    | AFL
    | MLB
    | Unrecognised of raw: string

type SportMeta =
    { Label: string; Matchup: Matchup; IsSoccer: bool; Modelled: bool }

let sportMeta (sport: Sport) : SportMeta =
    match sport with
    | Sport.AFL -> { Label = "AFL"; Matchup = HomeVersusAway; IsSoccer = false; Modelled = true }
    | Sport.MLB -> { Label = "MLB"; Matchup = AwayAtHome;     IsSoccer = false; Modelled = true }
    | Sport.Unrecognised raw ->
        { Label = raw; Matchup = UnknownConvention; IsSoccer = false; Modelled = false }
```

One registry, one exhaustive match. `src/Laboratory.fsproj` promotes FS0025
(incomplete pattern match) from warning to **error**, so exhaustiveness is
enforced by the compiler refusing the build rather than by the zero-warning CI
gate noticing afterwards.

## `Unrecognised` is not a fallback

The relay serves many competitions; a closed union over an open world would
either drop games or take the slate down. `Unrecognised` is the same device as
`Nested.Malformed` already in this repo: a real state, made loud.

- The card group renders `EFL Cup · 3 · UNMODELLED SPORT`, with
  `data-unmodelled="true"` on the section.
- Its fixtures render `Home vs Away` — home first, neutral separator. Not a
  guess at the convention, a refusal to make one. Guessing is what produced the
  AFL bug above.
- The drift sentinel reports the sport vocabulary it observes and flags
  unmodelled sports daily, so the registry's incompleteness surfaces as an alarm
  within a day.

The fix when it fires is to add the case — and the compiler then forces it
through every function in the registry. That is the difference between a
fallback and an alarm: a fallback keeps working quietly and never gets fixed.

## What the compiler said

<!-- proof: FS0025 -->
```fsharp
match g.Sport with
| Sport.AFL -> "afl"
| Sport.MLB -> "mlb"
```
```
error FS0025: Incomplete pattern matches on this expression. For example, the
value 'Unrecognised (_)' may indicate a case not covered by the pattern(s).
```

Any match on `Sport` anywhere in the program must handle every case. This is the
direct replacement for `AMERICAN_SPORTS.has(sport)` and
`sportName.includes("MLS")`: there is no membership test to get wrong, and no
way to write a check that silently answers `false` for a sport nobody
considered.

### Adding a sport without updating the registry

Adding `| NHL` to the union and nothing else:

```
src/Desk.fs(92,11): error FS0025: Incomplete pattern matches on this expression.
For example, the value 'NHL' may indicate a case not covered by the pattern(s).
```

The compiler names the missing case. This is Rule 50's requirement — one entry
per sport, no sport-specific knowledge outside the registry — enforced rather
than requested.

`scripts/proof-check.mjs` performs this mutation on every CI run: it adds a case
to the real union, compiles, and asserts FS0025 is raised *and names the new
case*. The claim on this page cannot drift ahead of the code.

## What this does not claim

- The registry has two modelled sports, AFL and MLB, because those are the only
  ones evidenced by committed captures. Cases are added when the sentinel
  observes them, not invented in advance.
- `IsSoccer` is declared because Rule 50 names it, and is currently `false` for
  every modelled sport. It is a registry field with no consumer yet — recorded
  as such rather than presented as working.
- Nothing here claims production's five registries disagree with each other.
  Their contents were never read. Only that five exist, which is the condition
  Rule 50 exists to end.
