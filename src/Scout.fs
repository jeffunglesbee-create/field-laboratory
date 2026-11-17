module Scout

open System
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
//   Gate E  ANSWERABLE — added 2026-11-15, not in the architecture doc: a
//           coin-flip market, from the moneylines (see `gateCoinFlip`).
//
// Two of the architecture's five gates. That is the finding, not a limitation to
// work around, and it is the reason for the shape below. Gate E is a sixth, on
// data the payload does carry.
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
///
/// Strings are matched exactly, as the relay serves them. "FOX" was here and
/// the 2026-11-14 slate served "Fox" on three CFB games, so both are listed.
///
/// The 2026-11-15 additions are the owner's classification (approved with the
/// pasted proposal of that date): Fox, CBS, CW, NBA TV, NHL Net, ESPNU, CBSSN
/// and USA Net are national. "Disney+" is classified here, not by the owner: it
/// appears only as a simulcast beside ESPN or ABC ("ESPN, Disney+"), and as a
/// local outlet it would have qualified a national ESPN game.
let private nationalOutlets =
    [ "ESPN"; "ESPN2"; "ABC"; "FOX"; "FS1"; "TBS"; "TNT"; "NBC"; "Peacock"
      "Apple TV+"; "Netflix"; "MLB Network"; "Prime Video"; "truTV"
      "Fox"; "CBS"; "CW"; "NBA TV"; "NHL Net"; "ESPNU"; "CBSSN"; "USA Net"; "Disney+"
      // 2026-11-17, owner's "Full scope". Verified that day: NBCSN, NBCUniversal's
      // national cable channel relaunched November 2025, carrying Monday NBA games;
      // "Apple TV", the 2025 rename of Apple TV+, where MLS moved (exact match, as
      // "Fox" above); Fandango, the free national stream of the Bundesliga under
      // Versant's USA Sports deal. The rest classified by name and precedent.
      "NBCSN"; "Apple TV"; "Fandango"; "Paramount+"; "ESPN Deportes"; "beIn Sports"
      "Universo"; "Tele"; "CNBC"; "E!"; "SYFY"; "FOX Deportes"; "NFL Net"; "Hulu" ]

/// Team-owned, regional, or streaming-only. "MLB.TV" is deliberately here: it is
/// a league-wide out-of-market product, not a national broadcast, and treating
/// it as national would disqualify nearly every game.
///
/// The 2026-11-15 owner ruling puts the conference networks (BTN, SEC Network,
/// ACC Network) and the streaming-only services (ESPN+, MW+, DAZN regional
/// feeds, Prime Video's local feed) on this side: a game only there is one a
/// viewer would not find on their own. The rest of that day's additions are
/// regional networks, local stations and team feeds, each served verbatim on the 2026-11-14 slate (data/streams-2026-11-14.json).
let private localOutlets =
    [ "MLB.TV"; "YES"; "NESN"; "MASN"; "SNY"; "MSG"; "CHSN"; "BravesVision"
      "CLEGuardians.TV"; "Marquee"; "SportsNet"; "Bally"; "FanDuel Sports"
      // conference networks and streaming-only (owner ruling)
      "BTN"; "SEC Network"; "ACC Network"; "ESPN+"; "MW+"
      "DAZN (YES)"; "DAZN MEM"; "DAZN MIN"; "Prime Video (Local)"
      // regional networks, local stations and team feeds, as served on 11-14
      "Altitude 2 Sports"; "MNMT"; "MSGB"; "MSGSN"; "NBC Sports Phil"; "NBC Sports BA"
      "GCSEN"; "DSN"; "The Spot - MTN"; "Scripps Sports"
      "KFAA-TV"; "KTVD-TV (My20)"; "KCOP"; "KONG"; "Utah 16"
      "Pelicans.com"; "MavsTV"; "CARNHL"; "MINNHL"; "CBJNHL"; "Blues App"; "BN+"; "Mammoth+"; "ABTV"
      // 2026-11-17, owner's "Full scope". Verified that day: DAZN is the exclusive
      // local broadcaster of the Cavaliers, Pacers and Spurs (as of the Grizzlies and
      // Timberwolves above); KUNP 16 and BlazerVision are the Trail Blazers' local
      // station and team stream; Suns Live and Arizona's Family (KTVK 3TV, and CBS5)
      // are the Suns' team stream and local partner.
      "DAZN CLE"; "DAZN IND"; "DAZN SAS"; "KUNP 16"; "BlazerVision"
      "Suns Live"; "Arizona's Family 3TV"; "Arizona's Family CBS5"
      // League-wide out-of-market, like MLB.TV above, by the owner's ruling.
      "NBA League Pass"
      // Team feeds, regional networks and local stations, classified by name.
      "MyMi"; "Bucks App"; "KJZZ-TV"; "Jazz+"; "Spectrum Sports Net"; "Spectrum Sports Net +"
      "KSBI"; "Thunder App"; "ClipperVision"; "Altitude Sports"; "MSG2"; "NBC Sports Phil +"
      "CHSN+"; "KHN"; "Fox 11 Plus"; "ALT2/KTVD"; "KTLA"; "KTTV"; "KSTP"; "KING 5"
      "KDFW 4"; "KDFI"; "WWHO"; "KUSA-TV (9NEWS)" ]

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
// Gate E — coin-flip market, answerable from the payload
// ---------------------------------------------------------------------------
//
// Not one of the June 10 architecture's five. Added 2026-11-15 on the owner's
// approval of the win-probability input, because /context/date does carry what
// it needs: the moneylines, which `Desk.winProbability` de-vigs into a market
// probability in the shape its market has (closing preferred over opening).
//
// The question: did the market, before the game, have it level? A game nobody
// can call is one a scout would point at. Single dimension, boolean, no sum and
// no score, so it qualifies the way the other gates do (see `verdictOf`).
//
// The band is 47% to 53% on the de-vigged home probability, inclusive. The
// owner's proposal named that band and, separately, "H(p) >= 0.99"; those
// disagree (an entropy of 0.99 bits is roughly 44% to 56%), so the explicit
// percentages are used and the entropy is not.

let private COIN_FLIP_LOW = 0.47
let private COIN_FLIP_HIGH = 0.53

/// Both sides' probabilities as whole percentages, named and in the sport's own
/// matchup order, so the reason cannot transpose them.
let private levelText (game: Game) (home: float) (away: float) =
    let side name (p: float) = sprintf "%s %.0f%%" name (p * 100.0)
    match presentByMatchup game.Sport (side game.Home home) (side game.Away away) with
    | Contest(first, second) -> sprintf "%s, %s" first second
    | Event _ -> sprintf "%s, %s" (side game.Home home) (side game.Away away)

let gateCoinFlip (game: Game) : Gate =
    { Name = "Gate E — coin-flip market"
      Answer =
        match winProbability game with
        | TwoWayWP market ->
            let home = float (Market.twoWayHome market)
            let away = float (Market.twoWayAway market)
            if home >= COIN_FLIP_LOW && home <= COIN_FLIP_HIGH then
                Qualifies(sprintf "the market had it level before the game (%s)" (levelText game home away))
            else
                DoesNotQualify(sprintf "the market had a favourite (%s)" (levelText game home away))
        // A defined "no", not a missing input: the band is a two-sided idea, and
        // a draw is a third outcome it does not describe.
        | ThreeWayWP _ -> DoesNotQualify "a three-way market; the coin-flip band is defined for two sides"
        | ThreeWayDrawMissing -> Unanswerable "the draw price (a three-way market served without it)"
        | NoWinProbability -> Unanswerable "a moneyline for both sides (none served on this game)" }

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
    /// Carries how many gates were asked, so the summary counts rather than
    /// hard-coding a total that changes when a gate is added.
    | Indeterminate of unanswered: Gate list * asked: int

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
            if unanswered.IsEmpty then NotQualifying gates else Indeterminate(unanswered, List.length gates)

/// Every gate for one game, in the architecture doc's order.
let gatesFor (game: Game) (seriesEntries: int) : Gate list =
    [ gateBroadcast game.Streams
      gateSeries (Some game.League) seriesEntries
      gateMilestone
      gateStatAnomaly
      gateWorldCup
      gateCoinFlip game ]

let scoutVerdict (game: Game) (seriesEntries: int) = verdictOf (gatesFor game seriesEntries)

// ---------------------------------------------------------------------------
// Choosing among qualifiers
// ---------------------------------------------------------------------------
//
// The owner's ruling, 2026-11-15: nothing arbitrary, nothing invented.
// Production orders qualifiers by `_rankSignal`, a weighted sum (stat anomaly
// 100+, milestone 60/80, series 40, WC MD3 35, MD2 20) used for sort order
// only. Its weights are numbers someone chose, and Gate E has none, so it is
// not ported. Instead, two comparisons, each of something that already exists:
//
//   1. GATE PRECEDENCE. The game whose best qualifying gate comes first in
//      `gatesFor`, which is the architecture doc's order (A, B, C, D) with E
//      after it. So a series game ranks ahead of a coin-flip one. No sum: only
//      the single best gate is compared.
//   2. NEAREST TO EVEN, between games whose best gate is the coin-flip market:
//      the smaller distance of the de-vigged home probability from 50%. One
//      market quantity, not a score.
//
// What is still level after both is NOT broken by slate order, which is the
// arbitrary choice this replaces. It is reported: `Level` holds every game
// tied with the choice, and the panel names them. The first real slate it ran
// on has one: Ducks v Islanders at -108/-112 and Blues v Panthers at -112/-108
// are mirror lines, the same distance from even.

/// Float rounding only, the same tolerance `Market` uses for a probability set.
let private EVEN_EPS = 1e-9

/// Position of a gate in the documented order, read from `gatesFor` itself so
/// the order has one definition.
let private precedenceOf (order: Gate list) (gate: Gate) =
    order |> List.findIndex (fun g -> g.Name = gate.Name)

/// Distance from even for a game whose market is two-way; None otherwise.
let private distanceFromEven (game: Game) =
    match winProbability game with
    | TwoWayWP market -> Some(abs (float (Market.twoWayHome market) - 0.5))
    | ThreeWayWP _ | ThreeWayDrawMissing | NoWinProbability -> None

type ScoutChoice =
    { Choice: Game
      Gates: Gate list
      /// Every other qualifier the two comparisons could not separate from the
      /// choice. Empty when the choice stands alone.
      Level: Game list
      /// Which comparison decided it, in words.
      Basis: string
      /// Qualifiers left out because they have finished. Counted so the panel
      /// can say the pick has moved on, rather than hiding that it did.
      Finished: int }

/// What the chooser found. Three outcomes, because "nothing qualified" and
/// "everything that qualified is over" are different nights.
type ScoutOutcome =
    | Chosen of ScoutChoice
    /// Games qualified, and every one of them has finished.
    | AllFinished of qualified: int
    | NoneQualify

/// Chooses among the slate's qualifiers that have not finished, at `now`.
///
/// Finished games drop out (owner's ruling 2026-11-15, option B): the pick is
/// the best game still to watch, so it rolls forward through the day as games
/// end. A game under way stays in: it can still be watched. One pick at a time;
/// a pick per daypart is filed separately (docs/CC-CMD-2026-11-15-scout-daypart-picks.md).
let chooseScoutAt (now: DateTimeOffset) (games: Game list) (seriesEntries: int) : ScoutOutcome =
    let isFinished (g: Game) =
        match gameStateAt now g with
        | Final _ -> true
        | Scheduled | InProgress _ -> false
    let allQualifiers =
        games
        |> List.choose (fun g ->
            match scoutVerdict g seriesEntries with
            | Qualifying gates ->
                let order = gatesFor g seriesEntries
                let best = gates |> List.map (precedenceOf order) |> List.min
                let bestIsCoinFlip = (List.item best order).Name = (gateCoinFlip g).Name
                Some(g, gates, best, (if bestIsCoinFlip then distanceFromEven g else None))
            | Disqualified _ | NotQualifying _ | Indeterminate _ -> None)
    let qualifiers = allQualifiers |> List.filter (fun (g, _, _, _) -> not (isFinished g))
    let finished = List.length allQualifiers - List.length qualifiers
    match qualifiers with
    | [] -> if finished > 0 then AllFinished finished else NoneQualify
    | _ ->
        let topGate = qualifiers |> List.map (fun (_, _, best, _) -> best) |> List.min
        let atTop = qualifiers |> List.filter (fun (_, _, best, _) -> best = topGate)
        let nearest =
            atTop |> List.choose (fun (_, _, _, d) -> d) |> function [] -> None | ds -> Some(List.min ds)
        let finalists =
            match nearest with
            | Some d -> atTop |> List.filter (fun (_, _, _, dist) -> match dist with Some x -> abs (x - d) <= EVEN_EPS | None -> false)
            | None -> atTop
        let (choice, gates, _, _) = List.head finalists
        let basis =
            match List.length qualifiers, List.length atTop, nearest with
            | 1, _, _ -> if finished > 0 then "the only unfinished game that qualifies" else "the only game that qualifies"
            | _, 1, _ -> "its qualifying gate comes first in the documented order"
            | _, _, Some _ -> "the coin-flip market nearest to even"
            | _, _, None -> "its qualifying gate comes first in the documented order"
        Chosen
            { Choice = choice
              Gates = gates
              Level = finalists |> List.tail |> List.map (fun (g, _, _, _) -> g)
              Basis = basis
              Finished = finished }

/// At the wall clock. The view's entry point; tests use `chooseScoutAt`.
let chooseScout (games: Game list) (seriesEntries: int) : ScoutOutcome =
    chooseScoutAt DateTimeOffset.UtcNow games seriesEntries

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
    | Indeterminate(unanswered, asked) ->
        sprintf "Cannot tell from this payload — %d of %d gates have no data here" (List.length unanswered) asked
