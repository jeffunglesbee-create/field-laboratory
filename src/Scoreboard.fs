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

/// A node whose text is a function of the game's live state. Creating it also
/// wires the effect that keeps it current — the two cannot be separated, which
/// is the point.
///
/// The previous version created each node with its text baked in and then wired
/// an effect for the score only. That shipped a real bug: a game reaching Final
/// updated its score and kept rendering the word "Scheduled" beside it, because
/// nothing drove the status node. Same mechanism as the ambient-panel skeleton
/// overlap — under fine-grained rendering, anything the reactive system does not
/// explicitly own is simply never updated again.
let private stateNode (className: string) (testId: string) (compute: unit -> string) =
    let node = el "div" className (compute ())
    node.setAttribute("data-testid", testId)
    Solid.createEffect (fun () -> node.textContent <- compute ())
    node

/// A node whose text comes from the immutable game record. Safe to set once,
/// because there is no state it could fall behind.
let private staticNode (className: string) (testId: string) (text: string) =
    let node = el "div" className text
    if testId <> "" then node.setAttribute("data-testid", testId)
    node

/// Builds the card and mounts it. Returns the state setter so scores can be
/// pushed reactively without re-rendering the card — the whole point of an
/// island.
let render (mount: HTMLElement) (game: Game) =
    let state, setState = Solid.createSignal (gameState game)

    // Derived values that recompute reactively rather than being baked in at
    // render time.
    let display = Solid.createMemo (fun () -> scoreText (state ()))
    let status = Solid.createMemo (fun () -> statusText game (state ()))

    let card = el "div" "desk-card" ""
    card.setAttribute("data-game-id", game.Id)

    let children =
        [ staticNode "desk-card__header" "" (sprintf "%s · %s" game.Sport (defaultArg game.Venue "—"))
          staticNode "desk-card__teams" "" (sprintf "%s @ %s" game.Away game.Home)
          stateNode "desk-card__score" "score" display
          stateNode "desk-card__status" "status" status
          staticNode "desk-card__drama" "drama" (dramaText game)
          staticNode "desk-card__odds" "" (oddsText game) ]

    // drama and odds are staticNode deliberately, not by omission: both derive
    // from the immutable Game record, not from GameState, so they cannot go
    // stale. Anything that reads `state ()` must be a stateNode.
    for child in children do
        card.appendChild child |> ignore

    mount.appendChild card |> ignore

    setState
