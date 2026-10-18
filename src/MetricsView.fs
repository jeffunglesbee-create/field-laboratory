module MetricsView

// The Metrics tab: the four empowerment metrics, mounted.
// docs/CC-CMD-2026-10-17-metrics-tab-render-path.md.
//
// A MOUNT, NOT A BUILD. Every value on this tab comes out of a public function
// of the metric's own module. This file draws what it is handed and counts
// nodes. It computes no metric, no threshold and no share. A second copy of a
// metric in a view is the defect gravity-census.mjs refused in its own header.
//
// THE ADR-002 BOUNDARY, as amended 2026-10-15. Geometry and opacity carry the
// verdict, and `aria-label` carries the state name and the math: each label is
// the module's own string, never written here. Visible text holds only fixture
// names, dates, identifiers, census counts and mechanisms.
// scripts/metrics-render-check.mjs reads the panel's innerText and fails if any
// node's accessible name appears in it.
//
// NOTHING FETCHES ON PAGE LOAD. `load` runs on the tab's first selection
// (Program.fs, as the Verify tab does). Flow's four small files load with the
// tab. Gravity's 1.8 MB capture loads on the first expand of its own section,
// once. Second Wind and Tactical Lock fetch nothing.

open System
open Browser.Types
open Browser
open Fable.Core
open Fetch

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private child (parent: HTMLElement) (node: HTMLElement) =
    parent.appendChild node |> ignore
    node

let private get (path: string) : JS.Promise<Result<string, string>> =
    promise {
        try
            let! res = fetch path []
            if res.Ok then
                let! body = res.text ()
                return Ok body
            else
                return Error(sprintf "%s: HTTP %d" path res.Status)
        with e ->
            return Error(sprintf "%s: %s" path e.Message)
    }

/// A collapsible section: its title and provenance are always visible, and
/// `onFirstOpen` runs once, the first time a reader expands it.
let private section (mount: HTMLElement) (key: string) (title: string) (provenance: string) (onFirstOpen: HTMLElement -> unit) =
    let details = child mount (el "details" "mx-section" "")
    details.setAttribute ("data-metric", key)
    child details (el "summary" "mx-title" title) |> ignore
    child details (el "p" "mx-provenance" provenance) |> ignore
    let body = child details (el "div" "mx-body" "")
    let opened = ref false
    details.addEventListener (
        "toggle",
        fun _ ->
            if details.hasAttribute "open" && not opened.Value then
                opened.Value <- true
                body.setAttribute ("data-loaded", "true")
                onFirstOpen body
    )
    details, body

let private failed (body: HTMLElement) (reason: string) =
    let p = child body (el "p" "mx-error" (sprintf "Not drawn: %s" reason))
    p.setAttribute ("data-state", "fetch-failed")

// --- Flow ---------------------------------------------------------------------

type private FlowSubject =
    { Key: string
      Title: string
      Stats: string
      Incidents: string
      EventRow: string }

let private flowSubjects =
    [ { Key = "finished"
        Title = "Bundesliga 213708, FC Augsburg v FC Bayern München, 2026-10-10 (full time recorded at 90')"
        Stats = "data/bsd-flow-finished-stats.json"
        Incidents = "data/bsd-flow-finished-incidents.json"
        EventRow = "data/bsd-flow-event-213708.json" }
      { Key = "inplay"
        Title = "Europa 601226, GNK Dinamo Zagreb v RSC Anderlecht, 2026-10-15 (captured in play, last shot 79')"
        Stats = "data/bsd-flow-inplay-stats.json"
        Incidents = "data/bsd-flow-inplay-incidents.json"
        EventRow = "data/bsd-flow-event-601226.json" } ]

/// One strip per side: a cell per regulation minute. A cell's opacity is
/// `Flow.pulseStyle`'s, and its accessible name is `Flow.ariaLabel`'s.
let private flowStrip (parent: HTMLElement) (finished: Flow.Finished option) (subject: string) (side: Flow.Side) =
    let sideName = match side with Flow.Home -> "home" | Flow.Away -> "away"
    let strip = child parent (el "div" "mx-flow-strip" "")
    strip.setAttribute ("data-subject", subject)
    strip.setAttribute ("data-side", sideName)
    child strip (el "span" "mx-flow-side" (if sideName = "home" then "Home" else "Away")) |> ignore
    match finished with
    | None ->
        // A missing witness is a state, not a reason to omit the node.
        let cell = child strip (el "span" "mx-flow-cell mx-flow-cell--nowitness" "")
        cell.setAttribute ("data-flow", "no-witness")
        cell.setAttribute ("role", "img")
        cell.setAttribute ("aria-label", "Flow has no witness for this capture: its event row is not that capture's, or kickoff is not two FIELD days past")
    | Some f ->
        for minute in 1..90 do
            let at: Flow.Clock = { Minute = minute; Added = 0 }
            let cell = child strip (el "span" "mx-flow-cell" "")
            cell.setAttribute ("data-flow", "minute")
            cell.setAttribute ("role", "img")
            cell.setAttribute ("style", Flow.pulseStyle f side at)
            cell.setAttribute ("aria-label", sprintf "Minute %d, %s: %s" minute sideName (Flow.ariaLabel f side at))

let private loadFlow (body: HTMLElement) =
    promise {
        for s in flowSubjects do
            let block = child body (el "div" "mx-flow-subject" "")
            block.setAttribute ("data-subject", s.Key)
            child block (el "h4" "" s.Title) |> ignore
            let! stats = get s.Stats
            let! incidents = get s.Incidents
            let! row = get s.EventRow
            match stats, incidents, row with
            | Ok stats, Ok incidents, Ok row ->
                let capture = Flow.decodeCapture stats (Some incidents)
                let finished = Flow.witnessAfterKickoff capture row DateTimeOffset.UtcNow
                flowStrip block finished s.Key Flow.Home
                flowStrip block finished s.Key Flow.Away
            | Error e, _, _
            | _, Error e, _
            | _, _, Error e -> failed block e
    }

// --- Second Wind ----------------------------------------------------------------

/// The population, committed verbatim (owner, 2026-10-18, option 1 of
/// docs/CC-CMD-2026-10-18-second-wind-population-capture.md): 328 games, about
/// 136 MB, fetched on the section's first expand and never before. The curve is
/// formed here by `Stamina.staminaCurve` from those bytes, the same way the
/// census forms it, and each subject is read through its own game's witness.
let private populationDir = "data/nhl-second-wind-population"

/// The four states, in the order drawn. The prefix is `Stamina.staminaLabel`'s
/// own leading words. Subjects are SELECTED by it, never relabelled with it.
let private secondWindStates = [ "Insufficient"; "PopulationRate"; "SecondWind"; "TrailingRate" ]

type private Game =
    { Id: int
      Witness: Stamina.FinishedGame option
      Players: Stamina.PlayerGame list }

/// Fetch with a bounded number in flight, preserving order.
let private getAll (paths: string list) : JS.Promise<Result<string, string> list> =
    promise {
        let arr = List.toArray paths
        let out : Result<string, string> array = Array.create arr.Length (Error "not fetched")
        let next = ref 0
        let worker () =
            promise {
                while next.Value < arr.Length do
                    let i = next.Value
                    next.Value <- i + 1
                    let! r = get arr.[i]
                    out.[i] <- r
            }
        let! _ = Promise.all [ for _ in 1..8 -> worker () ]
        return List.ofArray out
    }

let private stateOf (label: string) =
    secondWindStates |> List.tryFind (fun st -> label.StartsWith(st + " state active"))

/// A track the width of the row. `TrackOnly` is the bare track; `Ticks` puts two
/// ticks at the module's own fractions, at its opacity. Nothing is rescaled.
let private staminaTrack (parent: HTMLElement) (mark: Stamina.Mark) (label: string) =
    let track = child parent (el "span" "mx-track" "")
    track.setAttribute ("role", "img")
    track.setAttribute ("aria-label", label)
    match mark with
    | Stamina.TrackOnly -> track.setAttribute ("data-mark", "track-only")
    | Stamina.Ticks(expected, observed, opacity) ->
        track.setAttribute ("data-mark", "ticks")
        for cls, at in [ "mx-tick mx-tick--expected", expected; "mx-tick mx-tick--observed", observed ] do
            let tick = child track (el "span" cls "")
            tick.setAttribute ("style", sprintf "left: %.4f%%; opacity: %.2f" (at * 100.0) opacity)

let private loadSecondWind (body: HTMLElement) =
    promise {
        let status = child body (el "p" "mx-stated" "Fetching the 328 committed games…")
        let! manifest = get (populationDir + "/MANIFEST.json")
        match manifest with
        | Error e -> failed body e
        | Ok text ->
            let ids =
                match Thoth.Json.Decode.fromString (Thoth.Json.Decode.field "games" (Thoth.Json.Decode.list (Thoth.Json.Decode.field "id" Thoth.Json.Decode.int))) text with
                | Ok ids -> ids
                | Error _ -> []
            let paths = ids |> List.collect (fun id -> [ sprintf "%s/%d-pbp.json" populationDir id; sprintf "%s/%d-shifts.json" populationDir id ])
            let! texts = getAll paths
            let games =
                List.zip ids (List.chunkBySize 2 texts)
                |> List.choose (fun (id, pair) ->
                    match pair with
                    | [ Ok pbpText; Ok shiftsText ] ->
                        match Stamina.staminaPlayByPlay pbpText, Stamina.staminaShifts shiftsText with
                        | Ok pbp, Ok chart ->
                            match Stamina.staminaPlayerGames pbp chart with
                            | Ok windowed -> Some { Id = id; Witness = Stamina.staminaWitness pbp chart; Players = windowed.Players }
                            | Error _ -> None
                        | _ -> None
                    | _ -> None)
            match Stamina.staminaCurve (games |> List.collect (fun g -> g.Players)) with
            | Error refusal ->
                status.textContent <- sprintf "Not drawn: %d of %d games decoded, and the curve was refused." (List.length games) (List.length ids)
                status.setAttribute ("aria-label", refusal)
                status.setAttribute ("data-state", "curve-refused")
            | Ok curve ->
                // Every skater-game read once, through its own game's witness.
                let readings =
                    games
                    |> List.collect (fun g ->
                        match g.Witness with
                        | None -> []
                        | Some w ->
                            g.Players
                            |> List.choose (fun pg ->
                                match Stamina.staminaLabel curve w pg.Player, Stamina.staminaMark curve w pg.Player with
                                | Some label, Some mark -> Some(g.Id, pg.Player, label, mark)
                                | _ -> None))
                let count st = readings |> List.filter (fun (_, _, l, _) -> stateOf l = Some st) |> List.length
                status.textContent <-
                    sprintf "%d of %d games decoded; %d skater-games read: %d Insufficient, %d PopulationRate, %d SecondWind, %d TrailingRate. One subject of each, the first in game order:"
                        (List.length games) (List.length ids) (List.length readings)
                        (count "Insufficient") (count "PopulationRate") (count "SecondWind") (count "TrailingRate")
                for st in secondWindStates do
                    match readings |> List.tryFind (fun (_, _, l, _) -> stateOf l = Some st) with
                    | None ->
                        let p = child body (el "p" "mx-error" "Not drawn: no skater-game in the population reads this way.")
                        p.setAttribute ("data-state", "absent")
                    | Some(gameId, player, label, mark) ->
                        let row = child body (el "div" "mx-subject" "")
                        child row (el "span" "mx-play-id" (sprintf "Game %d, player %d" gameId player)) |> ignore
                        staminaTrack row mark (sprintf "Game %d, player %d: %s" gameId player label)
    }

// --- Gravity Well -------------------------------------------------------------

let private framesPath = "data/bdb-event-frames-2022-w2.json"

/// The season the file NAME states, as gravity-census.mjs reads it: not a
/// clock, and not a second hardcoded year.
let private namedSeason =
    let m = Text.RegularExpressions.Regex.Match(framesPath, @"-(\d{4})-w\d+\.json$")
    if m.Success then Some(int m.Groups.[1].Value * 1<Vintage.season>) else None

let private shownPlays = 12

let private shapeClass (shape: Gravity.Shape) =
    match shape with
    | Gravity.Expanding -> "expanding"
    | Gravity.Steady -> "steady"
    | Gravity.Contracting -> "contracting"

let private loadGravity (body: HTMLElement) =
    promise {
        let! text = get framesPath
        match text, namedSeason with
        | Error e, _ -> failed body e
        | Ok _, None -> failed body "the capture's file name states no season"
        | Ok text, Some shown ->
            let today = Desk.fieldDayIso (Desk.fieldToday ())
            let current = Vintage.nflSeasonOf (int (today.Substring(0, 4))) (int (today.Substring(5, 2)))
            match Gridiron.decodeFrames current text with
            | Error e ->
                let p = child body (el "p" "mx-error" "Not drawn: the capture did not decode.")
                p.setAttribute ("data-state", "decode-refused")
                p.setAttribute ("aria-label", sprintf "Decode refused: %A" e)
            | Ok tracked ->
                match Gravity.archivedAt shown tracked, Gravity.gravityCensus shown tracked, Gravity.measuredAt shown tracked with
                | Some archived, Ok census, Ok measured ->
                    let routeRunners = census.ByPos |> Array.sumBy (fun t -> t.DrawingCount + t.LevelCount + t.CedingCount + t.NotRouteRunnerCount)
                    let unencoded = census.ByPos |> Array.sumBy (fun t -> t.NotRouteRunnerCount)
                    let plays = measured |> List.filter (fun m -> match m.Result with Gravity.Measured _ -> true | Gravity.Unmeasured _ -> false) |> List.truncate shownPlays
                    child body (el "p" "mx-stated" (sprintf "Showing %d of the capture's %d plays, the first %d measured in file order (%d measured). Not ranked: drawn is read within a play, and a tight end's expectation sits below a running back's." (List.length plays) census.Plays shownPlays census.MeasuredPlays)) |> ignore
                    child body (el "p" "mx-stated" (sprintf "%d of %d receivers carry no encoding: not route runners on that play. They are drawn as a dashed outline, which is not the mark of a receiver who drew nothing." unencoded routeRunners)) |> ignore
                    for m in plays do
                        match m.Result with
                        | Gravity.Unmeasured _ -> ()
                        | Gravity.Measured receivers ->
                            let row = child body (el "div" "mx-play" "")
                            row.setAttribute ("data-play", sprintf "%d-%d" m.GameId m.PlayId)
                            child row (el "span" "mx-play-id" (sprintf "Game %d, play %d" m.GameId m.PlayId)) |> ignore
                            for r in receivers do
                                let name = Gravity.accessibleName archived m.GameId m.PlayId r.NflId |> Option.defaultValue "No reading for this receiver"
                                let mark = child row (el "span" "mx-well" "")
                                mark.setAttribute ("role", "img")
                                mark.setAttribute ("aria-label", sprintf "%s %d: %s" r.Pos r.NflId name)
                                match Gravity.encodeWell archived m.GameId m.PlayId r.NflId with
                                | Some enc ->
                                    mark.setAttribute ("data-well", shapeClass enc.Shape)
                                    mark.setAttribute ("style", sprintf "--mx-fill: %.3f" enc.Opacity)
                                | None -> mark.setAttribute ("data-well", "unencoded")
                | _ ->
                    // A season mismatch is its own state, not an empty section.
                    let reason =
                        match Vintage.valueAt shown tracked with
                        | Error mismatch -> sprintf "Vintage mismatch: displaying %d, capture %A" (int mismatch.displaying) mismatch.value
                        | Ok _ -> sprintf "The capture is not an archive of %d while the current season is %d" (int shown) (int current)
                    let p = child body (el "p" "mx-error" "Not drawn: the capture is not an archive of the season it names.")
                    p.setAttribute ("data-state", "vintage-mismatch")
                    p.setAttribute ("role", "img")
                    p.setAttribute ("aria-label", reason)
    }

// --- Tactical Lock ------------------------------------------------------------

let private tacticalLockText (body: HTMLElement) =
    let p (text: string) = child body (el "p" "mx-stated" text) |> ignore
    p "Built and proven (docs/LOCK-PROOF.md, docs/AMNESTY-PROOF.md). Not drawn: 132,798 team windows were classified, and every one is active play left unmeasured."
    p "The reason is the source, not the metric: no capture clocks a restart below the minute, so no window can show a lock or its absence. A single sample mark would imply the others differ, so none is drawn."

// --- the panel ----------------------------------------------------------------

let load (mount: HTMLElement) : JS.Promise<unit> =
    promise {
        mount.innerHTML <- ""
        let panel = child mount (el "div" "mx-panel" "")
        child panel (el "h2" "" "Metrics") |> ignore
        child panel (el "p" "mx-provenance mx-provenance--top" "Committed captures, named below, not today's slate. Each section says which capture it reads and when that capture was taken.") |> ignore
        let flow, flowBody =
            section panel "flow" "Flow (soccer)" "Captures: data/bsd-flow-finished-* (Bundesliga 213708, 2026-10-10) and data/bsd-flow-inplay-* (Europa 601226, 2026-10-15), with each match's BSD event row (data/bsd-flow-event-*.json, captured 2026-10-18)." (fun _ -> ())
        flow.setAttribute ("open", "")
        section panel "second-wind" "Second Wind (NHL)" "Capture: data/nhl-second-wind-population/ (2025-26 regular season, every fourth game, 328 games, about 136 MB), fetched on first expand." (fun body -> loadSecondWind body |> Promise.start) |> ignore
        section panel "gravity" "Gravity Well (NFL)" "Capture: data/bdb-event-frames-2022-w2.json (Big Data Bowl, 2022 season, week 2, 7 games), 1.8 MB, fetched on first expand." (fun body -> loadGravity body |> Promise.start) |> ignore
        section panel "tactical-lock" "Tactical Lock (soccer)" "Source: every R2 capture (field-relay-nba run 38962367310)." tacticalLockText |> ignore
        do! loadFlow flowBody
    }
