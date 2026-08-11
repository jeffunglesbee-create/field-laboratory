module Pick

open Thoth.Json
open Desk

// FIELD's Pick, decoded from the real `bundle.pick` of
// /analytics/newspaper/<date>.
//
// The client half of this feature has never been built. The production outbox
// `Field's Pick — Ranked List — 2026-07-07` shipped the relay side and closed
// with an explicit scope note:
//
//   "`ranked` is now available in the relay response and stored in D1
//    analytics_output. It is not yet rendered anywhere in jubilant-bassoon. A
//    separate client-side CC-CMD is required to display the ranked list in the
//    UI."
//
// That CC-CMD was never dispatched. So this is not a re-implementation of
// working production code — it is the unbuilt half, and the laboratory is a
// reasonable place to find out what building it costs.
//
// The shape below is the verbatim live response recorded in that outbox,
// committed as data/pick-2026-07-07.json. Read its `_provenance` block before
// trusting it: it was transcribed from a document, not fetched here, because
// this sandbox has no route to the relay. scripts/pick-live-check.mjs fetches
// the real route from CI, which does.

// ---------------------------------------------------------------------------
// The rank, sealed
// ---------------------------------------------------------------------------

/// A pick's ordering value. Comparable, never printable.
///
/// `score` is a sum over independent boolean dimensions — the live response
/// shows 3 reasons scoring 3.5 and 2 reasons scoring 3. That makes it a
/// composite, and ADR-002 PROHIBITED #3 — displaying a raw composite number to
/// the user, severity CRITICAL — is the prohibition the 2026-07-07 push/pull
/// re-analysis explicitly did NOT relax.
///
/// FIELD's own Scout's Pick architecture doc states the same constraint from
/// the patent side: "`_rankSignal()` is for SORT ORDER only. The ranking scores
/// are NOT summed or compared to a threshold for qualification."
///
/// Note what is and is not claimed. No ADR-002 clause names the *pick* score
/// specifically; this applies the drama precedent by analogy, because the two
/// values have the same shape and the same failure mode. If that analogy is
/// wrong it is wrong in the safe direction — the number is withheld, and
/// nothing downstream is misled.
///
/// So, unlike `SealedDrama`, there is deliberately **no formatter and no
/// amnesty zone**. `formatDramaPeak` exists because ADR-002 Defense 4 grants a
/// documented post-game exemption. No such exemption is recorded for the pick,
/// and inventing one to make a UI nicer is exactly the move the amnesty gate
/// was built to prevent. Ordering is exposed; the number never becomes a
/// string.
type SealedRank = private SealedRank of float

/// Ordering only. The float is never returned, so a caller can sort by rank and
/// cannot render it.
let compareRank (SealedRank a) (SealedRank b) = compare b a

/// Whether two entries are level. This is a real question about the live data,
/// not a convenience: three of the five ranked entries scored 3.5.
let rankEquals (SealedRank a) (SealedRank b) = a = b

// ---------------------------------------------------------------------------
// One ranked entry
// ---------------------------------------------------------------------------

type PickEntry =
    { GameId: string
      Sport: Sport
      Home: string
      Away: string
      Rank: SealedRank
      /// The boolean dimensions that qualified the game — "tight line (1.5)",
      /// "prime time", "national broadcast". These ARE displayable: each is a
      /// single-dimension statement, not a composite, and production already
      /// surfaces reasons. Showing the evidence while withholding the sum is
      /// the whole point of the ADR-002 shape.
      Reasons: string list }

/// Is the leader actually alone at the top?
///
/// The live 2026-07-07 response ranks five games and the top THREE all score
/// 3.5. Production takes `scored[0]` after a descending sort, so which of the
/// three becomes "the pick" is decided by sort stability over the input order —
/// not by anything editorial.
///
/// That is a real property of the real data, so it is a type rather than a
/// footnote. A UI that says "tonight's pick" over a three-way tie is making a
/// claim the data does not support, and this makes the caller handle it.
type Leadership =
    | Unrivalled
    /// Includes the leader itself, so `SharedBy 3` means three level at the top.
    | SharedBy of contenders: int

type PickBoard =
    { Leader: PickEntry
      /// Everything after the leader, in rank order. May be empty.
      Chasers: PickEntry list
      Leadership: Leadership
      /// The AI-written recommendation line. Present for the #1 game only —
      /// the production outbox verified that ranked[1..4] carry no brief and
      /// that a five-entry list does not cost five AI calls. That is the
      /// O(1) newspaper rule holding, and it is worth not breaking here.
      Brief: string option }

/// What the pick section actually said tonight.
///
/// Three genuinely different outcomes, and the difference matters: an absent
/// section means the analytics run has not happened, while a pass means it ran
/// and declined. Collapsing those into "no pick" would hide a broken pipeline
/// behind a normal-looking quiet night.
type PickOutcome =
    | NoPickSection
    | Passed of reason: string
    | Picked of PickBoard

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

let private entryDecoder : Decoder<PickEntry> =
    Decode.object (fun get ->
        { GameId = get.Optional.Field "game_id" Decode.string |> Option.defaultValue ""
          Sport = get.Optional.Field "sport" Decode.string
                  |> Option.map sportOfString
                  |> Option.defaultValue (Sport.Unrecognised "")
          Home = get.Optional.Field "home" Decode.string |> Option.defaultValue "—"
          Away = get.Optional.Field "away" Decode.string |> Option.defaultValue "—"
          Rank = get.Optional.Field "score" Decode.float
                 |> Option.defaultValue 0.0
                 |> SealedRank
          Reasons = get.Optional.Field "reasons" (Decode.list Decode.string)
                    |> Option.defaultValue [] })

/// How many entries share the top rank.
let private leadershipOf (entries: PickEntry list) =
    match entries with
    | [] | [ _ ] -> Unrivalled
    | leader :: rest ->
        let level = rest |> List.filter (fun e -> rankEquals e.Rank leader.Rank) |> List.length
        if level = 0 then Unrivalled else SharedBy(level + 1)

let pickDecoder : Decoder<PickOutcome> =
    Decode.object (fun get ->
        // The pass branch is identified by `type: "pass"`. Checked before
        // anything else, because a passed response still carries a `reason`
        // and no ranked list, and reading it as a pick would produce an empty
        // board rather than an honest "no pick tonight".
        match get.Optional.Field "type" Decode.string with
        | Some "pass" ->
            Passed(get.Optional.Field "reason" Decode.string
                   |> Option.defaultValue "no reason given")
        | _ ->
            let ranked =
                get.Optional.Field "ranked" (Decode.list entryDecoder)
                |> Option.defaultValue []
            match ranked with
            | [] ->
                // A pick object with no ranked list. The relay change that
                // added `ranked` post-dates the pick feature, so an older
                // stored bundle can legitimately lack it — that is a missing
                // section, not a pass.
                NoPickSection
            | entries ->
                // Sorted here rather than trusted. The response arrived sorted,
                // but "arrived sorted" is an observation about one response.
                let ordered = entries |> List.sortWith (fun a b -> compareRank a.Rank b.Rank)
                Picked
                    { Leader = List.head ordered
                      Chasers = List.tail ordered
                      Leadership = leadershipOf ordered
                      Brief = get.Optional.Field "brief" Decode.string })

/// Decode the `pick` field of a newspaper bundle. An absent field is
/// `NoPickSection`, which is why this takes the whole bundle.
let bundlePickDecoder : Decoder<PickOutcome> =
    Decode.object (fun get ->
        get.Optional.Field "pick" pickDecoder |> Option.defaultValue NoPickSection)

// ---------------------------------------------------------------------------
// Display helpers — everything the UI is allowed to say
// ---------------------------------------------------------------------------

let entryMatchup (entry: PickEntry) = matchupText entry.Sport entry.Home entry.Away

/// Names the tie instead of hiding it.
let leadershipNote (leadership: Leadership) =
    match leadership with
    | Unrivalled -> None
    | SharedBy n -> Some(sprintf "level with %d others on the same signals" (n - 1))

/// Decode a whole newspaper bundle. Mirrors `Desk.decodePayload`.
let decodeBundle (json: string) : Result<PickOutcome, string> =
    Decode.fromString bundlePickDecoder json

/// Decode a bare `pick` object, which is how the committed fixture is stored.
let decodePick (json: string) : Result<PickOutcome, string> =
    Decode.fromString pickDecoder json
