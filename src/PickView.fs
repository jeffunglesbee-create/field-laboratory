module PickView

open Browser.Types
open Browser
open Desk
open Pick
open Scout

// Rendering for the two pick surfaces.
//
// They live in one module because the single most important thing about them is
// the contrast, and splitting them into two files would make it easy to render
// one and forget the other's caption. Each panel states what it is FOR before
// it states what it chose:
//
//   Field's Pick  ranks the whole slate. "national broadcast" is a POSITIVE
//                 reason in the live data. It is the marquee game.
//   Scout's Pick  disqualifies national games outright. It is the hidden one.
//
// Show both without captions and the page is presenting two contradictory
// recommendations as one opinion.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    // No downcast: Fable.Browser.Dom types createElement as HTMLElement
    // already, and `:?>` here is warning FS0067 ("this type test will always
    // hold") — which the zero-warning gate treats as a build failure.
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private child (parent: HTMLElement) (node: HTMLElement) =
    parent.appendChild node |> ignore
    node

let private reasonChips (reasons: string list) =
    let row = el "div" "pick-reasons" ""
    // The reasons are the displayable half. Each is a single-dimension
    // statement — "tight line (1.5)", "prime time" — which is exactly what
    // ADR-002 permits: the evidence, not the composite that weighs it.
    for reason in reasons do
        child row (el "span" "pick-reason" reason) |> ignore
    row

// ---------------------------------------------------------------------------
// Field's Pick
// ---------------------------------------------------------------------------

let renderFieldPick (mount: HTMLElement) (outcome: PickOutcome) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "pick-panel" "")
    child panel (el "h2" "" "Field's Pick") |> ignore
    child panel (el "p" "pick-panel__what"
                    ("The marquee game, ranked across the whole slate. A national broadcast "
                     + "counts IN ITS FAVOUR here — this is the opposite of Scout's Pick.")) |> ignore

    match outcome with
    | NoPickSection ->
        // Deliberately not "no pick tonight". An absent section means the
        // analytics run has not produced one, which is a pipeline fact, not an
        // editorial one.
        child panel (el "p" "pick-empty"
                        "No pick section in this payload. The analytics bundle either has not run for this date or predates the ranked field.") |> ignore
    | Passed(reason, board) ->
        // `passReasonText`, never the relay's sentence. The live route returned
        // "top game scored 1.0 — under the 3.0 watch-bar" on 2026-08-10, and
        // this line rendered it verbatim until live-tabs-check caught it.
        child panel (el "p" "pick-empty" (passReasonText reason)) |> ignore

        // The refusal stands; what came closest is still shown. Same rules as
        // "Also ranked" on a pick night: matchup and reasons, never the rank.
        // The tie is named, because on 2026-11-14 all five were level.
        if not board.Closest.IsEmpty then
            child panel (el "h3" "pick-panel__what" "Closest on the board") |> ignore
            match leadershipNote board.Leadership with
            | Some note -> child panel (el "div" "pick-leader__tie" note) |> ignore
            | None -> ()
            for entry in board.Closest do
                let row = child panel (el "div" "pick-chaser" "")
                child row (el "span" "" (entryMatchup entry)) |> ignore
                child row (el "span" "pick-chaser__reasons" (String.concat " · " entry.Reasons)) |> ignore
    | Picked board ->
        let leader = child panel (el "div" "pick-leader" "")
        child leader (el "div" "pick-leader__matchup" (entryMatchup board.Leader)) |> ignore

        // The tie is stated where someone will read it, not buried. Three games
        // scored identically on 2026-07-07 and production's `scored[0]` picked
        // by sort stability; calling that "tonight's pick" without qualification
        // is a claim the data does not support.
        match leadershipNote board.Leadership with
        | Some note -> child leader (el "div" "pick-leader__tie" note) |> ignore
        | None -> ()

        child leader (reasonChips board.Leader.Reasons) |> ignore

        match board.Brief with
        | Some brief -> child leader (el "p" "pick-brief" brief) |> ignore
        | None -> ()

        if not board.Chasers.IsEmpty then
            child panel (el "h3" "pick-panel__what" "Also ranked") |> ignore
            for chaser in board.Chasers do
                let row = child panel (el "div" "pick-chaser" "")
                child row (el "span" "" (entryMatchup chaser)) |> ignore
                // Reasons, never the score. There is no code path from a
                // SealedRank to a string, so this is not a discipline the
                // renderer has to remember.
                child row (el "span" "pick-chaser__reasons" (String.concat " · " chaser.Reasons)) |> ignore

// ---------------------------------------------------------------------------
// Scout's Pick
// ---------------------------------------------------------------------------

let private gateClass (answer: GateAnswer) =
    match answer with
    | Qualifies _ -> "gate gate--qualifies"
    | Unanswerable _ -> "gate gate--unanswerable"
    | DoesNotQualify _ -> "gate"

let private gateAnswerText (answer: GateAnswer) =
    match answer with
    | Qualifies because -> sprintf "qualifies — %s" because
    | DoesNotQualify because -> sprintf "no — %s" because
    | Unanswerable missing -> sprintf "cannot tell — needs %s" missing

let renderScoutPick (mount: HTMLElement) (games: Game list) (seriesEntries: int) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "pick-panel" "")
    child panel (el "h2" "" "Scout's Pick") |> ignore
    child panel (el "p" "pick-panel__what"
                    ("\"The one game tonight you'd never find on your own, but definitely should watch.\" "
                     + "A national broadcast DISQUALIFIES a game here — the opposite of Field's Pick.")) |> ignore

    // `chooseScout`, not the first qualifier in slate order: precedence by gate,
    // then nearest to even, and whatever is still level is named, not hidden.
    // No gate names in this text: tab-check reads gate lines by splitting on them.
    match chooseScout games seriesEntries with
    | AllFinished qualified ->
        child panel (el "p" "pick-empty"
                        (sprintf "Every game that qualified on this slate has finished (%d). "
                                 qualified
                         + "The pick moves on as games end, and none is left to watch.")) |> ignore
    | Chosen choice ->
        let leader = child panel (el "div" "pick-leader" "")
        child leader (el "div" "pick-leader__matchup" (matchupText choice.Choice.Sport choice.Choice.Home choice.Choice.Away)) |> ignore
        match choice.Level with
        | [] -> ()
        | level ->
            child leader (el "div" "pick-leader__tie"
                            (sprintf "level with %d other%s on the same signals: %s"
                                     (List.length level) (if List.length level = 1 then "" else "s")
                                     (level |> List.map (fun g -> matchupText g.Sport g.Home g.Away) |> String.concat "; "))) |> ignore
        child leader (el "div" "pick-brief" (verdictSummary (Qualifying choice.Gates))) |> ignore
        child leader (el "div" "pick-chaser__reasons" (sprintf "Chosen as %s." choice.Basis)) |> ignore
        if choice.Finished > 0 then
            child leader (el "div" "pick-chaser__reasons"
                            (sprintf "%d qualifier%s already finished, so the pick has moved on."
                                     choice.Finished (if choice.Finished = 1 then "" else "s"))) |> ignore
    | NoneQualify ->
        // The honest result on this payload, and the whole point of the
        // exercise. Production's gates are JS booleans, so a gate with no input
        // returns false and reads as "does not qualify". Here it reports what
        // it needed.
        child panel (el "p" "pick-empty"
                        ("No game qualifies from this payload — and for most gates that is because "
                         + "the data is not here, not because the answer is no. The gates are listed "
                         + "below for the first game on the slate, with what each would need.")) |> ignore

    match games with
    | [] -> ()
    | first :: _ ->
        child panel (el "h3" "pick-panel__what"
                        (sprintf "Gates — %s" (matchupText first.Sport first.Home first.Away))) |> ignore
        for gate in gatesFor first seriesEntries do
            let row = child panel (el "div" (gateClass gate.Answer) "")
            child row (el "div" "gate__name" gate.Name) |> ignore
            child row (el "div" "gate__answer" (gateAnswerText gate.Answer)) |> ignore

        // Named, never counted. A count says a problem exists and nothing else.
        //
        // Carries `pick-outlets` as well as `pick-empty`. The extra class is not
        // styling — it marks this paragraph as the one place in the panel whose
        // text is VERBATIM THIRD-PARTY DATA rather than anything laboratory
        // computed. Outlet names legitimately contain numbers: on 2026-08-15 the
        // slate carried "KFMB 8.1 (CBS)", a real ATSC channel number, and
        // live-tabs-check's bare-decimal scan for a leaked composite score
        // matched it and turned main red.
        //
        // The scan is narrowed by PROVENANCE — exclude the element that renders
        // data we did not compute — rather than by loosening the pattern, which
        // would let a genuine 8.1 through everywhere else.
        let unmodelled = games |> List.collect (fun g -> unmodelledOutlets g.Streams) |> List.distinct
        if not unmodelled.IsEmpty then
            child panel (el "p" "pick-empty pick-outlets"
                            (sprintf "Broadcast outlets not in the registry: %s"
                                     (String.concat ", " unmodelled))) |> ignore

// ---------------------------------------------------------------------------
// Deep Cuts
// ---------------------------------------------------------------------------
//
// One hidden game per window of the day, by Scout's rules (DeepCuts.fs). Every window
// of the day is listed, empty or not, and every game the board could not place is
// counted by reason at the foot, so the panel never reads as more complete than it is.
// No gate names in this text, for the same reason as Scout's leader line.

let renderDeepCuts (mount: HTMLElement) (slateDate: string) (games: Game list) (seriesEntries: int) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "pick-panel" "")
    child panel (el "h2" "" "Deep Cuts") |> ignore
    child panel (el "p" "pick-panel__what"
                    ("One hidden game for each part of the day, chosen by Scout's Pick's rules. "
                     + "A game belongs to the window it kicks off in (ET). Its own list: Field's Pick, "
                     + "Scout's Pick and Pick'em are unchanged.")) |> ignore
    let b = DeepCuts.board slateDate games seriesEntries
    for r in b.Windows do
        let section = child panel (el "div" "deep-cut" "")
        section.setAttribute ("data-window", r.Window.Id)
        let n = List.length r.Games
        child section (el "h3" "pick-panel__what"
                          (sprintf "%s · %d game%s" r.Window.Label n (if n = 1 then "" else "s"))) |> ignore
        match r.Outcome with
        | Chosen choice ->
            let leader = child section (el "div" "pick-leader" "")
            child leader (el "div" "pick-leader__matchup" (matchupText choice.Choice.Sport choice.Choice.Home choice.Choice.Away)) |> ignore
            match choice.Level with
            | [] -> ()
            | level ->
                child leader (el "div" "pick-leader__tie"
                                (sprintf "level with %d other%s on the same signals: %s"
                                         (List.length level) (if List.length level = 1 then "" else "s")
                                         (level |> List.map (fun g -> matchupText g.Sport g.Home g.Away) |> String.concat "; "))) |> ignore
            child leader (el "div" "pick-brief" (verdictSummary (Qualifying choice.Gates))) |> ignore
            child leader (el "div" "pick-chaser__reasons" (sprintf "Chosen as %s." choice.Basis)) |> ignore
            if choice.Finished > 0 then
                child leader (el "div" "pick-chaser__reasons"
                                (sprintf "%d qualifier%s already finished in this window."
                                         choice.Finished (if choice.Finished = 1 then "" else "s"))) |> ignore
        | AllFinished qualified ->
            child section (el "p" "pick-empty"
                              (sprintf "Every game that qualified in this window has finished (%d)." qualified)) |> ignore
        | NoneQualify ->
            child section (el "p" "pick-empty"
                              (if n = 0 then "No games kick off in this window."
                               else sprintf "No deep cut in this window: none of its %d game%s qualifies." n (if n = 1 then "" else "s"))) |> ignore
    match b.NotPlaced with
    | [] -> ()
    | notPlaced ->
        let counts =
            notPlaced
            |> List.countBy (fun (_, why) -> DeepCuts.notPlacedText why)
            |> List.map (fun (why, k) -> sprintf "%d %s" k why)
            |> String.concat ", "
        child panel (el "p" "pick-empty deep-cuts__unplaced" (sprintf "Not placed in a window: %s." counts)) |> ignore
