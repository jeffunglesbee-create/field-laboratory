module Desk

open System
open Thoth.Json
open Units

// Decoders for the real /context/date/<date> payload served by field-relay-nba.
// Every shape here was observed on a live response, not inferred from a schema.
// A verbatim capture lives in data/context-2026-05-15.json.

/// `went_to_ot` arrives as 0, 1, or null. It is an integer standing in for a
/// tri-state, where null means "not known yet" rather than "no" — a game still
/// in progress has not not-gone-to-overtime. Modelled as three real cases so
/// the "unknown" branch cannot be silently treated as `false`.
type OvertimeStatus =
    | RegulationOnly
    | WentToOvertime
    | OvertimeUnknown

/// A field that the relay serves as a *string containing JSON* rather than as
/// JSON. Three real fields do this: drama_arc, opening_odds, closing_odds.
///
/// The inner failure is kept as data rather than thrown, so one malformed
/// odds blob does not take the whole game — and therefore the whole
/// scoreboard — down with it. `NotPresent` is a real null, distinct from
/// `Malformed`, which is a present-but-broken value worth reporting.
type Nested<'T> =
    | NotPresent
    | Decoded of 'T
    | Malformed of string

type Odds =
    { Source: string
      MoneylineHome: int option
      MoneylineAway: int option }

/// A drama score, sealed at decode time so the raw number cannot leave this
/// module.
///
/// FIELD's ADR-002 classifies "raw composite drama number displayed to user" as
/// a bright-line violation, severity CRITICAL, explicitly including values
/// computed client-side: the number itself IS the interest level the RUWT
/// patents claim. Production has had to walk this back at least four times
/// (renderAmbientPanel's "FIRE 87", updatePinWidget's threshold icon,
/// getOTWMomentum's drama delta, _otwGetLiveTier's T3/T4 selection).
///
/// The union case is private, so outside `Desk` this value can be passed around
/// but never read, formatted, compared, or thresholded. That is deliberately
/// stronger than the display gate alone requires, and it is the second ADR-002
/// axis rather than the first — see the note on `AmnestyZone` below.
type SealedDrama = private SealedDrama of float<drama>

type Game =
    { Id: string
      Sport: string
      League: string
      Date: string
      Home: string
      Away: string
      HomeScore: int option
      AwayScore: int option
      Venue: string option
      Streams: string option
      StartTime: DateTimeOffset option
      RawStartTime: string option
      DramaPeak: SealedDrama option
      DramaArc: Nested<int list>
      OpeningOdds: Nested<Odds>
      Overtime: OvertimeStatus
      EspnEventId: string option
      FinalizedAt: string option }

type DeskPayload =
    { Ok: bool
      Date: string
      Regular: Game list
      Postseason: Game list }

// ---------------------------------------------------------------------------
// The hazards
// ---------------------------------------------------------------------------

/// Decodes a field whose value is a JSON *string* that itself contains JSON.
///
/// This is the case TypeScript structurally cannot help with: `drama_arc:
/// string` is a completely accurate type annotation that tells you nothing
/// about whether the thing inside parses, or what shape it has when it does.
/// Absence has THREE real representations in this payload, not two. Found by
/// the drift sentinel on its first live run against 36 games:
///
///   1. JSON null                  -> the field is absent
///   2. "[15,15,36,53]"            -> a real value
///   3. "null"  (a *string*        -> also absent, and the one that was missed
///      containing the literal
///      null)
///
/// Variant 3 produced `Error at: $ Expecting a list but instead got: null` on a
/// real EFL Cup game. It means "no arc", exactly like variant 1, so reporting it
/// as corruption is a false positive that would have kept the sentinel red
/// forever over a benign, stable shape.
///
/// The nullness test goes through the JSON decoder rather than comparing the
/// raw string to "null", so whitespace and quoting are handled properly. The
/// narrowness matters: anything that is not genuinely null still surfaces as
/// Malformed, which is what keeps the sentinel's teeth.
let nestedJson (inner: Decoder<'T>) : Decoder<Nested<'T>> =
    Decode.oneOf [
        Decode.nil NotPresent
        Decode.string
        |> Decode.map (fun raw ->
            match Decode.fromString (Decode.nil ()) raw with
            | Ok () -> NotPresent
            | Error _ ->
                match Decode.fromString inner raw with
                | Ok value -> Decoded value
                | Error err -> Malformed err)
    ]

/// `start_time` is ISO-8601 with **no seconds component** — "2026-08-09T16:15Z",
/// not "2026-08-09T16:15:00Z". Already recorded in the FIELD codex as a real
/// client-side parsing risk, so it is parsed explicitly and the raw string is
/// retained alongside the parsed value rather than discarded.
let parseStartTime (raw: string) : DateTimeOffset option =
    match DateTimeOffset.TryParse(raw, Globalization.CultureInfo.InvariantCulture,
                                  Globalization.DateTimeStyles.AssumeUniversal
                                  ||| Globalization.DateTimeStyles.AdjustToUniversal) with
    | true, value -> Some value
    | _ -> None

let overtimeDecoder : Decoder<OvertimeStatus> =
    Decode.oneOf [
        Decode.nil OvertimeUnknown
        Decode.int
        |> Decode.map (function
            | 0 -> RegulationOnly
            | 1 -> WentToOvertime
            | _ -> OvertimeUnknown)
    ]

let oddsDecoder : Decoder<Odds> =
    Decode.object (fun get ->
        { Source = get.Optional.Field "source" Decode.string |> Option.defaultValue "unknown"
          MoneylineHome = get.Optional.At [ "moneyline"; "home" ] Decode.int
          MoneylineAway = get.Optional.At [ "moneyline"; "away" ] Decode.int })

let gameDecoder : Decoder<Game> =
    Decode.object (fun get ->
        let rawStart = get.Optional.Field "start_time" Decode.string
        { Id = get.Required.Field "id" Decode.string
          Sport = get.Required.Field "sport" Decode.string
          League = get.Optional.Field "league" Decode.string |> Option.defaultValue ""
          Date = get.Optional.Field "date" Decode.string |> Option.defaultValue ""
          Home = get.Required.Field "home" Decode.string
          Away = get.Required.Field "away" Decode.string
          // Null pre-game, and null is NOT zero. A 0-0 game that has started and
          // a game that has not started are different things on a scoreboard.
          HomeScore = get.Optional.Field "home_score" Decode.int
          AwayScore = get.Optional.Field "away_score" Decode.int
          Venue = get.Optional.Field "venue" Decode.string
          Streams = get.Optional.Field "streams" Decode.string
          StartTime = rawStart |> Option.bind parseStartTime
          RawStartTime = rawStart
          // Sealed at the boundary, not at the render site. The raw float exists
          // for exactly one expression and is never stored unwrapped, so there
          // is no point downstream where an unsealed drama number is in scope.
          DramaPeak =
            get.Optional.Field "drama_peak" Decode.float
            |> Option.map (fun v -> SealedDrama(v * 1.0<drama>))
          DramaArc = get.Optional.Field "drama_arc" (nestedJson (Decode.list Decode.int))
                     |> Option.defaultValue NotPresent
          OpeningOdds = get.Optional.Field "opening_odds" (nestedJson oddsDecoder)
                        |> Option.defaultValue NotPresent
          Overtime = get.Optional.Field "went_to_ot" overtimeDecoder
                     |> Option.defaultValue OvertimeUnknown
          EspnEventId = get.Optional.Field "espn_event_id" Decode.string
          FinalizedAt = get.Optional.Field "finalized_at" Decode.string })

let payloadDecoder : Decoder<DeskPayload> =
    Decode.object (fun get ->
        { Ok = get.Optional.Field "ok" Decode.bool |> Option.defaultValue false
          Date = get.Optional.Field "date" Decode.string |> Option.defaultValue ""
          Regular = get.Optional.At [ "games"; "regular" ] (Decode.list gameDecoder)
                    |> Option.defaultValue []
          Postseason = get.Optional.At [ "games"; "postseason" ] (Decode.list gameDecoder)
                       |> Option.defaultValue [] })

let decodePayload (json: string) : Result<DeskPayload, string> =
    Decode.fromString payloadDecoder json

// ---------------------------------------------------------------------------
// Derived display state
// ---------------------------------------------------------------------------

/// A game is one of these. Making it a real union means the renderer cannot
/// forget a case — the compiler enforces exhaustiveness.
type GameState =
    | Scheduled
    | InProgress of home: int * away: int
    | Final of home: int * away: int * overtime: bool

/// Today in UTC, as the relay formats dates. ISO-8601 dates compare correctly
/// as plain strings, so asking "is this game's date already past" needs no date
/// parsing at all. Built from parts rather than a format string so it does not
/// depend on Fable's ToString format support.
///
/// Public because Program.fs builds the live /context/date URL from it, so the
/// page and the state inference cannot disagree about which day "today" is.
let todayUtc () =
    let n = System.DateTime.UtcNow
    sprintf "%04d-%02d-%02d" n.Year n.Month n.Day

let gameState (g: Game) : GameState =
    match g.HomeScore, g.AwayScore with
    | Some h, Some a ->
        // `finalized_at` is NOT a reliable "this game is over" signal, and
        // trusting it alone was a real bug visible on the deployed page: AFL
        // games from 15 May rendered as "In progress" in August.
        //
        // Measured cause, not guessed. The relay has two ingest paths and only
        // one sets the field:
        //   live ingest  — MLB 2026-08-09, created_at same day, finalized_at SET
        //   backfill     — AFL 2026-05-15/16, created_at 2026-07-03, ALWAYS null
        // Confirmed across every AFL row on both dates probed.
        //
        // So the date does the work the missing field cannot: a game whose date
        // has already passed is over, whatever the relay recorded. The
        // finalized_at check is kept because it is the stronger signal when
        // present — it settles a game that finished earlier *today*, which the
        // date comparison deliberately will not.
        let datePassed = g.Date <> "" && g.Date < todayUtc ()
        if g.FinalizedAt.IsSome || datePassed then
            Final(h, a, g.Overtime = WentToOvertime)
        else
            InProgress(h, a)
    | _ -> Scheduled

// ---------------------------------------------------------------------------
// ADR-002 amnesty gate
// ---------------------------------------------------------------------------

/// Proof that the caller is in the post-game amnesty zone.
///
/// ADR-002's Defense 4 is what permits displaying a raw drama number at all,
/// and it covers only code that *provably* runs post-game. The amnesty CC-CMD
/// states the required shape directly:
///
///   "Any function that displays the raw arc number must be a dedicated
///    function with no live-state call site, not a shared live+post function
///    with a runtime conditional."
///
/// In JavaScript that is a review obligation, upheld by a design doc, a manual
/// `call-graph.js` run, and an outbox note asking the next session to re-check.
/// Production's own audit note is blunt about how well text-matching works
/// here: "string-search RUWT audits are not reliable, only reading the actual
/// composite-value flow into DOM catches this class of bug."
///
/// A data flow cannot be grepped. It can be typed. The case below is private,
/// so `amnestyZone` is the only source of a value of this type, and it hands
/// one out for `Final` alone — which makes "no live-state call site" a
/// compile error rather than an audit finding.
type AmnestyZone = private | AmnestyZone

/// The only way to obtain the witness.
let amnestyZone (state: GameState) : AmnestyZone option =
    match state with
    | Final _ -> Some AmnestyZone
    // Named explicitly rather than wildcarded: a future fourth GameState case
    // should fail to compile here and force a decision, not default into
    // whichever branch happens to be the wildcard.
    | Scheduled -> None
    | InProgress _ -> None

/// The only way a drama score becomes a string anywhere in this program.
///
/// Note what this does and does not cover. It is the *display* gate — ADR-002
/// PROHIBITED #3, severity CRITICAL. It is NOT the push gate: the 2026-07-07
/// push/pull re-analysis corrected Rules A/B/C/E so that derived drama state
/// may be computed, stored, and served on pull, and explicitly recorded that
/// this "does NOT touch the separate, still-fully-enforced prohibition on
/// displaying a raw composite number to the user."
///
/// The two defenses are independent, and the amnesty CC-CMD names the exact
/// residual risk: "a *later* session reusing this same arc-score data as a push
/// trigger without re-checking this gate." Sealing the value is what addresses
/// that second axis — an unwrapped drama float never escapes this module, so no
/// future notification path can be handed one without editing this file.
let formatDramaPeak (_zone: AmnestyZone) (SealedDrama peak) : string =
    sprintf "%.0f" (float peak)
