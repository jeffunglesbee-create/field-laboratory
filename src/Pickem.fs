module Pickem

open Fable.Core.JsInterop
open Browser
open Desk

// Pick'em — the viewer's own picks, one side per game.
//
// A THIRD pick feature, and the only one that is the viewer's opinion rather
// than FIELD's. Worth stating next to the other two so the page's three "pick"
// surfaces stay distinguishable:
//
//   Field's Pick  FIELD ranks the slate. Editorial. One winner.
//   Scout's Pick  FIELD's hidden-gem gates. Editorial. One qualifier.
//   PICK'EM       YOU choose a side per game. Not editorial at all.
//
// Modelled from the production screen, which is the only evidence available —
// there is no picks route in any capture this repo holds. What that screen shows:
//
//   * a summary line: "No picks decided yet -- 12 of your real picks still
//     pending or live."
//   * sport chips with counts: MLB 10, WNBA 2, EFL Cup 1, MLS 5
//   * per game: "Away @ Home", two side buttons with one highlighted, and a
//     status chip reading PENDING
//
// Two things in that screen are load-bearing and easy to miss.
//
// ONE: the chip counts sum to 18 and the summary says 12. Those are different
// populations — games on the slate versus picks actually made — and nothing on
// the screen says so. Both numbers are derived here from one source and
// labelled, because two independently-computed counts that disagree is a bug
// report waiting to happen even when both are right.
//
// TWO: "still pending or live" is the summary's own distinction, so a pick on a
// game in progress is NOT the same as a pick on a game that has not started.
// Three states, not two.

type Side =
    | Away
    | Home

/// Proof that a pick has actually been settled by a finished game.
///
/// The production summary says "No picks decided yet", which means decidedness
/// is a claim about a real outcome. The failure mode is grading a pick from a
/// score that is still moving — a game leading 3-1 in the sixth is not a win,
/// and a renderer with an `if (pick === leader) 'CORRECT'` has no way to know
/// that.
///
/// So the case is private and `decide` is the only source. It hands one out for
/// `Final` alone, which makes "you cannot grade a live game" a compile error
/// rather than a review note. Same shape as `AmnestyZone` in Desk.fs, and for
/// the same reason: the rule is about which state you are in, and a witness
/// type is how that becomes unforgeable.
type Verdict = private Verdict of correct: bool

let verdictIsCorrect (Verdict correct) = correct

/// The only way a pick becomes graded.
let decide (state: GameState) (side: Side) : Verdict option =
    match state with
    | Final(home, away, _) ->
        // A draw is neither correct nor wrong, and forcing it into a boolean
        // would silently grade every drawn game as a loss. MLS and EFL Cup are
        // both on this slate, so this is not hypothetical.
        if home = away then None
        else
            let winner = if home > away then Home else Away
            Some(Verdict(winner = side))
    // Named, not wildcarded: a fourth GameState case must force a decision here
    // rather than defaulting into "not decided".
    | Scheduled -> None
    | InProgress _ -> None

/// What the row shows.
type PickStatus =
    | NotPicked
    | Pending of Side
    | Live of Side
    /// A draw, or any final the verdict declines to grade. Distinct from
    /// `Live` because the game IS over — it just settles nothing.
    | Undecidable of Side
    | Decided of Side * Verdict

let statusOf (state: GameState) (pick: Side option) : PickStatus =
    match pick with
    | None -> NotPicked
    | Some side ->
        match state with
        | Scheduled -> Pending side
        | InProgress _ -> Live side
        | Final _ ->
            match decide state side with
            | Some verdict -> Decided(side, verdict)
            | None -> Undecidable side

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
//
// localStorage, keyed by date. These are the viewer's picks and no route in any
// capture this repo holds carries them, so inventing a server shape would be
// fiction. Stated rather than implied: the production screen says "your real
// picks", which suggests they are persisted somewhere real, and this is not
// that. It is the laboratory's stand-in, and the type work above is what the
// laboratory is actually testing.

let private storageKey (date: string) = sprintf "field_lab_pickem_%s" date

/// `gameId=side` pairs. A flat encoding on purpose — a corrupt JSON blob would
/// take every pick with it, where a malformed line here loses one.
let loadPicks (date: string) : Map<string, Side> =
    match window.localStorage.getItem (storageKey date) with
    | null -> Map.empty
    | "" -> Map.empty
    | raw ->
        raw.Split(';')
        |> Array.choose (fun entry ->
            match entry.Split('=') with
            | [| gameId; "home" |] when gameId <> "" -> Some(gameId, Home)
            | [| gameId; "away" |] when gameId <> "" -> Some(gameId, Away)
            // Anything else is dropped rather than guessed at. A pick that
            // cannot be read is not a pick for the other side.
            | _ -> None)
        |> Map.ofArray

let savePicks (date: string) (picks: Map<string, Side>) =
    let encoded =
        picks
        |> Map.toSeq
        |> Seq.map (fun (gameId, side) ->
            sprintf "%s=%s" gameId (match side with Home -> "home" | Away -> "away"))
        |> String.concat ";"
    window.localStorage.setItem (storageKey date, encoded)

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

type Summary =
    { /// Games on the slate. This is what the sport chips count.
      Games: int
      /// Picks actually made. This is what the summary line counts. On the
      /// production screen these were 18 and 12 — different numbers, both
      /// correct, and nothing said which was which.
      Picked: int
      Unsettled: int
      Correct: int
      Wrong: int
      Undecided: int }

let summarise (statuses: PickStatus list) : Summary =
    let count predicate = statuses |> List.filter predicate |> List.length
    { Games = List.length statuses
      Picked = count (fun s -> s <> NotPicked)
      Unsettled = count (function Pending _ | Live _ -> true | _ -> false)
      Correct = count (function Decided(_, v) -> verdictIsCorrect v | _ -> false)
      Wrong = count (function Decided(_, v) -> not (verdictIsCorrect v) | _ -> false)
      Undecided = count (function Undecidable _ -> true | _ -> false) }

/// The banner, derived rather than written.
///
/// Production's line is "No picks decided yet -- 12 of your real picks still
/// pending or live." Both halves are computed from the same `Summary`, so the
/// sentence cannot contradict the rows beneath it.
let summaryLine (s: Summary) =
    let settled = s.Correct + s.Wrong
    if s.Picked = 0 then
        sprintf "No picks yet — %d game(s) on the slate." s.Games
    elif settled = 0 then
        sprintf "No picks decided yet — %d of your %d pick(s) still pending or live."
                s.Unsettled s.Picked
    else
        let tail =
            if s.Unsettled > 0 then sprintf ", %d still pending or live" s.Unsettled else ""
        let drawn =
            if s.Undecided > 0 then sprintf ", %d drawn" s.Undecided else ""
        sprintf "%d right, %d wrong of %d decided%s%s." s.Correct s.Wrong settled tail drawn
