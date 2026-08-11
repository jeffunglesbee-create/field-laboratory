module Scout

open Desk

// Scout's Pick — the OTHER pick, and the opposite of Field's Pick.
//
// Worth stating plainly, because the two are easy to conflate and they
// disagree by design:
//
//   FIELD'S PICK   ranks the slate and rewards "national broadcast" as a
//                  positive reason. It is the marquee game.
//   SCOUT'S PICK   DISQUALIFIES national games. Its stated purpose is "the one
//                  game tonight you'd never find on your own, but definitely
//                  should watch." It is the hidden one.
//
// A UI that shows both must say which is which, or it is presenting two
// contradictory recommendations as if they were one opinion.
//
// Source: FIELD — Scout's Pick Architecture (June 10 2026). Five gates:
//
//   Gate 0  isNationalGame AND NOT WC          -> disqualify
//   Gate A  hasSeriesContext                   -> qualify
//   Gate B  hasMilestone (BDL within 5%)       -> qualify
//   Gate C  hasStatAnomaly (deviation >= 0.25) -> qualify
//   Gate D  hasWCStakes (MD2/MD3 pAdv variance)-> qualify
//
// ---------------------------------------------------------------------------
// WHAT THIS PAYLOAD CAN ACTUALLY ANSWER
// ---------------------------------------------------------------------------
//
// Audited against both committed captures rather than assumed. A game carries:
// id, sport, league, date, home, away, scores, venue, streams, note, tags,
// crew, local_note, odds, drama, espn_event_id, went_to_ot, finalized_at,
// start_time.
//
//   Gate 0  ANSWERABLE, differently — see `Broadcast` below.
//   Gate A  ANSWERABLE from league/series.
//   Gate B  NOT ANSWERABLE — no milestone or player data in this payload.
//   Gate C  NOT ANSWERABLE — no stat-of-day, no deviation.
//   Gate D  NOT ANSWERABLE — no World Cup scenario data.
//
// Two of five gates. That is the finding, not a limitation to work around, and
// it is the reason for the shape below.
//
// ---------------------------------------------------------------------------
// WHY "CANNOT TELL" IS A CASE
// ---------------------------------------------------------------------------
//
// In production each gate is a JS boolean, so a gate whose input is missing
// returns false — indistinguishable from a gate that looked and said no. The
// architecture doc records that exact failure as the reason for the June 10
// rebuild:
//
//   "Gate 0 killed all WC games — every WC game has nationalBundle set ...
//    because there's no local alternative, not because it's mainstream."
//
// The gate did not misjudge the games. It answered a question it could not
// answer, and `false` had no way to say so. `GateAnswer` gives it one.
type GateAnswer =
    | Qualifies of because: string
    | DoesNotQualify of because: string
    /// The payload does not carry what this gate needs. Names the field, so a
    /// reader learns what would have to arrive for the answer to change.
    | Unanswerable of missing: string

type Gate = { Name: string; Answer: GateAnswer }

// ---------------------------------------------------------------------------
// Gate 0 — broadcast
// ---------------------------------------------------------------------------

/// Whether the viewer already has an easy way to watch.
///
/// Production reads `nationalBundle`. This payload has `streams` instead — a
/// comma-separated outlet list like "MLB.TV, BravesVision, YES". Different
/// field, so this is not a port of Gate 0; it is the same editorial question
/// asked of the data that exists.
///
/// And it is arguably the better question. Gate 0's recorded bug was that
/// `nationalBundle` was set on World Cup games "because there's no local
/// alternative, not because it's mainstream" — the flag conflated two things.
/// `streams` lets the presence of a local alternative be read directly rather
/// than inferred from a flag that meant something else.
type Broadcast =
    /// A recognised national outlet and nothing local alongside it. This is the
    /// disqualifying case: everyone can already find it.
    | NationalOnly of outlet: string
    /// At least one regional or team-owned outlet is listed.
    | LocalAvailable
    /// Outlets listed, none recognised either way. NOT treated as local — that
    /// assumption is the Gate 0 bug in the other direction.
    | UnrecognisedOutlets of raw: string
    | NoBroadcastListed

/// Named, not pattern-matched on substrings.
///
/// FIELD Rule 50 (SPORT-DISPLAY-A) prohibits `sportName.includes(...)` checks
/// for exactly this reason, and the same argument applies to broadcasters. The
/// registry is explicit so an unmodelled outlet becomes visible rather than
/// silently bucketed.
let private nationalOutlets =
    [ "ESPN"; "ESPN2"; "ABC"; "FOX"; "FS1"; "TBS"; "TNT"; "NBC"; "Peacock"
      "Apple TV+"; "Netflix"; "MLB Network"; "Prime Video"; "truTV" ]

/// Team-owned or regional. "MLB.TV" is deliberately here: it is a league-wide
/// out-of-market product, not a national broadcast, and treating it as national
/// would disqualify nearly every game.
let private localOutlets =
    [ "MLB.TV"; "YES"; "NESN"; "MASN"; "SNY"; "MSG"; "CHSN"; "BravesVision"
      "CLEGuardians.TV"; "Marquee"; "SportsNet"; "Bally"; "FanDuel Sports" ]

let private splitOutlets (raw: string) =
    raw.Split(',') |> Array.map (fun s -> s.Trim()) |> Array.filter (fun s -> s <> "") |> List.ofArray

let broadcastOf (streams: string option) : Broadcast =
    match streams |> Option.map splitOutlets with
    | None | Some [] -> NoBroadcastListed
    | Some outlets ->
        let isNational o = nationalOutlets |> List.exists (fun n -> n = o)
        let isLocal o = localOutlets |> List.exists (fun l -> l = o)
        if outlets |> List.exists isLocal then LocalAvailable
        else
            match outlets |> List.tryFind isNational with
            | Some national -> NationalOnly national
            | None -> UnrecognisedOutlets(String.concat ", " outlets)

/// Outlets this registry does not know, so the sentinel can name them.
let unmodelledOutlets (streams: string option) =
    match streams |> Option.map splitOutlets with
    | None -> []
    | Some outlets ->
        outlets
        |> List.filter (fun o ->
            not (nationalOutlets |> List.exists ((=) o))
            && not (localOutlets |> List.exists ((=) o)))

let gateBroadcast (streams: string option) : Gate =
    { Name = "Gate 0 — already easy to find"
      Answer =
        match broadcastOf streams with
        | NationalOnly outlet -> DoesNotQualify(sprintf "national broadcast on %s, no local option listed" outlet)
        | LocalAvailable -> Qualifies "no national-only broadcast"
        | NoBroadcastListed -> Unanswerable "streams (no outlets listed on this game)"
        | UnrecognisedOutlets raw -> Unanswerable(sprintf "streams (unrecognised outlets: %s)" raw) }

// ---------------------------------------------------------------------------
// Gate A — series context
// ---------------------------------------------------------------------------

/// Production tests the league string for playoff/series/final. Kept as an
/// explicit list rather than a substring scan, same reasoning as the outlets.
let private seriesLeagues = [ "playoff"; "playoffs"; "series"; "final"; "finals" ]

let gateSeries (league: string option) (seriesEntries: int) : Gate =
    { Name = "Gate A — series context"
      Answer =
        let leagueSaysSeries =
            league
            |> Option.map (fun l -> seriesLeagues |> List.exists (fun s -> l.ToLower() = s))
            |> Option.defaultValue false
        if leagueSaysSeries then Qualifies "the league string names a series"
        elif seriesEntries > 0 then Qualifies "the payload carries series standing"
        else DoesNotQualify "no series context in league or series section" }

// ---------------------------------------------------------------------------
// Gates B, C, D — not answerable here
// ---------------------------------------------------------------------------
//
// Written out rather than omitted. A gate that is missing from the list looks
// like a gate that passed; a gate that reports what it needs is a to-do with an
// address on it.

let gateMilestone : Gate =
    { Name = "Gate B — milestone within 5%"
      Answer = Unanswerable "player milestone data (production reads BDL; not in /context/date)" }

let gateStatAnomaly : Gate =
    { Name = "Gate C — stat anomaly >= 0.25"
      Answer = Unanswerable "getStatOfDay deviation (PK%/DRTG/park factor; not in /context/date)" }

let gateWorldCup : Gate =
    { Name = "Gate D — World Cup MD2/MD3 stakes"
      Answer = Unanswerable "WC scenario pAdv data (not in /context/date)" }

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/// Four outcomes, because "no" and "cannot tell" are different answers.
///
/// M2 / ADR-002 note: qualification stays boolean over independent dimensions.
/// Nothing here sums the gates or compares them to a threshold — a game
/// qualifies because one gate said yes, exactly as the architecture doc
/// requires. There is no Scout equivalent of `SealedRank` because there is no
/// Scout score in this payload to seal.
type ScoutVerdict =
    | Disqualified of by: string
    | Qualifying of on: Gate list
    | NotQualifying of asked: Gate list
    /// Nothing qualified, but some gates could not be asked. This is the case
    /// production cannot express, and on this payload it is the common one.
    | Indeterminate of unanswered: Gate list

let verdictOf (gates: Gate list) : ScoutVerdict =
    // Gate 0 is a veto and is checked first, matching the architecture doc's
    // ordering: a national game is out regardless of what else it has.
    let vetoed =
        gates
        |> List.tryPick (fun g ->
            match g.Name, g.Answer with
            | name, DoesNotQualify because when name.StartsWith "Gate 0" -> Some because
            | _ -> None)
    match vetoed with
    | Some because -> Disqualified because
    | None ->
        let qualifying =
            gates |> List.filter (fun g ->
                match g.Answer with
                | Qualifies _ -> not (g.Name.StartsWith "Gate 0")
                | _ -> false)
        if not qualifying.IsEmpty then Qualifying qualifying
        else
            let unanswered =
                gates |> List.filter (fun g ->
                    match g.Answer with
                    | Unanswerable _ -> true
                    | Qualifies _ | DoesNotQualify _ -> false)
            if unanswered.IsEmpty then NotQualifying gates else Indeterminate unanswered

/// Every gate for one game, in the architecture doc's order.
let gatesFor (game: Game) (seriesEntries: int) : Gate list =
    [ gateBroadcast game.Streams
      gateSeries (Some game.League) seriesEntries
      gateMilestone
      gateStatAnomaly
      gateWorldCup ]

let scoutVerdict (game: Game) (seriesEntries: int) = verdictOf (gatesFor game seriesEntries)

/// One line naming what the verdict rests on.
let verdictSummary (verdict: ScoutVerdict) =
    match verdict with
    | Disqualified because -> sprintf "Not a Scout's Pick — %s" because
    | Qualifying gates ->
        gates
        |> List.map (fun g -> match g.Answer with
                              | Qualifies because -> because
                              | DoesNotQualify _ | Unanswerable _ -> g.Name)
        |> String.concat "; "
    | NotQualifying _ -> "No gate qualified this game"
    | Indeterminate unanswered ->
        sprintf "Cannot tell from this payload — %d of 5 gates have no data here" (List.length unanswered)
