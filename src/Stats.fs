module Stats

open Desk

// The Stats tab's Scouting Report, built from production's Stats tab and from
// the audit of it — not ported.
//
// THE HEADLINE BUG, quoted from that audit:
//
//   "'Tied — anyone's game' appears on all seven games, including Athletics
//    47-73 vs Rays 73-46 and Padres 64-57 vs Brewers 74-46. It comes from
//    buildComebackProbability, which is a LIVE IN-GAME feature. Its first line:
//
//        if (!eData || eData.state === 'post') return null;
//
//    It guards post but not pre. On a scheduled game there are no scores, so
//    both sides parse to 0, margin is 0, and it announces a tie. It's worse
//    than a cosmetic glitch because of placement: it sits directly beneath the
//    win-loss records, so it reads as a verdict on those records — a 47-73 team
//    called even with a 73-46 team."
//
// The audit's own fix is "one condition: state === 'pre' returns null, same as
// post". That is correct and it is a patch on a shape that invites the bug: a
// function that takes raw scores and is trusted to check the state first. Add a
// fourth state later and the same hole reopens.
//
// Here the scores a comeback line needs cannot be obtained from a game that has
// not started. `LiveMargin` is private and `liveMargin` is the only constructor,
// and it returns None for Scheduled and for Final. There is no pre-game path to
// a comeback string to forget to guard — see docs/STATS-PROOF.md, where passing
// a Scheduled game is refused by the compiler.
//
// THE SECOND BUG is visible in the screenshot without reading any source: the
// header reads "Orioles @ Twins" and the records line beneath it reads
// "Twins: 59-62 · Orioles: 58-62". Home first, under an away-first header. The
// audit notes the pitcher rows are "away first then home" — so two adjacent
// lines in one card use opposite orders. That is the transposition
// `orderByMatchup` was written for, arriving in a third place.
//
// THE THIRD is silence. From the audit: "Two games have no PARK row at all —
// that's `if (pf)` skipping a null lookup"; umpires "render as bare names:
// that's the else branch, no rating entry"; every pitcher is "a bare name,
// meaning era/wins were null and both the tempo and arsenal lookups missed".
// A row that vanishes and a row that quietly renders half of itself are the
// same failure as the empty weather slate: absence and failure collapsed into
// one appearance. Each row below names what it is missing.

// --- the comeback line -------------------------------------------------------

/// The scores a comeback line is allowed to see.
///
/// Private, so the only way to hold one is `liveMargin`, which refuses anything
/// that is not in progress. A scheduled game has no margin — not a margin of
/// zero.
type LiveMargin =
    private
        { Leader: int
          Trailer: int }

/// The ONLY constructor. Returns None for `Scheduled` and for `Final`.
///
/// `Final` is refused too, and deliberately: production's guard was written
/// against `post` and the audit's fix adds `pre`, which leaves the function
/// still enumerating states it must not serve. Here the affirmative case is
/// named once and everything else is None, so a fourth `GameState` cannot open
/// a hole — it simply has no case.
let liveMargin (state: GameState) : LiveMargin option =
    match state with
    | InProgress(home, away) -> Some { Leader = max home away; Trailer = min home away }
    | Scheduled
    | Final _ -> None

let marginOf ({ Leader = l; Trailer = t }) = l - t

/// The line itself. Takes a `LiveMargin`, so it cannot be reached from a game
/// that has not started.
///
/// A margin of zero is a REAL tie here, because the only way to hold a
/// `LiveMargin` is to be in progress. That is the same sentence production
/// renders on a 0-0 scheduled game, and it is true exactly when it is reachable.
let comebackText (m: LiveMargin) : string =
    match marginOf m with
    | 0 -> "Tied — anyone's game"
    | d when d <= 2 -> sprintf "Within %d — live" d
    | d when d <= 5 -> sprintf "%d-run gap" d
    | d -> sprintf "%d down — needs an inning" d

// --- rows that can be missing ------------------------------------------------

/// Park factor, expressed as deviation from 100.
///
/// `Unknown` carries the venue name rather than being absent. Production's
/// `if (pf)` drops the row entirely, so two of seven games showed no PARK line
/// and nothing said which two or why.
type ParkFactor =
    | ParkUnknown of venue: string
    | ParkKnown of venue: string * runs: int * hr: int

/// Whether a park favours the pitcher or the hitter. Derived from the runs
/// deviation rather than stored beside it, so the badge and the number cannot
/// disagree — production keeps `badgeClass` as its own field.
type ParkLean =
    | PitchersPark
    | LaunchPad
    | NeutralPark

let parkLean =
    function
    | ParkUnknown _ -> NeutralPark
    | ParkKnown(_, runs, _) ->
        if runs <= -5 then PitchersPark
        elif runs >= 5 then LaunchPad
        else NeutralPark

/// An umpire, with or without a rating.
///
/// Production renders Iassogna, Adrian Johnson and Márquez as bare names — the
/// else branch, no rating entry. A bare name looks like a complete row.
type Umpire =
    | UmpireUnrated of name: string
    | UmpireRated of name: string * overturnRate: float * challenges: int * weakZone: string option

/// UMP WATCH at an overturn rate of 0.65 or higher, per production's threshold.
let umpWatch =
    function
    | UmpireUnrated _ -> false
    | UmpireRated(_, rate, _, _) -> rate >= 0.65

/// A probable pitcher.
///
/// `Unenriched` NAMES what is missing. Every pitcher in the audited screenshot
/// is a bare name, "meaning era/wins were null and both the tempo and arsenal
/// lookups missed" — four separate absences rendering identically to a pitcher
/// with no data at all, and identically to each other.
type Pitcher =
    | PitcherUnenriched of name: string * missing: string list
    | PitcherEnriched of name: string * era: float * wins: int * losses: int * topPitch: string

let pitcherName =
    function
    | PitcherUnenriched(n, _) -> n
    | PitcherEnriched(n, _, _, _, _) -> n

/// A team's record. Absent is a case, not an empty string — the audit records
/// that "Rockies @ Diamondbacks shows no line at all — one of the two lookups
/// failed", matched `.includes(nickname)` by substring.
type Record =
    | RecordUnknown
    | RecordKnown of wins: int * losses: int

let recordText =
    function
    | RecordUnknown -> "record unavailable"
    | RecordKnown(w, l) -> sprintf "%d–%d" w l

// --- the report --------------------------------------------------------------

type ScoutingReport =
    { Sport: Sport
      Home: string
      Away: string
      Park: ParkFactor
      Umpire: Umpire
      HomePitcher: Pitcher
      AwayPitcher: Pitcher
      HomeRecord: Record
      AwayRecord: Record }

/// The records line, ordered by the SAME function as the card header.
///
/// This is the bug the screenshot shows: "Orioles @ Twins" as the header and
/// "Twins: 59-62 · Orioles: 58-62" beneath it. Anything ordered beside a matchup
/// comes from `orderByMatchup`, which is the rule `PickemView` learned the third
/// time this transposition appeared.
let recordsLine (r: ScoutingReport) : string =
    let (firstName, firstRec), (secondName, secondRec) =
        orderByMatchup r.Sport (r.Home, r.HomeRecord) (r.Away, r.AwayRecord)
    sprintf "%s: %s · %s: %s" firstName (recordText firstRec) secondName (recordText secondRec)

/// The pitcher rows, in the same order as the records line and the header.
///
/// Production labels these "away first then home" while the records line is home
/// first. One card, two orders, neither of them stated.
let pitcherRows (r: ScoutingReport) : (string * Pitcher) list =
    let first, second =
        orderByMatchup r.Sport (r.Home, r.HomePitcher) (r.Away, r.AwayPitcher)
    [ first; second ]

/// Everything this report could not resolve, as one list.
///
/// The point of collecting them: a report with four silent gaps looks exactly
/// like a complete one, row by row. Counted together they are visible.
let gaps (r: ScoutingReport) : string list =
    [ match r.Park with
      | ParkUnknown venue -> yield sprintf "no park factor for %s" venue
      | ParkKnown _ -> ()
      match r.Umpire with
      | UmpireUnrated name -> yield sprintf "no rating for umpire %s" name
      | UmpireRated _ -> ()
      for label, p in [ "home", r.HomePitcher; "away", r.AwayPitcher ] do
          match p with
          | PitcherUnenriched(name, missing) ->
              yield sprintf "%s pitcher %s: %s" label name (String.concat ", " missing)
          | PitcherEnriched _ -> ()
      match r.HomeRecord, r.AwayRecord with
      | RecordUnknown, RecordUnknown -> yield "neither record resolved"
      | RecordUnknown, _ -> yield sprintf "no record for %s" r.Home
      | _, RecordUnknown -> yield sprintf "no record for %s" r.Away
      | _ -> () ]
