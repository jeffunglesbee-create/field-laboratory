module Gridiron

// The Big Data Bowl event frames, decoded with the coordinate frame and the
// instant carried in the type.
//
// WHY
//
// docs/CC-CMD-2026-10-15-empowerment-metrics.md, Task 4: "Carry the frame so
// that subtraction is a compile error." Its soccer finding is that two payload
// paths share a key name and a shape while meaning different frames, and mixing
// them "silently mirrors the away team — no error, a plausible wrong answer".
//
// The NFL artifact has the same hazard in a different place. Every row of
// `data` is `{gameId, playId, event, players:[{nflId, team, pos, side, x, y}]}`:
// a ball_snap row and a pass_forward row for one play have the same keys, the
// same shape and the same players. Subtracting a snap position from a release
// position compiles in any untyped reading and gives a plausible distance that
// describes no moment of the play. And the metric derives a second coordinate
// frame (yards past the line of scrimmage) that also has an along and an
// across.
//
// So a position is `Position<'Frame, 'Instant>`: two phantom tags, private
// fields, minted only by the decoder (served frame) or by `toScrimmage` (the
// derived one). docs/GRAVITY-PROOF.md compiles the refusals.
//
// NAMES. BDB calls an instant a "frame" (frameId). Here "frame" means a
// COORDINATE frame only, and an instant is called an instant.
//
// THE CONVENTION IS DATA, AND IT IS CHECKED, NOT ASSUMED. The envelope states
// `coordinateConvention: {frame: "offense-right", units: "yards"}` and the
// builder verified it before upload (910/910 and 895/895 on x, 53/53 and 57/57
// on y; jubilant-bassoon outbox/bdb-event-frames-build-latest.json). The
// decoder refuses any other frame or unit by name instead of reading it.

open Thoth.Json
open Units

/// The served frame: origin where the offense's own end line meets the sideline
/// on its right; along runs 0 to 120 toward the offense's goal, across 0 to
/// 53.3 toward the offense's left.
type OffenseRight = interface end

/// The derived frame: origin at the snapper's position at the snap; along is
/// yards past the line of scrimmage, across is yards to the offense's left of
/// the snapper.
type Scrimmage = interface end

/// The ball_snap instant.
type Snap = interface end

/// The pass_forward instant: the moment the ball leaves the passer's hand.
type Release = interface end

/// A point on the field, in one coordinate frame, at one instant. The fields
/// are private, so no reader can take an along out of one frame and set it
/// against another: arithmetic goes through the functions below, which demand
/// matching tags.
type Position<'Frame, 'Instant> =
    private
        { Along: float<yd>
          Across: float<yd> }

type Side =
    | Offense
    | Defense

/// One player at one instant, in the served frame.
type Player<'Instant> =
    { NflId: int
      Team: string
      Pos: string
      Side: Side
      At: Position<OffenseRight, 'Instant> }

/// One play: its snap instant and its release instant, either of which the
/// artifact may not carry (54 plays in the 2022 week-2 capture are snap-only).
type Play =
    { GameId: int
      PlayId: int
      Snapped: Player<Snap> list option
      Released: Player<Release> list option }

/// Squared distance between two positions in the SAME frame at the SAME
/// instant. Squared, so comparisons stay exact and no square root is taken
/// that nothing needs.
let distanceSq (a: Position<'Frame, 'Instant>) (b: Position<'Frame, 'Instant>) : float<yd ^ 2> =
    let along = a.Along - b.Along
    let across = a.Across - b.Across
    along * along + across * across

/// Re-express a served position relative to the line of scrimmage. The anchor
/// must be a SNAP position: the line is where the ball was snapped, not where
/// the snapper has drifted to by the release.
let toScrimmage (snapper: Position<OffenseRight, Snap>) (p: Position<OffenseRight, 'Instant>) : Position<Scrimmage, 'Instant> =
    { Along = p.Along - snapper.Along
      Across = p.Across - snapper.Across }

/// Yards past the line of scrimmage. Defined on the scrimmage frame only, so
/// the one scalar this module lets out already has the line subtracted.
let yardsPast (p: Position<Scrimmage, 'Instant>) : float<yd> = p.Along

/// Strictly past the line. A player level with the snapper is not past it.
let pastLine (p: Position<Scrimmage, 'Instant>) : bool = yardsPast p > 0.0<yd>

/// The snapper's position at the snap: the forward-most offensive player
/// labelled C. In 32 of the capture's 545 snap instants two offensive players
/// carry C, all in game 2022091803 (the census counts them). In all 32 the
/// forward-most is the one nearest the quarterback's y: a scratch measurement
/// recorded in outbox/gravity-well-2026-10-16.md, not an artifact.
let snapperAt (atSnap: Player<Snap> list) : Position<OffenseRight, Snap> option =
    match atSnap |> List.filter (fun p -> p.Side = Offense && p.Pos = "C") with
    | [] -> None
    | centres -> Some (centres |> List.maxBy (fun p -> p.At.Along)).At

// --- decoding ---------------------------------------------------------------

type private Row =
    | SnapRow of gameId: int * playId: int * players: Player<Snap> list
    | ReleaseRow of gameId: int * playId: int * players: Player<Release> list

let private side : Decoder<Side> =
    Decode.string
    |> Decode.andThen (fun s ->
        match s with
        | "offense" -> Decode.succeed Offense
        | "defense" -> Decode.succeed Defense
        | other -> Decode.fail (sprintf "side %s is neither offense nor defense; refused rather than guessed" other))

/// x and y become along and across with no transform: the builder already
/// rotated left-direction plays into the declared frame.
let private player<'Instant> () : Decoder<Player<'Instant>> =
    Decode.object (fun get ->
        let along = get.Required.Field "x" Decode.float
        let across = get.Required.Field "y" Decode.float
        { NflId = get.Required.Field "nflId" Decode.int
          Team = get.Required.Field "team" Decode.string
          Pos = get.Required.Field "pos" Decode.string
          Side = get.Required.Field "side" side
          At = { Along = along * 1.0<yd>; Across = across * 1.0<yd> } })

let private row : Decoder<Row> =
    Decode.object (fun get ->
        get.Required.Field "gameId" Decode.int, get.Required.Field "playId" Decode.int, get.Required.Field "event" Decode.string)
    |> Decode.andThen (fun (gameId, playId, event) ->
        match event with
        | "ball_snap" ->
            Decode.field "players" (Decode.list (player<Snap> ()))
            |> Decode.map (fun ps -> SnapRow(gameId, playId, ps))
        | "pass_forward" ->
            Decode.field "players" (Decode.list (player<Release> ()))
            |> Decode.map (fun ps -> ReleaseRow(gameId, playId, ps))
        | other -> Decode.fail (sprintf "event %s is not one this decoder reads; refused rather than dropped" other))

/// The declared convention, refused by name if it is not the one this module
/// was written against.
let private convention : Decoder<unit> =
    Decode.field
        "coordinateConvention"
        (Decode.object (fun get -> get.Required.Field "frame" Decode.string, get.Required.Field "units" Decode.string))
    |> Decode.andThen (fun (frame, units) ->
        if frame <> "offense-right" then
            Decode.fail (sprintf "coordinateConvention.frame is %s; this decoder reads offense-right only" frame)
        elif units <> "yards" then
            Decode.fail (sprintf "coordinateConvention.units is %s; this decoder reads yards only" units)
        else
            Decode.succeed ())

/// Rows into plays, in (gameId, playId) order. A second row with an event a
/// play already has is refused: choosing one of two would be choosing an answer.
let private group (rows: Row list) : Result<Play list, string> =
    let blank gameId playId : Play =
        { GameId = gameId; PlayId = playId; Snapped = None; Released = None }
    let twice gameId playId = Error(sprintf "play %d/%d carries the same event twice; refused rather than choosing one" gameId playId)
    rows
    |> List.fold
        (fun (acc: Result<Map<int * int, Play>, string>) r ->
            match acc with
            | Error e -> Error e
            | Ok plays ->
                match r with
                | SnapRow(g, p, ps) ->
                    let play = plays |> Map.tryFind (g, p) |> Option.defaultValue (blank g p)
                    if play.Snapped.IsSome then twice g p
                    else Ok(Map.add (g, p) { play with Snapped = Some ps } plays)
                | ReleaseRow(g, p, ps) ->
                    let play = plays |> Map.tryFind (g, p) |> Option.defaultValue (blank g p)
                    if play.Released.IsSome then twice g p
                    else Ok(Map.add (g, p) { play with Released = Some ps } plays))
        (Ok Map.empty)
    |> Result.map (Map.toList >> List.map snd)

let private frames : Decoder<Play list> =
    convention
    |> Decode.andThen (fun () -> Decode.field "data" (Decode.list row))
    |> Decode.andThen (fun rows ->
        match group rows with
        | Ok plays -> Decode.succeed plays
        | Error reason -> Decode.fail reason)

/// The frames artifact, stamped with its season. `current` is the caller's:
/// this module reads no clock.
let decodeFrames (current: int<Vintage.season>) (text: string) : Result<Vintage.Tracked<Play list>, Vintage.DecodeError> =
    Vintage.decodeEnvelope current frames text
