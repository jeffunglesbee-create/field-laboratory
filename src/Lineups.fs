module Lineups

open Thoth.Json

// A PREDICTED starting XI, and the six other things the same request can return.
//
// Commissioned by field-relay-nba's
// docs/CC-CMD-2026-10-11-predicted-xi-render-decision.md, whose Repo line reads
// "jubilant-bassoon or field-laboratory — the decision is which". It is this
// repository, and the reason is recorded here rather than in a document,
// because the document asked for it "beside the code".
//
// WHY NOT THE CLIENT. jubilant-bassoon already renders a Lineups section — it
// reads `plData.fixture.teamLists` from the Premier League's own feed, which is
// published about an hour before kickoff and is a confirmed team sheet by
// definition. Its rows are `#shirt POS Name` and carry no qualifier of any
// kind, and every non-answer collapses to the same outcome: `if
// (!starters.length) continue;` for an empty list, `anchor.remove()` for a
// failed fetch. So a BSD predicted XI placed there would render in the same
// box, in the same row format, from a different vendor, distinguished by
// nothing — which is the document's own central claim word for word, and is a
// working renderer that would have to be rewritten rather than a gap to fill.
//
// WHY HERE. Three things this feature needs already exist in this repository:
// `Schedule.ProbablePitcher` is a private single-case union specifically so a
// blank row cannot be rendered where a name should be; `Pick.SealedRank` is a
// number that is usable and deliberately not printable; and the page renders
// from committed captures pinned by `?data=`, which is the only way a screenshot
// of a predicted sheet AND a confirmed one can be taken on the same afternoon.
//
// Nothing is built in jubilant-bassoon. The document says "do not build in
// both" and the client is not touched.
//
// ---------------------------------------------------------------------------
// WHAT WAS MEASURED, before any of this was designed
// ---------------------------------------------------------------------------
//
// Two real captures, `data/lineups-predicted.json` (event 220230) and
// `data/lineups-confirmed.json` (event 5327), written by
// `scripts/capture-lineups-fixture.mjs` from the deployed relay. Neither is
// hand-made; see data/PROVENANCE.md.
//
//                        predicted              confirmed
//   lineup_status         "predicted"            "confirmed"
//   beta                  true                   false
//   confidence            0.791 / 0.85           null / null
//   ai_score              22 of 22 populated      0 of 22 populated
//                         0.411 – 0.87            null on every player
//   captain               absent                  present
//   unavailable_players   2 players, 2 reasons    5 players, 5 reasons
//
// FOUR SIGNALS AGREE, which is worth stating because an earlier reading of this
// payload got it backwards. A probe that recorded the payload's KEY PATHS showed
// `confidence` and `ai_score` present on the confirmed sheet, and "present" was
// read as "populated" — the conclusion being that neither could tell the two
// states apart. The values say the opposite: every one of them is null. The key
// existing is not the field being filled, which is this project's Rule 99 and
// the reason the bytes were read rather than the key list.
//
// `unavailable_players` was misread the same way and in the other direction. The
// relay's probe reported zero unavailable players for the finished events, and
// that was taken for an absence; the probe computes that figure from pre-match
// bodies only, and the finished run had no pre-match events. The capture carries
// five, each with a reason.

// ---------------------------------------------------------------------------
// The score, sealed
// ---------------------------------------------------------------------------

/// A model number the vendor publishes without saying what it measures.
///
/// `ai_score` is real, it is populated on every player of a predicted sheet, and
/// it spans 0.411 to 0.87 in the capture. `confidence` is 0.791 and 0.85. Both
/// are null on the confirmed sheet. So they discriminate, which makes them
/// useful and makes rendering them tempting.
///
/// The commissioning document says "showing a number without saying what it
/// ranges over is its own defect". The observed interval can be stated; what the
/// number MEASURES cannot. The vendor does not say whether 0.87 is a likelihood
/// of starting, a rating of form, or the model's confidence in its own guess,
/// and those three would be read very differently by someone looking at a team
/// sheet. A number whose units are unknown is not a fact about the player.
///
/// So PRESENCE escapes and the value does not. The same seal `Pick.SealedRank`
/// carries, for the same reason and with the same deliberate absence of a
/// formatter: there is no way to turn one of these into a string, so "do not
/// print the score" is a type error rather than a review note.
type SealedScore = private SealedScore of float

/// Whether the vendor supplied a number here at all. The ONLY thing a
/// `SealedScore` tells anyone, and the thing the corroboration check below is
/// built from.
let isScored (s: SealedScore option) = Option.isSome s

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/// A player's name on a sheet.
///
/// Private, so nothing can construct one from an empty string and render a blank
/// row where a player should be. `Schedule.ProbablePitcher` carries this seal
/// for that exact reason and this is the same hazard eleven times a side: a
/// sheet with a missing name renders as a team sheet with a hole in it, which
/// looks like a player who has not been named rather than like a decoder that
/// dropped one.
type PlayerName = private PlayerName of string

/// The only way a name becomes a string.
let playerName (PlayerName n) = n

/// A name, or nothing. Whitespace is not a name: BSD's `name` is a free-text
/// field and `" "` would otherwise pass a `<> ""` test and render as a row with
/// a blank where the player goes.
let tryPlayerName (raw: string) =
    if System.String.IsNullOrWhiteSpace raw then None else Some(PlayerName(raw.Trim()))

// ---------------------------------------------------------------------------
// What the vendor says the sheet IS
// ---------------------------------------------------------------------------

/// The two answers. RequireQualified so a bare `Predicted` cannot drift in from
/// another module's namesake, the discipline `Sport` and `Palette.Semantic`
/// already use.
[<RequireQualifiedAccess>]
type Standing =
    /// The lineup as submitted. Nothing about it is a guess.
    | Confirmed
    /// Model output. Every name on the sheet is the vendor's prediction.
    | Predicted

/// Both, for exhaustive iteration in checks.
let allStandings = [ Standing.Confirmed; Standing.Predicted ]

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

type Player =
    { Name: PlayerName
      /// BSD's single-letter code — "G", "D", "M", "F". Optional because the
      /// payload may omit it, and a row with no position is still a real player.
      Position: string option
      Shirt: int option
      /// Populated on a predicted sheet, null on a confirmed one. Never printed.
      Score: SealedScore option }

type SideSheet =
    { Team: string
      /// "4-2-3-1". Optional: a sheet with no formation is still a sheet.
      Formation: string option
      /// The side's own uncertainty, sealed for the reason above.
      Confidence: SealedScore option
      Players: Player list
      Substitutes: Player list }

/// A named player who will not be available, with the vendor's stated reason.
///
/// This is the part a brief can cite, and the reason the document calls it that:
/// a reason is a fact a scorer can check against the row rather than echo from
/// its prompt. 7 of 7 across both captures carry a non-null one ("Broken Toe",
/// "Shoulder Injury", one suspension).
type Unavailable =
    { Who: PlayerName
      Status: string option
      Reason: string option }

// ---------------------------------------------------------------------------
// The answer — SEVEN cases
// ---------------------------------------------------------------------------

/// The outcome of one lineups request.
///
/// SEVEN cases, and the count is not a design preference. The relay distinguishes
/// five `X-Lineup-State` values and four `X-Lineup-Fill` values, and the
/// document's Task 3 names three non-answers — `status-absent`, `served-empty`
/// and `upstream-failed`. There are five. `status-unrecognised:<word>` is the
/// one the document does not name, and a renderer built to the document's three
/// would fall through on it; falling through means drawing the sheet, and
/// drawing a sheet whose kind is a word nobody has seen is the fabrication the
/// whole document exists to prevent.
///
/// THIS IS THE OPPOSITE OF `Desk.Section`'s REASONING, deliberately. That type
/// folds empty and failed into one `EmptyOrFailed` case, and its comment is
/// explicit about why: the wire format cannot tell them apart, so separating
/// them would be "inventing certainty the payload does not carry". Here the wire
/// CAN tell them apart — the relay sends `served-empty` separately from `absent`
/// separately from `null`, and says in its own source that they "must not be
/// smoothed into either". So they are separate cases for the same reason
/// `Section`'s are joined: follow what the payload actually distinguishes.
type Answer =
    /// Players, and the vendor said which kind of sheet this is.
    | Sheet of Standing * home: SideSheet * away: SideSheet
    /// Players, and `lineup_status` is absent, null or empty. The vendor served
    /// a sheet and declined to say whether it is announced. NOT predicted and
    /// NOT confirmed.
    | SheetOfUnstatedKind of home: SideSheet * away: SideSheet
    /// Players, and `lineup_status` is a word this decoder has never seen. The
    /// word is carried so the report can name it rather than say "unknown".
    | SheetOfUnknownKind of status: string * home: SideSheet * away: SideSheet
    /// `lineups` served and empty. Not a 404 and not a team sheet.
    | ServedEmpty
    /// No `lineups` key in the response at all.
    | NotInPayload
    /// `lineups: null` — the vendor named the field and left it unfilled.
    | ExplicitlyNull
    /// The call failed. The lineup state is unknown.
    | UpstreamFailed of detail: string

/// One reply, whole. `Unavailable` travels beside the answer rather than inside
/// it because it is populated in BOTH states and on some of the non-answers, so
/// nesting it in the `Sheet` cases would lose it exactly when a reader most
/// wants it — a failed sheet with a known injury list is more informative than
/// either half alone.
type Reply =
    { Answer: Answer
      UnavailableHome: Unavailable list
      UnavailableAway: Unavailable list
      /// The vendor's own beta flag, as served. `true` on 8 of 8 predicted and
      /// `false` on 3 of 3 confirmed observations.
      Beta: bool option
      UpdatedAt: string option }

// ---------------------------------------------------------------------------
// The treatment — a property of the ROW
// ---------------------------------------------------------------------------

/// What marks one player's row.
///
/// Task 2: "the predicted treatment is not a badge in a corner... make it a
/// property of the row rather than a legend elsewhere on the page."
///
/// So every player row carries its own word, in its own column, eleven times a
/// side. That reads as repetition and it is the point: a row quoted, screenshot,
/// or read aloud on its own keeps the word with it, and a legend in the card's
/// header does not survive being separated from the card. The two sheets then
/// differ on every single line rather than in one corner.
///
/// The colour is the redundant channel, never the primary one — `Semantic.Caution`
/// for `Unannounced`, which is the amber this palette already assigns to
/// "bracket trap / injury". A reader who cannot distinguish amber reads the same
/// word.
type RowMark =
    /// Model output. Every name on this sheet is a prediction.
    | Unannounced
    /// A submitted team sheet.
    | Announced
    /// Served with players, and the vendor did not say which kind. The row says
    /// so rather than picking the more flattering of the two.
    | KindNotStated

/// The mark for an answer's rows — `None` when there are no rows to mark.
///
/// An option rather than a default, because "no rows" and "rows with no mark"
/// are different and a default would make the second the rendering of the first.
let markFor =
    function
    | Sheet(Standing.Predicted, _, _) -> Some Unannounced
    | Sheet(Standing.Confirmed, _, _) -> Some Announced
    | SheetOfUnstatedKind _ -> Some KindNotStated
    | SheetOfUnknownKind _ -> Some KindNotStated
    | ServedEmpty -> None
    | NotInPayload -> None
    | ExplicitlyNull -> None
    | UpstreamFailed _ -> None

/// The word in the row's own column. Lower case: it is a qualifier on the name,
/// not a heading.
let markWord =
    function
    | Unannounced -> "predicted"
    | Announced -> "confirmed"
    | KindNotStated -> "kind not stated"

/// The palette word for a mark. `Quiet` for an announced sheet: a fact needs no
/// accent, and `NoAccent` is not available here because every row carries the
/// column.
let markSemantic =
    function
    | Unannounced -> Palette.Semantic.Caution
    | Announced -> Palette.Semantic.Quiet
    | KindNotStated -> Palette.Semantic.Caution

// ---------------------------------------------------------------------------
// The seven sentences
// ---------------------------------------------------------------------------

/// What the card says about an answer, in one sentence, for every case.
///
/// SEVEN DISTINCT SENTENCES. Task 3's requirement is that the non-answers "must
/// not render as a thin team sheet" and that they are not each other. The
/// strings below are the proof surface for that: `Suite.fs` asserts all seven
/// differ pairwise, so a future edit that makes two of them the same fails the
/// build's own suite rather than passing review.
///
/// None of them is "no lineup announced". That phrase is true of exactly none of
/// these seven outcomes, and it is the thing the relay's own source says must
/// not be said.
/// An upstream value reduced to the characters a TOKEN can have.
///
/// `Pick.passReasonText` takes the harder line for its own field — "Fixed text:
/// none of the relay's sentence survives, because there is no way to know which
/// parts of a free-text field are safe" — and for a free-text REASON that is
/// right. A `lineup_status` is not a sentence: every value anyone has observed
/// is one lowercase word. So the word survives and everything a word cannot
/// contain does not, which is what lets this page NAME the status it refused
/// instead of saying "unknown" and sending the reader back to the network.
///
/// The cap is 24 characters against a longest-observed value of "confirmed".
let safeToken (raw: string) =
    let kept =
        raw
        |> Seq.filter (fun c -> System.Char.IsLetterOrDigit c || c = '-' || c = '_')
        |> Seq.truncate 24
        |> Seq.toArray
        |> System.String
    if kept = "" then None else Some kept

/// WHY THE UPSTREAM DETAIL IS NOT IN ANY SENTENCE.
///
/// The first version of `headline` interpolated `UpstreamFailed`'s detail
/// straight into its prose, and `Suite.fs`'s own "NO headline says \"no lineup
/// announced\"" check failed on its first run — because a detail carrying that
/// phrase was reprinted verbatim as the page's own words. The sentence that
/// promised not to say it said it, through a field it did not control.
///
/// So the sentences are fixed and the detail is a separate diagnostic line. The
/// detail is still reported; it is just not prose the reader will take as the
/// page's claim about the lineup.
let headline =
    function
    | Sheet(Standing.Confirmed, _, _) ->
        "Confirmed team sheet. These are the names as submitted."
    | Sheet(Standing.Predicted, _, _) ->
        "Predicted, not announced. Every name below is the vendor's model output, not a team sheet."
    | SheetOfUnstatedKind _ ->
        "Players were served and the vendor did not say whether this is announced or predicted. It is not safe to read as either."
    | SheetOfUnknownKind(status, _, _) ->
        match safeToken status with
        | Some token ->
            sprintf "Players were served under a status this page has never seen: \"%s\". Treated as neither announced nor predicted." token
        | None ->
            "Players were served under a status this page has never seen and cannot print. Treated as neither announced nor predicted."
    | ServedEmpty ->
        "The vendor answered with an empty sheet. Something was served and it contained no players — which is not the same as nothing being announced."
    | NotInPayload ->
        "The response carried no lineups at all. The question was not answered, and it was not refused either."
    | ExplicitlyNull ->
        "The vendor named the lineups field and left it empty. That is a stated absence, not a missing response."
    | UpstreamFailed _ ->
        "The request failed. The lineup state is unknown, which is not the same as nobody having been named."

/// The failure's own words, for a diagnostic line rather than for prose.
/// `None` for every answer that did not fail, so a view cannot print an empty
/// detail beside a sheet that arrived fine.
let failureDetail =
    function
    | UpstreamFailed detail -> Some detail
    | Sheet _ -> None
    | SheetOfUnstatedKind _ -> None
    | SheetOfUnknownKind _ -> None
    | ServedEmpty -> None
    | NotInPayload -> None
    | ExplicitlyNull -> None

/// Whether an answer carries players to draw. Used so a view cannot reach for
/// sheets that are not there.
let hasPlayers =
    function
    | Sheet _ -> true
    | SheetOfUnstatedKind _ -> true
    | SheetOfUnknownKind _ -> true
    | ServedEmpty -> false
    | NotInPayload -> false
    | ExplicitlyNull -> false
    | UpstreamFailed _ -> false

/// The two sides, when there are two.
let sidesOf =
    function
    | Sheet(_, h, a) -> Some(h, a)
    | SheetOfUnstatedKind(h, a) -> Some(h, a)
    | SheetOfUnknownKind(_, h, a) -> Some(h, a)
    | ServedEmpty -> None
    | NotInPayload -> None
    | ExplicitlyNull -> None
    | UpstreamFailed _ -> None

// ---------------------------------------------------------------------------
// Corroboration
// ---------------------------------------------------------------------------

/// Does the vendor's own numbering agree with the standing it declared?
///
/// Four signals were measured and all four agreed on both captures:
/// `lineup_status`, `beta`, a populated `confidence`, a populated `ai_score`.
/// This reports DISAGREEMENT, and it reports it rather than resolving it: the
/// day a sheet says `confirmed` while carrying a model score on every player is
/// the day something upstream changed, and a renderer that quietly trusted
/// `lineup_status` would draw a confirmed sheet over predicted names.
///
/// It never overrides the standing. `lineup_status` is the vendor's own
/// statement and this page is not in the business of second-guessing it — the
/// output is a note for the reader, not a different sheet.
let disagreements (r: Reply) =
    // A NAME ON BOTH LISTS, which is not about the standing at all and so is
    // checked for every answer that carries sides.
    //
    // MEASURED, in the committed capture rather than imagined:
    // `data/lineups-confirmed.json` names Idan Toklomati in Charlotte FC's
    // STARTING ELEVEN and lists him under `unavailable_players.home` as
    // "injured · Knee Injury". On a CONFIRMED sheet — the kind this page tells
    // the reader is the names as submitted.
    //
    // Both halves were drawn, side by side, and the page said nothing. A reader
    // scanning the eleven and then the injury list below it has to notice the
    // repetition themselves, and the one who does not comes away believing a
    // thing the payload contradicts two inches lower.
    //
    // Reported, never resolved. Which half is wrong is the vendor's question,
    // and dropping either one would be this page inventing an answer to it.
    let bothLists =
        match sidesOf r.Answer with
        | None -> []
        | Some(home, away) ->
            let clash (side: SideSheet) (out: Unavailable list) =
                let named =
                    (side.Players @ side.Substitutes)
                    |> List.map (fun p -> playerName p.Name)
                    |> Set.ofList
                out
                |> List.map (fun u -> playerName u.Who)
                |> List.filter named.Contains
                |> List.map (fun who ->
                    sprintf "%s is named on %s's sheet AND listed unavailable" who side.Team)
            clash home r.UnavailableHome @ clash away r.UnavailableAway

    let standingNotes =
        match r.Answer with
        | Sheet(standing, home, away) ->
            let scoredPlayers =
                [ home; away ]
                |> List.sumBy (fun s -> s.Players |> List.filter (fun p -> isScored p.Score) |> List.length)
            let confidences = [ home; away ] |> List.filter (fun s -> isScored s.Confidence) |> List.length
            [ match standing, r.Beta with
              | Standing.Predicted, Some false -> yield "the sheet says predicted and beta is false"
              | Standing.Confirmed, Some true -> yield "the sheet says confirmed and beta is true"
              | _ -> ()
              match standing, scoredPlayers with
              | Standing.Confirmed, n when n > 0 ->
                  yield sprintf "the sheet says confirmed and %d player(s) still carry a model score" n
              | Standing.Predicted, 0 -> yield "the sheet says predicted and no player carries a model score"
              | _ -> ()
              match standing, confidences with
              | Standing.Confirmed, n when n > 0 ->
                  yield sprintf "the sheet says confirmed and %d side(s) still carry a confidence" n
              | _ -> () ]
        | _ -> []

    standingNotes @ bothLists

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------
//
// THE STATE COMES FROM THE BODY, NOT THE HEADERS, and that is a deliberate
// choice with a cost. The relay sends `X-Lineup-State` and `X-Lineup-Fill`
// precisely so a caller never has to infer them — but `?data=` pins this page to
// a file in data/, and a file has no headers. A decoder that read the headers
// could not render a committed capture at all, so the live path and the fixture
// path would be two different decoders and only one of them would ever be
// exercised by a check.
//
// So the body is the contract here. `scripts/capture-lineups-fixture.mjs`
// asserts on every capture that the relay's headers and these same values
// derived from the body agree, and REFUSES to write the fixture if they do not —
// which is the one command that can refute this paragraph.

/// A sealed score, or nothing. `Decode.nil` first so an explicit null is a
/// clean absence rather than a decode failure — the confirmed capture sends
/// `ai_score: null` on all 22 players, so this branch is the common case there.
let private scoreDecoder : Decoder<SealedScore option> =
    Decode.oneOf [ Decode.nil None; Decode.float |> Decode.map (SealedScore >> Some) ]

let private optionalString (field: string) : Decoder<string option> =
    Decode.oneOf [ Decode.nil None; Decode.string |> Decode.map Some ]
    |> fun d -> Decode.oneOf [ Decode.field field d; Decode.succeed None ]

let private optionalInt (field: string) : Decoder<int option> =
    Decode.oneOf [ Decode.nil None; Decode.int |> Decode.map Some ]
    |> fun d -> Decode.oneOf [ Decode.field field d; Decode.succeed None ]

/// One player, or nothing.
///
/// A row whose `name` is absent, null or blank yields `None` and is DROPPED
/// rather than rendered. That is the `ProbablePitcher` discipline: a nameless
/// row on a team sheet reads as a player who has not been announced, which is a
/// claim the payload did not make. The count of what was dropped is recoverable
/// — `playersSeen` below — so a silently shortened sheet is visible rather than
/// merely shorter.
let private playerDecoder : Decoder<Player option> =
    Decode.object (fun get ->
        let raw =
            get.Optional.Field "name" Decode.string
            |> Option.orElse (get.Optional.Field "short_name" Decode.string)
            |> Option.defaultValue ""
        match tryPlayerName raw with
        | None -> None
        | Some n ->
            Some
                { Name = n
                  Position = get.Optional.Field "position" Decode.string
                  Shirt = get.Optional.Field "jersey_number" Decode.int
                  Score =
                    get.Optional.Field "ai_score" scoreDecoder |> Option.defaultValue None })

/// A list of players, with the unnamed ones dropped. An element that is not an
/// object contributes nothing rather than failing the decode — the goal is to
/// render what arrived, and one malformed substitute must not blank a sheet.
let private playerListDecoder : Decoder<Player list> =
    Decode.oneOf
        [ Decode.list (Decode.oneOf [ playerDecoder; Decode.succeed None ])
          |> Decode.map (List.choose id)
          Decode.succeed [] ]

let private sideDecoder : Decoder<SideSheet> =
    Decode.object (fun get ->
        { Team = get.Optional.Field "team_name" Decode.string |> Option.defaultValue "—"
          Formation = get.Optional.Field "formation" Decode.string
          Confidence = get.Optional.Field "confidence" scoreDecoder |> Option.defaultValue None
          Players = get.Optional.Field "players" playerListDecoder |> Option.defaultValue []
          Substitutes = get.Optional.Field "substitutes" playerListDecoder |> Option.defaultValue [] })

let private unavailableDecoder : Decoder<Unavailable option> =
    Decode.object (fun get ->
        let raw =
            get.Optional.Field "name" Decode.string
            |> Option.orElse (get.Optional.Field "short_name" Decode.string)
            |> Option.defaultValue ""
        match tryPlayerName raw with
        | None -> None
        | Some n ->
            Some
                { Who = n
                  Status = get.Optional.Field "status" Decode.string
                  Reason = get.Optional.Field "reason" Decode.string })

let private unavailableListDecoder : Decoder<Unavailable list> =
    Decode.oneOf
        [ Decode.list (Decode.oneOf [ unavailableDecoder; Decode.succeed None ])
          |> Decode.map (List.choose id)
          Decode.succeed [] ]

/// How full the `lineups` field is. The four values the relay distinguishes.
///
/// `Decode.keys` is what separates ABSENT from NULL. `get.Optional.Field`
/// cannot: Thoth returns `None` for a missing field and for an explicit null
/// alike, which is the exact collapse this type exists to avoid.
type private Fill =
    | FillAbsent
    | FillNull
    | FillEmpty
    | FillServed of home: SideSheet * away: SideSheet

let private fillDecoder : Decoder<Fill> =
    Decode.keys
    |> Decode.map List.ofSeq
    |> Decode.andThen (fun keys ->
        if not (List.contains "lineups" keys) then
            Decode.succeed FillAbsent
        else
            Decode.field
                "lineups"
                (Decode.oneOf
                    [ Decode.nil FillNull
                      Decode.keys
                      |> Decode.map List.ofSeq
                      |> Decode.andThen (fun sides ->
                          if List.isEmpty sides then
                              Decode.succeed FillEmpty
                          else
                              // Either side may be missing; the sheet is still
                              // served. A missing side decodes as an empty one
                              // rather than failing the whole reply.
                              let side name =
                                  Decode.oneOf [ Decode.field name sideDecoder
                                                 Decode.succeed
                                                     { Team = "—"
                                                       Formation = None
                                                       Confidence = None
                                                       Players = []
                                                       Substitutes = [] } ]
                              Decode.map2
                                  (fun h a -> FillServed(h, a))
                                  (side "home")
                                  (side "away"))
                      Decode.succeed FillEmpty ]))

let replyDecoder : Decoder<Reply> =
    Decode.object (fun get ->
        let fill = get.Required.Raw fillDecoder
        let status = get.Required.Raw(optionalString "lineup_status")
        let answer =
            match fill with
            | FillAbsent -> NotInPayload
            | FillNull -> ExplicitlyNull
            | FillEmpty -> ServedEmpty
            | FillServed(home, away) ->
                match status with
                | None -> SheetOfUnstatedKind(home, away)
                | Some "" -> SheetOfUnstatedKind(home, away)
                | Some "confirmed" -> Sheet(Standing.Confirmed, home, away)
                | Some "predicted" -> Sheet(Standing.Predicted, home, away)
                | Some other -> SheetOfUnknownKind(other, home, away)
        { Answer = answer
          UnavailableHome =
            get.Optional.Field "unavailable_players" (Decode.field "home" unavailableListDecoder)
            |> Option.defaultValue []
          UnavailableAway =
            get.Optional.Field "unavailable_players" (Decode.field "away" unavailableListDecoder)
            |> Option.defaultValue []
          Beta = get.Required.Raw(Decode.oneOf [ Decode.field "beta" (Decode.oneOf [ Decode.nil None; Decode.bool |> Decode.map Some ]); Decode.succeed None ])
          UpdatedAt = get.Required.Raw(optionalString "updated_at") })

/// A reply from a response body.
///
/// A body that will not parse is `UpstreamFailed`, not an empty sheet. That is
/// the distinction the whole type exists for: unparseable means the state is
/// unknown, and "unknown" rendered as "nobody has been named" is the quiet
/// wrongness this repository keeps finding.
let fromString (json: string) : Reply =
    match Decode.fromString replyDecoder json with
    | Ok reply -> reply
    | Error e ->
        { Answer = UpstreamFailed(sprintf "the response did not decode: %s" e)
          UnavailableHome = []
          UnavailableAway = []
          Beta = None
          UpdatedAt = None }

/// A reply for a fetch that never produced a body.
let unreachable (detail: string) : Reply =
    { Answer = UpstreamFailed detail
      UnavailableHome = []
      UnavailableAway = []
      Beta = None
      UpdatedAt = None }

/// How many players each side carries, for a sheet that has sides. Exposed so a
/// shortened sheet is reportable: eleven is the number a reader expects, and a
/// decoder that dropped one must not be indistinguishable from a vendor that
/// sent ten.
let playersSeen (a: Answer) =
    match sidesOf a with
    | None -> None
    | Some(h, aw) -> Some(List.length h.Players, List.length aw.Players)
