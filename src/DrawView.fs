module DrawView

open Browser.Types
open Browser
open Fable.Core
open Fetch
open Draw

// The Draw panel: a knockout bracket with its own invariants printed on it.
//
// WHY THIS SURFACE EXISTS AT ALL, given that jubilant-bassoon already ships a
// tennis bracket and this is not a second copy of it.
//
// The client's bracket answers "who plays whom". It cannot answer the question
// this repo is for, which is why anyone should believe it. `Draw.fs` refuses
// four states and REPORTS two more, and every one of those decisions is
// invisible in a rendered bracket: a draw whose entry round is exempt from the
// canonical-size law looks exactly like one that passed it, and for two months
// the difference between those was a bug that called nine of ten Masters draws
// corrupt.
//
// So this panel draws the bracket and, beside every round, the law's verdict on
// that round — including the two verdicts that are neither pass nor fail. That
// is the whole reason to render it here rather than link to the client.
//
// WHAT IS JOINED, AND FROM WHERE
//
//   SHAPE      `Draw.decodeResponse` — rounds, players, winners, edges.
//   SCORELINE  `Tennis.decodeDrawNodes` — the same payload's `sets`, through
//              the module that refuses a score tennis cannot finish on.
//
// Two decoders over one file is deliberate and is the arrangement `Fixtures.fs`
// already records: the shape module has no `sets` field and should not grow one,
// because a scoreline that decodes wrongly and a draw that joins wrongly are
// different failures. The join between them is by match id, and a match whose
// scoreline is REFUSED renders with no score rather than with numbers nobody
// checked — the count of refusals is printed in the header, so a refusal is
// visible rather than merely absent.

let private el (tag: string) (className: string) (text: string) : HTMLElement =
    let node = document.createElement tag
    if className <> "" then node.className <- className
    if text <> "" then node.textContent <- text
    node

let private child (parent: HTMLElement) (node: HTMLElement) =
    parent.appendChild node |> ignore
    node

// --- the verdict line for one round ------------------------------------------

/// What a round's header says, and the class that styles it.
///
/// Total over `SizeVerdict`. FS0025 is an error here, so a fifth verdict cannot
/// be added to `Draw.fs` without this function refusing to compile — which is
/// the point of the union being a union: the two "not compared" cases must keep
/// saying WHY, and a bool would have let them quietly render as a pass.
let private verdictNote (v: SizeVerdict) : string * string =
    // The Final holds one match, so "1 matches" is on this page by default.
    let n_matches n = sprintf "%d match%s" n (if n = 1 then "" else "es")
    match v with
    | AtCanonicalSize n ->
        sprintf "%s · at canonical size" (n_matches n), "dv-round__note--held"
    | OffCanonicalSize(have, want) ->
        sprintf "%s · %d short of %d" (n_matches have) (want - have) want, "dv-round__note--off"
    | EntryRoundNotCompared have ->
        sprintf "%s · entry round — no canonical size to compare to" (n_matches have),
        "dv-round__note--exempt"
    | NotYetPlayedOut have ->
        sprintf "%s · not played out yet" (n_matches have), "dv-round__note--exempt"

/// The short form, for the round column's own caption.
let private verdictWord (v: SizeVerdict) =
    match v with
    | AtCanonicalSize _ -> "canonical"
    | OffCanonicalSize _ -> "short"
    | EntryRoundNotCompared _ -> "not compared"
    | NotYetPlayedOut _ -> "not compared"

// --- one match ---------------------------------------------------------------

/// A side of a match, with its score if one was decoded.
///
/// `won` drives the emphasis. It is `WinnerId`, not "the higher score": a
/// retirement is won by the player with fewer sets on the board, and reading
/// the winner off the scoreline would print the wrong name in bold for exactly
/// the three matches of the captured slam that ended that way.
let private side (mount: HTMLElement) (p: Player option) (won: bool) (score: string) =
    let row = child mount (el "div" (if won then "dv-side dv-side--won" else "dv-side") "")
    match p with
    | None ->
        // A match with a player missing is real — an unplayed row carries no
        // names — and is drawn as absent rather than skipped, so the bracket's
        // shape stays honest about what is not there.
        child row (el "span" "dv-side__name dv-side__name--none" "—") |> ignore
    | Some player ->
        child row (el "span" "dv-side__name" player.Name) |> ignore
        match player.CountryCode with
        | Some cc -> child row (el "span" "dv-side__cc" cc) |> ignore
        | None -> ()
    if score <> "" then child row (el "span" "dv-side__score" score) |> ignore

/// One match block.
///
/// `fromNowhere` marks a player who appears in this round without having won a
/// match in the round before — a bye, a walkover, a late qualifier, or a row the
/// vendor does not serve. Marked ON THE PLAYER rather than counted in the
/// header, because "3 players from nowhere" in a summary is a number nobody can
/// act on and a mark beside a name is a question anyone can chase.
let private matchBlock (mount: HTMLElement)
                       (scoreOf: int -> string * string)
                       (fromNowhere: Set<int>)
                       (refused: Set<int>)
                       (m: MatchView) =
    let block = child mount (el "div" "dv-match" "")
    block.setAttribute ("data-match-id", string m.Id)
    block.setAttribute ("data-round", roundLabel m.Round)
    let s1, s2 = scoreOf m.Id
    let won (p: Player option) =
        match p, m.WinnerId with
        | Some player, Some w -> player.Id = w
        | _ -> false
    let marked (p: Player option) =
        match p with
        | Some player -> Set.contains player.Id fromNowhere
        | None -> false
    if marked m.P1 || marked m.P2 then block.setAttribute ("data-from-nowhere", "true")
    // The refusal is said HERE as well as in the header. A reader looking at the
    // bracket sees a match with no numbers; without this it is indistinguishable
    // from one that has not been played.
    if Set.contains m.Id refused then
        block.setAttribute ("data-scoreline", "refused")
        child block (el "p" "dv-match__refused" "scoreline refused") |> ignore
    side block m.P1 (won m.P1) s1
    side block m.P2 (won m.P2) s2

// --- the panel ---------------------------------------------------------------

/// Why one scoreline was refused, in words.
///
/// Total over `Tennis.DecodeError`, so a sixth refusal added there is a compile
/// error here rather than a match that silently shows no score.
let private refusalWhy (e: Tennis.DecodeError) =
    match e with
    | Tennis.NoSets -> "no sets"
    | Tennis.IllegalCompletedSet(i, a, b) ->
        sprintf "set %d is %d-%d, which is not a score a set ends on" (i + 1) a b
    | Tennis.IllegalLiveSet(a, b) ->
        sprintf "%d-%d is not a score a set can still be at" a b
    | Tennis.SummaryDisagreesWithSets(claimed, listed) ->
        sprintf "the summary claims %d sets won and the list holds %d" claimed listed
    | Tennis.IllegalAbandonedSet(a, b) ->
        sprintf "the match ended on %d-%d, which is neither a completed set nor a score to stop at" a b
    | Tennis.IllegalTiebreak(i, a, b, x, y) ->
        sprintf "set %d is %d-%d carrying a tiebreak of %d-%d, and a tiebreak is played at 6-6 and only there"
            (i + 1) a b x y

let renderIdle (mount: HTMLElement) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "dv-panel" "")
    child panel (el "h2" "" "Draw") |> ignore
    child panel (el "p" "dv-idle" "Reading the draw…") |> ignore

/// Every failure to build a draw, named. Total over `DrawError`, so a sixth
/// refusal added to `Draw.fs` is a compile error here rather than a blank panel.
let private errorLine (e: DrawError) =
    match e with
    | EmptyDraw -> "No draw in this payload."
    | UnknownRound name ->
        sprintf "A row is in round \"%s\", which is not a round of the draw. \
                 The whole payload is refused rather than that row dropped — \
                 dropping it would build a clean-looking bracket out of a list \
                 the exceptions had been removed from." name
    | DuplicateMatchId id ->
        sprintf "Two matches share id %d. Every edge would address one of them \
                 and nothing would say which." id
    | WinnerNotInMatch(matchId, winnerId) ->
        sprintf "Match %d records player %d as the winner, and that player is \
                 not one of the two who played it." matchId winnerId
    | PlayerTwiceInRound(round, playerId) ->
        sprintf "Player %d appears twice in %s. In single elimination that \
                 cannot happen, and it is what a draw assembled from two \
                 editions of one tournament looks like." playerId round

let renderError (mount: HTMLElement) (message: string) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "dv-panel" "")
    child panel (el "h2" "" "Draw") |> ignore
    let p = child panel (el "p" "dv-error" message)
    p.setAttribute ("data-state", "error")

/// Render a built draw.
///
/// `scorelines` is keyed by match id. A match absent from it either was not
/// played or had its scoreline refused; `refusals` says which, and by name —
/// the count alone is printed whether it is zero or not, because a number that
/// only appears when it is non-zero is a number whose absence means two
/// different things.
let render (mount: HTMLElement)
           (d: Draw)
           (scorelines: Map<int, string * string>)
           (refusals: (int * Tennis.DecodeError) list) =
    mount.innerHTML <- ""
    let panel = child mount (el "div" "dv-panel" "")

    let head = child panel (el "header" "dv-head" "")
    child head (el "h2" "dv-head__title" (tournament d)) |> ignore
    child head (el "p" "dv-head__season" (season d)) |> ignore

    // The line that makes this a laboratory bracket rather than a bracket.
    // Every number in it is read off the built draw, not off the payload.
    let facts = child head (el "p" "dv-head__facts" "")
    facts.setAttribute ("data-matches", string (matchCount d))
    facts.setAttribute ("data-edges", string (edgeCount d))
    let refusedCount = List.length refusals
    facts.setAttribute ("data-refused", string refusedCount)
    facts.textContent <-
        sprintf "%d matches · %d edges, each resolved by winner identity to exactly one next match · %d scoreline%s refused"
            (matchCount d) (edgeCount d) refusedCount (if refusedCount = 1 then "" else "s")

    // Named, not counted. A refusal is the scoreline module catching something
    // the vendor served that tennis cannot produce, and it is the most useful
    // line on this panel — printed as a number nobody can chase, it may as well
    // not be there.
    if not (List.isEmpty refusals) then
        let why = child head (el "p" "dv-head__refused" "")
        why.textContent <-
            refusals
            |> List.map (fun (id, e) -> sprintf "match %d — %s" id (refusalWhy e))
            |> String.concat "; "
            |> sprintf "Scoreline refused, so no numbers are printed for it: %s"

    let champLine = child head (el "p" "dv-head__champion" "")
    match champion d with
    | Some p ->
        champLine.textContent <- sprintf "Champion: %s" p.Name
        champLine.setAttribute ("data-champion", p.Name)
    | None ->
        // A real answer, not a missing one. A draw in progress has no champion,
        // and a blank line here would read as a failure to find one.
        champLine.textContent <- "No champion yet — this draw is still being played."
        champLine.setAttribute ("data-champion", "")

    let verdicts = roundVerdicts d
    let off = roundsOffCanonicalSize d
    let isCompared (v: SizeVerdict) =
        match v with
        | AtCanonicalSize _ | OffCanonicalSize _ -> true
        | EntryRoundNotCompared _ | NotYetPlayedOut _ -> false
    let compared = verdicts |> List.filter (fun (_, v) -> isCompared v) |> List.length
    let exempt = List.length verdicts - compared
    let law = child head (el "p" "dv-head__law" "")
    law.setAttribute ("data-off-canonical", string (List.length off))
    law.setAttribute ("data-compared", string compared)
    law.textContent <-
        if List.isEmpty off then
            sprintf "Canonical-size law: %d round%s compared, none short. %d exempt."
                compared (if compared = 1 then "" else "s") exempt
        else
            off
            |> List.map (fun (r, have, want) -> sprintf "%s is %d where %d belong" r have want)
            |> String.concat "; "
            |> sprintf "Canonical-size law: %s"

    let nowhere = playersFromNowhere d
    let nowhereIds = nowhere |> List.map fst |> Set.ofList
    let nowhereLine = child head (el "p" "dv-head__nowhere" "")
    nowhereLine.setAttribute ("data-from-nowhere", string (List.length nowhere))
    nowhereLine.textContent <-
        if List.isEmpty nowhere then
            "Every player in every round won their way there."
        else
            nowhere
            |> List.map (fun (pid, round) ->
                match playerName d pid with
                | Some n -> sprintf "%s in %s" n round
                | None -> sprintf "player %d in %s" pid round)
            |> String.concat "; "
            |> sprintf "Entered without winning a match in the round before: %s"

    let refusedIds = refusals |> List.map fst |> Set.ofList
    let scoreOf id =
        match Map.tryFind id scorelines with
        | Some pair -> pair
        | None -> "", ""

    let tree = child panel (el "div" "dv-tree" "")
    tree.setAttribute ("data-rounds", string (List.length verdicts))
    for (r, v) in verdicts do
        let column = child tree (el "section" "dv-round" "")
        column.setAttribute ("data-round", roundLabel r)
        column.setAttribute ("data-verdict", verdictWord v)
        let header = child column (el "header" "dv-round__head" "")
        child header (el "h3" "dv-round__name" (roundLabel r)) |> ignore
        let note, cls = verdictNote v
        child header (el "p" ("dv-round__note " + cls) note) |> ignore
        let body = child column (el "div" "dv-round__matches" "")
        for m in matchesInRound d r do
            matchBlock body scoreOf nowhereIds refusedIds m

// --- fetching ----------------------------------------------------------------

/// Turn one decoded match into the two score strings its sides print.
///
/// A retirement prints the abandoned set on the line it stopped at and marks it,
/// because "6-4 2-1" with no mark reads as a match still in progress. A live set
/// is printed the same way for the same reason.
let private scorePair (m: Tennis.Match) : string * string =
    let completed = Tennis.setScores m
    let extra =
        match Tennis.abandonedSet m, Tennis.currentSet m with
        | Some(a, b), _ -> [ a, b ]
        | None, Some(a, b) -> [ a, b ]
        | None, None -> []
    let all = completed @ extra
    let suffix = if (Tennis.abandonedSet m).IsSome then " r." else ""
    let line pick = (all |> List.map (fun pair -> string (pick pair)) |> String.concat " ") + suffix
    line fst, line snd

/// The scoreline map, and every match whose scoreline was REFUSED.
///
/// A refusal is a set score tennis cannot produce. It is carried WITH ITS MATCH
/// ID rather than counted, because a count cannot be chased: the first render of
/// this panel printed "1 scoreline refused" over a real defect — match 36028's
/// second set is 6-4 carrying `tiebreak: [40, 15]`, and 40-15 is a game score on
/// a set that cannot have a tiebreak at all — and there was no way from the page
/// to learn which match that was.
///
/// The refused match still draws. Its names and its winner come from the shape
/// decoder, which is a different question and answered correctly; only the
/// numbers are withheld, and the panel says so where they would have been.
let scorelinesOf (json: string) : Map<int, string * string> * (int * Tennis.DecodeError) list =
    let decoded = Tennis.decodeDrawNodesById json
    let ok =
        decoded
        |> List.choose (fun (id, r) ->
            match r with
            | Ok m -> Some(id, scorePair m)
            | Error _ -> None)
    let refused =
        decoded
        |> List.choose (fun (id, r) ->
            match r with
            | Error e -> Some(id, e)
            | Ok _ -> None)
    Map.ofList ok, refused

/// Fetch a payload, returning the failure as a value. A rejected promise here
/// would take the panel down with it.
let private fetchText (url: string) : JS.Promise<Result<string, string>> =
    promise {
        try
            let! res = fetch url []
            if res.Ok then
                let! body = res.text ()
                return Ok body
            else
                return Error(sprintf "HTTP %d from %s" res.Status url)
        with e ->
            return Error e.Message
    }

/// Load a draw into the panel: fetch, decode both ways, render.
///
/// Every branch renders something. A panel that stays on "Reading the draw…"
/// after a failed fetch is a page claiming to be working, which is the state
/// this repo has shipped blank three times.
let load (mount: HTMLElement) (url: string) : JS.Promise<unit> =
    promise {
        renderIdle mount
        let! payload = fetchText url
        match payload with
        | Error e -> renderError mount (sprintf "The draw did not load. %s" e)
        | Ok json ->
            match decodeResponse json with
            | Error e -> renderError mount (errorLine e)
            | Ok d ->
                let scorelines, refusals = scorelinesOf json
                render mount d scorelines refusals
    }
