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
//   3. A row that could not be resolved SAYS SO, and the report carries a
//      count. Production drops the PARK row entirely when the lookup returns
//      null, so two of seven games showed no park line and nothing said which.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private child (parent: HTMLElement) (node: HTMLElement) =
    parent.appendChild node |> ignore
    node

/// A labelled row. `value` is what the row resolved to; `missing` is true when
/// the row is present but unenriched, which gets a visible marker rather than
/// looking like a complete row.
let private row (mount: HTMLElement) (label: string) (value: string) (missing: bool) =
    let r = child mount (el "div" (if missing then "st-row st-row--gap" else "st-row") "")
    r.setAttribute ("data-row", label.ToLower())
    child r (el "div" "st-row__label" label) |> ignore
    child r (el "div" "st-row__value" value) |> ignore
    if missing then
        r.setAttribute ("data-gap", "true")
        child r (el "span" "st-row__flag" "unresolved") |> ignore

let private parkText =
    function
    | ParkUnknown venue -> sprintf "%s — no park factor on file" venue
    | ParkKnown(venue, runs, hr) ->
        let sign v = if v > 0 then sprintf "+%d%%" v else sprintf "%d%%" v
        sprintf "%s · %s runs · %s HR" venue (sign runs) (sign hr)

let private umpireText =
    function
    | UmpireUnrated name -> sprintf "%s — no rating on file" name
    | UmpireRated(name, rate, challenged, weak) ->
        let zone = match weak with
                   | Some z -> sprintf " · weak: %s" z
                   | None -> ""
        sprintf "%s · %d%% overturns · %d challenged%s" name (int (rate * 100.0)) challenged zone

let private pitcherText =
    function
    | PitcherUnenriched(name, missing) ->
        sprintf "%s — missing %s" name (String.concat ", " missing)
    | PitcherEnriched(name, era, w, l, top) ->
        sprintf "%s · %.2f ERA · %d–%d · %s" name era w l top

/// One game's report.
let private renderReport (mount: HTMLElement) (report: ScoutingReport) (state: GameState) =
    let card = child mount (el "div" "st-card" "")
    card.setAttribute ("data-matchup", matchupText report.Sport report.Home report.Away)

    child card (el "div" "st-card__header" (matchupText report.Sport report.Home report.Away)) |> ignore
    child card (el "div" "st-card__title" "SCOUTING REPORT") |> ignore

    let rows = child card (el "div" "st-rows" "")
    row rows "PARK" (parkText report.Park) (match report.Park with ParkUnknown _ -> true | _ -> false)
    // The lean is derived from the runs number, so the badge cannot contradict
    // the figure beside it.
    match parkLean report.Park with
    | PitchersPark -> child rows (el "div" "st-badge st-badge--pitcher" "Pitcher's Park") |> ignore
    | LaunchPad -> child rows (el "div" "st-badge st-badge--hitter" "Launch Pad") |> ignore
    | NeutralPark -> ()

    row rows "UMPIRE" (umpireText report.Umpire)
        (match report.Umpire with UmpireUnrated _ -> true | _ -> false)
    if umpWatch report.Umpire then
        child rows (el "div" "st-badge st-badge--watch" "UMP WATCH") |> ignore

    for teamName, pitcher in pitcherRows report do
        row rows (teamName.ToUpper()) (pitcherText pitcher)
            (match pitcher with PitcherUnenriched _ -> true | _ -> false)

    child card (el "div" "st-card__records" (recordsLine report)) |> ignore

    // THE LINE THAT IS A BUG IN PRODUCTION. It appears only when `liveMargin`
    // yields one, which is only for a game in progress. On a scheduled game
    // there is nothing to render and nothing to guard.
    match liveMargin state with
    | Some margin ->
        let line = child card (el "div" "st-card__comeback" (comebackText margin))
        line.setAttribute ("data-comeback", "true")
    | None -> ()

    // Every gap on this card, counted. Row by row a missing park factor and a
    // bare pitcher name look like ordinary rows; together they are a number.
    match gaps report with
    | [] -> ()
    | gs ->
        let note = child card (el "div" "st-card__gaps"
                                  (sprintf "%d unresolved: %s" (List.length gs) (String.concat "; " gs)))
        note.setAttribute ("data-gaps", string (List.length gs))

/// Build a report from a decoded game.
///
/// Everything production enriches from side tables is absent in `/context/date`,
/// so every row resolves to its unenriched case and SAYS which fields are
/// missing. That is the honest rendering of this payload, and it is what the
/// panel will show until those lookups exist — not a bare name that reads as
/// complete.
let reportFor (game: Game) : ScoutingReport =
    { Sport = game.Sport
      Home = game.Home
      Away = game.Away
      Park =
        match game.Venue with
        | Some v -> ParkUnknown v
        | None -> ParkUnknown "venue not given"
      Umpire = UmpireUnrated "not in /context/date"
      HomePitcher = PitcherUnenriched(game.Home + " starter", [ "name"; "ERA"; "W–L"; "arsenal" ])
      AwayPitcher = PitcherUnenriched(game.Away + " starter", [ "name"; "ERA"; "W–L"; "arsenal" ])
      HomeRecord = RecordUnknown
      AwayRecord = RecordUnknown }

let render (mount: HTMLElement) (games: Game list) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "st-panel" "")
    child panel (el "h2" "" "Stats") |> ignore
    child panel (el "p" "st-panel__what"
                    ("One scouting report per game. Rows this payload cannot fill say so — "
                     + "a bare name reads as a complete row, and that is how four separate "
                     + "missing lookups render identically.")) |> ignore

    match games with
    | [] -> child panel (el "p" "st-empty" "No games on this slate.") |> ignore
    | _ ->
        let reports = child panel (el "div" "st-reports" "")
        for game in games |> List.sortBy (fun g -> g.Id) do
            renderReport reports (reportFor game) (gameState game)
