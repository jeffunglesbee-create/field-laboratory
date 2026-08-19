module Desk

open System
open Fable.Core
open Fable.Core.JsInterop
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
/// JSON. FOUR real fields do this: drama_arc, opening_odds, closing_odds — and
/// `tags`, which was missed until the archive spec was read.
///
/// The evidence for `tags` is the relay's own `/archive/tagged/:tag` route:
///
///     SELECT * FROM regular_season_games WHERE tags LIKE ?
///       .bind(`%"${tag}"%`)
///
/// Binding `%"tag"%` — with the quotes inside the pattern — only matches if the
/// column holds a JSON array serialised as text. A native array column would
/// not be queried that way.
///
/// The inner failure is kept as data rather than thrown, so one malformed
/// odds blob does not take the whole game — and therefore the whole
/// scoreboard — down with it. `NotPresent` is a real null, distinct from
/// `Malformed`, which is a present-but-broken value worth reporting.
type Nested<'T> =
    | NotPresent
    | Decoded of 'T
    | Malformed of string

/// A calendar day in FIELD's canonical zone, America/New_York.
///
/// The defect this replaces was a bare `string` date with an implicit zone —
/// the same shape as a signed handicap with an unstated side, and the same
/// class of bug. `todayUtc()` was correct-looking and wrong for four hours a
/// night.
///
/// Two separate questions were being conflated:
///
///   1. What zone does the relay's `date` column use? A property of the data.
///      Measured, not assumed: across a live 18-game slate, 8 games start on a
///      LATER UTC day than their `date` and none start earlier. The date runs
///      behind UTC, never ahead — Western-hemisphere keying, consistent with
///      ET and inconsistent with UTC.
///
///   2. What day is it for the viewer? A property of the person reading the
///      page, who is on the US east coast. No measurement can change that, and
///      treating it as blocked on (1) was over-caution: at 21:00 ET the viewer
///      wants tonight's slate and `todayUtc()` hands them tomorrow's.
///
/// Canonical ET rather than the browser's local zone, deliberately. FIELD's
/// smoke, cron, SW_VERSION and relay day-boundary are all America/New_York, so
/// a browser-local page would disagree with the rest of the system the moment
/// the reader travels.
type FieldDay = private FieldDay of string

/// The FIELD-zone day containing a given instant.
///
/// Takes the instant rather than reading the clock, so it is a pure function
/// and can be tested at fixed points. That is not incidental: the first version
/// read `new Date()` internally, and the only assertion that could reach it
/// compared its output to "today" — which is identical under UTC, under a
/// hardcoded -4, and under the correct rules for twenty hours out of every
/// twenty-four. Both mutations passed 11/11. A guard whose one real assertion
/// is time-dependent, in precisely the window that is hard to reach, is false
/// confidence.
///
/// Via `Intl` with an IANA zone name, not a fixed offset. EST/EDT changes on
/// the second Sunday in March and the first Sunday in November; hand-rolling
/// that is how a date library becomes a bug, and the browser and Node both
/// already carry the rules.
[<Emit("""(() => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date($0));
  const g = t => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
})()""")>]
let private dayInFieldZone (epochMs: float) : string = jsNative

/// The FIELD-zone day for an arbitrary instant. Pure, and therefore testable.
let fieldDayAt (instant: DateTimeOffset) : FieldDay =
    FieldDay(dayInFieldZone (float (instant.ToUnixTimeMilliseconds())))

/// Today in FIELD's zone. The only impure entry point, and a one-liner over
/// `fieldDayAt` so there is nothing here that the fixed-instant tests miss.
let fieldToday () : FieldDay = fieldDayAt DateTimeOffset.UtcNow

/// Lifts a relay date string into the canonical zone.
///
/// This ASSERTS the relay's `date` is a FIELD-zone day, which the measurement
/// above supports for every sport observed with a start time. It is not proven
/// for the AFL: an Australian fixture lands in the small hours UTC either way,
/// so the test cannot discriminate there. Recorded rather than glossed.
let fieldDayOfIso (iso: string) : FieldDay option =
    if iso.Length = 10 && iso.[4] = '-' && iso.[7] = '-' then Some(FieldDay iso) else None

let fieldDayIso (FieldDay iso) = iso

/// Whole-day arithmetic, built from the three integer parts rather than parsed.
/// A bare parse of a date-only string is read in the runtime's LOCAL zone, so
/// stepping a day could drift; integers cannot.
let fieldDayShift (days: int) (FieldDay iso) : FieldDay =
    match iso.Split('-') with
    | [| y; m; d |] ->
        match System.Int32.TryParse y, System.Int32.TryParse m, System.Int32.TryParse d with
        | (true, yy), (true, mm), (true, dd) ->
            let shifted = System.DateTime(yy, mm, dd).AddDays(float days)
            FieldDay(sprintf "%04d-%02d-%02d" shifted.Year shifted.Month shifted.Day)
        | _ -> FieldDay iso
    | _ -> FieldDay iso

/// ISO-8601 days compare correctly as plain strings, and both sides are now
/// known to be in the same zone — which is the whole point of the type.
let fieldDayIsBefore (FieldDay a) (FieldDay b) = a < b

type Odds =
    { Source: string
      MoneylineHome: int option
      MoneylineAway: int option
      /// When this snapshot was taken. Decoded because it is the only way to
      /// check that an "opening" and a "closing" price are actually a sequence
      /// — and in the committed capture, they are not.
      CapturedAt: DateTimeOffset option
      RawCapturedAt: string option
      // The handicap and the total, as the relay nests them. Kept as the raw
      // four numbers here; their *relationships* are derived below, because
      // that is where the shape claims live and the shape is what turned out
      // to be interesting.
      SpreadHome: float option
      SpreadAway: float option
      TotalOver: float option
      TotalUnder: float option }

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
    | MLS
    | WNBA
    | EFLCup
    | NFL
    | CFL
    /// Spanish top-flight association football. The relay labels it "La Liga",
    /// with the space, and the drift sentinel reported it unmodelled from
    /// 2026-08-16.
    | LaLiga
    /// Modelled as a case so it can be DECLARED unmodelled rather than merely
    /// unrecognised — see `Omission` below. Golf itself stays unmodelled.
    | Golf
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
      /// False for anything the desk will not render under a convention.
      /// Surfaced in the UI so an unmodelled sport is visible rather than
      /// silently rendered under a guess.
      Modelled: bool
      /// Why this sport is deliberately NOT modelled, when that is a decision
      /// rather than a gap.
      ///
      /// `Modelled = false` used to mean two different things with nothing to
      /// tell them apart: "nobody has looked at this yet" and "we looked, and
      /// leaving it unmodelled is the correct answer". The drift sentinel
      /// alarms on the first and must not alarm on the second, or it reports
      /// the same permanent finding twice a day forever — and an alarm that can
      /// never be cleared trains people to ignore the next one, which is the
      /// exact reasoning the sentinel's own issue-closing step already uses.
      ///
      /// Same device as `Scouting.venuesWithoutParkFactors` for venues with no
      /// park factors, and `tryUmpire` returning None for umpires production
      /// genuinely has no entry for: naming the known-absent case is what makes
      /// the remaining alarms mean something.
      ///
      /// `Some reason` is a recorded decision. `None` on an unmodelled sport is
      /// a real alarm.
      Omission: string option }

/// THE registry. Adding a case to `Sport` without adding it here does not
/// compile — see docs/SPORT-PROOF.md for the compiler refusing exactly that.
let sportMeta (sport: Sport) : SportMeta =
    match sport with
    | Sport.AFL -> { Label = "AFL"; Matchup = HomeVersusAway; IsSoccer = false; Modelled = true; Omission = None }
    | Sport.MLB -> { Label = "MLB"; Matchup = AwayAtHome; IsSoccer = false; Modelled = true; Omission = None }
    // Association football names the home side first, everywhere. Both of these
    // are `IsSoccer = true`, which is the field Rule 50 names explicitly and
    // whose absence produced `sportName.includes("MLS")` in production.
    | Sport.MLS -> { Label = "MLS"; Matchup = HomeVersusAway; IsSoccer = true; Modelled = true; Omission = None }
    | Sport.EFLCup -> { Label = "EFL Cup"; Matchup = HomeVersusAway; IsSoccer = true; Modelled = true; Omission = None }
    | Sport.WNBA -> { Label = "WNBA"; Matchup = AwayAtHome; IsSoccer = false; Modelled = true; Omission = None }
    // Gridiron, North American convention: the visiting side is named first,
    // "Cowboys at Eagles". Same convention already encoded above for MLB and
    // WNBA, and the basis is stated rather than derived — ESPN is unreachable
    // from this sandbox (HTTP 000 at the proxy), so this is a convention
    // judgement recorded for review, exactly like the soccer entries below it.
    //
    // Added because production has NFL as a first-class sport while laboratory
    // rendered it `Unrecognised` — drift-sentinel reported `unmodelled: NFL,
    // CFL, golf` on 2026-08-14 and again on 2026-08-15, and an unmodelled sport
    // renders "Home vs Away" regardless of which side the relay calls home.
    | Sport.NFL -> { Label = "NFL"; Matchup = AwayAtHome; IsSoccer = false; Modelled = true; Omission = None }
    | Sport.CFL -> { Label = "CFL"; Matchup = AwayAtHome; IsSoccer = false; Modelled = true; Omission = None }
    // Association football, so the same convention as MLS and EFL Cup above.
    // This is read off the data rather than assumed: `data/brief-join-corpus.json`
    // carries four fixtures whose ids list the home side first and agree with
    // the `home` field — `La Liga_2026-08-15_alavs_getafe` with home Alavés,
    // away Getafe. Guessing a convention is what produced the AFL transposition,
    // so the evidence is named here.
    | Sport.LaLiga -> { Label = "La Liga"; Matchup = HomeVersusAway; IsSoccer = true; Modelled = true; Omission = None }
    // DECLARED unmodelled. Every field is what `Unrecognised` would produce —
    // the desk still refuses to claim a two-sided contest — and the only thing
    // that changes is that the sentinel can tell this apart from a sport nobody
    // has looked at.
    | Sport.Golf ->
        { Label = "golf"
          Matchup = UnknownConvention
          IsSoccer = false
          Modelled = false
          Omission = Some "the relay packs a tournament and a round into home/away — golf_2026-08-14_fedexstjudechampionship_r2 renders \"FedEx St. Jude Championship vs R2\" — so they are not opponents. Every Matchup case asserts a contest between two sides. Modelling golf under one would have the desk state that a tournament played a round; a non-contest Matchup case is the real fix and is its own change." }
    | Sport.Unrecognised raw ->
        { Label = raw; Matchup = UnknownConvention; IsSoccer = false; Modelled = false; Omission = None }

/// The only place a sport string becomes a `Sport`.
let sportOfString (raw: string) : Sport =
    match raw with
    | "AFL" -> Sport.AFL
    | "MLB" -> Sport.MLB
    | "MLS" -> Sport.MLS
    | "WNBA" -> Sport.WNBA
    // The relay's own label, with the space. Matched verbatim rather than
    // normalised: a normaliser is a place for two spellings to silently become
    // one sport, which is the failure Rule 53 records for team names.
    | "EFL Cup" -> Sport.EFLCup
    | "NFL" -> Sport.NFL
    | "CFL" -> Sport.CFL
    // The relay's own label, with the space, matched verbatim for the same
    // reason "EFL Cup" is.
    | "La Liga" -> Sport.LaLiga
    // `golf` maps to a case that DECLARES itself unmodelled, and that is a
    // decision rather than an omission. The relay packs a tournament and a round into `home`
    // and `away` — `golf_2026-08-14_fedexstjudechampionship_r2` renders as
    // "FedEx St. Jude Championship vs R2" — so those two fields are not
    // opponents. Every `Matchup` case this type has asserts a contest between
    // two sides, and modelling golf under one would make the desk state, in its
    // own voice, that a tournament played a round.
    //
    // `Sport.Golf` keeps `Modelled = false` and `UnknownConvention`, exactly as
    // `Unrecognised` did, so nothing about how golf renders changes. What it
    // adds is `Omission = Some ...`, which lets the drift sentinel report a
    // recorded decision instead of raising the same alarm twice a day forever.
    // Adding a fourth `Matchup` case for events that are not two-sided is the
    // actual fix and is still its own change: inventing a convention in a hurry
    // is precisely what produced the AFL/MLB transposition recorded above
    // `orderByMatchup`.
    | "golf" -> Sport.Golf
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
      /// Lifted at the decode boundary, so no bare date string reaches the
      /// renderer. `None` means the relay sent a date this laboratory cannot
      /// read as a day — a real state, not a default.
      ///
      /// This is what makes the zone a type rather than a convention. With
      /// `Date: string`, `g.Date < fieldDayIso (fieldToday ())` still compiled
      /// — the exact defect the FieldDay work set out to remove, written in one
      /// line, past a type that only guarded the unwrap. Verified by writing it
      /// and watching it build.
      Day: FieldDay option
      Home: string
      Away: string
      HomeScore: int option
      AwayScore: int option
      Venue: string option
      Streams: string option
      /// Editorial note on the game. Free text; ADR-002 CLEAN per the archive
      /// spec's own status ("factual game results, scores, teams, dates,
      /// editorial notes"). Never observed populated.
      Note: string option
      /// The local/regional variant of the same. Never observed populated.
      LocalNote: string option
      /// Broadcast crew — commentators. Production renders it two ways, a full
      /// `.crew-line` in the card body and a compact `.crew-chip` beside the
      /// broadcast pills, both conditional on the field being truthy. Its own
      /// execution log notes crew is populated on postseason objects (NBA
      /// Finals, Stanley Cup Final). Never observed populated here.
      Crew: string option
      /// The fourth double-encoded field. See `nestedJson`.
      Tags: Nested<string list>
      StartTime: DateTimeOffset option
      RawStartTime: string option
      DramaPeak: SealedDrama option
      DramaArc: Nested<SealedArc>
      OpeningOdds: Nested<Odds>
      ClosingOdds: Nested<Odds>
      Overtime: OvertimeStatus
      EspnEventId: string option
      FinalizedAt: string option }

/// A row from the relay's `briefs` table.
///
/// Field names are taken from the relay's own SQL in
/// `docs/CC-CMD-context-graph.md` (`findBriefs`, and the `/context/date`
/// handler's `SELECT * FROM briefs`), not guessed. Everything optional: the
/// date-level query is `SELECT *`, so the full column set is not enumerable
/// from the source, and a column this laboratory has never seen is decoded as
/// absent rather than assumed away.
type Brief =
    { Id: string option
      BriefType: string option
      Text: string option
      /// FIELD's JQ score for the PROSE, not for the game. Distinct from the
      /// drama score in every way that matters to ADR-002: it rates writing
      /// quality, not how interesting a game is, so it carries none of the
      /// RUWT weight `SealedDrama` does and is not gated.
      QualityScore: float option
      Source: string option
      Model: string option
      WordCount: int option
      GameId: string option
      Date: string option }

/// Which game a brief belongs to, for the two key spaces the briefs table
/// actually uses to address a game row on this desk.
///
/// `brief.game_id` is not one identifier — `scripts/game-id-scheme.mjs` measured
/// seven schemes in that one column. Only two of them resolve to a game row:
/// the game's own id (provider-composite briefs, `MLS_MLS-COM-…`) and its ESPN
/// event id (bare-numeric `761703` and `espn:`-prefixed briefs). The rest are
/// ordinals (`g32`) or external provider ids (`afl_38670`) that address nothing
/// here, and returning no match for them is the honest "no brief on this card"
/// state rather than a wrong pairing — the one failure mode the scoreline work
/// exists to rule out.
///
/// The full census lives in that script; this covers exactly the resolving two,
/// and a comment there and here is the only link the F#/JS boundary allows.
let briefKeyMatches (game: Game) (brief: Brief) : bool =
    match brief.GameId with
    | None -> false
    | Some raw ->
        let stripped = if raw.StartsWith "espn:" then raw.Substring 5 else raw
        raw = game.Id
        || (match game.EspnEventId with
            | Some espn -> espn = stripped
            | None -> false)

/// `game.Id -> the brief that joins to it`, at most one per game.
///
/// A brief with no text is not a brief to reveal: `Text = None` or whitespace
/// yields no entry, so a card becomes flippable only when there is prose behind
/// it. That keeps the flip affordance honest — it never promises a back face
/// that turns out empty.
let briefsByGame (games: Game list) (briefs: Brief list) : Map<string, Brief> =
    let hasText (b: Brief) =
        match b.Text with
        | Some t when t.Trim() <> "" -> true
        | _ -> false
    let usable = briefs |> List.filter hasText
    games
    |> List.choose (fun g ->
        usable
        |> List.tryFind (briefKeyMatches g)
        |> Option.map (fun b -> g.Id, b))
    |> Map.ofList

/// A section of the Context Graph response.
///
/// Three states, and the middle one is the finding. The relay assembles
/// `/context/date` with `Promise.allSettled` and collapses a rejected query to
/// an empty array:
///
///   briefs: briefs.status === 'fulfilled' ? briefs.value.results : []
///
/// So `[]` means EITHER "no rows for this date" OR "the D1 query failed and the
/// relay swallowed it". Those are not the same thing — one is a fact about the
/// slate, the other is an outage — and the wire format cannot tell them apart.
/// The client is structurally unable to distinguish them, and any code that
/// treats `[]` as "no briefs today" is guessing.
///
/// Naming it `EmptyOrFailed` is the honest model. It is deliberately awkward to
/// read, because the ambiguity is real and hiding it behind the word `Empty`
/// would be inventing certainty the payload does not carry.
type Section<'T> =
    /// The key is absent from the payload entirely.
    | Absent
    /// Present and empty. Indistinguishable from a failed upstream query.
    | EmptyOrFailed
    | Present of 'T list

type DeskPayload =
    { Ok: bool
      Date: string
      Regular: Game list
      Postseason: Game list
      /// How many rows arrived that this desk could not name both sides of.
      ///
      /// Not an error count and not a silence. A row with `away: null` is a
      /// real thing the relay serves — PGA Tour rows carry NULL for both sides,
      /// because a golf event has no two teams — and it is not a game this
      /// scoreboard can draw. The number exists so that "18 cards from 19 rows"
      /// is a statement the page can make, rather than something a reader would
      /// have to notice.
      Unnamed: int
      Briefs: Section<Brief>
      /// `series` and `standings` are decoded as raw key sets rather than
      /// typed rows. The relay selects them with `SELECT * FROM
      /// postseason_series` and a brief-table projection, and neither has ever
      /// arrived non-empty here, so there is no observed shape to model. Their
      /// keys are recorded so the day they arrive, they can be modelled from
      /// evidence rather than from the SQL alone.
      Series: Section<string list>
      Standings: Section<string list> }

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
///
/// The direct branch is deliberate and last. Every observed instance of these
/// four fields is either null or a string, but the shape is a serialisation
/// choice rather than a contract, and a relay that started sending real JSON
/// would otherwise fail the whole game decode over a field nothing renders.
/// Ordered after the string branch so it can never shadow it: a string is still
/// unwrapped and still surfaces as Malformed when its contents are broken.
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
        inner |> Decode.map Decoded
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
        let rawCaptured = get.Optional.Field "captured_at" Decode.string
        { Source = get.Optional.Field "source" Decode.string |> Option.defaultValue "unknown"
          MoneylineHome = get.Optional.At [ "moneyline"; "home" ] Decode.int
          MoneylineAway = get.Optional.At [ "moneyline"; "away" ] Decode.int
          // Full ISO-8601 with milliseconds here, unlike `start_time`, which
          // arrives with no seconds component at all. Two timestamp formats in
          // one payload; both are parsed explicitly and both keep their raw
          // string, because assuming a shared format is how the start_time bug
          // is waiting to happen again.
          CapturedAt = rawCaptured |> Option.bind parseStartTime
          RawCapturedAt = rawCaptured
          SpreadHome = get.Optional.At [ "spread"; "home" ] Decode.float
          SpreadAway = get.Optional.At [ "spread"; "away" ] Decode.float
          TotalOver = get.Optional.At [ "total"; "over" ] Decode.float
          TotalUnder = get.Optional.At [ "total"; "under" ] Decode.float })

let gameDecoder : Decoder<Game> =
    Decode.object (fun get ->
        let rawStart = get.Optional.Field "start_time" Decode.string
        { Id = get.Required.Field "id" Decode.string
          Sport = get.Required.Field "sport" Decode.string |> sportOfString
          League = get.Optional.Field "league" Decode.string |> Option.defaultValue ""
          Day = get.Optional.Field "date" Decode.string |> Option.bind fieldDayOfIso
          Home = get.Required.Field "home" Decode.string
          Away = get.Required.Field "away" Decode.string
          // Null pre-game, and null is NOT zero. A 0-0 game that has started and
          // a game that has not started are different things on a scoreboard.
          HomeScore = get.Optional.Field "home_score" Decode.int
          AwayScore = get.Optional.Field "away_score" Decode.int
          Venue = get.Optional.Field "venue" Decode.string
          Streams = get.Optional.Field "streams" Decode.string
          Note = get.Optional.Field "note" Decode.string
          LocalNote = get.Optional.Field "local_note" Decode.string
          Crew = get.Optional.Field "crew" Decode.string
          Tags = get.Optional.Field "tags" (nestedJson (Decode.list Decode.string))
                 |> Option.defaultValue NotPresent
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
          ClosingOdds = get.Optional.Field "closing_odds" (nestedJson oddsDecoder)
                        |> Option.defaultValue NotPresent
          Overtime = get.Optional.Field "went_to_ot" overtimeDecoder
                     |> Option.defaultValue OvertimeUnknown
          EspnEventId = get.Optional.Field "espn_event_id" Decode.string
          FinalizedAt = get.Optional.Field "finalized_at" Decode.string })

let briefDecoder : Decoder<Brief> =
    Decode.object (fun get ->
        { Id = get.Optional.Field "id" Decode.string
          BriefType = get.Optional.Field "brief_type" Decode.string
          Text = get.Optional.Field "brief_text" Decode.string
          QualityScore = get.Optional.Field "quality_score" Decode.float
          Source = get.Optional.Field "source" Decode.string
          Model = get.Optional.Field "model" Decode.string
          WordCount = get.Optional.Field "word_count" Decode.int
          GameId = get.Optional.Field "game_id" Decode.string
          Date = get.Optional.Field "date" Decode.string })

/// Lifts a list decoder into a `Section`, preserving the empty/absent
/// distinction the relay's own shape destroys on the other axis.
let section (inner: Decoder<'T>) : Decoder<Section<'T>> =
    Decode.list inner
    |> Decode.map (fun rows -> if List.isEmpty rows then EmptyOrFailed else Present rows)

/// Records what arrived without claiming to understand it. Elements that are
/// not objects contribute no keys rather than failing the decode — the goal is
/// to find out what arrives, and a decoder that rejects the unknown would
/// defeat the purpose.
let keySetDecoder : Decoder<Section<string list>> =
    Decode.list (Decode.oneOf [ Decode.keys |> Decode.map List.ofSeq; Decode.succeed [] ])
    |> Decode.map (fun rows -> if List.isEmpty rows then EmptyOrFailed else Present rows)

/// Every row that names both sides, plus a COUNT of the rows that do not.
///
/// WHY THIS IS NOT `Decode.list gameDecoder`
///
/// It was, until 2026-08-13, when `live-check` went red on the deployed page:
///
///     Error at: `$.games.regular.[18].away`
///     Expecting a string but instead got: null
///     FAIL  card count matches decoded game count → decoded NaN, rendered 0
///
/// `Decode.list` is all-or-nothing. One PGA Tour row — which carries NULL for
/// both sides, correctly, because a golf event has no two teams — took the
/// whole slate down. Nineteen games rendered as a blank page, and the five
/// checks that followed failed against a page with nothing on it.
///
/// There are two wrong fixes and this is neither.
///
///   CRASH-ON-ONE is what was there. A payload is a set of independent rows;
///   one row this desk cannot draw is not a reason to draw none of them.
///
///   INVENT A NAME is what `Pick.fs` does — `Optional |> defaultValue "—"`.
///   That renders a card for a matchup that does not exist, with a dash where
///   a team should be, and nothing anywhere records that it was made up. It is
///   the fabrication this repo exists to refuse, and it is worse than the crash
///   because it looks like it worked.
///
/// So: decode what can be decoded, and count what cannot. `Decode.succeed None`
/// is the branch that accepts a row without understanding it — deliberately
/// total, because the purpose is to keep going, not to enumerate every way a
/// row can be un-drawable. The count is what stops that being a silent skip:
/// `Unnamed` travels with the payload and is rendered whenever it is non-zero,
/// so a dropped row is a number on the page rather than an absence a reader has
/// to detect.
let private gamesIn (path: string list) (get: Decode.IGetters) : Game list * int =
    get.Optional.At path (Decode.list (Decode.oneOf [ gameDecoder |> Decode.map Some
                                                      Decode.succeed None ]))
    |> Option.defaultValue []
    |> fun rows -> List.choose id rows, rows |> List.filter Option.isNone |> List.length

let payloadDecoder : Decoder<DeskPayload> =
    Decode.object (fun get ->
        let regular, regularUnnamed = gamesIn [ "games"; "regular" ] get
        let postseason, postseasonUnnamed = gamesIn [ "games"; "postseason" ] get
        { Ok = get.Optional.Field "ok" Decode.bool |> Option.defaultValue false
          Date = get.Optional.Field "date" Decode.string |> Option.defaultValue ""
          Regular = regular
          Postseason = postseason
          Unnamed = regularUnnamed + postseasonUnnamed
          Briefs = get.Optional.Field "briefs" (section briefDecoder) |> Option.defaultValue Absent
          Series = get.Optional.Field "series" keySetDecoder |> Option.defaultValue Absent
          Standings = get.Optional.Field "standings" keySetDecoder |> Option.defaultValue Absent })

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

/// Has the game kicked off, as of a named instant?
///
/// `start_time` is the only status signal this payload carries. Absent, this
/// returns false rather than guessing — an unknown start time is not evidence
/// that a game has not begun.
let notYetStartedAt (now: DateTimeOffset) (g: Game) =
    match g.StartTime with
    | Some start -> now < start
    | None -> false

/// The state of a game AT A NAMED INSTANT.
///
/// This is the real function; `gameState` below just supplies "now".
///
/// The split is not tidiness. `gameState` read the wall clock in two places —
/// `fieldToday ()` for the date comparison and `DateTimeOffset.UtcNow` for
/// kickoff — which meant every assertion about it was an assertion about when
/// the test happened to run. This repo has already paid for exactly that:
/// zone-check reported 16/16 while a deliberately broken UTC-4 implementation
/// also passed 11/11, because its one F# assertion was time-dependent. The fix
/// there was to make `fieldDayAt(instant)` pure. Same fix, same reason.
///
/// A caller that wants "now" says so. A test that wants a Tuesday in February
/// says that instead, and gets the same answer on every run.
let gameStateAt (now: DateTimeOffset) (g: Game) : GameState =
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
        // Both sides in the canonical zone. Before the type, this compared a
        // relay date against a UTC "today" — so between 00:00 and 04:00 UTC,
        // which is 20:00-midnight ET, tonight's live games compared as past
        // and rendered Final. The same bug family as the AFL "In progress in
        // August" one, with the sign reversed, and squarely in US prime time.
        let datePassed =
            match g.Day with
            | Some day -> fieldDayIsBefore day (fieldDayAt now)
            | None -> false
        if g.FinalizedAt.IsSome || datePassed then
            Final(h, a, g.Overtime = WentToOvertime)
        elif notYetStartedAt now g then
            // Scores present, but the game has not kicked off — so they are
            // placeholders, not a live scoreline.
            //
            // Found in field-playground, which has the same shape written the
            // other way round: `if (g.home_score === null) return 'pre'`. Its
            // CFL route writes 0 for all 47 unplayed fixtures, so every
            // unstarted CFL game reports as live, and a `disabled` bound to
            // that status greys out both pick buttons on games that have not
            // started — with no explanation to the user.
            //
            // That probe's recommended fix is the one applied here: gate on
            // status, never on a score being present. This repo's version was
            // latent rather than live — no route in either committed capture
            // writes placeholder zeroes — which is exactly why it was worth
            // fixing before one does.
            Scheduled
        else
            InProgress(h, a)
    | _ -> Scheduled

/// The state of a game right now. The only impure entry point.
let gameState (g: Game) : GameState = gameStateAt DateTimeOffset.UtcNow g

// ---------------------------------------------------------------------------
// Line shapes
// ---------------------------------------------------------------------------

/// The handicap, always stated relative to the home side.
///
/// A handicap is one number. The relay serves it as two, and they must be exact
/// opposites for the pair to describe a single line. `Unbalanced` is not
/// defensive padding: if it ever fires, the two numbers are not one handicap and
/// nothing downstream should be treating them as though they were.
///
/// Stating it relative to home rather than to "the favourite" is deliberate.
/// This repo has already shipped one bug from a number whose referent was
/// implicit — every fixture rendered away-first because `%s @ %s` carried no
/// convention with it. A signed handicap with an unstated side is the same
/// mistake waiting.
type Spread =
    | Balanced of homeHandicap: float
    | Unbalanced of home: float * away: float

/// The total.
///
/// The relay serves `{over, under}`, which reads as two prices. In every
/// observed game both hold the SAME number — 8.5 and 8.5 — so the field carries
/// one line written twice, not an over price and an under price. `OneLine` is
/// what the data actually is; `TwoNumbers` is what the field name implies and
/// has never been seen.
type TotalLine =
    | OneLine of line: float
    | TwoNumbers of over: float * under: float

/// Whether the handicap agrees with the moneyline about who is favoured.
///
/// A real cross-field invariant: the side giving points on the handicap should
/// be the side priced shorter on the moneyline. Both currently agree on every
/// observed game. If they ever disagree, one of the two fields is describing a
/// different market — visible here rather than as a card that merely looks odd.
type FavouriteAgreement =
    | Agrees
    | Disagrees of moneylineFavoursHome: bool * handicapFavoursHome: bool
    | NotComparable

let spreadOf (o: Odds) : Spread option =
    match o.SpreadHome, o.SpreadAway with
    | Some h, Some a when h = -a -> Some(Balanced h)
    | Some h, Some a -> Some(Unbalanced(h, a))
    | _ -> None

let totalOf (o: Odds) : TotalLine option =
    match o.TotalOver, o.TotalUnder with
    | Some over, Some under when over = under -> Some(OneLine over)
    | Some over, Some under -> Some(TwoNumbers(over, under))
    | _ -> None

let favouriteAgreement (o: Odds) : FavouriteAgreement =
    match o.MoneylineHome, o.MoneylineAway, spreadOf o with
    | Some mh, Some ma, Some (Balanced h) when h <> 0.0 ->
        match impliedOfMoneyline mh, impliedOfMoneyline ma with
        | Some ih, Some ia ->
            // The separation must exceed the book's own margin before either
            // side counts as favoured.
            //
            // The first version asked only `mh <> ma`, and the live sentinel
            // caught it on its first run: MLB_2026-08-10_cardinals_phillies at
            // -113/-107 was flagged as a favourite mismatch. Those prices imply
            // 0.5305 and 0.5169 — a separation of 0.0136 against an overround
            // of 0.0474, three and a half times larger. There is no favourite
            // there, and which side carries the -1.5 runline is not determined
            // by a difference smaller than the vig.
            //
            // The threshold is the overround itself, taken from the same two
            // prices, so this is not a constant tuned until the check passed —
            // there is no constant. A market that does not separate the sides
            // by more than its own margin has not named a favourite.
            let overround = float ih + float ia - 1.0
            let separation = abs (float ih - float ia)
            if separation <= overround then NotComparable
            else
                let moneylineFavoursHome = float ih > float ia
                // A negative home handicap means home gives points, i.e. home
                // is favoured.
                let handicapFavoursHome = h < 0.0
                if moneylineFavoursHome = handicapFavoursHome then Agrees
                else Disagrees(moneylineFavoursHome, handicapFavoursHome)
        | _ -> NotComparable
    // A zero handicap, an absent price, or an unbalanced spread has no
    // favourite to agree about.
    | _ -> NotComparable

// ---------------------------------------------------------------------------
// The Odds Story
// ---------------------------------------------------------------------------

/// What the opening and closing prices actually say, once both are decoded.
///
/// The Debrief's "Odds Story" layer is meant to narrate line movement. Building
/// it against this relay produced the laboratory's first finding about the DATA
/// rather than about a type:
///
///   opening_odds.captured_at = 2026-08-09T10:01:24.241Z
///   closing_odds.captured_at = 2026-08-09T10:01:00.322Z
///
/// The "closing" line was captured 24 seconds BEFORE the "opening" one, from the
/// same adapter (`odds-api`), and the two are byte-identical across moneyline,
/// spread and total. They are not an open/close pair — they are the same
/// snapshot written to two columns. Confirmed on both games in the capture.
///
/// So `NotASequence` is a real case, and it is the one the committed data
/// actually takes. A narrative layer that rendered "line unchanged" here would
/// be describing a market that was never observed twice.
type OddsStory =
    /// Neither price present.
    | NoPrices
    /// Only one side of the pair exists. Nothing to compare.
    | SingleSnapshot of Odds
    /// The closing snapshot is not after the opening one, so the pair does not
    /// describe a sequence and no movement can be inferred from it.
    | NotASequence of opening: Odds * closing: Odds
    /// A genuine sequence, prices identical.
    | Unmoved of Odds
    /// A genuine sequence with a real move, in implied-probability terms.
    | Moved of opening: Odds * closing: Odds * homeShift: float<implied>

/// Builds the story. Every branch is reachable from real relay data; none is
/// defensive padding.
let oddsStory (opening: Nested<Odds>) (closing: Nested<Odds>) : OddsStory =
    match opening, closing with
    | Decoded o, Decoded c ->
        let sequenced =
            match o.CapturedAt, c.CapturedAt with
            // Strictly after. Equal timestamps are not a sequence either: two
            // snapshots taken in the same instant cannot show movement.
            | Some ot, Some ct -> ct > ot
            // No timestamps at all means the sequence is unverifiable, and
            // assuming it holds is exactly the assumption this case exists to
            // stop being made silently.
            | _ -> false
        if not sequenced then NotASequence(o, c)
        else
            match o.MoneylineHome, c.MoneylineHome with
            | Some oh, Some ch when oh = ch -> Unmoved c
            | Some oh, Some ch ->
                match impliedOfMoneyline oh, impliedOfMoneyline ch with
                | Some io, Some ic -> Moved(o, c, ic - io)
                | _ -> NotASequence(o, c)
            | _ -> Unmoved c
    | Decoded o, _ -> SingleSnapshot o
    | _, Decoded c -> SingleSnapshot c
    | _ -> NoPrices

// ---------------------------------------------------------------------------
// Which day is a game's `date`?
// ---------------------------------------------------------------------------

/// How a game's `date` field relates to its `start_time`.
///
/// This laboratory keys everything off `todayUtc()`. FIELD does not: its own
/// `field_smoke.js` takes its date from the "system clock (America/NY)", its
/// CC-CMDs track ET rollover explicitly ("ET is still 2026-06-23, 21:54 ET =
/// 01:54 UTC the next day"), and a PM-19.5 session note flags the ambiguity
/// unresolved — "this lands June 3 in UTC and likely June 2 in ET — confirm
/// which timezone Rule 23 reads from for date-rollover".
///
/// Before changing the laboratory to ET, the premise needs testing, and the
/// obvious test is not "is it ET" but "what IS it". The relay serves AFL,
/// MLS, WNBA, MLB and EFL Cup — competitions on three continents — so a third
/// possibility is live: `date` may be each competition's own LOCAL date, in
/// which case no single timezone is the right answer and ET would be as wrong
/// as UTC for the AFL.
///
/// Measured rather than assumed, per sport, because assuming an American
/// convention generalises is the exact mistake that produced
/// "Collingwood @ Sydney".
type DateKeying =
    | NoStartTime
    /// `start_time` falls on the same UTC day as `date`.
    | SameUtcDay
    /// `start_time` is on a LATER UTC day than `date` — so `date` is behind
    /// UTC, which is what a Western-hemisphere keying (ET) looks like.
    | StartsAfterDateUtc
    /// `start_time` is on an EARLIER UTC day than `date` — `date` is ahead of
    /// UTC, which is what an Australian or Asian local keying looks like.
    | StartsBeforeDateUtc

let dateKeying (g: Game) : DateKeying =
    match g.StartTime with
    | None -> NoStartTime
    | Some start ->
        match g.Day with
        | None -> NoStartTime
        | Some day ->
            let utc = start.UtcDateTime
            let startUtcDay = sprintf "%04d-%02d-%02d" utc.Year utc.Month utc.Day
            let dayIso = fieldDayIso day
            // ISO-8601 dates compare correctly as plain strings.
            if startUtcDay = dayIso then SameUtcDay
            elif startUtcDay > dayIso then StartsAfterDateUtc
            else StartsBeforeDateUtc

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

// ---------------------------------------------------------------------------
// The drama sparkline
// ---------------------------------------------------------------------------
//
// A 30-bar row plotting `drama_arc`, captioned "drama over time (peak N)".
//
// Two bugs are being designed out rather than fixed, because both are the kind
// that look correct in a screenshot.
//
// NORMALISING TO THE SERIES MAXIMUM. The production version scaled each bar
// against that game's own tallest sample, so the tallest bar was always 100%.
// A real 821-sample arc spanning 44-74 rendered as a 59-100% wall, and a game
// peaking at 20 drew the same silhouette as one peaking at 95. The committed
// capture here is the same shape: 504 samples spanning 51-81, which
// max-normalisation would render as 63-100%.
//
// The fix is a fixed 0-100 domain, so a bar's height in percent IS the drama
// value. Structurally, that means there is no function here that takes the
// maximum of the series — not a rule to follow, an absent capability.
//
// EVERY-NTH DOWNSAMPLING. Taking every Nth sample can step straight over a
// spike: with 504 samples in 30 buckets, 474 of them are never looked at. The
// peak the caption names could be invisible in the chart beneath it.
//
// The fix is bucketed max, which carries a property worth asserting rather than
// describing: THE MAXIMUM OF THE OUTPUT EQUALS THE MAXIMUM OF THE INPUT. That
// is false for every-Nth and true here, and it is checked on the real arc.

/// One bar. The percentage IS the value — there is no scale factor.
type DramaBar = private DramaBar of int

/// The drama score's stated domain. Named because the fixed domain is the whole
/// point; a magic 100 in an expression would be the thing that drifts.
let private DRAMA_DOMAIN_MAX = 100

/// Values the relay sent outside the stated 0-100 domain.
///
/// Reported rather than silently clamped away: a 150 in a "0-100 closeness
/// score" is upstream drift, and the sentinel should be able to name it. The
/// bars themselves are clamped, because a 150% tall bar is a layout bug on top
/// of a data bug.
let arcOutOfDomain (SealedArc points) =
    points |> List.filter (fun p -> p < 0 || p > DRAMA_DOMAIN_MAX)

/// Downsample to `buckets` bars, taking the MAX of each bucket.
///
/// Max, not first and not mean: the sparkline exists to show where the game got
/// close, and a summary that can hide the closest moment is not showing that.
let private bucketMax (buckets: int) (points: int list) : int list =
    match points with
    | [] -> []
    | _ ->
        let total = List.length points
        let source = Array.ofList points
        if total <= buckets then points
        else
            [ for i in 0 .. buckets - 1 ->
                // Boundaries computed from the index so the last bucket always
                // ends exactly at `total` — no trailing samples dropped, which
                // is another way a peak goes missing.
                let start = i * total / buckets
                let stop = (i + 1) * total / buckets
                let stop = if i = buckets - 1 then total else max stop (start + 1)
                source.[start .. stop - 1] |> Array.max ]

/// The bars, ready to render. Clamped into the domain.
let sparklineBars (buckets: int) (SealedArc points) : DramaBar list =
    bucketMax buckets points
    |> List.map (fun p -> DramaBar(max 0 (min DRAMA_DOMAIN_MAX p)))

/// The only way a bar becomes anything renderable.
///
/// A bar height is a composite value that MUST reach the DOM — you cannot draw
/// the chart without it. So the seal is not "no number escapes", which would be
/// unimplementable; it is "the number escapes only as a CSS length, and only
/// under amnesty". The int is never returned bare, and this needs the same
/// `AmnestyZone` witness as `formatDramaPeak`, so a live game cannot have a
/// sparkline any more than it can have a printed peak.
let barHeightStyle (_zone: AmnestyZone) (DramaBar value) : string =
    sprintf "height: %d%%" value
