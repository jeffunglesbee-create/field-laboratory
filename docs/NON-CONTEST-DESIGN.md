# The non-contest `Matchup` case

**Filed 2026-08-25.** Design for the fourth `Matchup` case that `Sport.Golf`'s
own `Omission` has been asking for since it was written.

**Status:** BUILT 2026-08-25, same day. Option A was taken. Every measurement
below is from a probe run that day; nothing here is inferred from general
knowledge about golf. Session doc:
`outbox/cc-session-2026-08-25-non-contest.md`.

Two things the build found that this design did not predict, both recorded in
the session doc: golf never reaches `Final` (`gameStateAt` needs both scores and
`away_score` is null), so `scoreText`'s `Scheduled` branch had to check the
`Matchup` case or the whole feature was a no-op with green tests; and a Fable
union field is not a string, so guard 3 had to read `cases()[tag]` at both
levels.

---

## What the rows actually hold

`outbox/sport-vocabulary-2026-08-25T01-24-34-105Z.json`, from a
`drift-sentinel` dispatch on `4ea140f`:

```
sport="golf"       id="golf_2026-08-24_bmwchampionship_r4"
                   league="PGA Tour"   home="BMW Championship"   away="R4"
                   home_score=-17      away_score=null
                   note="Wyndham Clark -17"
                   venue="Bellerive Country Club"
                   espn_event_id="golf_401811963"

sport="PGA Tour"   id="PGA Tour_2026-08-20_src401811963"
                   league="PGA Tour"   home=null   away=null
                   home_score=-6       away_score=-6
                   espn_event_id="401811963"
```

**The same ESPN event, 401811963 — the BMW Championship — written twice.** That
single fact splits this work in two, and the split is why this document does not
cover PGA Tour.

## The golf row is a leaderboard, not a broken contest

Every column carries a real value. What was wrong was reading them as a fixture:

| column | read as a contest | measured meaning |
|---|---|---|
| `home` | the home side | the event |
| `away` | the away side | the stage within it |
| `home_score` | the home score | the figure the leader carries |
| `away_score` | the away score | unused |
| `note` | an editorial note | the leader, named, with that figure |
| `venue` | the venue | the course |
| `league` | the league | the tour |

`sportMeta`'s current entry for `Sport.Golf` says only that `home`/`away` "are
not opponents". True, and too small: the desk renders
`"BMW Championship vs R4"` and **discards a named leader and a figure that are
already in the payload**. So the non-contest case is not a suppression. It is a
second card shape, and the data to fill it is already decoded.

One thing measured here that is deliberately NOT modelled: `-17` is called "the
figure the leader carries", not "the score to par". What was observed is that
`home_score` and the number inside `note` agree. "To par" is golf knowledge,
and this file's rule is that a convention gets derived from a measurement or
not asserted — the same rule that keeps `Sport.IPL` unmodelled.

## The type

```fsharp
/// What the relay's two side-columns hold for a sport that stages an EVENT
/// rather than a contest between two sides.
///
/// Measured per sport, never inferred. A statement about what the relay
/// WRITES, not about how the sport is played.
type EventShape =
    /// `home` names the event, `away` names the stage within it, and
    /// `home_score` carries the figure the leader carries -- not a side's
    /// score. `note` carries that leader by name.
    ///
    /// Measured on golf, 2026-08-24 (BMW Championship R4):
    ///   home = "BMW Championship"   away = "R4"
    ///   home_score = -17            away_score = null
    ///   note = "Wyndham Clark -17"  league = "PGA Tour"
    | LeaderboardSnapshot

type Matchup =
    | AwayAtHome
    | HomeVersusAway
    | UnknownConvention
    /// Not a contest. There are not two sides, so there is no pair to order
    /// and no separator between them that would be honest.
    | NotAContest of EventShape
```

**One `EventShape` case, not two.** The obvious second case is a `NoSides` for
PGA Tour's null columns. It is wrong: modelling those rows as a legitimate event
shape would enshrine the relay's category error as a thing this laboratory
understands. They are duplicates of a golf row, provably — see
`CC-CMD-2026-08-25-golf-sport-label.md`. A one-case union looks odd and is
correct; the second case arrives if and when a second non-contest sport is
measured, not before.

## Which call sites the compiler forces

Exactly two functions match on `.Matchup`, both in `Desk.fs`:

- `orderByMatchup` (line 457)
- `matchupText` (line 464)

Everything else routes through them — `Scoreboard.scoreText`,
`PickemView` (line 72), `Stats.headerText` and line 241, `Pick.entryMatchup`,
`PickView` lines 128 and 144. Adding the case is two compile errors, both in one
file. That is the registry design working as intended.

## `orderByMatchup` is the sharp part

```fsharp
let orderByMatchup (sport: Sport) (home: 'a) (away: 'a) : 'a * 'a =
    match (sportMeta sport).Matchup with
    | AwayAtHome -> away, home
    | HomeVersusAway
    | UnknownConvention -> home, away
```

Adding `| NotAContest _ -> home, away` compiles, renders nothing visibly wrong
today, and is the defect this repository keeps deleting. The caller asked which
of two things comes first. For a non-contest there are not two things. Handing
back a pair is an answer to a question that was not asked, and it is the exact
shape of the failure recorded in this function's own comment: names taken from
one path and numbers from another, with no shared decision point.

**Recommended — A. `orderByMatchup` returns a decision, not a pair.**

```fsharp
/// The two ways a fixture can be presented. A renderer must choose, and the
/// compiler makes it choose: there is no branch that yields a pair for a
/// non-contest.
type Presentation<'a> =
    | Contest of first: 'a * second: 'a
    | Event of EventShape

let presentByMatchup (sport: Sport) (home: 'a) (away: 'a) : Presentation<'a> =
    match (sportMeta sport).Matchup with
    | AwayAtHome -> Contest(away, home)
    | HomeVersusAway
    | UnknownConvention -> Contest(home, away)
    | NotAContest shape -> Event shape
```

Cost: five call sites in five files each name what an event renders as. That is
the whole point — the same medicine as `Sport` cases forcing the registry, and
this function's comment already argues for it.

**Cheaper — B.** Keep the pair, add `| NotAContest _ -> home, away`, and gate
rendering on `matchupText` alone. Two files instead of five. It leaves
`orderByMatchup` handing out a pair that is not one, which is exactly the
silent-wrong that produced the AFL transposition. **Not recommended.**

## The two renders

```fsharp
| NotAContest LeaderboardSnapshot ->
    // The event and the stage within it. Never a separator that reads as a
    // versus: "BMW Championship v R4" is the sentence this case exists to
    // stop the desk from saying.
    sprintf "%s · %s" home away
```

The scoreline. `scoreText` renders `sprintf "%d–%d" first second`, which for
golf is wrong twice: `away_score` is null, and `-17` belongs to one player.

```fsharp
/// The leaderboard line. `note` carries the leader NAMED, which is strictly
/// more than `home_score` carries, so it is preferred and the bare figure is
/// the fallback. Two levels, inside Rule 76's cap.
let private eventScoreText (g: Game) =
    match g.Note, g.HomeScore with
    | Some n, _      -> n
    | None, Some s   -> string s
    | None, None     -> "—"
```

**Open, deliberately:** rendering `0` as `E`. It is the universal golf notation
and it is general knowledge, not a measurement — and the fallback branch is
barely reachable, since `note` was populated on both sampled golf rows. Left
as the plain integer until a row with `home_score = 0` and no `note` is
actually observed.

## What else changes

1. **`Sport.Golf` becomes `Modelled = true`, `Omission = None`.** That is the
   deliverable: the section heading stops reading `golf · N · UNMODELLED SPORT`.
2. **`scripts/sport-registry-check.mjs:92`** asserts `golf.Modelled === false`.
   That assertion flips, and its comment records that the reason changed —
   golf was never unmodellable, it was un-*renderable* under a contest.
3. **`Game.League` gets its first renderer.** Golf's tour is already decoded and
   used in exactly one place (`Scout.fs:233`), never shown. `league="PGA Tour"`
   on the golf row is the correct tour identity and belongs on the card.
   Scoped to the event card only — a general "league means tour" rule is NOT
   established: `Sport.IPL`'s league column reads `"IPL 2026 — Match 53"`.
4. **`Program.fs:195`** renders `"N row(s) not drawn — sides not named"`. Once
   golf is modelled the remaining count is PGA Tour shells, and that wording
   blames the relay for a fault that is real but differently shaped. Gated on
   `CC-CMD-2026-08-25-golf-sport-label.md`; do not reword it in this change.

## Guards (Rule 89 — each names its artifact)

1. `matchupText(sportOfString('golf'), 'BMW Championship', 'R4')` must equal
   `"BMW Championship · R4"` exactly, and must not match `/\b(v|vs|@)\b/`.
2. `sportMeta(sportOfString('golf')).Modelled === true` and `.Omission` absent.
3. `presentByMatchup` must return `Event` for golf and `Contest` for all 21
   modelled contest sports — enumerated, all 22 asserted, not sampled.
4. `eventScoreText` over four enumerated inputs: note present; note absent with
   a figure; note absent with no figure; both present and disagreeing (note
   wins, and that is asserted rather than assumed).

## Estimate

About two hours: one for `Desk.fs` plus the five `Presentation` call sites, one
for the four guards and the `sport-registry-check` flip. Option B would be
roughly half that and is not recommended.
