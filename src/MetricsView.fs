module MetricsView

// The Metrics tab: the four empowerment metrics, mounted.
// docs/CC-CMD-2026-10-17-metrics-tab-render-path.md.
//
// A MOUNT, NOT A BUILD. Every value on this tab comes out of a public function
// of the metric's own module. This file draws what it is handed and counts
// nodes. It computes no metric, no threshold and no share. A second copy of a
// metric in a view is the defect gravity-census.mjs refused in its own header.
//
// THE ADR-002 BOUNDARY, as amended 2026-10-15 and again 2026-10-21. Geometry
// and opacity carry the verdict, and `aria-label` carries the state name and the
// math: each label is the module's own string, never written here. Since the
// owner's 2026-10-21 amendment (jubilant-bassoon docs/ADR-002-CONTEXT.md, Defense
// 4), a finished or archived game also gets a plain-English sentence, and that
// too is the module's own (`Flow.narrative`, `Stamina.staminaNarrative`,
// `Gravity.playNarrative`), behind the same witness. This file writes no verdict
// words of its own: its visible text is names, dates, counts, legends and the
// modules' sentences.
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

/// Plain English for a section: what the metric measures and how to read its
/// marks (owner, 2026-10-21: "none of these display in plain English"). These
/// are DEFINITIONS AND LEGENDS, the same for every row. What a particular row
/// shows comes from the module's own narrative, never from here.
let private explain (parent: HTMLElement) (heading: string) (paragraphs: string list) =
    child parent (el "p" "mx-explain-head" heading) |> ignore
    for text in paragraphs do
        child parent (el "p" "mx-explain" text) |> ignore

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

/// The two team names, from the match's own BSD event row.
let private homeAndAway (row: string) =
    Thoth.Json.Decode.fromString
        (Thoth.Json.Decode.map2 (fun h a -> h, a)
            (Thoth.Json.Decode.field "home_team" Thoth.Json.Decode.string)
            (Thoth.Json.Decode.field "away_team" Thoth.Json.Decode.string))
        row

let private loadFlow (body: HTMLElement) =
    promise {
        explain body "What it measures" [
            "Whether a team strings attacks together. A team is in flow once it takes three shots that each had some chance of scoring (an expected-goals value, xG, above zero) without the opponent taking a shot in between. Any opponent shot ends the run. A minute in which both teams shot ends it too, because the order of shots inside a minute is not recorded."
            "It counts shots only. Possession that never produced a shot does not show here." ]
        explain body "How to read it" [
            "Each match has two strips, home on top and away below, with one cell per minute from the 1st on the left to the 90th on the right."
            "A lit cell is a minute in which that team was in flow. The brighter the cell, the more xG the team had built up in that unbroken run, reaching full brightness at 1.0 xG (one goal's worth of chances). A dark cell is a minute in which it was not." ]
        for s in flowSubjects do
            let block = child body (el "div" "mx-flow-subject" "")
            block.setAttribute ("data-subject", s.Key)
            child block (el "h4" "" s.Title) |> ignore
            let! stats = get s.Stats
            let! incidents = get s.Incidents
            let! row = get s.EventRow
            match row |> Result.bind homeAndAway with
            | Ok(home, away) -> child block (el "p" "mx-flow-teams" (sprintf "Home: %s. Away: %s." home away)) |> ignore
            | Error _ -> ()
            match stats, incidents, row with
            | Ok stats, Ok incidents, Ok row ->
                let capture = Flow.decodeCapture stats (Some incidents)
                let finished = Flow.witnessAfterKickoff capture row DateTimeOffset.UtcNow
                flowStrip block finished s.Key Flow.Home
                flowStrip block finished s.Key Flow.Away
                match finished, homeAndAway row with
                | Some f, Ok(home, away) ->
                    for name, side in [ home, Flow.Home; away, Flow.Away ] do
                        let line = child block (el "p" "mx-narrative" (sprintf "%s: %s" name (Flow.narrative f side)))
                        line.setAttribute ("data-narrative", "flow")
                | _ -> ()
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
      Players: Stamina.PlayerGame list
      /// "Nick Foligno (CHI)" by player id, and "CHI at FLA, 2025-10-07".
      /// Identifiers read from the game's own play-by-play, not a metric.
      Names: Map<int, string>
      Matchup: string }

/// Names and the matchup from the NHL play-by-play's rosterSpots, awayTeam,
/// homeTeam and gameDate. A field that does not read leaves the id in place.
let private namesOf (pbpText: string) : Map<int, string> * string =
    let str path = Thoth.Json.Decode.at path Thoth.Json.Decode.string
    let team = Thoth.Json.Decode.map2 (fun (id: int) (abbrev: string) -> id, abbrev) (Thoth.Json.Decode.field "id" Thoth.Json.Decode.int) (str [ "abbrev" ])
    let spot =
        Thoth.Json.Decode.map4 (fun (pid: int) (teamId: int) first last -> pid, teamId, first + " " + last)
            (Thoth.Json.Decode.field "playerId" Thoth.Json.Decode.int)
            (Thoth.Json.Decode.field "teamId" Thoth.Json.Decode.int)
            (str [ "firstName"; "default" ])
            (str [ "lastName"; "default" ])
    let game =
        Thoth.Json.Decode.map4 (fun spots away home date -> spots, away, home, date)
            (Thoth.Json.Decode.field "rosterSpots" (Thoth.Json.Decode.list spot))
            (Thoth.Json.Decode.field "awayTeam" team)
            (Thoth.Json.Decode.field "homeTeam" team)
            (Thoth.Json.Decode.field "gameDate" Thoth.Json.Decode.string)
    match Thoth.Json.Decode.fromString game pbpText with
    | Ok(spots, (awayId, away), (homeId, home), date) ->
        let abbrev teamId = if teamId = awayId then away elif teamId = homeId then home else "?"
        (spots |> List.map (fun (pid, teamId, name) -> pid, sprintf "%s (%s)" name (abbrev teamId)) |> Map.ofList),
        sprintf "%s at %s, %s" away home date
    | Error _ -> Map.empty, ""

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
        explain body "What it measures" [
            "Whether a skater shoots more, or less, late in his own ice time than players usually do. His regulation ice time in a game is split into thirds, and his shot attempts (goals, shots on goal, missed shots and blocked shots) in the first third are compared with those in the last third."
            "The norm comes from every skater-game in this capture, worked out separately for players with under 12, 12 to 18, and over 18 minutes of ice time."
            "Each skater-game lands in one of four outcomes. Second wind: clearly more of his attempts came in the last third than the norm. Trailing rate: clearly fewer. Population rate: within the normal range. Insufficient: too few attempts to tell. \"Clearly\" means a split that luck would produce less than 2.5% of the time." ]
        explain body "How to read it" [
            "Each bar runs from 0% on the left to 100% on the right: the share of his attempts that came in the last third. The thin white line is the norm for his ice-time group. The thick teal mark is his own share."
            "A bright teal mark is a clear difference from the norm, either way. A faint one is within the normal range. An empty bar means too few attempts to place a mark at all." ]
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
                            | Ok windowed ->
                                let names, matchup = namesOf pbpText
                                Some { Id = id; Witness = Stamina.staminaWitness pbp chart; Players = windowed.Players; Names = names; Matchup = matchup }
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
                                match Stamina.staminaLabel curve w pg.Player, Stamina.staminaMark curve w pg.Player, Stamina.staminaNarrative curve w pg.Player with
                                | Some label, Some mark, Some sentence -> Some(g, pg.Player, label, mark, sentence)
                                | _ -> None))
                let count st = readings |> List.filter (fun (_, _, l, _, _) -> stateOf l = Some st) |> List.length
                status.textContent <-
                    sprintf "%d of %d games read (every fourth regular-season game of 2025-26), %d skater-games in all: %d with too few attempts to tell, %d within the normal range, %d with a second wind and %d with a trailing rate. Below is one example of each outcome, taken from the first game in which it occurs, each with what it shows."
                        (List.length games) (List.length ids) (List.length readings)
                        (count "Insufficient") (count "PopulationRate") (count "SecondWind") (count "TrailingRate")
                for st in secondWindStates do
                    match readings |> List.tryFind (fun (_, _, l, _, _) -> stateOf l = Some st) with
                    | None ->
                        let p = child body (el "p" "mx-error" "Not drawn: no skater-game in the population reads this way.")
                        p.setAttribute ("data-state", "absent")
                    | Some(game, player, label, mark, sentence) ->
                        let row = child body (el "div" "mx-subject" "")
                        let who = game.Names |> Map.tryFind player |> Option.defaultValue (sprintf "Player %d" player)
                        let where = if game.Matchup = "" then sprintf "game %d" game.Id else game.Matchup
                        child row (el "span" "mx-play-id" (sprintf "%s, %s" who where)) |> ignore
                        staminaTrack row mark (sprintf "Game %d, player %d: %s" game.Id player label)
                        let line = child body (el "p" "mx-narrative" sentence)
                        line.setAttribute ("data-narrative", "second-wind")
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

/// Offense and defense team per play, from the frames' own `team` and `side`.
let private teamsOf (text: string) : Map<int * int, string * string> =
    let player = Thoth.Json.Decode.map2 (fun (t: string) (s: string) -> t, s) (Thoth.Json.Decode.field "team" Thoth.Json.Decode.string) (Thoth.Json.Decode.field "side" Thoth.Json.Decode.string)
    let row =
        Thoth.Json.Decode.map3 (fun (g: int) (p: int) players -> (g, p), players)
            (Thoth.Json.Decode.field "gameId" Thoth.Json.Decode.int)
            (Thoth.Json.Decode.field "playId" Thoth.Json.Decode.int)
            (Thoth.Json.Decode.field "players" (Thoth.Json.Decode.list player))
    match Thoth.Json.Decode.fromString (Thoth.Json.Decode.field "data" (Thoth.Json.Decode.list row)) text with
    | Error _ -> Map.empty
    | Ok rows ->
        rows
        |> List.choose (fun (key, players) ->
            let on side = players |> List.tryFind (fun (_, s) -> s = side) |> Option.map fst
            match on "offense", on "defense" with
            | Some o, Some d -> Some(key, (o, d))
            | _ -> None)
        |> List.distinctBy fst
        |> Map.ofList

let private loadGravity (body: HTMLElement) =
    promise {
        explain body "What it measures" [
            "Whether a receiver pulls defenders toward him during a pass play. For each receiver running a route, it counts the coverage defenders whose nearest route runner is him, once at the snap and again when the ball is thrown, and looks at the change."
            "It is not adjusted for position, and position matters: in this capture tight ends on average lost defenders between the snap and the throw while running backs gained them (outbox/gravity-census-latest.json). So compare the receivers within one play rather than across plays or positions." ]
        explain body "How to read it" [
            "Each row is one play, and each mark is one receiver on it, with his position listed after the marks in the same order."
            "Circle: more defenders on him at the throw than at the snap. Square: the same number. Diamond: fewer. The fill is the size of the change, as a share of the play's coverage defenders: an empty outline means no change and a full one means every coverage defender."
            "A dashed outline is an eligible receiver who was not running a route past the line when the ball was thrown, so there is nothing to measure for him." ]
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
                    let teams = teamsOf text
                    child body (el "p" "mx-stated" (sprintf "Showing %d of the capture's %d plays: the first %d that could be measured, in file order (%d of the %d could be). They are not ranked." (List.length plays) census.Plays shownPlays census.MeasuredPlays census.Plays)) |> ignore
                    child body (el "p" "mx-stated" (sprintf "Across the capture, %d of %d receiver places were not running a route when the ball was thrown, and are drawn dashed." unencoded routeRunners)) |> ignore
                    for m in plays do
                        match m.Result with
                        | Gravity.Unmeasured _ -> ()
                        | Gravity.Measured receivers ->
                            let row = child body (el "div" "mx-play" "")
                            row.setAttribute ("data-play", sprintf "%d-%d" m.GameId m.PlayId)
                            let label =
                                match teams |> Map.tryFind (m.GameId, m.PlayId) with
                                | Some(offense, defense) -> sprintf "%s offense v %s, play %d" offense defense m.PlayId
                                | None -> sprintf "Game %d, play %d" m.GameId m.PlayId
                            child row (el "span" "mx-play-id" label) |> ignore
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
                            child row (el "span" "mx-play-pos" (Gravity.receiverLabels receivers |> String.concat " · ")) |> ignore
                            match Gravity.playNarrative archived m.GameId m.PlayId with
                            | Some sentence ->
                                let line = child body (el "p" "mx-narrative" sentence)
                                line.setAttribute ("data-narrative", "gravity")
                            | None -> ()
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
    explain body "What it measures" [
        "Whether a team shut the opponent out of good chances over a stretch of play: in a window, both the opponent's total xG and its single best chance stay under fixed bars." ]
    explain body "Why nothing is drawn" [
        "The data cannot answer it yet. Time when the ball is dead has to be left out of a window, or a stoppage would look like the defence shutting the opponent down. That needs the moments play restarts (a throw-in, a goal kick, a foul) and a clock finer than the minute, and the captures carry neither. So all 132,798 team windows came out as active play that could not be measured."
        "Drawing a sample mark would suggest the other windows differ, so none is drawn. The metric itself is built and proven (docs/LOCK-PROOF.md, docs/AMNESTY-PROOF.md) and waits on a source that records restarts." ]

// --- Play frames --------------------------------------------------------------

/// Not a metric: what the binary play-feed decoder says about frames it is given.
/// The tiles are LaboratorySurface's own text; this draws them and writes none.
let private playFramesText (body: HTMLElement) =
    explain body "What it measures" [
        "Nothing about a game. This shows what the play-feed decoder does with a payload: it reads whole 24-byte records, and it refuses anything else by name instead of guessing."
        "Every tile below is built here, not received from a feed: nothing in this repository produces a live frame yet." ]
    explain body "How to read it" [
        "One tile per play for a payload that decodes. A play shows its win probability, the change from the play before it, and its expected points added. A shootout play is marked and left out of the change."
        "A tile with a dashed edge is a payload the decoder refused: bytes that do not divide into records, a record written in another layout, or a byte that must be zero and is not." ]
    let grid = child body (el "div" "mx-frames" "")
    for t in LaboratorySurface.exhibitTiles do
        let tile = child grid (el "div" (LaboratorySurface.toneClass t.Tone) "")
        tile.setAttribute ("data-frame-state", t.State)
        child tile (el "div" "mx-frame-title" t.Title) |> ignore
        child tile (el "div" "mx-frame-state" t.State) |> ignore
        for line in t.Lines do
            child tile (el "div" "mx-frame-line" line) |> ignore

// --- the panel ----------------------------------------------------------------

let load (mount: HTMLElement) : JS.Promise<unit> =
    promise {
        mount.innerHTML <- ""
        let panel = child mount (el "div" "mx-panel" "")
        child panel (el "h2" "" "Metrics") |> ignore
        child panel (el "p" "mx-explain" "Four ways of reading a game beyond the score, and a fifth section that is not one: the play-feed decoder's states. Open a section: each says what it measures and how to read its marks.") |> ignore
        child panel (el "p" "mx-provenance mx-provenance--top" "Committed captures, named below, not today's slate. Each section says which capture it reads and when that capture was taken.") |> ignore
        let flow, flowBody =
            section panel "flow" "Flow (soccer)" "Captures: data/bsd-flow-finished-* (Bundesliga 213708, 2026-10-10) and data/bsd-flow-inplay-* (Europa 601226, 2026-10-15), with each match's BSD event row (data/bsd-flow-event-*.json, captured 2026-10-18)." (fun _ -> ())
        flow.setAttribute ("open", "")
        section panel "second-wind" "Second Wind (NHL)" "Capture: data/nhl-second-wind-population/ (2025-26 regular season, every fourth game, 328 games, about 136 MB), fetched on first expand." (fun body -> loadSecondWind body |> Promise.start) |> ignore
        section panel "gravity" "Gravity Well (NFL)" "Capture: data/bdb-event-frames-2022-w2.json (Big Data Bowl, 2022 season, week 2, 7 games), 1.8 MB, fetched on first expand." (fun body -> loadGravity body |> Promise.start) |> ignore
        section panel "tactical-lock" "Tactical Lock (soccer)" "Source: every R2 capture (field-relay-nba run 38962367310)." tacticalLockText |> ignore
        section panel "play-frames" "Play frames (binary feed)" "Constructed in src/LaboratorySurface.fs through PlayFrame.Wire, not a capture and not a feed. Fetches nothing." playFramesText |> ignore
        do! loadFlow flowBody
    }
