module Scoreboard

open Browser
open Browser.Types
open Desk
open Units

// One desk card. Island-sized on purpose: it owns a single mount point and
// touches nothing around it, per FIELD's Solid island rubric.
//
// Reactive state uses Solid's own primitives (`Solid.createSignal`,
// `Solid.createMemo` — note `Fable.Solid` declares `namespace global`, so there
// is deliberately no `open` for it). The markup is plain typed DOM from
// Fable.Browser.Dom rather than JSX: the JSX view layer needs Feliz.JSX.Solid,
// a 2022 beta, and one card does not justify moving the whole compilation to
// JSX mode for it.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private scoreText (state: GameState) =
    match state with
    | Scheduled -> "—"
    | InProgress(h, a) -> sprintf "%d–%d" a h
    | Final(h, a, _) -> sprintf "%d–%d" a h

let private statusText (g: Game) (state: GameState) =
    match state with
    | Scheduled ->
        match g.RawStartTime, g.StartTime with
        | Some raw, Some parsed -> sprintf "Scheduled %s (parsed %s)" raw (parsed.ToString "HH:mm")
        | Some raw, None -> sprintf "Scheduled %s (UNPARSED)" raw
        | None, _ -> "Scheduled — no start time"
    | InProgress _ -> "In progress"
    | Final(_, _, true) -> "Final / OT"
    | Final(_, _, false) -> "Final"

/// Renders the drama arc summary. This is the payload's nastiest field: a
/// string containing a JSON array. All three outcomes are rendered distinctly,
/// so a malformed blob is visible rather than silently becoming an empty chart.
let private dramaText (g: Game) =
    match g.DramaArc with
    | NotPresent -> "no arc"
    | Malformed err -> sprintf "ARC MALFORMED: %s" (err.Substring(0, min 60 err.Length))
    | Decoded arc ->
        let peak =
            match g.DramaPeak with
            | Some p -> formatDrama p
            | None -> "?"
        sprintf "arc %d pts, peak %s" (List.length arc) peak

let private oddsText (g: Game) =
    match g.OpeningOdds with
    | NotPresent -> "no odds"
    | Malformed err -> sprintf "ODDS MALFORMED: %s" (err.Substring(0, min 60 err.Length))
    | Decoded o ->
        match o.MoneylineHome, o.MoneylineAway with
        | Some h, Some a -> sprintf "%s ML %+d / %+d" o.Source a h
        | _ -> sprintf "%s (no moneyline)" o.Source

/// Builds the card and mounts it. Returns a setter so the score can be pushed
/// reactively without re-rendering the card — the whole point of an island.
let render (mount: HTMLElement) (game: Game) =
    let state, setState = Solid.createSignal (gameState game)

    // A derived value that recomputes reactively rather than being baked in at
    // render time.
    let display = Solid.createMemo (fun () -> scoreText (state ()))

    let card = el "div" "desk-card" ""
    card.setAttribute("data-game-id", game.Id)

    let header = el "div" "desk-card__header" (sprintf "%s · %s" game.Sport (defaultArg game.Venue "—"))
    let teams = el "div" "desk-card__teams" (sprintf "%s @ %s" game.Away game.Home)
    let score = el "div" "desk-card__score" (display ())
    score.setAttribute("data-testid", "score")
    let status = el "div" "desk-card__status" (statusText game (state ()))
    status.setAttribute("data-testid", "status")
    let drama = el "div" "desk-card__drama" (dramaText game)
    drama.setAttribute("data-testid", "drama")
    let odds = el "div" "desk-card__odds" (oddsText game)

    for child in [ header; teams; score; status; drama; odds ] do
        card.appendChild child |> ignore

    mount.appendChild card |> ignore

    // Solid drives the score node only. Nothing else in the card is touched
    // when the score changes.
    Solid.createEffect (fun () -> score.textContent <- display ())

    setState
