module CardForecast

open System
open Units
open Desk
open Forecast

// THE MODEL'S FORECAST, ON AN EPL CARD — the first slice of
// docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md that a reader can see.
//
// WHAT IT SAYS. One line under the market line, in the market line's own layout
// (team names, rounded percentages), headed by where the number came from:
//
//     model table-v1 — Arsenal 38% · draw 27% · Spurs 35%
//
// The head is the provenance. `Forecast.Forecast` has three cases and the market
// line is the `MarketImplied` one; this is `Modelled`, and a card that drew both
// unlabelled would make them look like one claim. A card with no market price
// shows this line alone, which is the point of the phasing: a model needs no
// price to exist.
//
// WHAT IT DOES NOT SAY. Never a difference between this line and the market, a
// colour for agreement or disagreement, an arrow, or a word like "edge". The
// ruling for this feature (Rule F cleared for a modelled forecast, Rule A not)
// is structural here and not a promise: `lineFor` has NO parameter that carries
// a market price, so a rendering built on divergence would not compile without
// changing its signature. Two honest numbers side by side make agreement exactly
// as visible as disagreement, and that is all the card does with them.
//
// PULL ONLY (ADR-002 Rule A). The line is computed when a card renders and when
// the card's own state changes. There is no timer, no interval, no event source
// and no notification anywhere on this path, and nothing is pushed when a number
// moves. `scripts/check-forecast-pull-only.mjs` fails the build if one appears.
//
// WHEN THE LINE IS DRAWN AT ALL — three conditions, all required, and the last is
// the one that is easy to miss.
//
//   1. An EPL card. Nothing else is modelled.
//   2. In the `Scheduled` state. The standings table already contains a
//      match the moment it finishes (measured 2026-11-08: a forecast for a Final
//      card, computed from a table that includes its own result, is hindsight
//      wearing a forecast's label), so a Final card never carries a forecast.
//   3. Kickoff is still ahead of `now`. `Scheduled` is not enough, because
//      `gameStateAt` returns it for ANY row with no score — including a match
//      that kicked off minutes ago and a fixture that was postponed and never
//      scored. MEASURED 2026-11-08: Man Utd v Aston Villa is in the archive with
//      start 16:30Z and no score, i.e. `Scheduled` while in play. The standings
//      cannot contain a match that has not kicked off, so "kickoff is in the
//      future" is the exact condition under which this table is not hindsight.
//
// A card whose forecast window has closed (2 or 3 failing) draws NOTHING, not a
// sentence: the card's own status line already says where the match is, and a
// refusal there would be noise on every Final card of every past matchday.
// Refusals are for a card that SHOULD have a forecast and does not.

/// The standings, as a card sees them. Three states and no fourth: a card never
/// reads "nothing" as "empty".
type TableState =
    /// Requested, nothing back yet. A card says so rather than drawing nothing, so
    /// a request that never returns is distinguishable from a card with no
    /// forecast to give.
    | Pending
    | Loaded of TableRow list
    /// The route or the decoder said no; the sentence is the reason, verbatim.
    /// NOT a fallback to the committed capture — a quiet substitution of last
    /// week's table is the silent-wrongness shape this repository keeps finding.
    | Unavailable of string

/// Why a card that should carry a forecast carries a sentence instead. No
/// catch-all case: a new situation is named here or it does not compile.
type Refusal =
    /// The card has no kickoff time. `Desk.notYetStartedAt` reads an unknown
    /// kickoff as "may have started", so no pre-match claim can be made.
    | KickoffUnknown
    | StandingsPending
    | StandingsUnavailable of string
    /// Names that did not join to a standings row. There is no alias map in the
    /// client: the relay owns names (Rule 60), and a client-side normaliser is
    /// the band-aid Rule 64 describes. "Man United" (8 archive rows before
    /// 2026-10-31) is the real case; those cards are Final, so it costs nothing
    /// today, and the sentence is what a recurrence would show.
    | ClubsNotInTable of string list
    /// A deduction makes `points` ambiguous (net or gross is not decidable from
    /// the payload — see `Forecast.deductionsUnsettled`), so it refuses.
    | PointsDeducted of string list
    | NoMatchesPlayed of string list
    /// `Market.threeWay`'s sum guard refused. Not expected; named because the
    /// alternative is a card that quietly has no forecast.
    | ModelDeclined

/// What one card carries. `NoLine` is "nothing to say", and it is a different
/// state from every refusal.
type CardLine =
    | NoLine
    | ModelLine of ModelledForecast
    | NoModelLine of Refusal

/// The clubs, joined by name against the table. EXACT equality: both sides are
/// ESPN's `shortDisplayName` (the archive copies it), and a looser match is an
/// invented convention (Rule 62). `Standings.fromString` guarantees a name
/// answers to at most one row.
let private joinClub (rows: TableRow list) (name: string) : TableRow option =
    rows |> List.tryFind (fun r -> r.Team = name)

let private decide (rows: TableRow list) (game: Game) : CardLine =
    match joinClub rows game.Home, joinClub rows game.Away with
    | None, None -> NoModelLine(ClubsNotInTable [ game.Home; game.Away ])
    | None, Some _ -> NoModelLine(ClubsNotInTable [ game.Home ])
    | Some _, None -> NoModelLine(ClubsNotInTable [ game.Away ])
    | Some home, Some away ->
        match deductionsUnsettled [ home; away ] with
        | _ :: _ as names -> NoModelLine(PointsDeducted names)
        | [] ->
            // `Forecast.rating` is the one authority on "has played nothing";
            // this asks it rather than restating `Played <= 0`, so a second
            // guard cannot drift from the first.
            match [ home; away ] |> List.filter (fun r -> Option.isNone (rating r)) |> List.map (fun r -> r.Team) with
            | _ :: _ as names -> NoModelLine(NoMatchesPlayed names)
            | [] ->
                match modelOf home away with
                | Some m -> ModelLine m
                | None -> NoModelLine ModelDeclined

/// What a card carries, as of a named instant.
///
/// `now` is a PARAMETER for the reason `Desk.gameStateAt` takes one: a test that
/// wants a Saturday morning says so, and gets the same answer on every run.
/// There is deliberately no market input — see the header.
let lineFor (now: DateTimeOffset) (game: Game) (state: GameState) (table: TableState) : CardLine =
    if game.Sport <> Sport.EPL then NoLine
    else
        match state with
        | InProgress _ -> NoLine
        | Final _ -> NoLine
        | Scheduled ->
            match game.StartTime with
            | None -> NoModelLine KickoffUnknown
            | Some _ when not (notYetStartedAt now game) -> NoLine
            | Some _ ->
                match table with
                | Pending -> NoModelLine StandingsPending
                | Unavailable why -> NoModelLine(StandingsUnavailable why)
                | Loaded rows -> decide rows game

let private names (xs: string list) = String.concat ", " xs

/// A decoder's failure message names a path into the payload and can run to
/// several lines; a card has room for the front of it. The same cut
/// `Scoreboard.oddsText` makes for a malformed odds block.
let private clip (why: string) : string =
    if why.Length <= 80 then why else why.Substring(0, 80) + "…"

let private reasonText (r: Refusal) : string =
    match r with
    | KickoffUnknown -> "no forecast: kickoff time not served"
    | StandingsPending -> "standings loading"
    | StandingsUnavailable why -> sprintf "no forecast: standings unavailable (%s)" (clip why)
    | ClubsNotInTable xs -> sprintf "no forecast: not in the standings table: %s" (names xs)
    | PointsDeducted xs -> sprintf "no forecast: points deduction carried by %s" (names xs)
    | NoMatchesPlayed xs -> sprintf "no forecast: no match played yet by %s" (names xs)
    | ModelDeclined -> "no forecast: the model declined this fixture"

/// The card's text for a line. Every probability reaches the string through a
/// `Market` accessor and `Units.toPct`, exactly as `Desk.winProbabilityText`
/// does, so the two lines round identically and a reader comparing them is
/// comparing numbers, not formatting.
let text (game: Game) (line: CardLine) : string =
    let pc (p: float<prob>) = float (toPct p)
    match line with
    | NoLine -> ""
    | ModelLine m ->
        sprintf "model %s — %s %.0f%% · draw %.0f%% · %s %.0f%%"
            METHOD_TAG
            game.Home (pc (Market.threeWayHome m.Market))
            (pc (Market.threeWayDraw m.Market))
            game.Away (pc (Market.threeWayAway m.Market))
    | NoModelLine r -> sprintf "model %s — %s" METHOD_TAG (reasonText r)

/// The line's state as one word, for the DOM (`data-forecast`) so a check reads
/// WHAT RENDERED rather than matching prose. `model` is the only word that means
/// a number is on the card.
let kind (line: CardLine) : string =
    match line with
    | NoLine -> "none"
    | ModelLine _ -> "model"
    | NoModelLine KickoffUnknown -> "kickoff-unknown"
    | NoModelLine StandingsPending -> "standings-pending"
    | NoModelLine(StandingsUnavailable _) -> "standings-unavailable"
    | NoModelLine(ClubsNotInTable _) -> "clubs-not-in-table"
    | NoModelLine(PointsDeducted _) -> "points-deducted"
    | NoModelLine(NoMatchesPlayed _) -> "no-matches-played"
    | NoModelLine ModelDeclined -> "model-declined"
