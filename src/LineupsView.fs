module LineupsView

open Browser.Types
open Browser
open Fable.Core
open Fetch
open Lineups

// The Lineups surface. One request, seven possible answers, and a per-row mark.
//
// See `Lineups.fs` for the owner decision and the measurements. This file is
// only the drawing, and it has two jobs the model cannot do for it:
//
//   1. PUT THE MARK ON EVERY ROW. Task 2 of the commissioning document: "the
//      predicted treatment is not a badge in a corner... make it a property of
//      the row rather than a legend elsewhere on the page." So each player row
//      is three columns — shirt and position, name, and the row's own word —
//      and the word is on all twenty-two rows rather than once on the card.
//      A row screenshot, quoted, or read aloud on its own keeps it.
//
//   2. DRAW THE NON-ANSWERS AS DIFFERENT THINGS. Task 3. Each of the five gets
//      its own sentence and its own `data-answer` value, and none of them
//      produces a grid. An empty grid for all five tells the reader the same
//      wrong thing five ways.
//
// NO POLLING, NO WATCH, NO DIFF-ON-CHANGE. `load` fetches once, when the tab is
// first opened, and never again. The document's first stop condition is that
// the relay serves this on pull only — a lineup that changes an hour before
// kickoff is the most notification-shaped object this feature introduces, and
// Rule A is not cleared. `scripts/check-lineups-pull-only.mjs` fails the build
// if a timer, an interval, an event source or a schedule appears in this file.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private child (parent: HTMLElement) (node: HTMLElement) =
    parent.appendChild node |> ignore
    node

/// The shirt-and-position cell. Two facts the payload carries per player, and
/// neither is invented when absent: a player with no shirt number shows the
/// position alone, and one with neither shows an empty cell rather than a dash
/// standing in for a number nobody sent.
let private slotText (p: Player) =
    match p.Shirt, p.Position with
    | Some n, Some pos -> sprintf "%d  %s" n pos
    | Some n, None -> string n
    | None, Some pos -> pos
    | None, None -> ""

/// One player's row. THREE columns, and the third is the mark.
let private playerRow (mount: HTMLElement) (mark: RowMark) (p: Player) =
    let node = child mount (el "div" "lu-row" "")
    // The mark is in the DOM as data as well as as text, so a check can assert
    // "every row on this sheet is marked" without matching prose.
    node.setAttribute ("data-mark", markWord mark)
    child node (el "div" "lu-row__slot" (slotText p)) |> ignore
    child node (el "div" "lu-row__name" (playerName p.Name)) |> ignore
    // The word, every row. See the header for why this is not once per card.
    let word = child node (el "div" "lu-row__mark" (markWord mark))
    word.setAttribute
        ("style", sprintf "color:%s" (Palette.cssValue (Palette.tokenOf (markSemantic mark))))

/// One side's sheet.
///
/// The formation is rendered and the CONFIDENCE IS NOT. `Lineups.SealedScore`
/// has no formatter, so this is not a decision taken here — there is no way to
/// write the number into the DOM from this file, which is the point of the seal.
let private sideBlock (mount: HTMLElement) (mark: RowMark) (side: SideSheet) =
    let block = child mount (el "div" "lu-side" "")
    block.setAttribute ("data-team", side.Team)
    let head = child block (el "div" "lu-side__head" "")
    child head (el "div" "lu-side__team" side.Team) |> ignore
    match side.Formation with
    | Some f -> child head (el "div" "lu-side__formation" f) |> ignore
    | None -> ()

    let rows = child block (el "div" "lu-rows" "")
    for p in side.Players do
        playerRow rows mark p

    // Substitutes are a named list, not a continuation of the eleven. The
    // payload separates them and conflating them would turn a sheet of eleven
    // into a sheet of twenty-three.
    match side.Substitutes with
    | [] -> ()
    | subs ->
        child block (el "div" "lu-subs__label" (sprintf "SUBSTITUTES (%d)" (List.length subs))) |> ignore
        let subRows = child block (el "div" "lu-rows lu-rows--subs" "")
        for p in subs do
            playerRow subRows mark p

/// The unavailable list.
///
/// TASK 4, ANSWERED: beside the XI, not prose only.
///
/// Measured on both captures — 2 named players on the predicted sheet, 5 on the
/// confirmed, and 7 of 7 carrying a non-null reason ("Broken Toe", "Shoulder
/// Injury", one suspension). It is the only part of this payload that is a FACT
/// in both states: the eleven names are a prediction on one sheet and a team
/// sheet on the other, while an injury is an injury either way.
///
/// That is also why it is not prose-only. A reason is a thing a reader can
/// check against the row in front of them; a reason echoed into a sentence by a
/// generator is a thing they have to take on trust, and the commissioning
/// document names this as the property `journalism-quality.js`'s
/// `marginAgreement` rebuild settled on for exactly that reason.
///
/// A player with no stated reason renders with no reason, never with "unknown".
let private unavailableBlock (mount: HTMLElement) (label: string) (people: Unavailable list) =
    match people with
    | [] -> ()
    | _ ->
        let block = child mount (el "div" "lu-unavail" "")
        block.setAttribute ("data-unavailable", string (List.length people))
        child block (el "div" "lu-unavail__label" (sprintf "UNAVAILABLE — %s" label)) |> ignore
        let rows = child block (el "div" "lu-unavail__rows" "")
        for person in people do
            let node = child rows (el "div" "lu-unavail__row" "")
            child node (el "div" "lu-unavail__who" (playerName person.Who)) |> ignore
            let detail =
                match person.Status, person.Reason with
                | Some s, Some r -> sprintf "%s · %s" s r
                | Some s, None -> s
                | None, Some r -> r
                | None, None -> ""
            if detail <> "" then
                child node (el "div" "lu-unavail__why" detail) |> ignore

/// A `data-answer` value per case. Seven values, so a render check can assert
/// which of the seven was drawn without reading prose.
let private answerSlug =
    function
    | Sheet(Standing.Confirmed, _, _) -> "confirmed"
    | Sheet(Standing.Predicted, _, _) -> "predicted"
    | SheetOfUnstatedKind _ -> "kind-not-stated"
    | SheetOfUnknownKind _ -> "kind-unrecognised"
    | ServedEmpty -> "served-empty"
    | NotInPayload -> "not-in-payload"
    | ExplicitlyNull -> "explicitly-null"
    | UpstreamFailed _ -> "upstream-failed"

let render (mount: HTMLElement) (reply: Reply) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "lu-panel" "")
    panel.setAttribute ("data-answer", answerSlug reply.Answer)
    child panel (el "h2" "" "Lineups") |> ignore

    // The sentence, every time, for all seven answers.
    let said = child panel (el "p" "lu-headline" (headline reply.Answer))
    match markFor reply.Answer with
    | Some mark ->
        said.setAttribute
            ("style", sprintf "color:%s" (Palette.cssValue (Palette.tokenOf (markSemantic mark))))
    | None -> ()

    // The failure's own words, in a diagnostic line rather than in prose. See
    // `Lineups.headline` for why they are not in the sentence above.
    match failureDetail reply.Answer with
    | Some detail -> child panel (el "p" "lu-detail" detail) |> ignore
    | None -> ()

    // What the vendor's own numbers say about the standing it declared. Empty on
    // both captures; reported rather than resolved, because a confirmed sheet
    // carrying a model score on every player means something upstream changed.
    match disagreements reply with
    | [] -> ()
    | notes ->
        let block = child panel (el "div" "lu-disagree" "")
        block.setAttribute ("data-disagreements", string (List.length notes))
        child block (el "div" "lu-disagree__label" "THE PAYLOAD DISAGREES WITH ITSELF") |> ignore
        for note in notes do
            child block (el "div" "lu-disagree__note" note) |> ignore

    match sidesOf reply.Answer, markFor reply.Answer with
    | Some(home, away), Some mark ->
        let sides = child panel (el "div" "lu-sides" "")
        // Home first, the ordering rule the rest of this page uses for a line
        // carrying both sides.
        sideBlock sides mark home
        sideBlock sides mark away
        let unavail = child panel (el "div" "lu-unavails" "")
        unavailableBlock unavail home.Team reply.UnavailableHome
        unavailableBlock unavail away.Team reply.UnavailableAway
    | _ ->
        // NO GRID. The five non-answers get their sentence and nothing that
        // looks like a sheet — which is the whole of Task 3.
        //
        // The unavailable list still renders when the payload carried one: a
        // failed sheet with a known injury list is more informative than either
        // half alone, and it is the half that did arrive.
        let unavail = child panel (el "div" "lu-unavails" "")
        unavailableBlock unavail "home" reply.UnavailableHome
        unavailableBlock unavail "away" reply.UnavailableAway

    match reply.UpdatedAt with
    | Some at -> child panel (el "p" "lu-updated" (sprintf "Vendor's own timestamp: %s" at)) |> ignore
    | None -> ()

/// This page's own refusal, which is NOT one of the seven answers.
///
/// The `Answer` type models what the VENDOR said. A `?xi=` parameter this page
/// cannot make sense of is not something the vendor said — folding it into
/// `UpstreamFailed` would report a request that was never made as a request
/// that failed, and those are different facts about why the screen is empty.
let renderRefusal (mount: HTMLElement) (reason: string) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "lu-panel" "")
    panel.setAttribute ("data-answer", "not-requested")
    child panel (el "h2" "" "Lineups") |> ignore
    child panel
        (el "p" "lu-headline"
            ("No request was made, so nothing is known about any lineup. "
             + "This is not an empty team sheet and not a failed call.")) |> ignore
    child panel (el "p" "lu-detail" reason) |> ignore

let private renderIdle (mount: HTMLElement) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "lu-panel" "")
    child panel (el "h2" "" "Lineups") |> ignore
    child panel (el "p" "lu-headline" "Loading…") |> ignore

/// Fetch ONCE and render. No retry, no interval, no second request.
///
/// A failed fetch becomes `UpstreamFailed`, never an empty sheet: not knowing
/// and nobody having been named are different facts, and this is the one place
/// a renderer is tempted to make them the same.
let load (mount: HTMLElement) (url: string) : JS.Promise<unit> =
    promise {
        renderIdle mount
        let! reply =
            promise {
                try
                    let! res = fetch url []
                    if res.Ok then
                        let! body = res.text ()
                        return fromString body
                    else
                        return unreachable (sprintf "HTTP %d" res.Status)
                with e ->
                    return unreachable e.Message
            }
        render mount reply
    }

// ── One event's lineup, for a game card ─────────────────────────────────────
// docs/CC-CMD-2026-10-27-lineups-on-game-cards.md. The card does not draw a
// sheet of its own: it calls `loadEvent`, which resolves a source and hands it to
// `load` (or to `renderRefusal` when no request is to be made). One renderer,
// one place the per-row mark and the five non-answers are drawn.

/// The relay's per-event route, minus the id. The same base `Program.fs` holds as
/// RELAY_LINEUPS; `scripts/check-lineups-pull-only.mjs` fails if the two differ.
let private RELAY_EVENTS = "https://field-relay-nba.jeffunglesbee.workers.dev/bsd/events/"

/// The two committed captures and the events they are, from `data/PROVENANCE.md`:
/// 220230 pre-match (Boyaca Chico v Cucuta Deportivo) and 5327 played (Charlotte
/// FC v FC Dallas, 2026-10-10). The Lineups tab pins to these two files, and a
/// pinned page resolves a card to the same files.
///
/// Only 5327 can be on a card: 220230 is a Colombian second-division match, and
/// the relay joins six soccer labels, none of them that league. It stays because
/// it is the other half of what `data/PROVENANCE.md` records, not because a row
/// will carry it.
let private capturedEvents =
    [ "220230", "./data/lineups-predicted.json"
      "5327", "./data/lineups-confirmed.json" ]

/// Where one event's lineup comes from. Four cases, and two of them are a
/// request that is NOT made.
type LineupSource =
    /// A committed file under `?data=`. Same-origin, never the network.
    | FromCapture of url: string
    /// The relay, on a page that is not pinned.
    | FromRelay of url: string
    /// A pinned page and an event with no committed capture. Nothing is fetched:
    /// a pinned page that quietly went to the network would not be pinned.
    | NoCaptureHere of eventId: string
    /// An id that is not ASCII digits. A URL assembled from arbitrary text is a
    /// request this page did not intend to make (the same rule as `?xi=`).
    | NotAnEventId of raw: string

/// Pure: whether the page is pinned is an argument, so Suite can say it.
let sourceForEvent (pinned: bool) (eventId: string) : LineupSource =
    if eventId = "" || not (eventId |> Seq.forall (fun c -> c >= '0' && c <= '9')) then
        NotAnEventId eventId
    elif pinned then
        match capturedEvents |> List.tryFind (fun (id, _) -> id = eventId) with
        | Some(_, url) -> FromCapture url
        | None -> NoCaptureHere eventId
    else
        FromRelay(sprintf "%s%s/lineups" RELAY_EVENTS eventId)

/// `?data=` pins the page to a committed capture. Read the way `Program.fs` reads
/// every query parameter, so the two agree on what "pinned" means.
let private pinnedPage () =
    let search = Browser.Dom.window.location.search
    match search.IndexOf "data=" with
    | -1 -> false
    | i -> search.Substring(i + 5).Split('&').[0] <> ""

/// Draw one event's lineup into `mount`. Fetches at most once and only when
/// called; the caller decides when, and calls it once.
let loadEvent (mount: HTMLElement) (eventId: string) : JS.Promise<unit> =
    match sourceForEvent (pinnedPage ()) eventId with
    | FromCapture url
    | FromRelay url -> load mount url
    | NoCaptureHere id ->
        renderRefusal mount
            (sprintf "This page is pinned to a committed capture (?data=) and holds no lineup capture for event %s." id)
        promise { return () }
    | NotAnEventId raw ->
        renderRefusal mount
            (sprintf "bsd_event_id \"%s\" is not a number. Nothing was fetched."
                (safeToken raw |> Option.defaultValue "<nothing printable>"))
        promise { return () }
