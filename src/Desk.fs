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

/// How a sport names a fixture.
///
/// Not cosmetic. FIELD's Rule 50 (SPORT-DISPLAY-A) lists home/away order as the
/// first field of the sport registry precisely because it is sport-specific, and
/// this laboratory got it wrong: every card rendered "%s @ %s" away home, the
/// American convention, including AFL — so a Sydney home game rendered as
/// "Collingwood @ Sydney". Nothing caught it, because a string sport carries no
/// convention with it.
type Matchup =
    /// "Away @ Home". NFL, NBA, MLB, NHL.
    | AwayAtHome
    /// "Home v Away". AFL, and association football.
    | HomeVersusAway
    /// The sport is not modelled, so its convention is genuinely unknown.
    /// Rendered home-first with a neutral separator and flagged in the UI —
    /// guessing at a convention is how the bug above happened.
    | UnknownConvention

/// The sports this laboratory models.
///
/// Production keeps sport identity in at least five separate string-keyed maps
/// (`SPORT_COLORS`, `SPORT_ICONS`, `SPORT_CHIP_LABELS`, `SPORT_META`,
/// `ESPN_SPORTS` — all confirmed present in its code map), and Rule 50 exists to
/// unify them into one `SPORT_DISPLAY_RULES` registry. That rule has been
/// "Specced, not yet built" for months; `SPORT_DISPLAY_RULES` is absent from the
/// real source. Rules 51, 52 and 53 are the same shape and equally unbuilt.
///
/// `Unrecognised` is NOT a fallback. It is the same device as `Nested.Malformed`
/// — a real state, rendered visibly and reported by the drift sentinel, so an
/// unmodelled sport shows up as an alarm within a day rather than being quietly
/// absorbed. The fix when it fires is to add the case, which the compiler then
/// forces through every function in the registry.
[<RequireQualifiedAccess>]
type Sport =
    | AFL
    | MLB
    | Unrecognised of raw: string

/// Everything the renderer is allowed to know about a sport. One record, one
/// exhaustive match, so "added a sport, forgot a map" is a compile error rather
/// than five maps quietly disagreeing.
type SportMeta =
    { Label: string
      Matchup: Matchup
      /// Rule 50 names `isSoccer` explicitly, and lists `sportName.includes("MLS")`
      /// among the prohibited patterns it exists to eliminate.
      IsSoccer: bool
      /// False only for `Unrecognised`. Surfaced in the UI so an unmodelled
      /// sport is visible rather than silently rendered under a guess.
      Modelled: bool }

/// THE registry. Adding a case to `Sport` without adding it here does not
/// compile — see docs/SPORT-PROOF.md for the compiler refusing exactly that.
let sportMeta (sport: Sport) : SportMeta =
    match sport with
    | Sport.AFL -> { Label = "AFL"; Matchup = HomeVersusAway; IsSoccer = false; Modelled = true }
    | Sport.MLB -> { Label = "MLB"; Matchup = AwayAtHome; IsSoccer = false; Modelled = true }
    | Sport.Unrecognised raw ->
        { Label = raw; Matchup = UnknownConvention; IsSoccer = false; Modelled = false }

/// The only place a sport string becomes a `Sport`.
let sportOfString (raw: string) : Sport =
    match raw with
    | "AFL" -> Sport.AFL
    | "MLB" -> Sport.MLB
    | other -> Sport.Unrecognised other

/// Orders a home/away pair the way the sport names them.
///
/// Rule 50 lists "score format" in the same registry entry as home/away order,
/// and this is why: the two are one decision. Fixing the matchup text alone
/// produced `Sydney v Collingwood  75–81` where 75 was Collingwood's — names in
/// one order, numbers in the other. Internally consistent before the fix and
/// transposed after it, which is worse than either. Both now read from here.
let orderByMatchup (sport: Sport) (home: 'a) (away: 'a) : 'a * 'a =
    match (sportMeta sport).Matchup with
    | AwayAtHome -> away, home
    | HomeVersusAway
    | UnknownConvention -> home, away

/// Renders a fixture in its sport's own convention.
let matchupText (sport: Sport) (home: string) (away: string) =
    let first, second = orderByMatchup sport home away
    match (sportMeta sport).Matchup with
    | AwayAtHome -> sprintf "%s @ %s" first second
    | HomeVersusAway -> sprintf "%s v %s" first second
    // Home first, neutral separator. Not a guess at the convention — a refusal
    // to make one.
    | UnknownConvention -> sprintf "%s vs %s" first second

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

/// The drama arc: the series of composite drama scores the peak is drawn from.
///
/// Sealed for the same reason as the peak, and it is easy to miss why. The peak
/// is obviously "the drama number"; the arc looks like a chart input. But it is
/// a list of composite drama scores, and rendering any element of it is the
/// same bright-line violation as rendering the peak — `[15,15,36,53]` on a live
/// card is four raw interest levels, not one.
///
/// The first version of this gate sealed the peak alone and left the arc as
/// `int list`, which left the hole open while the proof doc claimed it was
/// closed.
type SealedArc = private SealedArc of int list

/// Number of samples in the arc. Deliberately NOT gated: a count of
/// observations is a factual property of the data, not an interest level, so it
/// carries none of the ADR-002 weight the values themselves do.
let arcLength (SealedArc points) = List.length points

type Game =
    { Id: string
      Sport: Sport
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
      DramaArc: Nested<SealedArc>
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
          Sport = get.Required.Field "sport" Decode.string |> sportOfString
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
          DramaArc = get.Optional.Field "drama_arc" (nestedJson (Decode.list Decode.int |> Decode.map SealedArc))
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
