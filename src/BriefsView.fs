module BriefsView

open Browser.Types
open Browser
open Desk

// The Briefs tab: the slate's briefs, counted.
//
// Stages 1-3 put the per-brief findings on the card that carries the brief — the
// prose, the scoreline verdict, the provenance, the anchoring. This is the same
// numbers one level up: the aggregate a single card cannot state, computed over
// every brief the payload carried.
//
// Every line here mirrors a finding that already has a per-brief form and a
// check behind it, so nothing is asserted that is not also measured elsewhere:
//
//   provenance      every archived brief is ProxySilent (Journalism, Phase 3)
//   anchoring       45.5% of stat sentences carry no time window (Journalism)
//   scoring_version no brief carries one (Corpus, Phase 2)
//   quality ceiling the reachable max is 245, not the nominal 300 (Ceiling)
//
// On a live scheduled slate the payload carries no briefs, and this says "no
// briefs on this slate" rather than drawing an empty frame — the honest state,
// the same one the cards show by simply not flipping.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private hasText (b: Brief) =
    match b.Text with
    | Some t when t.Trim() <> "" -> true
    | _ -> false

/// One aggregate statement: a number, a label, and the finding it restates.
let private stat (value: string) (label: string) : HTMLElement =
    let row = el "div" "briefs-stat" ""
    row.appendChild (el "div" "briefs-stat__value" value) |> ignore
    row.appendChild (el "div" "briefs-stat__label" label) |> ignore
    row

let render (mount: HTMLElement) (briefs: Brief list) (games: Game list) =
    mount.innerHTML <- ""
    let panel = el "div" "briefs-panel" ""
    panel.appendChild (el "h2" "briefs-panel__title" "Briefs on this slate") |> ignore

    let withText = briefs |> List.filter hasText

    if List.isEmpty withText then
        // Not an empty frame. The Section three-state distinguishes "no briefs"
        // from "the query failed", but at the card/tab level both mean the same
        // thing — there is nothing to show — and saying so is the honest state.
        panel.appendChild
            (el "p" "briefs-panel__empty"
                "No briefs on this slate. On a live scheduled slate that is the usual case — briefs are written as games are played.")
        |> ignore
    else
        let n = List.length withText

        // Provenance. Every stored brief is ProxySilent — nothing reads
        // X-FIELD-Model — so this is always n of n, and that IS the finding.
        let proxySilent =
            withText
            |> List.filter (fun b ->
                match Journalism.answeredFrom
                          (Journalism.fallbackModel (defaultArg b.Model "unknown")) None None with
                | Journalism.ProxySilent -> true
                | _ -> false)
            |> List.length
        panel.appendChild
            (stat (sprintf "%d / %d" proxySilent n)
                  "record no answering model — proxy silent, so which model wrote them is unknown")
        |> ignore

        // Anchoring, summed over the slate.
        let stats, anchored =
            withText
            |> List.fold (fun (s, a) b ->
                let bs, ba = Journalism.anchoring (defaultArg b.Text "")
                s + bs, a + ba) (0, 0)
        let unanchored = stats - anchored
        let pct = if stats = 0 then 0.0 else float unanchored / float stats * 100.0
        panel.appendChild
            (stat (sprintf "%d / %d" unanchored stats)
                  (sprintf "stat sentences carry no time window (%.0f%% unanchored)" pct))
        |> ignore

        // scoring_version. The Brief type has no such field because no brief
        // carries one; stated as a whole-slate fact, the Corpus finding at the
        // tab level.
        panel.appendChild
            (stat (sprintf "%d / %d" n n)
                  "carry no scoring_version — the rubric that scored them is not recorded")
        |> ignore

        // Quality against the scale the scorer can actually reach.
        let scored = withText |> List.choose (fun b -> b.QualityScore)
        (match scored with
         | [] ->
             panel.appendChild
                 (stat "—" "no quality_score on this slate's briefs") |> ignore
         | _ ->
             let mean = List.sum scored / float (List.length scored)
             let reachable = Ceiling.maxOf Ceiling.relayReachable
             panel.appendChild
                 (stat (sprintf "%.0f / %d" mean (int reachable))
                       "mean quality against the REACHABLE ceiling — the relay's scorer cannot reach the nominal 300")
             |> ignore)

    mount.appendChild panel |> ignore
