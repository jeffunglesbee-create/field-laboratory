module Stamina

// SECOND WIND, NHL. Task 3 of docs/CC-CMD-2026-10-15-empowerment-metrics.md.
//
// WHAT THIS IS ARITHMETIC ABOUT, AND NOTHING ELSE. A skater's individual shot
// attempts in the last third of his own regulation ice time, against his own
// first third, against the same ratio over a reference population. It is not
// a claim about a body. No biometric input exists anywhere in this pipeline, so
// nothing here, in the docs, or in the one string this module emits may assert
// conditioning, fitness or biology (spec, Task 3 opening paragraph). The case
// names `Stamina` and `SecondWind` are the spec's words. `TrailingRate` was the
// spec's `Fatiguing` until the owner ruled on 2026-10-16 (CC-CMD Task 3) to keep
// conditioning terms out of the accessible name; whether `SecondWind` follows
// is the question that ruling leaves open.
//
// CREDITED BY NAME, NEVER BY MEMBERSHIP. A goal goes to `scoringPlayerId`; a
// shot on goal, a missed shot and a blocked shot go to `shootingPlayerId`.
// Nothing here asks who was on the ice, so the two classes Task 0 measured as
// broken under the end-exclusive on-ice join (goals 23/101, penalties 0/133)
// cannot fail here, and every goal counts. Penalties are not an attempt and are
// not in `AttemptKind`: they are excluded BY NAME and counted
// (`PenaltiesNotCredited`). `staminaCoverage` measures where named credit sits
// against the credited player's own shifts, under [a,b), under (a,b] and under
// neither, with a period guard and a moved-clock control. It is a measurement
// of the boundary the spec asked about; nothing is credited through it.
//
// THE TWO DENOMINATORS. (1) Within-player: the test conditions on the skater's
// own n = first + last, so his own first third is the baseline and his level
// cancels. (2) Population: his band's expected last-third share,
// sum(last) / (sum(first) + sum(last)), from a reference season.
//
// THE PREMISE THE SPEC STATED, MEASURED, AND REFUTED UNDER THIS MEASURE. The
// spec says "most players decline late, so flat is not the null". Over the
// 2025-26 regular season, every 4th game id (328 of 328 games, 11807 skater-
// games; field-relay-nba run 38962367310, outbox/empowerment-premises-latest.json
// key `nhl`, reproduced with identical values by run 38963130231), the
// population's last third is level with its first third or above it in every
// band (the middle band's 0.996 is level, not a decline):
//
//     regulation ice     skater-games   first third   last third
//     under 720 s                1971          1061         1122
//     720 to 1079 s              5505          5308         5286
//     1080 s and over            4331          5791         5999
//
// and by ice-time decile the last/first ratio runs 1.11, 1.02, 0.96, 1.00,
// 1.00, 1.02, 0.98, 1.09, 0.98, 1.06. So under this contribution measure the
// population is flat to slightly rising, not declining. The metric still
// stands, because the expected share is MEASURED per band rather than assumed
// to be 0.5 or anything else; but the Suite's "declining" curves are test
// inputs, not a description of what hockey does.
//
// INSUFFICIENT IS A SIBLING. Below the fewest attempts at which BOTH verdicts
// are reachable at 2.5% in the skater's band, the reading is `Insufficient`,
// never a fall-through to `TrailingRate` (Task 3, "a sibling case, not a silent
// fall-through"; Rule 99, DISTINGUISHABILITY-A).
//
// THE FOURTH CASE. `PopulationRate` is the spec's "holding flat against a flat
// baseline has nothing": a skater whose split is within the band's rate. Task
// 3's second denominator, plus Rule 99 (absence is a sibling of the value). An
// exact binomial test has three outcomes at every n, and folding the third into
// `TrailingRate` would recreate the absence-defined state the spec names as the
// shared defect.
//
// VOCABULARY. The words that mean what Task 0.3's four on-ice states mean reuse
// them: `NoShiftData` (no regulation shift for the credited skater) and
// `InstantInNoInterval` (an instant inside none of the credited player's own
// shifts). The other counters (`BeyondRegulation`, `CreditedToNonSkater`,
// `AttemptsWithoutCredit`, `PenaltiesNotCredited`, `StartInclusive`,
// `EndInclusive`) count CREDIT classes, not on-ice resolution, which no word in
// that vocabulary covers; that is why they are new.
//
// THE RENDER BOUNDARY (spec "What the ruling still constrains" and the
// accessibility amendment). No public function returns a `Stamina` or an
// `Evidence`. The two projections, `staminaLabel` (the one string site) and
// `staminaMark` (geometry and opacity), take a `FinishedGame` plus a player id
// and compute the reading from the game inside the witness. A `FinishedGame`
// has a private representation and is minted only by `staminaWitness`, from a
// decoded play-by-play (itself private, so no code outside can relabel its
// vendor state) whose own `gameState` is FINAL or OFF with both scores, through
// the existing `Desk.amnestyZone (Desk.Final ...)`. Nothing renders a reading
// to a page in this CC-CMD.

open Thoth.Json

// ---- the two payloads ------------------------------------------------------

/// What the play-by-play's own `gameState` says. Vendor words; any other word,
/// measured or not, is `Unrecognised` and keeps the word.
[<RequireQualifiedAccess>]
type VendorState =
    | Fut
    | Pre
    | Live
    | Crit
    | Final
    | Off
    | Unrecognised of raw: string

/// The four play types that are an individual shot attempt, each credited BY
/// NAME in the play's own details. A penalty is not in this union.
[<RequireQualifiedAccess>]
type AttemptKind =
    | OnGoal
    | Missed
    | Blocked
    | Goal

/// `At` is elapsed seconds from puck drop: (period - 1) * 1200 + mm * 60 + ss.
type Attempt = { Shooter: int; Kind: AttemptKind; AttemptPeriod: int; At: int }

/// A penalty call. Carried only to COUNT the exclusion and to measure its boundary.
type Call = { Offender: int option; CallPeriod: int option; CalledAt: int option }

/// Private: built only by decoding, so no code outside this module can take a
/// decoded game and change what its vendor said about its state or its score.
type PlayByPlay =
    private
        { GameId: int
          State: VendorState
          Score: (int * int) option
          LastPeriod: int
          Skaters: int list
          Attempts: Attempt list
          Calls: Call list
          UncreditedAttempts: int }

type Shift = { Skater: int; ShiftPeriod: int; From: int; Until: int }

type ShiftChart =
    private
        { ChartGameId: int
          Shifts: Shift list
          NonShiftRows: int }

let private clockSeconds (mmss: string) : int option =
    match mmss.Split ':' with
    | [| m; s |] ->
        match System.Int32.TryParse m, System.Int32.TryParse s with
        | (true, mm), (true, ss) when mm >= 0 && ss >= 0 && ss < 60 -> Some(mm * 60 + ss)
        | _ -> None
    | _ -> None

let private elapsed (period: int) (mmss: string) : int option =
    clockSeconds mmss |> Option.map (fun s -> (period - 1) * 1200 + s)

let private vendorStateOf (raw: string) : VendorState =
    match raw with
    | "FUT" -> VendorState.Fut
    | "PRE" -> VendorState.Pre
    | "LIVE" -> VendorState.Live
    | "CRIT" -> VendorState.Crit
    | "FINAL" -> VendorState.Final
    | "OFF" -> VendorState.Off
    | other -> VendorState.Unrecognised other

let private attemptKindOf (typeDescKey: string) : AttemptKind option =
    match typeDescKey with
    | "shot-on-goal" -> Some AttemptKind.OnGoal
    | "missed-shot" -> Some AttemptKind.Missed
    | "blocked-shot" -> Some AttemptKind.Blocked
    | "goal" -> Some AttemptKind.Goal
    | _ -> None

type private Row =
    | Credited of Attempt
    | AttemptWithoutCredit
    | Penalty of Call
    | NotCounted

let private rowDecoder : Decoder<int option * Row> =
    Decode.object (fun get ->
        let key = get.Optional.Field "typeDescKey" Decode.string |> Option.defaultValue ""
        let period = get.Optional.At [ "periodDescriptor"; "number" ] Decode.int
        let at =
            match period, get.Optional.Field "timeInPeriod" Decode.string with
            | Some p, Some clock -> elapsed p clock
            | _ -> None
        let row =
            match attemptKindOf key with
            | Some kind ->
                let creditKey =
                    match kind with
                    | AttemptKind.Goal -> "scoringPlayerId"
                    | AttemptKind.OnGoal
                    | AttemptKind.Missed
                    | AttemptKind.Blocked -> "shootingPlayerId"
                match get.Optional.At [ "details"; creditKey ] Decode.int, period, at with
                | Some shooter, Some p, Some t -> Credited { Shooter = shooter; Kind = kind; AttemptPeriod = p; At = t }
                | _ -> AttemptWithoutCredit
            | None when key = "penalty" ->
                Penalty { Offender = get.Optional.At [ "details"; "committedByPlayerId" ] Decode.int; CallPeriod = period; CalledAt = at }
            | None -> NotCounted
        period, row)

/// rosterSpots with positionCode "G" are goalies: they carry 00:00-20:00 shift
/// rows, so leaving them in would make every goalie a player-game.
let private skaterDecoder : Decoder<int option> =
    Decode.object (fun get ->
        let playerId = get.Required.Field "playerId" Decode.int
        match get.Required.Field "positionCode" Decode.string with
        | "G" -> None
        | _ -> Some playerId)

let private playByPlayDecoder : Decoder<PlayByPlay> =
    Decode.object (fun get ->
        let plays = get.Required.Field "plays" (Decode.list rowDecoder)
        let rows = plays |> List.map snd
        let score =
            match get.Optional.At [ "homeTeam"; "score" ] Decode.int, get.Optional.At [ "awayTeam"; "score" ] Decode.int with
            | Some home, Some away -> Some(home, away)
            | _ -> None
        { GameId = get.Required.Field "id" Decode.int
          State = vendorStateOf (get.Required.Field "gameState" Decode.string)
          Score = score
          LastPeriod = plays |> List.choose fst |> List.fold max 0
          Skaters = get.Required.Field "rosterSpots" (Decode.list skaterDecoder) |> List.choose id |> List.distinct
          Attempts = rows |> List.choose (function Credited a -> Some a | AttemptWithoutCredit | Penalty _ | NotCounted -> None)
          Calls = rows |> List.choose (function Penalty c -> Some c | Credited _ | AttemptWithoutCredit | NotCounted -> None)
          UncreditedAttempts = rows |> List.filter (function AttemptWithoutCredit -> true | Credited _ | Penalty _ | NotCounted -> false) |> List.length })

/// The api-web.nhle.com `/v1/gamecenter/{id}/play-by-play` body.
let staminaPlayByPlay (json: string) : Result<PlayByPlay, string> = Decode.fromString playByPlayDecoder json

type private ChartRow =
    | ShiftRow of gameId: int * Shift
    | NonShift of gameId: int

/// A typeCode-517 row whose times do not read, or end before they start, refuses
/// the whole chart. Measured before this was typed: 0 such rows in 247474 over
/// 328 games (premise run 38962367310), so the refusal costs nothing today and
/// a vendor change would surface as a counted refusal, not as a wrong ice time.
let private shiftRowDecoder (gameId: int) : Decoder<ChartRow> =
    Decode.object (fun get ->
        get.Required.Field "playerId" Decode.int,
        get.Required.Field "period" Decode.int,
        get.Required.Field "startTime" Decode.string,
        get.Required.Field "endTime" Decode.string)
    |> Decode.andThen (fun (skater, period, startTime, endTime) ->
        match elapsed period startTime, elapsed period endTime with
        | Some a, Some b when b >= a -> Decode.succeed (ShiftRow(gameId, { Skater = skater; ShiftPeriod = period; From = a; Until = b }))
        | _ -> Decode.fail (sprintf "shift of player %d in period %d reads %s to %s" skater period startTime endTime))

/// typeCode 505 rows (goal events, 2125 of them in the premise pass) are not
/// shifts. They are counted and never summed into ice time.
let private chartRowDecoder : Decoder<ChartRow> =
    Decode.object (fun get -> get.Required.Field "gameId" Decode.int, get.Required.Field "typeCode" Decode.int)
    |> Decode.andThen (fun (gameId, typeCode) ->
        if typeCode = 517 then shiftRowDecoder gameId else Decode.succeed (NonShift gameId))

let private chartDecoder : Decoder<ShiftChart> =
    Decode.object (fun get -> get.Required.Field "data" (Decode.list chartRowDecoder), get.Required.Field "total" Decode.int)
    |> Decode.andThen (fun (rows, total) ->
        let gameIds = rows |> List.map (function ShiftRow(g, _) -> g | NonShift g -> g) |> List.distinct
        if total <> List.length rows then
            Decode.fail (sprintf "the chart says %d rows and carries %d" total (List.length rows))
        else
            match gameIds with
            | [ gameId ] ->
                Decode.succeed
                    { ChartGameId = gameId
                      Shifts = rows |> List.choose (function ShiftRow(_, s) -> Some s | NonShift _ -> None)
                      NonShiftRows = rows |> List.filter (function NonShift _ -> true | ShiftRow _ -> false) |> List.length }
            | [] -> Decode.fail "no-shift-data: the chart carries no rows"
            | many -> Decode.fail (sprintf "the chart mixes games %A" many))

/// The api.nhle.com `/stats/rest/en/shiftcharts?cayenneExp=gameId={id}` body.
let staminaShifts (json: string) : Result<ShiftChart, string> = Decode.fromString chartDecoder json

// ---- windows over the skater's own accumulated ice time ---------------------

type PlayerGame = { OfGame: int; Player: int; RegulationToi: int; FirstThird: int; LastThird: int }

type Windowed =
    { Players: PlayerGame list
      /// Credited attempts in period 4 or later: overtime and the shootout.
      BeyondRegulation: int
      /// Regulation attempts credited to a rostered skater with no regulation
      /// shift. Never windowed: at zero ice time every instant would read as
      /// the last third.
      NoShiftData: int
      /// Regulation attempts credited to an id that is not a rostered skater
      /// (a goalie, or nobody on the roster).
      CreditedToNonSkater: int
      /// Attempt plays naming nobody, or with no readable clock.
      AttemptsWithoutCredit: int
      PenaltiesNotCredited: int
      NonShiftRows: int }

/// tau: seconds of the skater's regulation shifts elapsed by instant t.
/// Continuous and monotone. A shift ending exactly at t counts in full.
let private iceTimeAt (shifts: (int * int) list) (t: int) : int =
    shifts |> List.sumBy (fun (a, b) -> max 0 (min (t - a) (b - a)))

/// Every rostered skater with regulation ice time, and his credited regulation
/// attempts in the first third (3 tau < T) and the last third (3 tau >= 2T) of
/// that ice time. Integer arithmetic, so no float sits on a boundary.
let staminaPlayerGames (pbp: PlayByPlay) (chart: ShiftChart) : Result<Windowed, string> =
    if chart.ChartGameId <> pbp.GameId then
        Error(sprintf "the shift chart is game %d and the play-by-play is game %d" chart.ChartGameId pbp.GameId)
    else
        let shiftsOf =
            chart.Shifts
            |> List.filter (fun s -> s.ShiftPeriod <= 3)
            |> List.groupBy (fun s -> s.Skater)
            |> List.map (fun (skater, shifts) -> skater, shifts |> List.map (fun s -> s.From, s.Until))
            |> Map.ofList
        let regulationToi skater =
            Map.tryFind skater shiftsOf |> Option.defaultValue [] |> List.sumBy (fun (a, b) -> b - a)
        let skaters = Set.ofList pbp.Skaters
        let regulation = pbp.Attempts |> List.filter (fun a -> a.AttemptPeriod <= 3)
        let players =
            pbp.Skaters
            |> List.choose (fun p ->
                let shifts = Map.tryFind p shiftsOf |> Option.defaultValue []
                let toi = shifts |> List.sumBy (fun (a, b) -> b - a)
                if toi > 0 then Some(p, shifts, toi) else None)
            |> List.map (fun (p, shifts, toi) ->
                let taus = regulation |> List.filter (fun a -> a.Shooter = p) |> List.map (fun a -> iceTimeAt shifts a.At)
                { OfGame = pbp.GameId
                  Player = p
                  RegulationToi = toi
                  FirstThird = taus |> List.filter (fun tau -> 3 * tau < toi) |> List.length
                  LastThird = taus |> List.filter (fun tau -> 3 * tau >= 2 * toi) |> List.length })
        Ok
            { Players = players
              BeyondRegulation = pbp.Attempts |> List.filter (fun a -> a.AttemptPeriod > 3) |> List.length
              NoShiftData = regulation |> List.filter (fun a -> Set.contains a.Shooter skaters && regulationToi a.Shooter = 0) |> List.length
              CreditedToNonSkater = regulation |> List.filter (fun a -> not (Set.contains a.Shooter skaters)) |> List.length
              AttemptsWithoutCredit = pbp.UncreditedAttempts
              PenaltiesNotCredited = List.length pbp.Calls
              NonShiftRows = chart.NonShiftRows }

// ---- the boundary, MEASURED (never used to credit) ------------------------

type Coverage = { Bearing: int; StartInclusive: int; EndInclusive: int; InstantInNoInterval: int }

type CreditCoverage = { Goals: Coverage; OtherAttempts: Coverage; Penalties: Coverage }

/// Is the named player inside one of his own shifts IN THE SAME PERIOD (the
/// guard onIceAt lacks, per Task 3's build constraints), under [a,b), under
/// (a,b], or under neither
/// end of [a,b]? Regulation instants only. `clockShift` moves every instant that
/// many seconds later inside its own period, wrapping only past the period's
/// end, so 0 is the identity and 600 is Task 0's decorrelated control.
let staminaCoverage (clockShift: int) (pbp: PlayByPlay) (chart: ShiftChart) : CreditCoverage =
    let shiftsOf = chart.Shifts |> List.groupBy (fun s -> s.Skater) |> Map.ofList
    let moved (period: int) (t: int) =
        let later = t + clockShift
        if later > period * 1200 then later - 1200 else later
    let covered (rule: int -> int -> int -> bool) (player: int, period: int, t: int) =
        Map.tryFind player shiftsOf
        |> Option.defaultValue []
        |> List.exists (fun s -> s.ShiftPeriod = period && rule s.From s.Until (moved period t))
    let tally (instants: (int * int * int) list) =
        { Bearing = List.length instants
          StartInclusive = instants |> List.filter (covered (fun a b t -> a <= t && t < b)) |> List.length
          EndInclusive = instants |> List.filter (covered (fun a b t -> a < t && t <= b)) |> List.length
          InstantInNoInterval = instants |> List.filter (fun i -> not (covered (fun a b t -> a <= t && t <= b) i)) |> List.length }
    let attempts (kinds: AttemptKind list) =
        pbp.Attempts
        |> List.filter (fun a -> a.AttemptPeriod <= 3 && List.contains a.Kind kinds)
        |> List.map (fun a -> a.Shooter, a.AttemptPeriod, a.At)
    { Goals = tally (attempts [ AttemptKind.Goal ])
      OtherAttempts = tally (attempts [ AttemptKind.OnGoal; AttemptKind.Missed; AttemptKind.Blocked ])
      Penalties =
        pbp.Calls
        |> List.choose (fun c ->
            match c.Offender, c.CallPeriod, c.CalledAt with
            | Some o, Some p, Some t when p <= 3 -> Some(o, p, t)
            | _ -> None)
        |> tally }

// ---- the population curve -------------------------------------------------

/// Bands of regulation ice time. The cut points sit near the measured p10
/// (631 s) and p50-p75 (989-1173 s) of 11807 skater-games; they are a choice,
/// stated as one, and each band must clear the support floor to be used.
[<RequireQualifiedAccess>]
type Band =
    | Under12
    | From12To18
    | From18

let staminaBand (regulationToi: int) : Band =
    if regulationToi < 720 then Band.Under12
    elif regulationToi < 1080 then Band.From12To18
    else Band.From18

type BandCounts = { PlayerGames: int; FirstThirds: int; LastThirds: int }

/// Private: a curve exists only after every band has cleared the floor.
type Curve =
    private
        { Under12: BandCounts
          From12To18: BandCounts
          From18: BandCounts }

let private supportFloor = 1000

let private allBands = [ Band.Under12; Band.From12To18; Band.From18 ]

let private nameOf (band: Band) : string =
    match band with
    | Band.Under12 -> "under 720 s"
    | Band.From12To18 -> "720 to 1079 s"
    | Band.From18 -> "1080 s and over"

let private countsFor (curve: Curve) (band: Band) : BandCounts =
    match band with
    | Band.Under12 -> curve.Under12
    | Band.From12To18 -> curve.From12To18
    | Band.From18 -> curve.From18

let private countsIn (games: PlayerGame list) (band: Band) : BandCounts =
    let inBand = games |> List.filter (fun g -> staminaBand g.RegulationToi = band)
    { PlayerGames = List.length inBand
      FirstThirds = inBand |> List.sumBy (fun g -> g.FirstThird)
      LastThirds = inBand |> List.sumBy (fun g -> g.LastThird) }

/// Each band's sums, whether or not they clear the floor: what a refusal reports.
let staminaBandCounts (games: PlayerGame list) : (string * BandCounts) list =
    allBands |> List.map (fun band -> nameOf band, countsIn games band)

let staminaCurve (games: PlayerGame list) : Result<Curve, string> =
    let curve =
        { Under12 = countsIn games Band.Under12
          From12To18 = countsIn games Band.From12To18
          From18 = countsIn games Band.From18 }
    let thin =
        allBands
        |> List.filter (fun band -> let k = countsFor curve band in k.FirstThirds < supportFloor || k.LastThirds < supportFloor)
    if List.isEmpty thin then Ok curve
    else
        thin
        |> List.map (fun band -> let k = countsFor curve band in sprintf "%s (first %d, last %d)" (nameOf band) k.FirstThirds k.LastThirds)
        |> String.concat "; "
        |> sprintf "refused, under %d attempts in a third: %s" supportFloor
        |> Error

// ---- the sealed verdict -----------------------------------------------------

let private tail = 0.025

let private expectedShare (k: BandCounts) : float =
    float k.LastThirds / float (k.FirstThirds + k.LastThirds)

/// Smallest n with share^n <= tail: the fewest attempts in which an all-one-side
/// split can clear the tail.
let private fewestFor (share: float) : int =
    let rec go n mass = if mass <= tail then n else go (n + 1) (mass * share)
    go 1 share

/// The fewest attempts at which BOTH verdicts are reachable in this band, so no
/// reading that is not Insufficient can be one-sided by construction.
let private eligibleFrom (k: BandCounts) : int =
    let share = expectedShare k
    max (fewestFor share) (fewestFor (1.0 - share))

type BandReading =
    { Name: string
      Counts: BandCounts
      ExpectedShare: float
      PopulationRatio: float
      EligibleFrom: int }

/// The population side of the test, per band. Numbers about a season, not
/// about any player.
let staminaBands (curve: Curve) : BandReading list =
    allBands
    |> List.map (fun band ->
        let k = countsFor curve band
        { Name = nameOf band
          Counts = k
          ExpectedShare = expectedShare k
          PopulationRatio = float k.LastThirds / float k.FirstThirds
          EligibleFrom = eligibleFrom k })

/// Thresholds, for the CI artifact only (SAMPLE-COVERAGE-A, field-relay-nba/CLAUDE.md:
/// printed beside the numbers).
/// Suite rows must not read this: a row whose boundary came from here would
/// move with a threshold mutation and never fail.
let staminaRule = {| Tail = tail; SupportFloor = supportFloor |}

type Evidence =
    private
        { InFirst: int
          InLast: int
          ExpectedShare: float }

/// Arithmetic about attempts, not a body. Private, and no public function
/// returns one: a reading leaves this module only through the two projections.
type Stamina =
    private // no reading is minted outside this module
    | Insufficient of events: int
    | PopulationRate of Evidence
    | TrailingRate of Evidence
    | SecondWind of Evidence

/// P(X >= k) and P(X <= k) for X ~ Binomial(n, share), by the pmf recurrence
/// IN LOG SPACE. The linear recurrence starts from (1 - share)^n, which is 0.0
/// at n = 1300 and share 4/9; every later term is then 0 and both tails read 0.
let private binomialTails (n: int) (share: float) (k: int) : float * float =
    let rest = 1.0 - share
    let mutable logMass = float n * log rest
    let mutable upper = 0.0
    let mutable lower = 0.0
    for i in 0..n do
        let mass = exp logMass
        if i >= k then upper <- upper + mass
        if i <= k then lower <- lower + mass
        logMass <- logMass + log (float (n - i)) - log (float (i + 1)) + log share - log rest
    upper, lower

let private staminaOf (curve: Curve) (game: PlayerGame) : Stamina =
    let band = countsFor curve (staminaBand game.RegulationToi)
    let expected = expectedShare band
    let n = game.FirstThird + game.LastThird
    if n < eligibleFrom band then
        Insufficient n
    else
        let evidence = { InFirst = game.FirstThird; InLast = game.LastThird; ExpectedShare = expected }
        let upper, lower = binomialTails n expected game.LastThird
        if upper <= tail then SecondWind evidence
        elif lower <= tail then TrailingRate evidence
        else PopulationRate evidence

// ---- the witness, bound to the game it came from ----------------------------

/// A finished game's own player-games, held with the amnesty witness that game
/// earned. Private: `staminaWitness` is the only way to obtain one.
type FinishedGame =
    private
        { Zone: Desk.AmnestyZone
          Game: int
          Readable: PlayerGame list }

/// The game's OWN final score, from a payload whose own state says it is over.
/// Every other state is named, with no wildcard, so a new case fails to compile.
let private finalZone (pbp: PlayByPlay) : Desk.AmnestyZone option =
    match pbp.State, pbp.Score with
    | VendorState.Final, Some(home, away) -> Desk.amnestyZone (Desk.Final(home, away, pbp.LastPeriod > 3))
    | VendorState.Off, Some(home, away) -> Desk.amnestyZone (Desk.Final(home, away, pbp.LastPeriod > 3))
    | VendorState.Final, None -> None
    | VendorState.Off, None -> None
    | VendorState.Live, _ -> None
    | VendorState.Crit, _ -> None
    | VendorState.Fut, _ -> None
    | VendorState.Pre, _ -> None
    | VendorState.Unrecognised _, _ -> None

/// The witness for one finished game and its own shift chart. None when the
/// vendor does not say the game is over with both scores, and None when the
/// chart is another game's.
let staminaWitness (pbp: PlayByPlay) (chart: ShiftChart) : FinishedGame option =
    match finalZone pbp, staminaPlayerGames pbp chart with
    | Some zone, Ok windowed -> Some { Zone = zone; Game = pbp.GameId; Readable = windowed.Players }
    | Some _, Error _ -> None
    | None, Ok _ -> None
    | None, Error _ -> None

let private readingOf (curve: Curve) (game: FinishedGame) (player: int) : Stamina option =
    game.Readable
    |> List.tryFind (fun pg -> pg.Player = player && pg.OfGame = game.Game)
    |> Option.map (staminaOf curve)

// ---- the two projections; both demand the witness ----------------------------

/// Geometry and opacity only. No string, no colour word: Palette's Must/Watch
/// are FIELD's watch vocabulary and would encode a recommendation.
type Mark =
    /// Insufficient: the track alone, no tick.
    | TrackOnly
    /// Fractions of the track's width: the band's expected last-third share and
    /// the skater's observed one, and how strongly both ticks are drawn.
    | Ticks of expected: float * observed: float * opacity: float

let staminaMark (curve: Curve) (game: FinishedGame) (player: int) : Mark option =
    let ticks (e: Evidence) (opacity: float) =
        Ticks(e.ExpectedShare, float e.InLast / float (e.InFirst + e.InLast), opacity)
    readingOf curve game player
    |> Option.map (fun reading ->
        match reading with
        | Insufficient _ -> TrackOnly
        | PopulationRate e -> ticks e 0.5
        | TrailingRate e -> ticks e 1.0
        | SecondWind e -> ticks e 1.0)

/// THE one string site for this metric (accessibility amendment): the state's
/// name and the numbers that produced it, generated from the value. Mechanical,
/// never adjectival. None for a player with no regulation ice time in the game.
let staminaLabel (curve: Curve) (game: FinishedGame) (player: int) : string option =
    let counted (state: string) (e: Evidence) =
        sprintf "%s state active, last third %d attempts against %.1f expected" state e.InLast (float (e.InFirst + e.InLast) * e.ExpectedShare)
    readingOf curve game player
    |> Option.map (fun reading ->
        match reading with
        | Insufficient events -> sprintf "Insufficient state active, %d attempts in the first and last thirds" events
        | PopulationRate e -> counted "PopulationRate" e
        | TrailingRate e -> counted "TrailingRate" e
        | SecondWind e -> counted "SecondWind" e)
