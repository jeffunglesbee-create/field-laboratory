module TacticalLock

open Thoth.Json
open Units

// TACTICAL LOCK (docs/CC-CMD-2026-10-15-empowerment-metrics.md, Task 2).
//
// A verdict about one side's defence over a 4-minute window of ACTIVE play: did
// the opponent hold the territory and still fail to make chances? The spec puts
// two conditions on that window before any verdict is drawn, and no capture in
// R2 meets either.
//
// 1. DEAD TIME OUT. "Stoppages excluded, or the window silently counts dead time
//    as suppression." The premise pass over every capture (field-relay-nba run
//    38962367310, outbox/empowerment-premises-latest.json, `soccer.T`; stats.json
//    for 788 of 788 non-shell captures, incidents.json for 786) found:
//    - one key finer than the minute anywhere in stats.json or incidents.json:
//      `period_second`, on 66 incident objects. No shot carries a clock below
//      its `min` and `added`.
//    - six incident types: period 1589, card 2830, goal 2378, injuryTime 1298,
//      substitution 7240, varDecision 220. None is a throw-in, goal kick or foul.
//    - restarts only inside goals' build-up `sequence[]` (throw-in 64, free-kick
//      2, of 8166 events), and 0 of the 8166 carry a time key.
//    So no stoppage can be placed on a clock, and none can be taken out.
//
// 2. A TERRITORY DENOMINATOR "within the same window" (spec section 0.4: "Without
//    it the metric has no denominator and Task 2 cannot be built"). The payload's
//    named territory measures, final-third entries and possession, are per half
//    or per match. `momentum`, the one per-minute series, is validated as
//    territory at HALF grain only (Task 2's build constraints; Task 0's session
//    doc: "validated at half grain, its minute values only in aggregate"). Task
//    0's probe read it more strongly, as a per-minute territory proxy; the spec
//    narrowed that reading and this module follows the spec.
//
// THE RECONCILIATION with section 0.4. Neither input of the spec's table exists
// at window grain, so no real window reaches the table. What is built is the
// table, its counterexample discipline and its own unmeasured cases, because
// done condition 5 needs constructors to loosen and checks to catch it:
// - `ActivePlayOnly` is a TEST SEAM. The census below never decodes one from a
//   capture.
// - `Territory` is a judgement handed in, never read here from momentum.
// - `Bars` are uncalibrated to any window length. No measurable window exists to
//   set them from, so no production value ships.
// Reopening the window needs a source with sub-minute clocks AND typed restarts;
// docs/CC-CMD-2026-10-16-bsd-ws-frame-shape.md asks the WebSocket feed for both.
//
// WHERE THE GATE IS. Classifying is not gated: computing over every capture is
// allowed. Drawing a state and naming it are: both demand `Desk.AmnestyZone`.
// The compiler checks that a witness is held, not where it came from
// (docs/AMNESTY-PROOF.md, the Tactical Lock section).

/// Whether the opponent held the territory in the window: the spec's
/// denominator. A judgement handed in by whoever builds the evidence.
type Territory =
    | OpponentHigh
    | OpponentLow

/// What a window is known to contain.
type WindowEvidence =
    /// Stoppages are in the window and cannot be taken out.
    | DeadTimeIn
    /// Active play only: the opponent's territory, judged, and each opponent
    /// shot's xG. Nothing decodes one from a capture (see the header).
    | ActivePlayOnly of opponentTerritory: Territory * opponentShots: float32<xg> list

/// The two xG bars a lock is held to. Private, so the smart constructor below is
/// the only way in. It refuses a best-chance bar that is negative or not a
/// number, and one at or above the total bar: a best chance never exceeds the
/// total it is part of, so under such bars the best-chance refusal could never
/// refuse anything. Uncalibrated (see the header).
type Bars =
    private
        { Total: float32<xg>
          BestChance: float32<xg> }

let lockBars (total: float32<xg>) (bestChance: float32<xg>) : Bars option =
    if 0.0f<xg> <= bestChance && bestChance < total then
        Some { Total = total; BestChance = bestChance }
    else
        None

/// JSON.stringify's string path. Fable gives every union a `toJSON` that writes
/// its case and its fields, which would print a lock's two numbers. The sealed
/// types below answer with their type name instead.
type IJsonOpaque =
    abstract toJSON: unit -> string

/// A defence over one window. Private, so classifying is the only source: a lock
/// is computed, never written down, and its numbers are never read back out
/// except as the accessible name. No equality, so two states cannot be compared
/// to learn which one a value is. Every runtime string path prints the type
/// name only: the override covers `string`, `%A` and interpolation under Fable,
/// the interface covers JSON.stringify. The compiler refuses none of those
/// paths; docs/AMNESTY-PROOF.md says which half is compile-time.
[<NoEquality; NoComparison>]
type DefenseState =
    private
    | Searching
    | Quiet
    | LockedOn of suppressed: float32<xg> * bestChanceAllowed: float32<xg>
    /// Dead time could not be taken out of the window.
    | ActivePlayUnmeasured
    /// A chance in the window has an xG that is not a finite number at or above
    /// zero (BSD writes a null `xg` on some shots). Never a verdict either way.
    | ChanceUnmeasured

    override _.ToString() = "DefenseState"

    interface IJsonOpaque with
        member _.toJSON() = "DefenseState"

/// A chance is measured when its xG is a number, at or above zero, below
/// infinity. Written so that holding is the condition: NaN fails both sides.
let private measured (chance: float32<xg>) =
    0.0f<xg> <= chance && chance < infinityf * 1.0f<xg>

/// The only constructor of a lock. It takes the opponent's best chance, the
/// counterexample, and refuses when either bar is exceeded. Equal to a bar is
/// not exceeding it.
let private lockedOn (b: Bars) (suppressed: float32<xg>) (bestChanceAllowed: float32<xg>) : DefenseState option =
    if suppressed <= b.Total && bestChanceAllowed <= b.BestChance then
        Some(LockedOn(suppressed, bestChanceAllowed))
    else
        None

/// One window's verdict. `suppressed` is the opponent's summed xG in the window;
/// whether the spec meant "held to" or "taken away" is a question for the owner.
/// Both high-xG cells of the spec's table, conceding on the break and under
/// siege, are `Searching`: the approved type has no case to split them.
let lockClassify (b: Bars) (w: WindowEvidence) : DefenseState =
    match w with
    | DeadTimeIn -> ActivePlayUnmeasured
    | ActivePlayOnly(territory, shots) ->
        if not (List.forall measured shots) then
            ChanceUnmeasured
        else
            let suppressed = List.sum shots
            let best = List.fold max 0.0f<xg> shots

            match territory with
            | OpponentHigh ->
                match lockedOn b suppressed best with
                | Some locked -> locked
                | None -> Searching
            | OpponentLow ->
                if suppressed <= b.Total && best <= b.BestChance then Quiet else Searching

/// The shape a state takes on a page: one per state, and neither unmeasured
/// state is drawn like Quiet. Its name prints as the type name only: a shape
/// maps one-to-one onto a state, so printing it would print the state.
[<RequireQualifiedAccess>]
type LockShape =
    | Shield
    | OpenArc
    | Ring
    | Hatch
    | Stipple

    override _.ToString() = "LockShape"

    interface IJsonOpaque with
        member _.toJSON() = "LockShape"

/// A state, encoded for drawing. Private and string-free like the state: only
/// the encoder below, under the witness, makes one. Colour and opacity are not
/// chosen, because nothing renders yet, and a later render must stay off the
/// palette's watch tiers (ADR-002 Rule F).
[<NoEquality; NoComparison>]
type LockEncoding =
    private
    | LockEncoding of LockShape

    override _.ToString() = "LockEncoding"

    interface IJsonOpaque with
        member _.toJSON() = "LockEncoding"

let lockEncode (_zone: Desk.AmnestyZone) (s: DefenseState) : LockEncoding =
    match s with
    | LockedOn _ -> LockEncoding LockShape.Shield
    | Searching -> LockEncoding LockShape.OpenArc
    | Quiet -> LockEncoding LockShape.Ring
    | ActivePlayUnmeasured -> LockEncoding LockShape.Hatch
    | ChanceUnmeasured -> LockEncoding LockShape.Stipple

let lockShapeOf (LockEncoding shape) : LockShape = shape

/// The one string site (CC-CMD accessibility amendment): the state's name, then
/// the numbers that produced it, named for what they are. The label says
/// "opponent xG" and not "suppressed" because the meaning of `suppressed` is the
/// owner's question, and a screen reader should not hear a guess.
let lockAriaLabel (_zone: Desk.AmnestyZone) (s: DefenseState) : string =
    match s with
    | Searching -> "Searching state active"
    | Quiet -> "Quiet state active"
    | LockedOn(suppressed, best) ->
        sprintf "LockedOn state active, opponent xG %.2f, opponent best chance xG %.2f" (float suppressed) (float best)
    | ActivePlayUnmeasured -> "ActivePlayUnmeasured state active"
    | ChanceUnmeasured -> "ChanceUnmeasured state active"

// --- the census over captures ------------------------------------------------
//
// One capture's windows, decided by what the capture carries and counted by
// what classifying them returns. A window is Task 0's grid
// (scripts/probe-empowerment.mjs, `lockOf`): the four minutes ending at minute
// e, e from 4 to 90, never across half time; stoppage time folds into minute
// 45 or 90 as the shotmap's `min` does, and extra time is outside the grid.
// Windows end no later than the capture's last minute (shots, incidents,
// momentum), so a capture taken at 80' has no window ending at 85'. Each window
// is read twice, once for each side's defence against the other side's shots.

/// One capture's windows, counted. Every field is a count of team windows.
type LockWindows =
    { /// Windows on the grid inside the capture, once per defending side.
      TeamWindows: int
      /// No incident in the capture is a restart carrying a clock below the
      /// minute, so no stoppage can be taken out of any window.
      RestartsUnclocked: int
      /// Restarts are clocked, but an opponent shot in the window is not.
      ShotsUnclocked: int
      /// Windows classifying returned ActivePlayUnmeasured for: the two counts
      /// above, if classifying is right.
      Unmeasured: int
      /// Dead time removable. Still no verdict: the payload has no territory
      /// reading at the window's grain.
      Clocked: int
      /// Of the clocked windows, those classifying locks with the territory
      /// judged high, under bars that refuse no measured chance: an upper bound
      /// over every choice of bars.
      LockedOnPossible: int
      /// Windows holding an opponent shot whose `xg` is not a number.
      XgMissing: int }

type private Shot =
    { Min: int
      Home: bool
      Xg: float option
      ShotClock: bool }

type private Incident =
    { Kind: string option
      Minute: float option
      IncidentClock: bool }

type private WindowRead =
    | NoRestartClock
    | NoShotClock
    | ActiveExtent of float32<xg> list

/// Task 0's TIME_KEY (scripts/probe-empowerment.mjs) without the minute-grain
/// names: `minute`, `min`, `added` and `added_time` are not finer than the minute.
let private subMinuteKeys =
    set [ "t"; "ts"; "uts"; "time"; "timestamp"; "frame"; "frameid"; "frame_id"; "sec"; "second"; "period_second" ]

/// Restarts and the stoppages before them, by the laws of the game, compared
/// with case, hyphens, underscores and spaces removed.
let private restartKinds =
    set [ "kickoff"; "throwin"; "goalkick"; "corner"; "cornerkick"; "freekick"; "penaltykick"; "dropball"; "droppedball"; "foul"; "offside" ]

let private isRestart (kind: string option) =
    match kind with
    | Some k ->
        restartKinds.Contains(k.ToLowerInvariant().Replace("-", "").Replace("_", "").Replace(" ", ""))
    | None -> false

/// True when the object carries a NUMBER under a key finer than the minute.
let private carriesClock: Decoder<bool> =
    Decode.keyValuePairs (Decode.oneOf [ Decode.float |> Decode.map Some; Decode.succeed None ])
    |> Decode.map (List.exists (fun (key, value) -> value.IsSome && subMinuteKeys.Contains(key.ToLowerInvariant())))

let private shotDecoder: Decoder<Shot> =
    Decode.object (fun get ->
        { Min = get.Required.Field "min" Decode.int
          Home = get.Required.Field "home" Decode.bool
          Xg = get.Optional.Field "xg" Decode.float
          ShotClock = get.Required.Raw carriesClock })

let private incidentDecoder: Decoder<Incident> =
    Decode.object (fun get ->
        { Kind = get.Optional.Field "type" Decode.string
          Minute = get.Optional.Field "minute" Decode.float
          IncidentClock = get.Required.Raw carriesClock })

let private statsDecoder: Decoder<Shot list * float list> =
    Decode.object (fun get ->
        get.Required.Field "shotmap" (Decode.list shotDecoder),
        get.Optional.Field "momentum" (Decode.list (Decode.field "m" Decode.float))
        |> Option.defaultValue [])

/// Bars that refuse no measured chance: an infinite total, and the largest best
/// chance a float32 holds. They meet the smart constructor's rule (zero, at most
/// the best-chance bar, below the total), so a window locked under them is a
/// window some choice of bars would lock.
let private refuseNothing =
    { Total = infinityf * 1.0f<xg>
      BestChance = System.Single.MaxValue * 1.0f<xg> }

/// A shot BSD wrote with a null `xg` enters as not-a-number, which classifying
/// keeps out of every verdict.
let private chanceOf (s: Shot) : float32<xg> =
    match s.Xg with
    | Some x -> float32 x * 1.0f<xg>
    | None -> nanf * 1.0f<xg>

/// Count one capture's windows. `incidents` is None when the capture has no
/// incidents.json. An unreadable file is an Error naming it, never zero windows.
let lockWindows (stats: string) (incidents: string option) : Result<LockWindows, string> =
    let incidentsRead =
        match incidents with
        | Some text -> Decode.fromString (Decode.field "incidents" (Decode.list incidentDecoder)) text
        | None -> Ok []

    match Decode.fromString statsDecoder stats, incidentsRead with
    | Error e, _ -> Error("stats.json: " + e)
    | _, Error e -> Error("incidents.json: " + e)
    | Ok(shots, momentum), Ok incs ->
        let restartsClocked =
            incs |> List.exists (fun i -> i.IncidentClock && isRestart i.Kind)

        let last =
            List.max (
                0
                :: List.map (fun s -> s.Min) shots
                @ List.choose (fun i -> i.Minute |> Option.map int) incs
                @ List.map int momentum
            )

        let ends = [ 4 .. min 45 last ] @ [ 49 .. min 90 last ]

        let against =
            [ for e in ends do
                  for defendingHome in [ true; false ] do
                      yield shots |> List.filter (fun s -> s.Home <> defendingHome && e - 3 <= s.Min && s.Min <= e) ]

        let read (opponentShots: Shot list) =
            if not restartsClocked then NoRestartClock
            elif opponentShots |> List.exists (fun s -> not s.ShotClock) then NoShotClock
            else ActiveExtent(List.map chanceOf opponentShots)

        let reads = List.map read against

        let verdicts =
            reads
            |> List.map (function
                | NoRestartClock
                | NoShotClock -> lockClassify refuseNothing DeadTimeIn
                | ActiveExtent chances -> lockClassify refuseNothing (ActivePlayOnly(OpponentHigh, chances)))

        let count p xs = xs |> List.filter p |> List.length

        Ok
            { TeamWindows = List.length reads
              RestartsUnclocked = reads |> count (function NoRestartClock -> true | _ -> false)
              ShotsUnclocked = reads |> count (function NoShotClock -> true | _ -> false)
              Unmeasured = verdicts |> count (function ActivePlayUnmeasured -> true | _ -> false)
              Clocked = reads |> count (function ActiveExtent _ -> true | _ -> false)
              LockedOnPossible = verdicts |> count (function LockedOn _ -> true | _ -> false)
              XgMissing = against |> count (List.exists (fun s -> s.Xg.IsNone)) }
