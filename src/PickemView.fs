module PickemView

open Browser.Types
open Browser
open Desk
open Pickem

// The Pick'em panel: sport sub-tabs, one row per game, two side buttons.
//
// Rendered from the production screen. Two things there are treated as findings
// rather than copied.
//
// THE WRAP. On that screen the "Rockies @ Diamondbacks" row pushes its PENDING
// chip onto a second line, while every other row keeps it inline — the two long
// team names overflow the row and the chip is what gives way. The rows here are
// a CSS grid with fixed tracks, so the chip column cannot be squeezed by a long
// name. A layout that degrades on the longest real value is the kind of thing
// that only shows up on the one night the fixture list is unkind.
//
// THE TWO NUMBERS. Chips count games; the banner counts picks. On the
// production screen those were 18 and 12, both correct, with nothing saying
// which was which. Both come from one `Summary` here and each is labelled.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private child (parent: HTMLElement) (node: HTMLElement) =
    parent.appendChild node |> ignore
    node

let private statusChip (status: PickStatus) =
    // Every case named. Adding a sixth PickStatus must fail here rather than
    // render as a blank chip.
    let label, className =
        match status with
        | NotPicked -> "NO PICK", "pk-chip pk-chip--none"
        | Pending _ -> "PENDING", "pk-chip pk-chip--pending"
        | Live _ -> "LIVE", "pk-chip pk-chip--live"
        | Undecidable _ -> "DRAWN", "pk-chip pk-chip--drawn"
        | Decided(_, verdict) ->
            if verdictIsCorrect verdict then "CORRECT", "pk-chip pk-chip--right"
            else "WRONG", "pk-chip pk-chip--wrong"
    el "span" className label

let private pickedSide (status: PickStatus) =
    match status with
    | NotPicked -> None
    | Pending side | Live side | Undecidable side | Decided(side, _) -> Some side

/// One game row. `onPick` is called with the chosen side.
let private renderRow (mount: HTMLElement) (game: Game) (status: PickStatus) (onPick: Side -> unit) =
    let row = child mount (el "div" "pk-row" "")
    row.setAttribute ("data-game", game.Id)

    child row (el "div" "pk-row__matchup" (matchupText game.Sport game.Home game.Away)) |> ignore

    let sides = child row (el "div" "pk-row__sides" "")
    // The buttons go through the SAME ordering function as the label, carrying
    // the side along with the name, so the two cannot disagree.
    //
    // The first version re-derived the order with its own `if`, and got it
    // backwards: the label read "Rockies @ Diamondbacks" while the left button
    // was Diamondbacks. That is precisely the failure `presentByMatchup`'s own
    // comment was written about — "names in one order, numbers in the other ...
    // internally consistent before the fix and transposed after it" — reached
    // from a third direction. Anything ordered beside a matchup has to come
    // from this function, not from a rule that agrees with it today.
    match presentByMatchup game.Sport (Home, game.Home) (Away, game.Away) with
    | Contest(firstSide, secondSide) ->
        for side, name in [ firstSide; secondSide ] do
            let button = child sides (el "button" "pk-side" name)
            button.setAttribute ("type", "button")
            let chosen = pickedSide status = Some side
            if chosen then button.classList.add "pk-side--chosen"
            // The pressed state is the whole meaning of this control, so it is
            // announced rather than only coloured.
            button.setAttribute ("aria-pressed", (if chosen then "true" else "false"))
            button.addEventListener ("click", fun _ -> onPick side)
    | Event _ ->
        // No buttons, and the reason stated rather than an empty cell. A pick
        // is a choice between two sides; an event has none, so there is nothing
        // here that could be picked and no `Side` value that would mean
        // anything. Rendering two disabled buttons would be worse — it would
        // draw the contest this case exists to deny.
        child sides (el "span" "pk-side--none" "no sides to pick — this is an event") |> ignore

    child row (statusChip status) |> ignore

/// Re-focus the current chip after a re-render.
///
/// `render` rebuilds the panel, which destroys the focused element — so a
/// second arrow key went to `body` and did nothing. The chips passed a
/// one-arrow-press test and were unusable on the second, which is the sharper
/// version of the bug they were meant to fix: keyboard support that works once
/// is not keyboard support.
let private refocusSelectedChip (mount: HTMLElement) =
    match mount.querySelector ".pk-sport[aria-selected=\"true\"]" with
    | null -> ()
    | node -> (node :?> HTMLElement).focus ()

/// The whole panel. Re-rendered on every pick, which is cheap at slate size and
/// keeps the banner, the chip counts and the rows from ever disagreeing.
let rec render (mount: HTMLElement) (date: string) (games: Game list) (activeSport: Sport option) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "pick-panel" "")
    child panel (el "h2" "" "Pick'em") |> ignore
    child panel (el "p" "pick-panel__what"
                    ("Your own pick, one side per game. Not an editorial recommendation — "
                     + "Field's Pick and Scout's Pick are FIELD's opinions; this one is yours.")) |> ignore

    let picks = loadPicks date
    let statusFor (g: Game) = statusOf (gameState g) (Map.tryFind g.Id picks)

    // The banner counts EVERY game on the slate, not the selected sport's. The
    // production line says "your real picks" without qualification, and scoping
    // it to one tab would make the number change as you browse.
    let summary = summarise (games |> List.map statusFor)
    child panel (el "div" "pk-banner" (summaryLine summary)) |> ignore

    let bySport =
        games
        |> List.groupBy (fun g -> g.Sport)
        |> List.sortBy (fun (sport, _) -> (sportMeta sport).Label)

    let selected =
        match activeSport with
        | Some sport when bySport |> List.exists (fun (s, _) -> s = sport) -> Some sport
        | _ -> bySport |> List.tryHead |> Option.map fst

    // Sport chips. A count sits on each, and the banner above says what IT
    // counts, so the two numbers are never presented as the same population.
    let chips = child panel (el "div" "pk-sports" "")
    chips.setAttribute ("role", "tablist")
    chips.setAttribute ("aria-label", "Sport")
    for sport, sportGames in bySport do
        let meta = sportMeta sport
        let chip = child chips (el "button" "pk-sport" "")
        chip.setAttribute ("type", "button")
        chip.setAttribute ("role", "tab")
        let isSelected = selected = Some sport
        chip.setAttribute ("aria-selected", (if isSelected then "true" else "false"))
        chip.setAttribute ("tabindex", (if isSelected then "0" else "-1"))
        if isSelected then chip.classList.add "pk-sport--on"
        // An unmodelled sport is said, not silently rendered under a guess —
        // the same rule the slate follows.
        let label = if meta.Modelled then meta.Label else meta.Label + " (unmodelled)"
        child chip (el "span" "" label) |> ignore
        child chip (el "span" "pk-sport__count" (string (List.length sportGames))) |> ignore
        chip.addEventListener ("click", fun _ -> render mount date games (Some sport))
        // Arrow keys, like the top-level tablist. These chips carried role and
        // aria-selected from the start but responded to clicks only, which is a
        // tablist in appearance and a row of buttons in use — the exact gap
        // tab-check exists to close one level up. Wraps rather than clamps, so
        // the last arrow press does something.
        chip.addEventListener ("keydown", fun ev ->
            let sports = bySport |> List.map fst
            let index = sports |> List.findIndex (fun s -> s = sport)
            let count = List.length sports
            let go target =
                ev.preventDefault ()
                render mount date games (Some target)
                refocusSelectedChip mount
            let move delta = go sports.[((index + delta) % count + count) % count]
            match (ev :?> Browser.Types.KeyboardEvent).key with
            | "ArrowRight" -> move 1
            | "ArrowLeft" -> move -1
            | "Home" -> go (List.head sports)
            | "End" -> go (List.last sports)
            | _ -> ())

    child panel (el "p" "pk-legend"
                    (sprintf "Chips count games in each sport (%d total). The line above counts picks (%d)."
                             summary.Games summary.Picked)) |> ignore

    let rows = child panel (el "div" "pk-rows" "")
    match selected with
    | None -> child panel (el "p" "pick-empty" "No games on this slate to pick.") |> ignore
    | Some sport ->
        let sportGames = bySport |> List.tryFind (fun (s, _) -> s = sport)
        match sportGames with
        | None -> ()
        | Some(_, gs) ->
            for game in gs |> List.sortBy (fun g -> g.Id) do
                renderRow rows game (statusFor game) (fun side ->
                    // Clicking the chosen side again clears it. Without that,
                    // a misclick is permanent, and "no pick" is a state the
                    // model already has.
                    let current = Map.tryFind game.Id picks
                    let next =
                        if current = Some side then Map.remove game.Id picks
                        else Map.add game.Id side picks
                    savePicks date next
                    render mount date games (Some sport))
