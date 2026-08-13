module StatsView

open Browser.Types
open Browser
open Desk
open Stats

// The Stats tab: one Scouting Report per game on the slate.
//
// Production's version of this screen is what `Stats.fs` was written against.
// Three things are done differently, and each is a bug that screen is currently
// showing:
//
//   1. The comeback line renders ONLY for a game in progress, because it takes
//      a `LiveMargin` and there is no way to make one from a scheduled game.
//      Production shows "Tied — anyone's game" on all seven pre-game cards.
//   2. The records line and the pitcher rows go through `orderByMatchup`, the
//      same function as the header. Production's header reads "Orioles @ Twins"
//      and its records line reads "Twins ... Orioles".
//   3. NOTHING IS UNRESOLVED. Production drops the PARK row entirely when the
//      lookup returns null, so two of seven games showed no park line and
//      nothing said which. The first version here marked such rows "unresolved",
//      which was better and still wrong: a report that asserts five rows and can
//      fill one is a report about the wrong subject. Every row is now built from
//      a field this payload carries, and `Row` has no unresolved case to build.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private child (parent: HTMLElement) (node: HTMLElement) =
    parent.appendChild node |> ignore
    node

/// A labelled row. Every row here resolved, because `Row` has no case that did
/// not.
let private row (mount: HTMLElement) (r: Row) =
    let node = child mount (el "div" "st-row" "")
    node.setAttribute ("data-row", (rowLabel r).ToLower())
    child node (el "div" "st-row__label" (rowLabel r)) |> ignore
    child node (el "div" "st-row__value" (rowValue r)) |> ignore

/// One game's report.
let private renderReport (mount: HTMLElement) (report: ScoutingReport) (state: GameState) =
    // A `section` with an accessible name, not a `div`. Visual separation and
    // announced separation are two different claims, and a border only makes
    // the first.
    let card = child mount (el "section" "st-card" "")
    let title = headerText report
    card.setAttribute ("data-matchup", title)
    card.setAttribute ("aria-label", title)

    child card (el "div" "st-card__header" title) |> ignore
    child card (el "div" "st-card__title" "SCOUTING REPORT") |> ignore

    let rows = child card (el "div" "st-rows" "")
    for r in report.Rows do
        row rows r

    // THE LINE THAT IS A BUG IN PRODUCTION. It appears only when `liveMargin`
    // yields one, which is only for a game in progress. On a scheduled game
    // there is nothing to render and nothing to guard.
    match liveMargin state with
    | Some margin ->
        let line = child card (el "div" "st-card__comeback" (comebackText margin))
        line.setAttribute ("data-comeback", "true")
    | None -> ()

/// Build a report from a decoded game.
///
/// Each row is added only when its data is there. A game with no broadcast
/// listed gets no broadcast row — nothing claims one and fails.
let reportFor (game: Game) : ScoutingReport =
    let state = gameState game
    let rows =
        [ // Production's park factors, keyed on the venue NAME rather than on a
          // team abbreviation, because the venue is what this payload carries.
          // Production reads `game._homeAbbr || game.homeTeam` and its own
          // CC-CMD records two games losing this row when that chain came back
          // empty; there is no chain here to come back empty.
          //
          // A venue with no published factor yields no row — production's
          // Rule 1, and the reason this is `tryParkByVenue` and not a lookup
          // with a neutral default.
          match game.Venue |> Option.bind Scouting.tryParkByVenue with
          | Some f -> yield ParkRow f
          | None -> ()

          // The plate umpire. `/context/date` has a `crew` field; the MLB
          // schedule payload only populates `officials[]` once a game is in
          // progress, which is why production shows an umpire on live cards and
          // not on upcoming ones. An unrated umpire still gets a row — a bare
          // name is production's real output and a complete answer.
          match game.Crew with
          | Some official when official.Trim() <> "" ->
              let key = (official.Split(' ') |> Array.last).ToLower()
              yield UmpireRow(official, Scouting.tryUmpire key)
          | _ -> ()

          // The venue table is hand-reviewed and checked against Open-Meteo's
          // resolved timezone daily, so a venue it carries is a fact.
          match game.Venue |> Option.bind Venues.tryFind with
          | Some v -> yield VenueRow(v.Name, v.Roof)
          | None -> ()

          // The odds pair. NotASequence is the real finding — closing_odds is
          // not a closing line — and NoPrices is genuinely no row.
          match oddsStory game.OpeningOdds game.ClosingOdds with
          | NoPrices -> ()
          | SingleSnapshot _ -> yield MarketRow "one snapshot only — nothing to compare"
          | NotASequence _ -> yield MarketRow "open/close not sequenced — one snapshot written twice"
          | Unmoved _ -> yield MarketRow "priced twice, unmoved"
          | Moved(_, _, shift) ->
              yield MarketRow(sprintf "line moved %.1f%% in implied terms" (abs (float shift) * 100.0))

          // Drama, behind the ADR-002 amnesty witness: only a finished game may
          // show the peak, and `formatDramaPeak` demands the witness.
          match amnestyZone state, game.DramaPeak with
          | Some zone, Some peak -> yield DramaRow(formatDramaPeak zone peak)
          | _ -> ()

          match Scout.broadcastOf game.Streams with
          | Scout.NoBroadcastListed -> ()
          | Scout.NationalOnly outlet -> yield BroadcastRow(sprintf "national only — %s" outlet)
          | Scout.LocalAvailable -> yield BroadcastRow "a local or team outlet is listed"
          | Scout.UnrecognisedOutlets raw -> yield BroadcastRow(sprintf "listed, unrecognised — %s" raw)

          match game.Overtime with
          | RegulationOnly -> yield OvertimeRow "regulation"
          | WentToOvertime -> yield OvertimeRow "went to overtime"
          | OvertimeUnknown -> () ]

    { Sport = game.Sport; Home = game.Home; Away = game.Away; Rows = rows }

let render (mount: HTMLElement) (games: Game list) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "st-panel" "")
    child panel (el "h2" "" "Stats") |> ignore
    child panel (el "p" "st-panel__what"
                    ("One scouting report per game, built from what this payload actually "
                     + "carries. A row exists only when its data does — nothing here claims "
                     + "a field and then reports it unresolved.")) |> ignore

    match games with
    | [] -> child panel (el "p" "st-empty" "No games on this slate.") |> ignore
    | _ ->
        let reports = child panel (el "div" "st-reports" "")
        for game in games |> List.sortBy (fun g -> g.Id) do
            renderReport reports (reportFor game) (gameState game)
