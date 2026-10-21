module Gravity

// Gravity Well, NFL: a route runner drawing coverage defenders away from his
// teammates, measured per receiver per play.
//
// WHY THIS SHAPE
//
// docs/CC-CMD-2026-10-15-empowerment-metrics.md Task 4 asks for "a player
// drawing defenders away", and the same document's rule for every metric is a
// denominator: "measure against what should have happened, not against zero".
// The task names none, so this module carries two, inside the value:
//
//   The counterfactual. At the release (pass_forward) each coverage defender is
//   assigned to the route runner nearest him. The SAME defenders and the SAME
//   runners are assigned again at that play's snap, from their snap positions:
//   what the receiver's alignment alone gave him. `drawn` is release attention
//   minus snap attention.
//
//   The coverage. How many defenders were in coverage, so "drew 1" is always
//   "drew 1 of 7".
//
// Because both instants assign the same defenders, drawn sums to zero over a
// play's route runners: a defender one receiver gains is one another lost.
// That is the "away from his teammates" in the concept, and it is checked
// (Suite, and scripts/gravity-census.mjs over every play of the capture).
//
// WHAT IT IS NOT
//
//   Not position-adjusted. drawn is relative to the receiver's own snap
//   alignment on that play, not to players at his position; the census
//   reports the per-position mean beside the counts so the structure is in
//   view (it differs by position) rather than removed.
//
//   Not a player trait. There is no per-player roll-up: seven games of one
//   week cannot separate a player from the cell he plays in.
//
//   Route runners and coverage are LINE-GEOMETRY PROXIES: an eligible receiver
//   or a defender strictly past the line at the release. The artifact does not
//   carry wasRunningRoute or wasInitialPassRusher, so a lineman a yard past the
//   line counts as coverage; the census measures how many.
//
// ADR-002. The ruling of 2026-10-15 lets derived verdicts about named players
// reach the page only as geometry, colour or opacity, plus one mechanical
// accessible name. So a `Well` has no string projection except `ToString`,
// which prints its type name, and the two projections that exist take an
// `Archived` witness: a value that only an ARCHIVE season, shown at that
// season, yields. A current or future season cannot be projected at all.

open Units
open Gridiron

/// What a route runner's alignment gave him and what his route took. Private:
/// the only mint is `wellOf`, so a verdict cannot exist without its
/// counterexample (AtSnap) and its denominator (Coverage).
type Pull =
    private
        { AtRelease: int
          AtSnap: int
          Coverage: int }

/// One eligible receiver on one measured play. NOT position-adjusted: the sign
/// is release attention minus snap attention for this receiver on this play,
/// and nothing subtracts what players at his position usually draw.
///
///   Drawing          drew more coverage than his alignment gave him
///   Level            the same; a measured zero, not an absence
///   Ceding           drew less
///   NotRouteRunner   eligible, but not past the line at the release: no
///                    value, a sibling of one (Rule 99)
[<Fable.Core.AttachMembers>]
type Well =
    private
    | Drawing of Pull
    | Level of Pull
    | Ceding of Pull
    | NotRouteRunner

    /// The type name and nothing it carries, through `string`, `%A` and
    /// interpolation. Checked in the Suite.
    override _.ToString() = "Gravity.Well"

    /// The same for `JSON.stringify`.
    member _.toJSON() = "Gravity.Well"

type Receiver = { NflId: int; Pos: string; Well: Well }

/// Why a play has no wells, in the order they are tested. Each is a sibling of
/// a measurement, never a zero.
type Unmeasurable =
    | NoReleaseFrame
    | NoSnapFrame
    | NoSnapper
    | NoRouteRunner
    | NoCoverage
    /// One route runner: his drawn is zero by construction, which says nothing.
    | SoleRouteRunner
    | MissingAtSnap of nflId: int

type PlayGravity =
    | Measured of Receiver list
    | Unmeasured of Unmeasurable

type Measurement =
    { GameId: int
      PlayId: int
      Result: PlayGravity }

/// The geometry a well is drawn with. Sign is SHAPE, magnitude is OPACITY:
/// the opacity is |drawn| / coverage, in [0, 1], and the shape's outline is
/// drawn at any opacity, so a Level (opacity 0) is a visible steady outline and
/// not the same as nothing. A NotRouteRunner has no encoding at all.
type Shape =
    | Expanding
    | Steady
    | Contracting

type Encoding = { Opacity: float; Shape: Shape }

/// The witness. Holds the measurements of an ARCHIVE season, obtained only from
/// `archivedAt` with that season named. Private, so it cannot be forged around
/// a current season's frames.
[<Fable.Core.AttachMembers>]
type Archived =
    private
    | Archived of Measurement list

    override _.ToString() = "Gravity.Archived"
    member _.toJSON() = "Gravity.Archived"

/// Per-position counts for the census. Aggregates only: there is no per-player row.
type PosTally =
    { Pos: string
      RouteRunners: int
      DrawingCount: int
      LevelCount: int
      CedingCount: int
      NotRouteRunnerCount: int
      DrawnSum: int }

/// How far past the line the proxies' members stand at the release, by role
/// and position. This is how the census measures what the line-geometry proxy
/// admits, rather than asserting it is small.
type PastLineTally =
    { Role: string
      Pos: string
      UnderOneYard: int
      OneToTwoYards: int
      TwoYardsOrMore: int }

type Census =
    { Plays: int
      SnapInstants: int
      ReleaseInstants: int
      MeasuredPlays: int
      NoReleaseFramePlays: int
      NoSnapFramePlays: int
      NoSnapperPlays: int
      NoRouteRunnerPlays: int
      NoCoveragePlays: int
      SoleRouteRunnerPlays: int
      MissingAtSnapPlays: int
      ConservationFailures: int
      TiesAtSnap: int
      TiesAtRelease: int
      TwoCentrePlays: int
      CoverageDefenders: int
      Reassigned: int
      LineLabelledInCoverage: int
      LineLabelledReassigned: int
      ByPos: PosTally array
      PastLine: PastLineTally array }

// --- the measurement --------------------------------------------------------

let private eligible = set [ "WR"; "TE"; "RB"; "FB" ]

/// Labels of defensive linemen, used ONLY by the census to measure what the
/// coverage proxy admits. Never part of the metric.
let private lineLabels = set [ "DE"; "DT"; "NT" ]

type private Classified =
    { Line: Position<OffenseRight, Snap>
      Eligible: Player<Release> list
      Runners: Player<Release> list
      Defenders: Player<Release> list
      SnapAt: Map<int, Position<OffenseRight, Snap>> }

/// The first reason a play cannot be measured, in a fixed order, or the sets
/// it is measured over.
let private classify (play: Play) : Result<Classified, Unmeasurable> =
    match play.Released, play.Snapped with
    | None, _ -> Error NoReleaseFrame
    | Some _, None -> Error NoSnapFrame
    | Some released, Some snapped ->
        match snapperAt snapped with
        | None -> Error NoSnapper
        | Some line ->
            let past (p: Player<Release>) = pastLine (toScrimmage line p.At)
            let eligibles = released |> List.filter (fun p -> p.Side = Offense && eligible.Contains p.Pos)
            let runners = eligibles |> List.filter past
            let defenders = released |> List.filter (fun p -> p.Side = Defense && past p)
            let snapAt = snapped |> List.map (fun p -> p.NflId, p.At) |> Map.ofList
            match runners, defenders with
            | [], _ -> Error NoRouteRunner
            | _, [] -> Error NoCoverage
            | [ _ ], _ -> Error SoleRouteRunner
            | _ ->
                match runners @ defenders |> List.tryFind (fun p -> not (snapAt.ContainsKey p.NflId)) with
                | Some absent -> Error(MissingAtSnap absent.NflId)
                | None ->
                    Ok
                        { Line = line
                          Eligible = eligibles
                          Runners = runners
                          Defenders = defenders
                          SnapAt = snapAt }

/// Each defender to the runner nearest him, at ONE instant: both lists carry
/// the same instant tag, so a snap position cannot be set against a release
/// one. A tie goes to the lower nflId (the census counts ties).
let private assign
    (runners: (int * Position<OffenseRight, 'Instant>) list)
    (defenders: (int * Position<OffenseRight, 'Instant>) list)
    : (int * int) list =
    defenders
    |> List.map (fun (d, at) ->
        let nearest = runners |> List.minBy (fun (r, runnerAt) -> distanceSq runnerAt at, r) |> fst
        d, nearest)

/// Defenders at one instant whose two nearest runners are equidistant.
let private tiesAmong
    (runners: (int * Position<OffenseRight, 'Instant>) list)
    (defenders: (int * Position<OffenseRight, 'Instant>) list)
    : int =
    defenders
    |> List.filter (fun (_, at) ->
        match runners |> List.map (fun (_, runnerAt) -> distanceSq runnerAt at) |> List.sort with
        | a :: b :: _ -> a = b
        | _ -> false)
    |> List.length

let private atReleaseOf (c: Classified) =
    (c.Runners |> List.map (fun p -> p.NflId, p.At)), (c.Defenders |> List.map (fun p -> p.NflId, p.At))

let private atSnapOf (c: Classified) =
    (c.Runners |> List.map (fun p -> p.NflId, c.SnapAt.[p.NflId])),
    (c.Defenders |> List.map (fun p -> p.NflId, c.SnapAt.[p.NflId]))

let private attention (runners: Player<Release> list) (assigned: (int * int) list) : Map<int, int> =
    let seed = runners |> List.map (fun p -> p.NflId, 0) |> Map.ofList
    assigned |> List.fold (fun counts (_, r) -> Map.add r (counts.[r] + 1) counts) seed

/// The only mint for a verdict.
let private wellOf (pull: Pull) : Well =
    let drawn = pull.AtRelease - pull.AtSnap
    if drawn > 0 then Drawing pull
    elif drawn = 0 then Level pull
    else Ceding pull

let private measurePlay (play: Play) : Measurement =
    let result =
        match classify play with
        | Error reason -> Unmeasured reason
        | Ok c ->
            let atRelease = attention c.Runners (atReleaseOf c ||> assign)
            let atSnap = attention c.Runners (atSnapOf c ||> assign)
            let coverage = List.length c.Defenders
            let runnerIds = c.Runners |> List.map (fun p -> p.NflId) |> set
            c.Eligible
            |> List.map (fun p ->
                let well =
                    if runnerIds.Contains p.NflId then
                        wellOf
                            { AtRelease = atRelease.[p.NflId]
                              AtSnap = atSnap.[p.NflId]
                              Coverage = coverage }
                    else
                        NotRouteRunner
                ({ NflId = p.NflId; Pos = p.Pos; Well = well }: Receiver))
            |> Measured
    ({ GameId = play.GameId; PlayId = play.PlayId; Result = result }: Measurement)

let private drawnOf (pull: Pull) = pull.AtRelease - pull.AtSnap

// --- the public surface -----------------------------------------------------

/// Every play's result at the season it describes. Wells inside are opaque:
/// reading one needs the `Archived` witness below.
let measuredAt (displaying: int<Vintage.season>) (frames: Vintage.Tracked<Play list>) : Result<Measurement list, Vintage.VintageMismatch> =
    Vintage.valueAt displaying frames |> Result.map (List.map measurePlay)

/// The witness: Some only when the frames are an ARCHIVE of `displaying`.
let archivedAt (displaying: int<Vintage.season>) (frames: Vintage.Tracked<Play list>) : Archived option =
    Vintage.archiveAt displaying frames |> Option.map (List.map measurePlay >> Archived)

let private wellIn (Archived measured) (gameId: int) (playId: int) (nflId: int) : Well option =
    measured
    |> List.tryPick (fun m ->
        if m.GameId = gameId && m.PlayId = playId then
            match m.Result with
            | Measured receivers -> receivers |> List.tryFind (fun r -> r.NflId = nflId) |> Option.map (fun r -> r.Well)
            | Unmeasured _ -> None
        else
            None)

/// The one string site (the 2026-10-15 accessibility amendment): state name
/// plus the numbers that produced it, generated from the value. None when the
/// receiver is not in the archived set.
let accessibleName (archived: Archived) (gameId: int) (playId: int) (nflId: int) : string option =
    wellIn archived gameId playId nflId
    |> Option.map (fun well ->
        match well with
        | Drawing p -> sprintf "Drawing state active, defenders drawn %d of %d" (drawnOf p) p.Coverage
        | Level p -> sprintf "Level state active, defenders drawn %d of %d" (drawnOf p) p.Coverage
        | Ceding p -> sprintf "Ceding state active, defenders drawn %d of %d" (drawnOf p) p.Coverage
        | NotRouteRunner -> "NotRouteRunner state active")

/// Position labels for a play's receivers, in order, numbered where a position
/// repeats ("WR1", "WR2"), so a sentence can say which one. Labelling, not a
/// measurement: the page's position list uses the same labels.
let receiverLabels (receivers: Receiver list) : string list =
    let total pos = receivers |> List.filter (fun r -> r.Pos = pos) |> List.length
    receivers
    |> List.mapi (fun i r ->
        if total r.Pos > 1 then
            let nth = receivers |> List.take (i + 1) |> List.filter (fun q -> q.Pos = r.Pos) |> List.length
            sprintf "%s%d" r.Pos nth
        else
            r.Pos)

/// The archived-play narrative (ADR-002 amendment, owner 2026-10-21): for each
/// receiver, the coverage defenders nearest him at the snap and at the throw,
/// in the play's own receiver order, and who drew the most. Behind the same
/// `Archived` witness as `encodeWell`, so a current season has no sentence.
let playNarrative (Archived measured) (gameId: int) (playId: int) : string option =
    measured
    |> List.tryFind (fun m -> m.GameId = gameId && m.PlayId = playId)
    |> Option.bind (fun m ->
        match m.Result with
        | Unmeasured _ -> None
        | Measured receivers ->
            let labelled = List.zip (receiverLabels receivers) receivers
            let pulls = labelled |> List.choose (fun (label, r) -> match r.Well with Drawing p | Level p | Ceding p -> Some(label, p) | NotRouteRunner -> None)
            let coverage = pulls |> List.tryHead |> Option.map (fun (_, p) -> p.Coverage)
            let each =
                labelled
                |> List.map (fun (label, r) ->
                    match r.Well with
                    | Drawing p | Level p | Ceding p -> sprintf "%s %d → %d" label p.AtSnap p.AtRelease
                    | NotRouteRunner -> sprintf "%s not running a route" label)
                |> String.concat ", "
            let most =
                match pulls |> List.sortByDescending (fun (_, p) -> drawnOf p) with
                | (pos, p) :: rest when drawnOf p > 0 && not (rest |> List.exists (fun (_, q) -> drawnOf q = drawnOf p)) ->
                    sprintf " The %s drew the most, %d more at the throw than at the snap." pos (drawnOf p)
                | (_, p) :: _ when drawnOf p > 0 -> sprintf " The most any receiver drew was %d more, shared." (drawnOf p)
                | _ -> " No receiver drew more defenders at the throw than at the snap."
            match coverage with
            | None -> None
            | Some c -> Some(sprintf "Coverage defenders nearest each receiver, at the snap → at the throw (%d in coverage): %s.%s" c each most))

let private share (pull: Pull) : float =
    float (abs (drawnOf pull)) / float pull.Coverage

/// The geometry, for an archived receiver only. A NotRouteRunner has none:
/// absence is drawn as nothing, never as a zero-opacity value.
let encodeWell (archived: Archived) (gameId: int) (playId: int) (nflId: int) : Encoding option =
    wellIn archived gameId playId nflId
    |> Option.bind (fun well ->
        match well with
        | Drawing p -> Some { Opacity = share p; Shape = Expanding }
        | Level p -> Some { Opacity = share p; Shape = Steady }
        | Ceding p -> Some { Opacity = share p; Shape = Contracting }
        | NotRouteRunner -> None)

// --- the census -------------------------------------------------------------

let private bin (yards: float<yd>) =
    if yards < 1.0<yd> then 0
    elif yards < 2.0<yd> then 1
    else 2

let private censusOf (plays: Play list) : Census =
    let measured = plays |> List.map measurePlay
    let reasons = measured |> List.choose (fun m -> match m.Result with Unmeasured r -> Some r | Measured _ -> None)
    let count reason = reasons |> List.filter (fun r -> r = reason) |> List.length
    let classified = plays |> List.choose (fun p -> match classify p with Ok c -> Some c | Error _ -> None)
    let receivers = measured |> List.collect (fun m -> match m.Result with Measured rs -> rs | Unmeasured _ -> [])
    let drawnOfWell well =
        match well with
        | Drawing p | Level p | Ceding p -> Some(drawnOf p)
        | NotRouteRunner -> None
    let conservationFailures =
        measured
        |> List.filter (fun m ->
            match m.Result with
            | Measured rs -> (rs |> List.choose (fun r -> drawnOfWell r.Well) |> List.sum) <> 0
            | Unmeasured _ -> false)
        |> List.length
    let reassignedIn (c: Classified) =
        let atRelease = atReleaseOf c ||> assign |> Map.ofList
        let atSnap = atSnapOf c ||> assign |> Map.ofList
        c.Defenders |> List.filter (fun d -> atRelease.[d.NflId] <> atSnap.[d.NflId])
    let byPos =
        receivers
        |> List.groupBy (fun r -> r.Pos)
        |> List.sortBy fst
        |> List.map (fun (pos, rs) ->
            let isCase f = rs |> List.filter (fun r -> f r.Well) |> List.length
            ({ Pos = pos
               RouteRunners = rs |> List.filter (fun r -> (drawnOfWell r.Well).IsSome) |> List.length
               DrawingCount = isCase (function Drawing _ -> true | _ -> false)
               LevelCount = isCase (function Level _ -> true | _ -> false)
               CedingCount = isCase (function Ceding _ -> true | _ -> false)
               NotRouteRunnerCount = isCase (function NotRouteRunner -> true | _ -> false)
               DrawnSum = rs |> List.choose (fun r -> drawnOfWell r.Well) |> List.sum }: PosTally))
        |> Array.ofList
    // `classify` succeeds exactly on the measured plays (a sole runner is its
    // own refusal), so these are the plays every diagnostic below is over.
    let pastLineRows =
        let rows role (members: Classified -> Player<Release> list) =
            classified
            |> List.collect (fun c -> members c |> List.map (fun p -> p.Pos, bin (yardsPast (toScrimmage c.Line p.At))))
            |> List.groupBy fst
            |> List.sortBy fst
            |> List.map (fun (pos, bins) ->
                let inBin b = bins |> List.filter (fun (_, x) -> x = b) |> List.length
                ({ Role = role; Pos = pos; UnderOneYard = inBin 0; OneToTwoYards = inBin 1; TwoYardsOrMore = inBin 2 }: PastLineTally))
        rows "route runner" (fun c -> c.Runners) @ rows "coverage" (fun c -> c.Defenders) |> Array.ofList
    let reassigned = classified |> List.collect reassignedIn
    let snaps = plays |> List.choose (fun p -> p.Snapped)
    ({ Plays = List.length plays
       SnapInstants = List.length snaps
       ReleaseInstants = plays |> List.filter (fun p -> p.Released.IsSome) |> List.length
       MeasuredPlays = (List.length measured) - (List.length reasons)
       NoReleaseFramePlays = count NoReleaseFrame
       NoSnapFramePlays = count NoSnapFrame
       NoSnapperPlays = count NoSnapper
       NoRouteRunnerPlays = count NoRouteRunner
       NoCoveragePlays = count NoCoverage
       SoleRouteRunnerPlays = count SoleRouteRunner
       MissingAtSnapPlays = reasons |> List.filter (function MissingAtSnap _ -> true | _ -> false) |> List.length
       ConservationFailures = conservationFailures
       TiesAtSnap = classified |> List.sumBy (fun c -> atSnapOf c ||> tiesAmong)
       TiesAtRelease = classified |> List.sumBy (fun c -> atReleaseOf c ||> tiesAmong)
       TwoCentrePlays =
         snaps
         |> List.filter (fun ps -> (ps |> List.filter (fun p -> p.Side = Offense && p.Pos = "C") |> List.length) >= 2)
         |> List.length
       CoverageDefenders = classified |> List.sumBy (fun c -> c.Defenders.Length)
       Reassigned = reassigned.Length
       LineLabelledInCoverage =
         classified
         |> List.sumBy (fun c -> c.Defenders |> List.filter (fun d -> lineLabels.Contains d.Pos) |> List.length)
       LineLabelledReassigned = reassigned |> List.filter (fun d -> lineLabels.Contains d.Pos) |> List.length
       ByPos = byPos
       PastLine = pastLineRows }: Census)

/// The census over every play, at the season the frames describe. Aggregates
/// by position only.
let gravityCensus (displaying: int<Vintage.season>) (frames: Vintage.Tracked<Play list>) : Result<Census, Vintage.VintageMismatch> =
    Vintage.valueAt displaying frames |> Result.map censusOf
