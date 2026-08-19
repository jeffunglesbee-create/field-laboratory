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

/// The scoreline, in the same order as the team names. Both orders come from
/// `orderByMatchup`, so they cannot drift apart — see the note there.
let private scoreText (sport: Sport) (state: GameState) =
    let line h a =
        let first, second = orderByMatchup sport h a
        sprintf "%d–%d" first second
    match state with
    | Scheduled -> "—"
    | InProgress(h, a) -> line h a
    | Final(h, a, _) -> line h a

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

/// A decode failure in the arc field. Reportable in any game state: this says
/// the payload was broken, which is a fact about the data, not a drama score.
let private arcFault (err: string) =
    sprintf "ARC MALFORMED: %s" (err.Substring(0, min 60 err.Length))

/// Post-game only, enforced by the compiler.
///
/// This function cannot be called for a live game. It needs an `AmnestyZone`,
/// and `Desk.amnestyZone` yields one for `Final` and nothing else — so there is
/// no live-state call site, and there cannot accidentally become one. That is
/// ADR-002's Defense 4 requirement ("a dedicated function with no live-state
/// call site, not a shared live+post function with a runtime conditional")
/// expressed as a type rather than as a review checklist.
///
/// The arc *length* is a count of samples, not a score, so it is factual and
/// not gated. The peak is the composite number, so it goes through
/// `formatDramaPeak`, which is the only thing that can unseal it.
let private postGameDramaText (zone: AmnestyZone) (g: Game) =
    match g.DramaArc with
    | NotPresent -> ""
    | Malformed err -> arcFault err
    | Decoded arc ->
        match g.DramaPeak with
        | Some peak -> sprintf "arc %d pts, peak %s" (arcLength arc) (formatDramaPeak zone peak)
        | None -> sprintf "arc %d pts" (arcLength arc)

/// The 30-bar sparkline. Post-game only, for the same reason the peak is.
///
/// `barHeightStyle` needs an `AmnestyZone`, so this cannot be called for a live
/// game. Deleting the guard in `dramaText` would not leak a chart of a live
/// composite; it would stop compiling.
let private SPARK_BUCKETS = 30

let private renderSparkline (zone: AmnestyZone) (g: Game) : HTMLElement option =
    match g.DramaArc with
    | NotPresent | Malformed _ -> None
    | Decoded arc ->
        let bars = sparklineBars SPARK_BUCKETS arc
        if List.isEmpty bars then None
        else
            let wrap = el "div" "spark" ""
            let caption =
                match g.DramaPeak with
                | Some peak -> sprintf "drama over time (peak %s)" (formatDramaPeak zone peak)
                | None -> "drama over time"
            let row = el "div" "spark__row" ""
            // The chart is decorative on top of a caption that already states
            // the peak, so it is hidden from assistive tech rather than read out
            // as thirty unlabelled boxes.
            row.setAttribute ("aria-hidden", "true")
            for bar in bars do
                let b = el "div" "spark__bar" ""
                b.setAttribute ("style", barHeightStyle zone bar)
                row.appendChild b |> ignore
            wrap.appendChild row |> ignore
            wrap.appendChild (el "div" "spark__caption" caption) |> ignore
            // Named, never counted — and never silently clamped away. A sample
            // outside the stated 0-100 domain is upstream drift, and
            // `arcOutOfDomain` existed for a full day computing that answer with
            // nothing reading it: a value set without proof, which is exactly
            // what `unused-check` was written to find.
            match arcOutOfDomain arc with
            | [] -> ()
            | rogue ->
                let listed = rogue |> List.map string |> String.concat ", "
                wrap.appendChild (el "div" "spark__caption"
                                     (sprintf "outside the 0-100 domain: %s" listed)) |> ignore
            Some wrap

/// The drama slot, for whatever state the game is currently in.
///
/// Live and scheduled games get no drama number — not by a conditional that
/// could be flipped, but because this branch holds no `AmnestyZone` and so
/// literally cannot reach `postGameDramaText`. Deleting the guard does not
/// leak the number; it stops compiling.
let private dramaText (g: Game) (state: GameState) =
    match amnestyZone state with
    | Some zone -> postGameDramaText zone g
    | None ->
        match g.DramaArc with
        | Malformed err -> arcFault err
        | NotPresent
        | Decoded _ -> ""

let private priceText (o: Odds) =
    match o.MoneylineHome, o.MoneylineAway with
    | Some h, Some a -> sprintf "%+d / %+d" h a
    | _ -> "no moneyline"

/// The handicap and the total, with any shape anomaly stated rather than
/// smoothed over. Every branch here corresponds to a real modelled case; the
/// two "should not happen" ones say so on the card if they ever do.
let private linesText (o: Odds) =
    let spread =
        match spreadOf o with
        | None -> ""
        // "H" for the home handicap. Not sport-labelled (runline / spread /
        // handicap) because nothing in this repo evidences what FIELD calls
        // them per sport, and inventing a vocabulary is how the sport registry
        // got five disagreeing copies in production.
        | Some (Balanced h) -> sprintf " · H %+.1f" h
        | Some (Unbalanced(h, a)) -> sprintf " · SPREAD UNBALANCED (%+.1f / %+.1f)" h a
    let total =
        match totalOf o with
        | None -> ""
        | Some (OneLine line) -> sprintf " · O/U %.1f" line
        | Some (TwoNumbers(over, under)) -> sprintf " · TOTAL SPLIT (%.1f / %.1f)" over under
    let agreement =
        match favouriteAgreement o with
        | Agrees
        | NotComparable -> ""
        | Disagrees(mlHome, spHome) ->
            sprintf " · FAVOURITE MISMATCH (ML says %s, handicap says %s)"
                (if mlHome then "home" else "away") (if spHome then "home" else "away")
    spread + total + agreement

/// The desk slot: the four editorial fields.
///
/// Every one of them is null in every game of every capture taken so far, so
/// this renders nothing on the committed data. It is built anyway because the
/// fields are real columns with documented meanings, and because a field that
/// only ever appears in production is exactly the kind that gets rendered wrong
/// the first time it does.
///
/// `crew` follows production's own pattern — conditional on the value being
/// present, never a placeholder. Its execution log notes crew is populated on
/// postseason objects (NBA Finals, Stanley Cup Final), which is why neither
/// capture here carries one.
///
/// ADR-002 CLEAN: the archive spec's own status records these as "factual game
/// results, scores, teams, dates, editorial notes". No score, no threshold, no
/// recommendation.
let private deskText (g: Game) =
    let parts =
        [ match g.Crew with
          | Some crew -> yield sprintf "crew: %s" crew
          | None -> ()
          match g.Note with
          | Some note -> yield note
          | None -> ()
          match g.LocalNote with
          | Some note -> yield sprintf "local: %s" note
          | None -> ()
          match g.Tags with
          | NotPresent -> ()
          // The tag values themselves, which is the whole content of the field.
          | Decoded tags when not (List.isEmpty tags) -> yield String.concat " · " tags
          | Decoded _ -> ()
          | Malformed err ->
              yield sprintf "TAGS MALFORMED: %s" (err.Substring(0, min 40 err.Length)) ]
    String.concat "  |  " parts

/// The Odds Story slot.
///
/// Factual market description only. ADR-002's Rule F permits anything "a
/// neutral data vendor could plausibly publish" — a bookmaker's price is the
/// textbook case — and this renders no threshold, no tier and no
/// recommendation, so it is nowhere near the composite-interest-score line the
/// drama gate exists to hold.
let private oddsText (g: Game) =
    match g.OpeningOdds, g.ClosingOdds with
    | Malformed err, _
    | _, Malformed err -> sprintf "ODDS MALFORMED: %s" (err.Substring(0, min 60 err.Length))
    | _ ->
        match oddsStory g.OpeningOdds g.ClosingOdds with
        | NoPrices -> "no odds"
        | SingleSnapshot o -> sprintf "%s ML %s%s (one snapshot)" o.Source (priceText o) (linesText o)
        // Stated on the card, not swallowed. The relay labels these open and
        // close; the timestamps say they are not.
        | NotASequence(o, c) ->
            sprintf "%s ML %s%s — open/close NOT SEQUENCED (%s vs %s)"
                o.Source (priceText c) (linesText c)
                (defaultArg o.RawCapturedAt "?") (defaultArg c.RawCapturedAt "?")
        | Unmoved c -> sprintf "%s ML %s%s (line unmoved)" c.Source (priceText c) (linesText c)
        | Moved(o, c, shift) ->
            sprintf "%s ML %s -> %s (home %+.1f pts implied)"
                c.Source (priceText o) (priceText c) (float shift * 100.0)

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
let render (mount: HTMLElement) (game: Game) (briefOpt: Brief option) =
    let state, setState = Solid.createSignal (gameState game)

    // Derived values that recompute reactively rather than being baked in at
    // render time.
    let display = Solid.createMemo (fun () -> scoreText game.Sport (state ()))
    let status = Solid.createMemo (fun () -> statusText game (state ()))
    // Drama is state-derived now, not immutable: the number is permitted only
    // once the game is final, so the slot has to appear at the moment the game
    // ends and must never be present before it.
    let drama = Solid.createMemo (fun () -> dramaText game (state ()))

    let card = el "div" "desk-card" ""
    card.setAttribute("data-game-id", game.Id)
    // The join key for weather. The card already shows the venue; this makes it
    // machine-readable so the weather fill does not have to parse the header.
    match game.Venue with
    | Some v -> card.setAttribute("data-venue", v)
    | None -> ()

    let children =
        // The sport is the group heading now, so the card header carries the
        // venue alone rather than repeating it on every card in the section.
        [ staticNode "desk-card__header" "" (defaultArg game.Venue "—")
          staticNode "desk-card__teams" "" (matchupText game.Sport game.Home game.Away)
          stateNode "desk-card__score" "score" display
          stateNode "desk-card__status" "status" status
          stateNode "desk-card__drama" "drama" drama
          // Empty at render. Weather is asynchronous and the card is not, so
          // this is a slot rather than a value — filled by WeatherView.fillCards
          // when a reading arrives, and left empty when none does. An empty slot
          // is the honest state for "not asked yet" and "no reading", and the
          // panel is where the difference between those is stated.
          staticNode "desk-card__wx" "weather" ""
          staticNode "desk-card__odds" "odds" (oddsText game)
          staticNode "desk-card__desk" "desk" (deskText game) ]

    // Where the front-face children are hosted. For a card with no brief this is
    // the card itself, byte-for-byte the old structure so nothing that queries a
    // `.desk-card__*` descendant changes. For a flippable card it is the front
    // face of a flip container, one level deeper — still a descendant of
    // `.desk-card`, so those same queries, the weather fill, and the score
    // setters all keep resolving.
    // The join is the single authority on "is there a brief to show": `briefsByGame`
    // only ever yields a brief with non-whitespace text, so a `Some` here already
    // means there is prose to reveal. Re-checking the text at this layer would be
    // a second guard defending the same claim, which lets a mutation break one
    // and survive on the other — exactly what the gate caught when this had two.
    let flippable = briefOpt.IsSome

    let contentHost =
        if flippable then el "div" "desk-card__front" "" else card

    // odds is a staticNode deliberately, not by omission: it derives from the
    // immutable Game record, not from GameState, so it cannot go stale.
    // Anything that reads `state ()` must be a stateNode — which now includes
    // drama, because ADR-002 makes its visibility a function of game state.
    for child in children do
        contentHost.appendChild child |> ignore

    // The sparkline is appended only when the game is already final AT RENDER
    // TIME, which is deliberately narrower than the text drama slot.
    //
    // The text slot is a `stateNode`: it recomputes when the state signal
    // changes, so a game finishing while the page is open starts showing its
    // peak. The chart does not do that yet — a game that goes final in front of
    // you gets its caption and no bars until the next render. Stated because it
    // is a real gap, not a design: the honest fix is a reactive chart node, and
    // that is more machinery than one row of divs deserves until someone has
    // watched a game end on this page.
    match amnestyZone (gameState game) with
    | Some zone ->
        match renderSparkline zone game with
        | Some spark -> contentHost.appendChild spark |> ignore
        | None -> ()
    | None -> ()

    // The flip. A card with a joined brief becomes a disclosure that turns to
    // reveal the prose production wrote for this game — the first place any of
    // the journalism work is visible, and it renders text the desk was already
    // decoding and throwing away (`payload.Briefs`, read once, in the decoder).
    //
    // Semantically this is the WAI-ARIA disclosure pattern, not a decorative
    // effect: the card is a `button` with `aria-expanded`, the brief a region it
    // controls. The rotateY is how it looks; `aria-expanded` is what it means,
    // so a screen reader announces "expanded/collapsed" rather than "flipped".
    //
    // Nothing is generated. The desk shows the brief that arrived or no brief at
    // all — a card with no joined prose is not a button and offers no affordance,
    // which is the honest state, not a disabled-looking one.
    match briefOpt with
    | Some brief when flippable ->
        let text = (defaultArg brief.Text "").Trim()
        // id must be a valid token and must match aria-controls exactly. game.Id
        // can carry spaces ("La Liga_…"), so both sides read from one sanitised
        // value rather than two that could drift.
        let safeId =
            game.Id
            |> Seq.map (fun c -> if System.Char.IsLetterOrDigit c then c else '-')
            |> Seq.toArray
            |> System.String
        let panelId = "brief-" + safeId

        let front = contentHost
        // A quiet marker on the front face so a reader knows the card turns.
        // Not a control of its own — the whole card is the control — just a hint.
        front.appendChild (staticNode "desk-card__flip-hint" "" "brief ›") |> ignore

        let back = el "div" "desk-card__brief" ""
        back.id <- panelId
        (match brief.BriefType with
         | Some t when t.Trim() <> "" ->
             back.appendChild (el "div" "desk-card__brief-kind" (t.Trim())) |> ignore
         | _ -> ())
        back.appendChild (el "p" "desk-card__brief-text" text) |> ignore

        // Stage 2: the scoreline verdict, on the brief that made the claim.
        //
        // A scoreline in the prose is checked against the one fact the game row
        // settles — the final — by dominance, not equality: a mid-game "leads
        // 4-2" is CONSISTENT with a final of 8-6 because scores do not decrease.
        // The whole relation and the extractor are in `Scoreline.fs`; this reads
        // its verdict and says nothing when the brief makes no scoreline claim.
        //
        // `Unsettled` is the honest state for a game with no final yet — the
        // common case on a live scheduled slate — and it is NOT dressed up as a
        // pass. `verdictFor` uses the immutable final from the game row, so the
        // badge does not depend on the reactive score signal.
        match Scoreline.verdictFor (Scoreline.final game.HomeScore game.AwayScore) text with
        | Some verdict ->
            let cls, label =
                match verdict with
                | Scoreline.Consistent -> "desk-card__verdict desk-card__verdict--ok", "scoreline checks out"
                | Scoreline.Impossible -> "desk-card__verdict desk-card__verdict--bad", "scoreline exceeds the final"
                | Scoreline.Unsettled -> "desk-card__verdict desk-card__verdict--wait", "scoreline — final not in yet"
            back.appendChild (el "div" cls label) |> ignore
        | None -> ()

        let flip = el "div" "desk-card__flip" ""
        flip.appendChild front |> ignore
        flip.appendChild back |> ignore
        card.appendChild flip |> ignore

        card.classList.add "desk-card--flippable"
        card.setAttribute("role", "button")
        card.setAttribute("tabindex", "0")
        card.setAttribute("aria-expanded", "false")
        card.setAttribute("aria-controls", panelId)

        let toggle () =
            let open_ = card.classList.contains "is-flipped"
            if open_ then card.classList.remove "is-flipped"
            else card.classList.add "is-flipped"
            card.setAttribute("aria-expanded", if open_ then "false" else "true")

        card.addEventListener("click", fun _ -> toggle ())
        card.addEventListener("keydown", fun (e: Event) ->
            let ke = e :?> KeyboardEvent
            match ke.key with
            // Enter and Space are the button-activation keys the disclosure
            // pattern requires; Space would otherwise scroll the page.
            | "Enter" | " " -> e.preventDefault (); toggle ()
            | _ -> ())
    | _ -> ()

    mount.appendChild card |> ignore

    setState

/// Renders the whole slate, grouped by sport, and returns the state setters in
/// DOM order so index 0 always addresses the first card on screen.
///
/// Groups are ordered by size descending then name, so a 20-game MLB slate leads
/// and a single cup tie does not. Deterministic either way — no reliance on the
/// order the relay happened to return.
///
/// Cards keep their `.desk-card` class and are merely nested one level deeper,
/// so every existing check that counts or queries cards is unaffected by the
/// grouping.
let renderSlate (mount: HTMLElement) (games: Game list) (briefs: Brief list) =
    let setters = ResizeArray<GameState -> unit>()

    // game.Id -> its brief, resolved once for the whole slate. Empty when the
    // payload carried no briefs, which is the common case on a scheduled slate
    // and leaves every card in its old flat form.
    let byGame = briefsByGame games briefs

    // Ordering is by the registry's label, not by the raw relay string, so it
    // stays stable even if the relay renames a competition it already serves.
    let groups =
        games
        |> List.groupBy (fun g -> g.Sport)
        |> List.sortBy (fun (sport, gs) -> (-(List.length gs), (sportMeta sport).Label))

    for (sport, gs) in groups do
        let meta = sportMeta sport
        let section = el "section" "sport-group" ""
        section.setAttribute("data-sport", meta.Label)

        // An unmodelled sport is stated on the page rather than rendered as
        // though it were understood. The convention for its fixtures is unknown,
        // so saying nothing would be claiming knowledge the registry lacks.
        if not meta.Modelled then
            section.setAttribute("data-unmodelled", "true")

        let heading =
            if meta.Modelled then sprintf "%s · %d" meta.Label (List.length gs)
            else sprintf "%s · %d · UNMODELLED SPORT" meta.Label (List.length gs)

        let title = el "h2" "sport-group__title" heading
        section.appendChild title |> ignore

        let grid = el "div" "sport-group__grid" ""
        for game in gs do
            setters.Add(render grid game (Map.tryFind game.Id byGame))
        section.appendChild grid |> ignore

        mount.appendChild section |> ignore

    setters
