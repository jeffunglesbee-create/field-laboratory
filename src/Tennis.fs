module Tennis

open Thoth.Json

// A tennis scoreline is not a scoreline, and that is the whole reason this
// module exists.
//
// Every `Sport` case this repository models resolves to two numbers under
// `HomeVersusAway` or `AwayAtHome`. A tennis match has no such pair. It has an
// ARRAY of per-set pairs, and the match score is derived from it — so
// "Menšik 1, Tien 1" and "Menšik 3-6, 6-1, 5-5" are the same match at the same
// instant, and neither can be recovered from the other by a two-number type.
//
// WHY IT WAS WORTH CAPTURING FIRST
//
// Before `data/tennis-live.json` existed, five invariants were written down
// from knowing tennis. The capture refuted two of them within a minute:
//
//   CLAIMED. "A completed set is 6-n, 7-5 or 7-6."
//   MEASURED. True of every set EXCEPT the last, which may be in progress and
//   legitimately 5-5, 4-3 or 2-4. The in-progress set lives in the same array
//   as the finished ones, with nothing marking it — `[{3,6},{6,1},{5,5}]` at
//   1-1 in sets. A rule applied to the whole array would have called every
//   live match corrupt.
//
//   CLAIMED. "Best-of decides the ceiling: 3 sets wins a best-of-5."
//   MEASURED. There is no best-of field, and it cannot be derived safely.
//   `circuit` reads "ATP" on a WOMEN'S match in the capture (UTR PTT Miami
//   Women, gender F), so the obvious derivation is wrong on real rows. Not
//   modelled — inventing the rule would be worse than leaving the ceiling
//   unchecked, and this repo's first rule is not to invent.
//
// A third fact the capture supplied that was not guessed at all: `tiebreak` is
// an optional third key on a set, `[8,6]` — so a tiebreak is first-to-seven
// win-by-two, not capped at seven.
//
// Reading is a simulation of execution. Two of five simulated wrong.
//
// WHAT IS AND IS NOT GUARANTEED
//
//   GUARANTEED. A `Match` value cannot be built whose set summary disagrees
//   with its set list, and a `CompletedSet` cannot hold a score no completed
//   set of tennis can end on. Both cases are private; `decode` is the only way
//   in, and it returns an error rather than a value it cannot justify.
//
//   NOT GUARANTEED. That a decoded match describes a real one. This checks
//   internal consistency against the rules of the sport, not truthfulness. A
//   fabricated but self-consistent payload decodes cleanly, and should — no
//   type can reach the court.

// --- what a set can be -------------------------------------------------------

/// A set that has ENDED. Private case: the only constructor is `completedSet`,
/// which refuses a score tennis cannot finish on.
type CompletedSet = private CompletedSet of p1: int * p2: int * tiebreak: (int * int) option

/// A set still being played. Deliberately a DIFFERENT type from a completed
/// one, with no equality and no conversion between them.
///
/// The mistake this prevents is the one the capture caught: treating the last
/// element of `sets_detail` as finished. `[{3,6},{6,1},{5,5}]` is a valid live
/// match, and 5-5 is a valid in-progress set. If both were one type, a check
/// asserting "sets end 6-n, 7-5 or 7-6" would compile and would report every
/// live match in the fixture as corrupt. Here it does not compile.
type LiveSet = private LiveSet of p1: int * p2: int

/// A completed set is 6-n with n at most 4, or 7-5, or 7-6. Nothing else ends a
/// set. Measured against all 11 rows of data/tennis-live.json: every set before
/// the last satisfies this, and no set after it does not.
let completedSet (p1: int) (p2: int) (tiebreak: (int * int) option) : CompletedSet option =
    if p1 < 0 || p2 < 0 then None
    else
        let hi = max p1 p2
        let lo = min p1 p2
        let legal = (hi = 6 && lo <= 4) || (hi = 7 && (lo = 5 || lo = 6))
        // A tiebreak is played at 6-6 and only there, so it may accompany a 7-6
        // and nothing else. In the capture, both tiebreak sets are 7-6 and
        // their breakers are [8,6] and [7,3] — first to seven, win by two,
        // which is why the ceiling is a margin rule rather than a cap at 7.
        let tiebreakOk =
            match tiebreak with
            | None -> true
            | Some(a, b) -> hi = 7 && lo = 6 && a >= 0 && b >= 0 && max a b >= 7 && abs (a - b) >= 2
        if legal && tiebreakOk then Some(CompletedSet(p1, p2, tiebreak)) else None

/// An in-progress set: any non-negative game count neither side has yet won on.
/// A live set may sit at 5-5 or 6-6; it may NOT sit at a score that has already
/// ended the set, because then it would not be live.
let liveSet (p1: int) (p2: int) : LiveSet option =
    if p1 < 0 || p2 < 0 then None
    elif (completedSet p1 p2 None).IsSome then None
    elif p1 > 7 || p2 > 7 then None
    else Some(LiveSet(p1, p2))

let completedPair (CompletedSet(a, b, tb)) = a, b, tb
let livePair (LiveSet(a, b)) = a, b

/// Who won a completed set. Total, because a completed set has a winner by
/// construction — `completedSet` cannot mint a draw.
let setWinner (CompletedSet(a, b, _)) = if a > b then 1 else 2

// --- what a match can be -----------------------------------------------------

/// A match's set list: those that finished, and at most one still being played.
///
/// "At most one" is structural rather than checked. A list of sets where two
/// are in progress is not a match state that exists, and here it is not a value
/// that can be built.
type Sets =
    private
    | Finished of CompletedSet list
    | InPlay of completed: CompletedSet list * current: LiveSet
    /// A match that ENDED on an unfinished set: a retirement.
    ///
    /// MEASURED, not anticipated. `decodeDrawNodes` was written assuming a
    /// finished match has only finished sets, and three of the 127 matches in
    /// the captured Roland Garros refused it — all three `status: finished`,
    /// all three stopping mid-set:
    ///
    ///   35384  R64   4-5
    ///   35152  R128  3-6 6-0 4-1
    ///   35142  R128  7-6 2-1
    ///
    /// 4-5 is not a set anyone won. The player retired, and the match is over
    /// with a set unplayed out. A THIRD case rather than a flag on `Finished`,
    /// for the same reason `LiveSet` is not a `CompletedSet`: the abandoned set
    /// is not one a completed-set rule may be applied to, and here it cannot be.
    | Retired of completed: CompletedSet list * abandoned: LiveSet

/// A decoded match. Private case: `decode` is the only way to obtain one.
type Match =
    private
        { Id: int
          Tournament: string
          Sets: Sets }

/// Why a payload did not decode. Named cases rather than a string, so a caller
/// must handle each and a message cannot drift from the condition that raised it.
type DecodeError =
    | NoSets
    | IllegalCompletedSet of index: int * p1: int * p2: int
    | IllegalLiveSet of p1: int * p2: int
    | SummaryDisagreesWithSets of claimedWon: int * setsInList: int
    /// The final set of an ended match is neither a completed set nor a legal
    /// score to abandon on.
    | IllegalAbandonedSet of p1: int * p2: int

/// Build a match from the shape BSD actually serves.
///
/// `setsWon` is `player1_sets + player2_sets` and `sets` is `sets_detail`. The
/// relation between them, measured on all 11 captured rows: the list holds
/// exactly the completed sets, or those plus one in progress. Nothing else.
/// That is what says which element is live WITHOUT a flag in the payload —
/// there is no flag, and the last element is live precisely when the summary
/// falls one short of the list.
let decode (id: int) (tournament: string) (setsWon: int) (sets: (int * int * (int * int) option) list) : Result<Match, DecodeError> =
    let n = List.length sets
    if n = 0 then Error NoSets
    elif setsWon = n then
        // Every set finished.
        let rec build i acc rest =
            match rest with
            | [] -> Ok(List.rev acc)
            | (a, b, tb) :: tail ->
                match completedSet a b tb with
                | Some s -> build (i + 1) (s :: acc) tail
                | None -> Error(IllegalCompletedSet(i, a, b))
        match build 0 [] sets with
        | Ok cs -> Ok { Id = id; Tournament = tournament; Sets = Finished cs }
        | Error e -> Error e
    elif setsWon = n - 1 then
        // The last is in play.
        let completed = sets |> List.take (n - 1)
        let (la, lb, _) = List.item (n - 1) sets
        let rec build i acc rest =
            match rest with
            | [] -> Ok(List.rev acc)
            | (a, b, tb) :: tail ->
                match completedSet a b tb with
                | Some s -> build (i + 1) (s :: acc) tail
                | None -> Error(IllegalCompletedSet(i, a, b))
        match build 0 [] completed with
        | Error e -> Error e
        | Ok cs ->
            match liveSet la lb with
            | Some ls -> Ok { Id = id; Tournament = tournament; Sets = InPlay(cs, ls) }
            | None -> Error(IllegalLiveSet(la, lb))
    else
        Error(SummaryDisagreesWithSets(setsWon, n))

/// Build a match KNOWN to have ended, from its set list alone.
///
/// Different question from `decode`, which is given a summary and uses it to
/// decide which set is live. Here the match is over — the caller has a result —
/// so there is no live set to identify and no summary to disagree with. What
/// remains is whether the last set was played out.
///
/// Every set but the last must be a completed set; a match cannot resume after
/// one was abandoned. The last is either completed, and the match is `Finished`,
/// or it is a legal in-progress score, and the match is `Retired`. Anything else
/// is neither and is refused.
let decodeFinal (id: int) (tournament: string) (sets: (int * int * (int * int) option) list) : Result<Match, DecodeError> =
    let n = List.length sets
    if n = 0 then Error NoSets
    else
        let rec build i acc rest =
            match rest with
            | [] -> Ok(List.rev acc)
            | (a, b, tb) :: tail ->
                match completedSet a b tb with
                | Some s -> build (i + 1) (s :: acc) tail
                | None -> Error(IllegalCompletedSet(i, a, b))
        match build 0 [] (List.truncate (n - 1) sets) with
        | Error e -> Error e
        | Ok cs ->
            let (la, lb, ltb) = List.item (n - 1) sets
            match completedSet la lb ltb with
            | Some last -> Ok { Id = id; Tournament = tournament; Sets = Finished(cs @ [ last ]) }
            | None ->
                match liveSet la lb with
                | Some ls -> Ok { Id = id; Tournament = tournament; Sets = Retired(cs, ls) }
                | None -> Error(IllegalAbandonedSet(la, lb))

// --- reading a decoded match -------------------------------------------------

let matchId (m: Match) = m.Id
let tournament (m: Match) = m.Tournament

/// Sets won by each side, DERIVED from the completed sets rather than trusted
/// from the payload's summary. The summary was used to decide which set is
/// live; recomputing here means the two must agree by construction instead of
/// by a field nobody rechecked.
let setsWon (m: Match) : int * int =
    let completed =
        match m.Sets with
        | Finished cs -> cs
        | InPlay(cs, _) -> cs
        | Retired(cs, _) -> cs
    let p1 = completed |> List.filter (fun s -> setWinner s = 1) |> List.length
    p1, List.length completed - p1

/// The set being played, if any. `None` is a real answer — a finished match has
/// no current set — which is why this is an option rather than a sentinel pair.
let currentSet (m: Match) : (int * int) option =
    match m.Sets with
    | Finished _ -> None
    | InPlay(_, ls) -> Some(livePair ls)
    // A retirement HAS no current set — nobody is playing it. The score it
    // stopped at is read with `abandonedSet`, which is a different question and
    // deliberately a different name.
    | Retired _ -> None

/// Is this match still being played?
let inPlay (m: Match) =
    match m.Sets with
    | Finished _ -> false
    | InPlay _ -> true
    | Retired _ -> false

/// Every COMPLETED set of a match, as game pairs in the order they were played.
///
/// The one way out of `Sets`, whose cases are private. Without it `completedPair`
/// had no reachable caller — a match can be built and asked whether it is in
/// play, but nothing could read the scoreline it was built from, which is the
/// thing a bracket actually prints.
///
/// Completed sets only. A live set is not a score anyone has won and a retired
/// match's abandoned set is not either; both are read by their own accessor, so
/// no caller can mistake one for a result.
let setScores (m: Match) : (int * int) list =
    let completed =
        match m.Sets with
        | Finished cs -> cs
        | InPlay(cs, _) -> cs
        | Retired(cs, _) -> cs
    completed |> List.map (fun s -> let a, b, _ = completedPair s in a, b)

/// Did this match end in a retirement, and on what score?
let abandonedSet (m: Match) : (int * int) option =
    match m.Sets with
    | Finished _ | InPlay _ -> None
    | Retired(_, ls) -> Some(livePair ls)

/// A match that has ended level is not a match that has ended. Reported rather
/// than made unrepresentable: without a best-of, "3-1 is impossible in a
/// best-of-3" is not decidable here, but "2-2 with nothing left to play" is,
/// and it is the one a decoder bug would actually produce.
let endedLevel (m: Match) =
    match m.Sets with
    | InPlay _ -> false
    // A retirement at one set all is normal and not a defect — the match ended
    // because someone stopped, not because the sets ran out. Reporting it as
    // "ended level" would flag every retirement in a slam as corrupt, which is
    // the mistake this module's header records making about live sets.
    | Retired _ -> false
    | Finished _ ->
        let p1, p2 = setsWon m
        p1 = p2


// --- reading the payload BSD actually serves ---------------------------------
//
// Thoth, following Schedule.fs. The field names below were read from
// data/tennis-live.json, not from the vendor's documentation and not from the
// 700-character truncated sample in the relay's probe artifact — that sample is
// a copy, and it cuts off mid-object.
//
// `tiebreak` is Optional because the capture shows it present on exactly two of
// the fifteen sets it carries, both of them 7-6. A Required decoder would have
// failed nine of eleven matches and looked like a broken feed.

let private setDecoder : Decoder<int * int * (int * int) option> =
    Decode.object (fun get ->
        let p1 = get.Required.Field "p1" Decode.int
        let p2 = get.Required.Field "p2" Decode.int
        let tb =
            get.Optional.Field "tiebreak" (Decode.array Decode.int)
            |> Option.bind (fun a -> if Array.length a = 2 then Some(a.[0], a.[1]) else None)
        p1, p2, tb)

/// One row of `/bsd/tennis/matches/live`, reduced to what this module models.
///
/// `player1_sets + player2_sets` is the summary that decides which set is live.
/// The tournament name is nested under `tournament.name`.
let private rowDecoder : Decoder<Result<Match, DecodeError>> =
    Decode.object (fun get ->
        let id = get.Required.Field "id" Decode.int
        let name = get.Required.At [ "tournament"; "name" ] Decode.string
        let s1 = get.Required.Field "player1_sets" Decode.int
        let s2 = get.Required.Field "player2_sets" Decode.int
        let sets = get.Required.Field "sets_detail" (Decode.list setDecoder)
        decode id name (s1 + s2) sets)

/// Decode every match in a captured payload.
///
/// A row that FAILS to decode stays in the list as an `Error`, rather than
/// being filtered out. Dropping it would make a corrupted payload indexing
/// clean, and "every match decodes" would be true of a list the failures had
/// been removed from — a check whose subject is chosen by the check.
///
/// A payload that is not a JSON array of objects yields an empty list, which
/// the suite asserts against separately: `List.forall` is vacuously true on
/// nothing, so "all decode" needs "and there are eleven" beside it.
/// Decode the FINISHED matches of a captured draw.
///
/// WHY THIS EXISTS. `Sets.Finished` had no captured match behind it. The live
/// capture comes from `/bsd/tennis/matches/live`, which by construction carries
/// only matches in progress — the two captures taken hold `live` and
/// `interrupted` and nothing else — so the one branch that models a COMPLETED
/// match was exercised by constructed inputs alone, and the coverage note in
/// `Suite.fs` said so rather than pretending otherwise.
///
/// The draw capture closes it without a new workflow. `data/tennis-draw.json`
/// is a finished Roland Garros: 127 matches, every one played out. And the set
/// shape is the SAME — the relay passes `sets_detail` through untouched, so
/// each entry is `{p1, p2}` with an optional two-element `tiebreak`, which is
/// exactly what `setDecoder` above already reads. Measured on the file, not
/// assumed from the field name.
///
/// `setsWon` is the LENGTH of the list here, which is what makes every one of
/// these decode as `Finished`: `decode` treats `setsWon = n` as "every set
/// finished" and `setsWon = n - 1` as "the last is in play". A completed match
/// has no set in play, so the summary equals the count by definition.
let decodeDrawNodes (json: string) : Result<Match, DecodeError> list =
    let nodeDec =
        Decode.object (fun get ->
            let id = get.Required.Field "id" Decode.int
            let round = get.Optional.Field "round" Decode.string |> Option.defaultValue "?"
            let sets = get.Optional.Field "sets" (Decode.list setDecoder)
            id, round, sets)
    match Decode.fromString (Decode.field "nodes" (Decode.list nodeDec)) json with
    | Error _ -> []
    | Ok rows ->
        rows
        // A node with no sets is a match not yet played, and this function is
        // about the finished ones. Dropped rather than failed — but the suite
        // asserts the surviving list is not empty, because `forall` on nothing
        // is the hole this repo has filled three times.
        |> List.choose (fun (id, round, sets) ->
            match sets with
            | Some s when not (List.isEmpty s) -> Some(decodeFinal id round s)
            | _ -> None)

let decodeAll (json: string) : Result<Match, DecodeError> list =
    match Decode.fromString (Decode.list rowDecoder) json with
    | Ok rows -> rows
    | Error _ -> []
