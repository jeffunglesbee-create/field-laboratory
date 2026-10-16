module Flow

open System
open Thoth.Json
open Units
open Desk

// Task 1 of docs/CC-CMD-2026-10-15-empowerment-metrics.md: Flow, over BSD soccer
// captures (`stats.json` shotmap, `incidents.json` period markers).
//
// What Flow is, as ruled 2026-10-16: three own-team shots of positive xG with
// no opposing shot between them. A shot of 0 xG by the team does not count and
// does not reset the run; any shot by the opponent ends it, whatever its xG. A
// minute in which both teams shot ends it and counts for neither, because the
// order inside a minute is unknown. It never crosses a period boundary: 45'/46',
// 90'/91' or 105'/106'.
//
// What Flow is NOT: "this team controlled the game". It is shots-only. An
// opponent possession that ended without a shot is invisible to it, and so is
// everything inside a minute.
//
// Where it may be shown: `InFlow` is a composite verdict about a named team.
// The verdict never leaves this module as a value. `TeamState` is a private
// type, `readingAt` says only whether a minute was recorded, and the verdict
// reaches a page only as `ariaLabel` (the one string) and `pulseStyle` (an
// opacity), both of which demand `Finished`, the witness that the match is
// over. The witness carries its own capture, so it cannot unlock a different
// one. The proofs are in docs/FLOW-PROOF.md and docs/AMNESTY-PROOF.md.
//
// A JavaScript caller must pass `new Clock(minute, added)`: a plain object
// compares as less than every Clock under Fable.

/// Which team took a shot. A fact about the shot, not a verdict.
type Side =
    | Home
    | Away

/// A minute as BSD writes it on a shot: `min`, plus `added` on a period's last
/// minute (45+2 is { Minute = 45; Added = 2 }). Record comparison is Minute,
/// then Added, which is match order while `added` sits only on 45, 90, 105 and
/// 120 (measured over every capture on 2026-10-16: field-relay-nba run
/// 38967053334).
type Clock = { Minute: int; Added: int }

/// The state of one team at one minute. PRIVATE TO THIS MODULE: no function
/// outside it can hold one, so no equality, reflection or serialiser outside it
/// can read one either.
type private TeamState =
    | Disjointed
    | InFlow of sequentialXg: float32<xg>

/// Whether a capture says anything about one team at one minute. It carries no
/// verdict. NotRead and NotRecorded are siblings, not a Disjointed in disguise
/// (Rule 99): a capture whose shots could not all be read, and a minute past
/// what the capture shows (after its last shot, or after 90' when it recorded
/// full time).
type Reading =
    | Recorded
    | NotRead
    | NotRecorded

type private ShotXg =
    | Positive of float32<xg>
    | Zero

type private Shot = { At: Clock; Side: Side; Xg: ShotXg; Estimated: bool }

/// A shotmap row as it arrived, before anything is decided about it.
type private Raw =
    { Min: int option
      Added: int option
      Home: bool option
      Xg: float option
      Estimated: bool
      Gtype: string option
      Sit: string option }

type private Shots =
    | NoShotmap
    | Unreadable of Raw list
    | Readable of Shot list

type private Marker = { Text: string; Live: bool; Minute: int option }

/// What the capture's own period markers show. None of these says the match is
/// over: the full-time marker is written at 90' before extra time as well
/// (beside an extra-time marker in 17 of 17 extra-time captures), so it proves
/// only that the capture recorded the 90' whistle.
type private Stage =
    | FullTimeSeen
    | InPlay
    | Unmarked
    | NoIncidents
    /// The incidents file names another event than the stats file does: the two
    /// halves of the capture are not of one match, so its markers are ignored.
    | Mismatched

type Capture =
    private
        { EventId: int option
          Shots: Shots
          Raws: Raw list
          Stage: Stage
          Markers: Marker list }

/// The witness that the match a capture records is over. It holds the capture
/// it was built from, so the two projections below describe that capture and
/// no other, and the `AmnestyZone` that `Desk.amnestyZoneAfterKickoff` handed
/// out for the capture's own kickoff.
[<NoEquality; NoComparison; Fable.Core.AttachMembers>]
type Finished =
    private
        { Of: Capture
          Zone: AmnestyZone }

    override _.ToString() = "Finished"
    /// JSON.stringify calls this instead of serialising the capture inside.
    member _.toJSON() = "Finished"

let private lenient (field: string) (d: Decoder<'a>) : Decoder<'a option> =
    Decode.oneOf
        [ Decode.field field (Decode.oneOf [ d |> Decode.map Some; Decode.succeed None ])
          Decode.succeed None ]

/// A JSON number with no fractional part. Thoth's `Decode.int` also accepts a
/// numeric STRING ("2"), which would let a shape change through unseen.
let private wholeNumber: Decoder<int> =
    Decode.float
    |> Decode.andThen (fun f -> if f = floor f then Decode.succeed (int f) else Decode.fail "not a whole number")

let private rawShot: Decoder<Raw> =
    Decode.object (fun get ->
        { Min = get.Required.Raw(lenient "min" wholeNumber)
          Added =
            get.Required.Raw(
                Decode.oneOf
                    [ Decode.field "added" (Decode.oneOf [ Decode.nil (Some 0); wholeNumber |> Decode.map Some; Decode.succeed None ])
                      Decode.succeed (Some 0) ]
            )
          Home = get.Required.Raw(lenient "home" Decode.bool)
          Xg = get.Required.Raw(lenient "xg" Decode.float)
          Estimated = get.Required.Raw(lenient "xg_estimated" Decode.bool) = Some true
          Gtype = get.Required.Raw(lenient "gtype" Decode.string)
          Sit = get.Required.Raw(lenient "sit" Decode.string) })

let private statsDecoder: Decoder<Raw list option> =
    Decode.oneOf [ Decode.field "shotmap" (Decode.list rawShot) |> Decode.map Some; Decode.succeed None ]

let private eventIdDecoder: Decoder<int option> = lenient "event_id" wholeNumber

let private isOwnGoal (r: Raw) = r.Gtype = Some "own"

let private isShootoutKick (r: Raw) = r.Sit = Some "shootout" && not (isOwnGoal r)

/// Rows that are not a shot by the side they name, so no run sees them, and
/// both are counted in the census. An own goal: the shotmap books it to the
/// credited team (`gtype` "own"), which did not shoot it. A shootout kick
/// (`sit` "shootout"): a kick after the match, not a shot in it. Measured over
/// every capture on 2026-10-16 (field-relay-nba run 38963130231): 73 own-goal
/// rows and 8 shootout rows, the latter at minutes 122-129 of the one capture
/// that reached a shootout.
let private excluded (r: Raw) = isOwnGoal r || isShootoutKick r

let private negative =
    function
    | Some n -> n < 0
    | None -> false

/// A row is unread when a fact a run needs is missing or malformed. One such
/// row leaves the WHOLE capture unread: a shot with no xG number goes to the
/// owner before any run treats it either way (Task 1, "a shot with no xg").
let private unreadRow (r: Raw) =
    r.Xg.IsNone
    || r.Min.IsNone
    || r.Home.IsNone
    || r.Added.IsNone
    || negative r.Min
    || negative r.Added
    || (match r.Xg with
        | Some x -> x < 0.0
        | None -> false)

let private shotsOf (raws: Raw list) : Shots =
    let shots = raws |> List.filter (fun r -> not (excluded r))
    if shots |> List.exists unreadRow then
        Unreadable shots
    else
        shots
        |> List.choose (fun r ->
            match r.Min, r.Added, r.Home, r.Xg with
            | Some m, Some a, Some h, Some x ->
                Some
                    { At = { Minute = m; Added = a }
                      Side = (if h then Home else Away)
                      Xg = (if x > 0.0 then Positive(float32 x * 1.0f<xg>) else Zero)
                      Estimated = r.Estimated }
            | _ -> None)
        |> Readable

let private marker: Decoder<Marker option> =
    Decode.object (fun get ->
        match get.Required.Raw(lenient "type" Decode.string) with
        | Some "period" ->
            Some
                { Text = get.Required.Raw(lenient "text" Decode.string) |> Option.defaultValue ""
                  Live = get.Required.Raw(lenient "is_live" Decode.bool) = Some true
                  Minute = get.Required.Raw(lenient "minute" wholeNumber) }
        | _ -> None)

let private incidentsDecoder: Decoder<int option * Marker list> =
    Decode.object (fun get ->
        get.Required.Raw eventIdDecoder,
        get.Required.Field "incidents" (Decode.list (Decode.oneOf [ marker; Decode.succeed None ])) |> List.choose id)

let private textOf (m: Marker) = m.Text.Trim().ToLowerInvariant()

let private beyondRegulationTexts =
    set [ "et"; "aet"; "ap"; "pen"; "extra time"; "extra-time"; "penalties"; "after extra time"; "after penalties" ]

let private stageOf (ms: Marker list) : Stage =
    if ms |> List.exists (fun m -> not m.Live && textOf m = "ft" && m.Minute = Some 90) then FullTimeSeen
    elif ms |> List.exists (fun m -> m.Live) then InPlay
    else Unmarked

/// Reads a capture: the `stats.json` text, and the `incidents.json` text when
/// the capture has one. Never fails: what could not be read is a case.
let decodeCapture (stats: string) (incidents: string option) : Capture =
    let raws =
        match Decode.fromString statsDecoder stats with
        | Ok(Some raws) -> Some raws
        | Ok None -> None
        | Error _ -> None
    let eventId =
        match Decode.fromString eventIdDecoder stats with
        | Ok id -> id
        | Error _ -> None
    let stage, markers =
        match incidents |> Option.map (Decode.fromString incidentsDecoder) with
        | Some(Ok(Some incidentsId, _)) when Some incidentsId <> eventId -> Mismatched, []
        | Some(Ok(_, ms)) -> stageOf ms, ms
        | Some(Error _) -> NoIncidents, []
        | None -> NoIncidents, []
    { EventId = eventId
      Shots =
        (match raws with
         | Some rs -> shotsOf rs
         | None -> NoShotmap)
      Raws = raws |> Option.defaultValue []
      Stage = stage
      Markers = markers }

// ---- runs ----

type private Period =
    | FirstHalf
    | SecondHalf
    | ExtraFirst
    | ExtraSecond

let private periods = [ FirstHalf; SecondHalf; ExtraFirst; ExtraSecond ]

let private periodOf (c: Clock) =
    if c.Minute <= 45 then FirstHalf
    elif c.Minute <= 90 then SecondHalf
    elif c.Minute <= 105 then ExtraFirst
    else ExtraSecond

/// The first minute that is no longer in the period.
let private periodEnd (p: Period) : Clock =
    match p with
    | FirstHalf -> { Minute = 46; Added = 0 }
    | SecondHalf -> { Minute = 91; Added = 0 }
    | ExtraFirst -> { Minute = 106; Added = 0 }
    | ExtraSecond -> { Minute = 121; Added = 0 }

/// Every boundary between two periods: from the first one up to, not including,
/// the second. A gap from 89' to 110' crosses both full time and extra time's
/// interval.
let private crossed (from: Period) (until: Period) : Period list =
    let i = List.findIndex ((=) from) periods
    let j = List.findIndex ((=) until) periods
    periods |> List.skip i |> List.take (max 0 (j - i))

/// Why a run ended. An opposing shot of positive xG and an opposing bucket of
/// 0-xG shots only are separate cases, so every run has exactly one closer.
type private Closer =
    | OpponentShot
    | OpponentShotOfZeroXg
    | SharedMinute
    | PeriodEnd of Period
    | CaptureEnd

type private Run =
    { Side: Side
      Counted: (Clock * float32<xg>) list
      Zeros: int
      Estimated: int
      Closer: Closer
      Until: Clock }

type private Pass =
    { Open: Run option
      Closed: Run list
      Last: (Clock * Side option) option
      Shared: int
      Separators: Period list
      Splits: Period list }

let private flowShots = 3

let private close (closer: Closer) (until: Clock) (p: Pass) =
    match p.Open with
    | Some r ->
        { p with
            Open = None
            Closed = { r with Closer = closer; Until = until } :: p.Closed }
    | None -> p

let private sideOf (bucket: Shot list) =
    match bucket |> List.map (fun s -> s.Side) |> List.distinct with
    | [ side ] -> Some side
    | _ -> None

let private step (p: Pass) (at: Clock, bucket: Shot list) : Pass =
    let p =
        match p.Last with
        | Some(prev, prevSide) when periodOf prev <> periodOf at ->
            let ended = periodOf prev
            let boundaries = crossed ended (periodOf at)
            let p = close (PeriodEnd ended) (periodEnd ended) p
            { p with
                Separators = boundaries @ p.Separators
                Splits = (if prevSide.IsSome && prevSide = sideOf bucket then boundaries @ p.Splits else p.Splits) }
        | _ -> p
    match sideOf bucket with
    | Some side ->
        let p =
            match p.Open with
            | Some r when r.Side <> side ->
                close (if bucket |> List.forall (fun s -> s.Xg = Zero) then OpponentShotOfZeroXg else OpponentShot) at p
            | _ -> p
        let counted = bucket |> List.choose (fun s -> match s.Xg with Positive x -> Some(at, x) | Zero -> None)
        let zeros = bucket |> List.filter (fun s -> s.Xg = Zero) |> List.length
        let estimated = bucket |> List.filter (fun s -> s.Estimated && s.Xg <> Zero) |> List.length
        let opened =
            match p.Open with
            | Some r -> Some { r with Counted = r.Counted @ counted; Zeros = r.Zeros + zeros; Estimated = r.Estimated + estimated }
            | None when not counted.IsEmpty ->
                Some { Side = side; Counted = counted; Zeros = zeros; Estimated = estimated; Closer = CaptureEnd; Until = periodEnd (periodOf at) }
            | None -> None
        { p with Open = opened; Last = Some(at, Some side) }
    | None ->
        let p = close SharedMinute at p
        { p with Shared = p.Shared + 1; Last = Some(at, None) }

/// Folds the shots in match order. A run still open after the last shot ends at
/// its period's boundary. When the capture recorded the 90' whistle and the
/// last shot is in regulation, that boundary is where the match put the run (an
/// interval or full time); otherwise the record simply stops there.
let private passOf (fullTimeSeen: bool) (shots: Shot list) : Pass =
    let pass =
        shots
        |> List.groupBy (fun s -> s.At)
        |> List.sortBy fst
        |> List.fold step { Open = None; Closed = []; Last = None; Shared = 0; Separators = []; Splits = [] }
    match pass.Last with
    | Some(last, _) ->
        let atBoundary = fullTimeSeen && last < periodEnd SecondHalf
        close (if atBoundary then PeriodEnd(periodOf last) else CaptureEnd) (periodEnd (periodOf last)) pass
    | None -> pass

let private sawFullTime (c: Capture) = c.Stage = FullTimeSeen

/// The verdict and its coverage together. Private: it is the only place a
/// `TeamState` exists outside a run.
type private Verdict =
    | State of TeamState
    | NoVerdict of Reading

let private verdictAt (c: Capture) (side: Side) (at: Clock) : Verdict =
    match c.Shots with
    | NoShotmap -> NoVerdict NotRead
    | Unreadable _ -> NoVerdict NotRead
    | Readable shots ->
        let lastShot = shots |> List.map (fun s -> s.At) |> List.sortDescending |> List.tryHead
        let recorded =
            at.Minute >= 1
            && ((lastShot |> Option.exists (fun l -> at <= l)) || (sawFullTime c && at < periodEnd SecondHalf))
        if not recorded then
            NoVerdict NotRecorded
        else
            let holds (r: Run) =
                r.Side = side
                && List.length r.Counted >= flowShots
                && at >= fst (List.item (flowShots - 1) r.Counted)
                && at < r.Until
            match (passOf (sawFullTime c) shots).Closed |> List.tryFind holds with
            | Some r -> State(InFlow(r.Counted |> List.filter (fun (c, _) -> c <= at) |> List.sumBy snd))
            | None -> State Disjointed

/// Whether the capture covers one team at one minute. No verdict: that leaves
/// this module only through the witness.
let readingAt (c: Capture) (side: Side) (at: Clock) : Reading =
    match verdictAt c side at with
    | State _ -> Recorded
    | NoVerdict r -> r

/// The only route to the witness: the capture's own BSD event row (an item of
/// `/api/v2/events/`, which carries `id` and `event_date`), joined to the
/// capture by the `event_id` the capture itself carries. Some only when the
/// row is that capture's, its kickoff FIELD day is at least two days before
/// `now`'s (`Desk.amnestyZoneAfterKickoff`), and the shots were all read.
///
/// There is no full-time route. The full-time marker is written at 90' before
/// extra time too, so a capture taken in that break would carry FT and still be
/// a match in play; putting its score into `Final` would assert a final score
/// the match did not have.
///
/// The row and `now` are the caller's data, like every decoded payload: this
/// checks that the row is the capture's own and does the date arithmetic, not
/// that the row is genuine.
let witnessAfterKickoff (c: Capture) (eventRow: string) (now: DateTimeOffset) : Finished option =
    let row =
        Decode.object (fun get -> get.Required.Field "id" wholeNumber, get.Required.Field "event_date" Decode.datetimeOffset)
    match Decode.fromString row eventRow, c.Shots with
    | Ok(id, kickoff), Readable _ when c.EventId = Some id ->
        amnestyZoneAfterKickoff kickoff now |> Option.map (fun zone -> { Of = c; Zone = zone })
    | _ -> None

/// The accessible name: the one string site for Flow. State name plus the
/// number that produced it, nothing adjectival.
let ariaLabel (f: Finished) (side: Side) (at: Clock) : string =
    match verdictAt f.Of side at with
    | State(InFlow x) -> sprintf "InFlow state active, sequential xG %.2f" (float (x / 1.0f<xg>))
    | State Disjointed -> "Disjointed state active"
    | NoVerdict NotRecorded -> "Flow not recorded at this minute"
    | NoVerdict NotRead -> "Flow not read"
    | NoVerdict Recorded -> "Flow not read"

/// The visual encoding: an opacity, capped at 1 xG, and only under the witness.
/// The number leaves this module only as a CSS opacity, like `barHeightStyle`'s
/// length. Every other reading draws nothing.
let pulseStyle (f: Finished) (side: Side) (at: Clock) : string =
    match verdictAt f.Of side at with
    | State(InFlow x) -> sprintf "opacity: %.2f" (min 1.0 (float (x / 1.0f<xg>)))
    | State Disjointed -> ""
    | NoVerdict _ -> ""

/// Per-capture counts for the census. No team and no xG value: a count of runs,
/// not a verdict about anyone. Every shot is counted, read or not.
type Census =
    { Stage: string
      LiveMarker: bool
      ExtraTimeMarker: bool
      Read: bool
      Shots: int
      OwnGoalRows: int
      ShootoutKicks: int
      Positive: int
      Zero: int
      Estimated: int
      WithoutXg: int
      WithoutMinute: int
      WithoutSide: int
      Malformed: int
      AddedAt45: int
      AddedAt90: int
      AddedAt105: int
      AddedAt120: int
      AddedElsewhere: int
      SharedMinutes: int
      FlowRuns: int
      FlowClosedByOpponent: int
      FlowClosedByOpponentZeroXg: int
      FlowClosedByShared: int
      FlowClosedAtHalfTime: int
      FlowClosedAtFullTime: int
      FlowClosedAtExtraInterval: int
      FlowClosedAtExtraEnd: int
      FlowClosedByCaptureEnd: int
      SeparatorsHalfTime: int
      SeparatorsFullTime: int
      SeparatorsExtraInterval: int
      SplitHalfTime: int
      SplitFullTime: int
      SplitExtraInterval: int
      ZeroInsideFlowRuns: int
      EstimatedInsideFlowRuns: int }

let flowCensus (c: Capture) : Census =
    let shots =
        match c.Shots with
        | Readable s -> s
        | Unreadable _ -> []
        | NoShotmap -> []
    let pass = passOf (sawFullTime c) shots
    let flow = pass.Closed |> List.filter (fun r -> List.length r.Counted >= flowShots)
    let flowBy closer = flow |> List.filter (fun r -> r.Closer = closer) |> List.length
    let countOf p xs = xs |> List.filter p |> List.length
    let included = c.Raws |> List.filter (fun r -> not (excluded r))
    let numbered = included |> List.choose (fun r -> r.Xg |> Option.map (fun x -> x, r.Estimated))
    let addedAt m =
        included |> countOf (fun r -> (r.Added |> Option.exists (fun a -> a > 0)) && r.Min = Some m)
    { Stage =
        (match c.Stage with
         | FullTimeSeen -> "full-time-seen"
         | InPlay -> "in-play"
         | Unmarked -> "unmarked"
         | NoIncidents -> "no-incidents"
         | Mismatched -> "mismatched")
      LiveMarker = c.Markers |> List.exists (fun m -> m.Live)
      ExtraTimeMarker = c.Markers |> List.exists (fun m -> beyondRegulationTexts.Contains(textOf m))
      Read =
        (match c.Shots with
         | Readable _ -> true
         | Unreadable _ -> false
         | NoShotmap -> false)
      Shots = List.length c.Raws
      OwnGoalRows = c.Raws |> countOf isOwnGoal
      ShootoutKicks = c.Raws |> countOf isShootoutKick
      Positive = numbered |> countOf (fun (x, _) -> x > 0.0)
      Zero = numbered |> countOf (fun (x, _) -> x = 0.0)
      Estimated = numbered |> countOf snd
      WithoutXg = included |> countOf (fun r -> r.Xg.IsNone)
      WithoutMinute = included |> countOf (fun r -> r.Min.IsNone)
      WithoutSide = included |> countOf (fun r -> r.Home.IsNone)
      Malformed =
        included
        |> countOf (fun r -> r.Added.IsNone || negative r.Min || negative r.Added || (r.Xg |> Option.exists (fun x -> x < 0.0)))
      AddedAt45 = addedAt 45
      AddedAt90 = addedAt 90
      AddedAt105 = addedAt 105
      AddedAt120 = addedAt 120
      AddedElsewhere =
        included
        |> countOf (fun r ->
            (r.Added |> Option.exists (fun a -> a > 0))
            && not (r.Min |> Option.exists (fun m -> List.contains m [ 45; 90; 105; 120 ])))
      SharedMinutes = pass.Shared
      FlowRuns = List.length flow
      FlowClosedByOpponent = flowBy OpponentShot
      FlowClosedByOpponentZeroXg = flowBy OpponentShotOfZeroXg
      FlowClosedByShared = flowBy SharedMinute
      FlowClosedAtHalfTime = flowBy (PeriodEnd FirstHalf)
      FlowClosedAtFullTime = flowBy (PeriodEnd SecondHalf)
      FlowClosedAtExtraInterval = flowBy (PeriodEnd ExtraFirst)
      FlowClosedAtExtraEnd = flowBy (PeriodEnd ExtraSecond)
      FlowClosedByCaptureEnd = flowBy CaptureEnd
      SeparatorsHalfTime = pass.Separators |> countOf ((=) FirstHalf)
      SeparatorsFullTime = pass.Separators |> countOf ((=) SecondHalf)
      SeparatorsExtraInterval = pass.Separators |> countOf ((=) ExtraFirst)
      SplitHalfTime = pass.Splits |> countOf ((=) FirstHalf)
      SplitFullTime = pass.Splits |> countOf ((=) SecondHalf)
      SplitExtraInterval = pass.Splits |> countOf ((=) ExtraFirst)
      ZeroInsideFlowRuns = flow |> List.sumBy (fun r -> r.Zeros)
      EstimatedInsideFlowRuns = flow |> List.sumBy (fun r -> r.Estimated) }
