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

/// Which capture to render. Defaults to the complete 2026-05-15 response;
/// `?data=games-2026-08-09` switches to the capture that carries the harder
/// cases (null scores, non-null nested odds, seconds-less start times).
let private dataUrl () =
    let search = window.location.search
    let marker = "data="
    match search.IndexOf marker with
    | -1 -> "./data/context-2026-05-15.json"
    | i ->
        let name = search.Substring(i + marker.Length).Split('&').[0]
        sprintf "./data/%s.json" name

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
        let! response = fetch (dataUrl ()) []
        let! body = response.text ()

        match decodePayload body with
        | Error err ->
            report "decode-status" (sprintf "DECODE FAILED: %s" err)
        | Ok payload ->
            let games = payload.Regular @ payload.Postseason

            report "decode-status"
                (sprintf "decoded %d game(s) for %s" (List.length games) payload.Date)

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
