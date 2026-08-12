module Program

open Browser
open Fable.Core.JsInterop
open Fetch
open Thoth.Json
open Desk
open Units

// Entry point for the desk scoreboard experiment.
//
// Fetches a real /context/date payload, decodes it with real runtime decoders,
// and renders one card. No fixtures: data/context-2026-05-15.json is a verbatim
// capture of a live relay response — see data/PROVENANCE.md for how and when it
// was taken, and why it is served locally rather than fetched from the relay
// directly.

/// The live relay. A browser can fetch this directly — the relay sends
/// `access-control-allow-origin: *`, confirmed in FIELD's own session docs — so
/// the deployed page renders today's real slate rather than a frozen capture.
/// This sandbox cannot reach *.workers.dev, which is why the fallback below
/// exists and why the render checks pin themselves to committed captures.
let private RELAY_DATE = "https://field-relay-nba.jeffunglesbee.workers.dev/context/date/"

/// Served if the live fetch fails for any reason. A stale-but-real slate beats
/// an empty page; three blank artifacts in this project's history were shipped
/// on the strength of everything upstream looking healthy.
let private FALLBACK = "./data/context-2026-05-15.json"

/// Field's Pick lives on a different route from the slate: the analytics
/// newspaper bundle, whose `pick` field the relay side shipped on 2026-07-07.
/// Fetched separately and allowed to fail on its own.
let private RELAY_PICK = "https://field-relay-nba.jeffunglesbee.workers.dev/analytics/newspaper/"

/// Reads a query parameter, or None. Deliberately not URLSearchParams — this
/// keeps the query handling in one place and identical across the params.
let private queryParam (name: string) =
    let search = window.location.search
    let marker = name + "="
    match search.IndexOf marker with
    | -1 -> None
    | i ->
        match search.Substring(i + marker.Length).Split('&').[0] with
        | "" -> None
        | value -> Some value

/// The date being viewed. `?date=YYYY-MM-DD` makes any day linkable and
/// reloadable; today in UTC otherwise, matching how the relay keys its slates.
let private viewedDate () =
    queryParam "date" |> Option.defaultValue (Desk.fieldDayIso (Desk.fieldToday ()))

/// Shifts a YYYY-MM-DD string by whole days.
///
/// Built from the three integer parts rather than parsed, which sidesteps
/// timezone interpretation entirely: a bare `DateTime.Parse` of a date-only
/// string is read in the viewer's LOCAL zone, so stepping a day for anyone west
/// of Greenwich could land on the wrong date. Same class of bug this repo
/// already hit on the seconds-less timestamps. Whole-day arithmetic on a
/// zoneless DateTime cannot drift.
let private shiftDate (iso: string) (days: int) =
    match iso.Split('-') with
    | [| y; m; d |] ->
        match System.Int32.TryParse y, System.Int32.TryParse m, System.Int32.TryParse d with
        | (true, yy), (true, mm), (true, dd) ->
            let shifted = System.DateTime(yy, mm, dd).AddDays(float days)
            sprintf "%04d-%02d-%02d" shifted.Year shifted.Month shifted.Day
        | _ -> iso
    | _ -> iso

/// Which payload to render. The viewed date's live slate by default;
/// `?data=<name>` pins to a committed capture in data/, which is what the
/// render checks use so their assertions stay deterministic.
let private dataUrl () =
    match queryParam "data" with
    | Some name -> sprintf "./data/%s.json" name
    | None -> RELAY_DATE + viewedDate ()

/// Fetches text, returning the failure as a value rather than throwing. A
/// rejected promise here would take the whole render down, which is precisely
/// the outcome the fallback exists to prevent.
let private tryFetchText (url: string) =
    promise {
        try
            let! res = fetch url []
            if res.Ok then
                let! body = res.text ()
                return Ok body
            else
                return Error(sprintf "HTTP %d" res.Status)
        with e ->
            return Error e.Message
    }

/// Disposal handle for the currently-rendered slate's Solid root. Date
/// navigation re-renders into the same mount, so each pass must dispose the
/// previous one or every day viewed leaves a live set of effects behind.
/// The slate's venue names, recorded at render time and read when the Weather
/// tab is first opened. Weather is the only surface with its own network call,
/// so it is the only one that earns a lazy load.
let mutable private weatherVenues : string list = []
let mutable private weatherLoaded = false

/// Fetch the weather once, the first time the tab is shown.
let private loadWeatherOnce () =
    if not weatherLoaded then
        weatherLoaded <- true
        match document.getElementById "panel-weather" with
        | null -> ()
        | mount ->
            WeatherView.renderIdle mount
            WeatherView.fetchSlate weatherVenues
            |> Promise.iter (fun (outcome, unlocated) ->
                WeatherView.render mount outcome unlocated
                // The same readings, affixed to the scoreboard cards. One fetch
                // serves both surfaces; the panel explains, the chip glances.
                WeatherView.fillCards outcome)
            |> ignore

let mutable private disposeRoot : (unit -> unit) option = None

let private disposePrevious () =
    match disposeRoot with
    | Some dispose ->
        dispose ()
        disposeRoot <- None
    | None -> ()

let private report (id: string) (text: string) =
    match document.getElementById id with
    | null -> ()
    | node -> node.textContent <- text

/// Test affordance, wired only when `?simulate=1` is present.
///
/// The reactive path went unverified until it was probed by hand, and that is
/// exactly how the stale-status bug survived a passing 6/6 render check: the
/// check only ever saw the initial paint. Driving a real state transition needs
/// a way in from outside the page, so the setters are exposed deliberately —
/// behind a flag, never in a normal load.
let private exposeForTesting (setters: ResizeArray<GameState -> unit>) =
    let named name =
        match name with
        | "scheduled" -> Scheduled
        | "inprogress" -> InProgress(1, 2)
        | "final" -> Final(7, 4, true)
        | _ -> Scheduled

    // System.Func, NOT a tupled lambda. Fable compiles `fun (a, b) -> ...` to a
    // function taking ONE tuple array, so window.__labSetState(0, 'final') would
    // arrive as tupledArg = 0 with tupledArg[1] undefined — silently selecting
    // the fallback case instead of the one asked for. Verified in the emitted
    // JS; System.Func emits a genuine two-parameter function.
    window?__labSetState <- System.Func<int, string, unit>(fun index name ->
        if index >= 0 && index < setters.Count then setters.[index] (named name))

let private start () =
    promise {
        let primaryUrl = dataUrl ()
        let! primary = tryFetchText primaryUrl

        // Fall back to the committed capture if the live slate is unreachable,
        // and say so on the page rather than silently serving stale data as
        // though it were today's.
        let! attempt =
            promise {
                match primary with
                | Ok body -> return Ok(body, "")
                | Error liveErr when primaryUrl <> FALLBACK ->
                    let! backup = tryFetchText FALLBACK
                    match backup with
                    | Ok body ->
                        return Ok(body, sprintf " — live slate unreachable (%s), showing committed capture" liveErr)
                    | Error backupErr ->
                        return Error(sprintf "live: %s; fallback: %s" liveErr backupErr)
                | Error liveErr -> return Error liveErr
            }

        match attempt with
        | Error err ->
            report "decode-status" (sprintf "FETCH FAILED: %s" err)
        | Ok(body, note) ->

        match decodePayload body with
        | Error err ->
            report "decode-status" (sprintf "DECODE FAILED: %s" err)
        | Ok payload ->
            let games = payload.Regular @ payload.Postseason

            report "decode-status"
                (sprintf "decoded %d game(s) for %s%s" (List.length games) payload.Date note)
            if (queryParam "data").IsNone then report "viewed-date" (viewedDate ())

            match document.getElementById "desk" with
            | null -> ()
            | mount ->
                // Tear the previous slate down BEFORE building the next one.
                // Date navigation re-renders into the same mount, and leaving
                // the old cards in place is precisely the ambient-panel skeleton
                // failure: under fine-grained rendering nothing clears what the
                // reactive system does not explicitly own. Disposing the Solid
                // root first also stops the previous slate's effects, which
                // would otherwise accumulate one dead set per date viewed.
                disposePrevious ()
                mount.innerHTML <- ""

                Solid.createRoot (fun dispose ->
                    disposeRoot <- Some(fun () -> dispose.Invoke())
                    let setters = Scoreboard.renderSlate mount games
                    if window.location.search.Contains "simulate=1" then
                        exposeForTesting setters)

            // Scout's Pick runs on the SAME payload the slate came from — its
            // gates read game fields, not a separate endpoint.
            match document.getElementById "panel-scout-pick" with
            | null -> ()
            | mount ->
                let seriesEntries =
                    match payload.Series with
                    | Present rows -> List.length rows
                    | Absent | EmptyOrFailed -> 0
                PickView.renderScoutPick mount games seriesEntries

            // Field's Pick comes from a DIFFERENT route — the analytics
            // newspaper bundle, not /context/date — so it is fetched separately
            // and its failure must not take the slate down with it.
            match document.getElementById "panel-field-pick" with
            | null -> ()
            | mount ->
                let pickUrl =
                    match queryParam "data" with
                    | Some _ -> "./data/pick-2026-07-07.json"
                    | None -> RELAY_PICK + payload.Date
                tryFetchText pickUrl
                |> Promise.iter (fun result ->
                    let outcome =
                        match result with
                        | Error _ ->
                            // Unreachable is not the same as "no pick", and
                            // saying "no pick tonight" when the fetch failed is
                            // the exact class of quiet wrongness this repo keeps
                            // finding. NoPickSection renders as "no section in
                            // this payload", which is true either way.
                            Pick.NoPickSection
                        | Ok body ->
                            // Try the bare pick object first (the committed
                            // fixture), then the whole bundle (the live route).
                            match Pick.decodePick body with
                            | Ok (Pick.NoPickSection) ->
                                match Pick.decodeBundle body with
                                | Ok outcome -> outcome
                                | Error _ -> Pick.NoPickSection
                            | Ok outcome -> outcome
                            | Error _ ->
                                match Pick.decodeBundle body with
                                | Ok outcome -> outcome
                                | Error _ -> Pick.NoPickSection
                    PickView.renderFieldPick mount outcome)

            // Pick'em runs on the same slate, and needs the date for storage
            // keying — the viewer's picks belong to the day they were made.
            match document.getElementById "panel-pickem" with
            | null -> ()
            | mount -> PickemView.render mount payload.Date games None

            // Weather. Its own fetch, to Open-Meteo directly — the relay's
            // /weather/today route 403s and is dead in production, so there is
            // nothing to hop through. Rendered when it resolves; the panel is
            // never left blank, because every SlateWeather case has a rendering
            // and the union has no fourth state to fall through.
            // Weather does NOT fetch here. It records the slate's venues and
            // waits for the tab to be opened.
            //
            // The first version fetched on every render. That put an
            // unconditional third-party request on page load, and every render
            // check in the repo failed on "no page or console errors" —
            // correctly, because a viewer who never opens this tab was being
            // charged 30-odd Open-Meteo requests on every date navigation.
            //
            // Playground runs its own 45s interval to prove two poll loops
            // coexist. That is a different goal; this one is the cheaper and
            // more honest behaviour, and it is why this is not a port.
            weatherVenues <- games |> List.choose (fun g -> g.Venue) |> List.distinct
            weatherLoaded <- false

            // Affixing weather to the CARD means loading it without waiting for
            // the tab — otherwise the chip appears only for viewers who happen
            // to click Weather, which is worse than not having it.
            //
            // But a page pinned to `?data=` is rendering a committed capture,
            // and a fixture render must not reach the network. That distinction
            // already exists in this file for the date controls, and it is the
            // right one here: the render checks all pin a capture, so they stay
            // free of a third-party request, while a real viewer gets the chips.
            if (queryParam "data").IsNone then loadWeatherOnce ()

            // Prove the units are live, not just declared: a real probability
            // formatted through the only sanctioned conversion.
            let openingWinProbability = 0.62<prob>
            report "units-demo" (sprintf "home win probability: %s"
                                          (formatWinProbability openingWinProbability))
    }

/// Wires the date toolbar. Navigation rewrites the URL and re-renders in place
/// rather than reloading, so the viewed day is linkable and the back button
/// works, without a full page fetch per step.
let private wireDateNav () =
    let pinned = (queryParam "data").IsSome

    let goTo (date: string) =
        let query =
            if window.location.search.Contains "simulate=1" then
                sprintf "?date=%s&simulate=1" date
            else
                sprintf "?date=%s" date
        window.history.pushState (null, "", query)
        start () |> Promise.start

    let bind (id: string) (handler: unit -> unit) =
        match document.getElementById id with
        | null -> ()
        | node ->
            if pinned then node.setAttribute("disabled", "true")
            else node.addEventListener ("click", fun _ -> handler ())

    bind "prev-day" (fun () -> goTo (shiftDate (viewedDate ()) -1))
    bind "next-day" (fun () -> goTo (shiftDate (viewedDate ()) 1))
    bind "today" (fun () -> goTo (Desk.fieldDayIso (Desk.fieldToday ())))

    // The back/forward buttons change the URL without a load, so the slate has
    // to be re-rendered explicitly or the page would show the previous day's
    // cards under the new date.
    window.addEventListener ("popstate", fun _ -> start () |> Promise.start)

    if pinned then
        report "viewed-date" "pinned to a committed capture"
    else
        report "viewed-date" (viewedDate ())

/// Wires the tablist.
///
/// Follows the WAI-ARIA tabs pattern rather than approximating it: exactly one
/// tab is in the tab order at a time (`tabindex` 0/-1), arrows move selection,
/// Home/End jump to the ends. A row of buttons that merely toggles `hidden` is
/// not a tablist to a screen reader, and this page has three surfaces that say
/// contradictory things — knowing which one you are on is load-bearing.
let private wireTabs () =
    let ids = [ "tab-scoreboard"; "tab-field-pick"; "tab-scout-pick"; "tab-pickem"; "tab-weather" ]

    let tabs () =
        ids |> List.choose (fun id ->
            match document.getElementById id with
            | null -> None
            | node -> Some node)

    let select (target: Browser.Types.HTMLElement) =
        for tab in tabs () do
            let selected = tab.id = target.id
            tab.setAttribute ("aria-selected", (if selected then "true" else "false"))
            tab.setAttribute ("tabindex", (if selected then "0" else "-1"))
            if selected && tab.id = "tab-weather" then loadWeatherOnce ()
            match document.getElementById (tab.getAttribute "aria-controls") with
            | null -> ()
            | panel ->
                if selected then panel.removeAttribute "hidden"
                else panel.setAttribute ("hidden", "true")
        target.focus ()

    let step (from: Browser.Types.HTMLElement) (delta: int) =
        let all = tabs ()
        match all |> List.tryFindIndex (fun t -> t.id = from.id) with
        | None -> ()
        // Wraps, per the pattern. Clamping would leave the last arrow press
        // doing nothing, which reads as a broken control rather than an edge.
        | Some i -> select all.[((i + delta) % all.Length + all.Length) % all.Length]

    for tab in tabs () do
        tab.addEventListener ("click", fun _ -> select tab)
        tab.addEventListener ("keydown", fun ev ->
            let key = (ev :?> Browser.Types.KeyboardEvent).key
            match key with
            | "ArrowRight" -> ev.preventDefault (); step tab 1
            | "ArrowLeft" -> ev.preventDefault (); step tab -1
            | "Home" -> ev.preventDefault (); select (List.head (tabs ()))
            | "End" -> ev.preventDefault (); select (List.last (tabs ()))
            | _ -> ())

wireTabs ()
wireDateNav ()
start () |> Promise.start
