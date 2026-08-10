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

wireDateNav ()
start () |> Promise.start
