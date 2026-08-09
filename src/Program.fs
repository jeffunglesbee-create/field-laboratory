module Program

open Browser
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
                for game in games do
                    Scoreboard.render mount game |> ignore

            // Prove the units are live, not just declared: a real probability
            // formatted through the only sanctioned conversion.
            let openingWinProbability = 0.62<prob>
            report "units-demo" (sprintf "home win probability: %s"
                                          (formatWinProbability openingWinProbability))
    }

start () |> Promise.start
