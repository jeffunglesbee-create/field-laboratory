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

// --- rows that cannot be missing --------------------------------------------
//
// THE CORRECTION. The first version of this file copied production's row list
// wholesale — PARK, UMPIRE, two pitchers, records — and then rendered four of
// the five as "unresolved", because /context/date carries none of what
// production enriches from side tables. Marking the gap was better than
// production's silence, and it was still the wrong shape: a report that asserts
// five rows and can fill one is a report about the wrong subject.
//
// A row here is CONSTRUCTED FROM DATA THAT EXISTS. `Row` has no unresolved case,
// so "unresolved" is not something to avoid rendering — it cannot be built. A
// game with no broadcast listed simply has no broadcast row; nothing claims one
// and fails.
//
// Every variant below is backed by a field this payload actually carries and by
// a type this repo already proved:
//
//   Venue      Venues.fs, hand-reviewed, and checked against the planet daily
//   Market     Desk.oddsStory — including NotASequence, the finding that
//              closing_odds is not a closing line
//   Drama      Desk.formatDramaPeak, behind the ADR-002 amnesty witness
//   Broadcast  Scout.broadcastOf, which refuses to guess at an unknown outlet
//   Overtime   Desk.OvertimeStatus
//
// PARK AND UMPIRE ARRIVED THE HONEST WAY. The paragraph that stood here said
// this repo had no park-factor table and that inventing one would be the exact
// fabrication the unresolved case was honest about. The first half was wrong.
// Production has carried both tables all along, in the one file too large for
// the contents API to return — so `Scouting.fs` is generated from production's
// real numbers, cross-checked value by value against a live production render
// before being carried. Nothing here is invented; it is imported.
//
// What is still absent stays absent, and for production's own Rule 1 reason:
// a venue with no published factor gets no row rather than a neutral one.

type Row =
    /// How the park plays, from production's own table.
    | ParkRow of factor: Scouting.ParkFactor
    /// The plate umpire, with a rating only if one exists for them.
    | UmpireRow of name: string * rating: Scouting.UmpireRating option
    /// The venue and its roof, from the checked table.
    | VenueRow of name: string * roof: Weather.RoofType
    /// What the two odds snapshots do or do not say.
    | MarketRow of summary: string
    /// The drama peak, which only a finished game may show.
    | DramaRow of text: string
    /// Where it can be watched, in the vocabulary Scout already refuses to guess with.
    | BroadcastRow of summary: string
    /// Regulation or overtime, once that is settled.
    | OvertimeRow of text: string

let rowLabel =
    function
    | ParkRow _ -> "PARK"
    | UmpireRow _ -> "UMPIRE"
    | VenueRow _ -> "VENUE"
    | MarketRow _ -> "MARKET"
    | DramaRow _ -> "DRAMA"
    | BroadcastRow _ -> "BROADCAST"
    | OvertimeRow _ -> "OVERTIME"

/// A signed percentage, in production's own punctuation.
///
/// Not `sprintf "%+d"`, which renders zero as "+0". loanDepot park is exactly
/// league average for runs and production shows it as "0% runs" — a real value
/// on the live page, and the one a naive format gets wrong.
let private signedPct (n: int) : string =
    if n = 0 then "0%" else sprintf "%+d%%" n

let rowValue =
    function
    | ParkRow f ->
        // The composite index never appears — `runsDeviation` is the only way
        // out of the type, so ADR-002 PROHIBITED #3 is closed by construction
        // rather than by remembering not to print `Runs`.
        let badge =
            match Scouting.parkBadge f with
            | Some b -> sprintf " · %s" b
            | None -> ""
        sprintf "%s · %s runs · %s HR%s"
            (Scouting.venueOf f) (signedPct (Scouting.runsDeviation f))
            (signedPct (Scouting.hrDeviation f)) badge
    | UmpireRow(name, rating) ->
        // A bare name is production's real output for an unrated umpire, and it
        // is the correct one: Márquez, Libka and Wendelstedt genuinely have no
        // entry. The row is complete either way, which is why neither branch
        // needs an "unresolved" marker.
        match rating with
        | None -> name
        | Some r ->
            let weak =
                match Scouting.weakZoneOf r with
                | Some z -> sprintf " · weak: %s zone" (Scouting.zoneText z)
                | None -> ""
            sprintf "%s · %d%% overturns · %d challenged%s"
                name
                (int (System.Math.Round(Scouting.overturnRate r * 100.0)))
                (Scouting.challengesOf r) weak
    | VenueRow(name, roof) ->
        let cover =
            match Weather.roofState roof with
            | Weather.PlayedInTheOpen -> "open air"
            | Weather.Covered -> "fixed roof"
            | Weather.UnknownRoofState -> "retractable roof"
        sprintf "%s · %s" name cover
    | MarketRow s -> s
    | DramaRow t -> t
    | BroadcastRow s -> s
    | OvertimeRow t -> t

// --- the report --------------------------------------------------------------

type ScoutingReport =
    { Sport: Sport
      Home: string
      Away: string
      Rows: Row list }

/// The header, and the only ordering anything beside it may use.
///
/// The screenshot that prompted this file shows a header reading
/// "Orioles @ Twins" above a records line reading "Twins ... Orioles". Nothing
/// here orders a pair except through `orderByMatchup`.
let headerText (r: ScoutingReport) = matchupText r.Sport r.Home r.Away

/// The two sides, in the header's order. Kept because anything that ever lists
/// both teams must come from here rather than from a rule that agrees today.
let sidesInHeaderOrder (r: ScoutingReport) : string * string =
    orderByMatchup r.Sport r.Home r.Away
