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

/// Which payload to render. Live today's-slate by default;
/// `?data=<name>` pins to a committed capture in data/, which is what the
/// render checks use so their assertions stay deterministic.
let private dataUrl () =
    let search = window.location.search
    let marker = "data="
    match search.IndexOf marker with
    | -1 -> RELAY_DATE + Desk.todayUtc ()
    | i ->
        let name = search.Substring(i + marker.Length).Split('&').[0]
        sprintf "./data/%s.json" name

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

            match document.getElementById "desk" with
            | null -> ()
            | mount ->
                let setters = ResizeArray<GameState -> unit>()
                for game in games do
                    setters.Add(Scoreboard.render mount game)
                if window.location.search.Contains "simulate=1" then
                    exposeForTesting setters

            // Prove the units are live, not just declared: a real probability
            // formatted through the only sanctioned conversion.
            let openingWinProbability = 0.62<prob>
            report "units-demo" (sprintf "home win probability: %s"
                                          (formatWinProbability openingWinProbability))
    }

start () |> Promise.start
