module Bdb

// The NFL scout panel's Big Data Bowl rows, typed. A mirror of what
// jubilant-bassoon's src/legacy/field.js does by hand (4172d95f, b615d5b8,
// fa24e59c), built so that each of the three defects that work met is
// something the compiler refuses rather than something a test catches.
// docs/CC-CMD-2026-10-18-bdb-scout-mirror.md is the command.
//
// THE THREE, AND WHAT HOLDS EACH
//
//   A 2022 value read as current. Every file is decoded through
//   Vintage.decodeEnvelope, so a season is welded to it at the boundary, and
//   every exit below takes the season being displayed as an argument and puts
//   it in the row's label. There is no accessor that takes a Tracked value
//   alone (Vintage's own guarantee, docs/VINTAGE-PROOF.md).
//
//   A speed shown without "≥". A tracked maximum is what a player reached THEN,
//   so the most it says about now is "at least". `SpeedFloor` has a private
//   case: it is built only by `speedIndex` and read only by `floorText`, which
//   writes the mark. docs/BDB-PROOF.md compiles both refusals.
//
//   A name ambiguity tested against a shared, mutable table. The client's
//   loader ran twice, and its second pass saw every name again and blanked all
//   1626 (fa24e59c). Here the index is a fold over ONE file's rows into a fresh
//   immutable map: there is no shared table for a second load to read.
//
// WHAT DOES NOT
//
//   A name match is not an identity match. A 2023+ player who shares a name
//   with a different 2022 player would take that player's floor; only a
//   collision INSIDE the 2022 file is caught. The depth chart carries no BDB
//   nflId, and no cross-era mapping was probed. Said here, as the client says it.

open System.Text.RegularExpressions
open Thoth.Json

/// Miles per hour, as the builder's `maxSpeedMph` states it.
[<Measure>]
type mph

type TeamTendency =
    { Team: string
      PlayActionRate: float
      DropbackRate: float
      TopFormation: string }

type TeamTimeToThrow =
    { Team: string
      Seconds: float
      Dropbacks: int }

type SpeedRow =
    { Name: string
      /// The 2022 club, as the file files him. Never used for display: filing a
      /// 2022 player under his 2022 team in a current game is the defect the
      /// client's 4172d95f removed.
      Team2022: string
      MaxMph: float<mph> }

/// team -> depth-chart position -> starter's name.
type DepthChart = Map<string, Map<string, string>>

/// The rows under `data`, keyed by anything; a row with a null measure is
/// skipped, as the client skips it, rather than refusing the whole file.
let private dataRows (row: Decoder<'T option>) : Decoder<'T list> =
    Decode.field "data" (Decode.keyValuePairs row |> Decode.map (List.choose snd))

let private tendency : Decoder<TeamTendency option> =
    Decode.object (fun get ->
        match get.Optional.Field "playActionRate" Decode.float with
        | None -> None
        | Some pa ->
            Some
                { TeamTendency.Team = (get.Required.Field "team" Decode.string).ToUpperInvariant()
                  PlayActionRate = pa
                  DropbackRate = get.Required.Field "dropbackRate" Decode.float
                  TopFormation = get.Required.Field "topFormation" Decode.string })

let private timeToThrow : Decoder<TeamTimeToThrow option> =
    Decode.object (fun get ->
        match get.Optional.Field "avgTimeToThrow" Decode.float with
        | None -> None
        | Some seconds ->
            Some
                { TeamTimeToThrow.Team = (get.Required.Field "team" Decode.string).ToUpperInvariant()
                  Seconds = seconds
                  Dropbacks = get.Required.Field "dropbacks" Decode.int })

let private speed : Decoder<SpeedRow option> =
    Decode.object (fun get ->
        match get.Optional.Field "maxSpeedMph" Decode.float with
        | None -> None
        | Some v ->
            Some
                { Name = get.Required.Field "name" Decode.string
                  Team2022 = get.Required.Field "team" Decode.string
                  MaxMph = v * 1.0<mph> })

let private depth : Decoder<DepthChart> =
    Decode.field "data" (Decode.keyValuePairs (Decode.keyValuePairs Decode.string))
    |> Decode.map (List.map (fun (team, starters) -> team.ToUpperInvariant(), Map.ofList starters) >> Map.ofList)

let decodeTendency current text = Vintage.decodeEnvelope current (dataRows tendency) text
let decodeTimeToThrow current text = Vintage.decodeEnvelope current (dataRows timeToThrow) text
let decodeSpeed current text = Vintage.decodeEnvelope current (dataRows speed) text
let decodeDepthChart current text = Vintage.decodeEnvelope current depth text

// ---------------------------------------------------------------------------
// Team rows: released with the season that released them, in the label.
// ---------------------------------------------------------------------------

/// A scout row: its label and the value per team. Built only here, so every
/// label below says the season it was released at.
type TeamRow<'T> = { Label: string; ByTeam: Map<string, 'T> }

let private teamRow (title: string) (team: 'T -> string) (displaying: int<Vintage.season>) (tracked: Vintage.Tracked<'T list>) =
    Vintage.archiveAt displaying tracked
    |> Option.map (fun rows ->
        { Label = sprintf "%s (%d)" title (int displaying)
          ByTeam = rows |> List.map (fun r -> team r, r) |> Map.ofList })

/// "Tendencies (2022)": only from a file that IS the 2022 archive.
let tendencyRow displaying (tracked: Vintage.Tracked<TeamTendency list>) =
    teamRow "Tendencies" (fun (r: TeamTendency) -> r.Team) displaying tracked

/// "Time to throw (2022)", the same way.
let timeToThrowRow displaying (tracked: Vintage.Tracked<TeamTimeToThrow list>) =
    teamRow "Time to throw" (fun (r: TeamTimeToThrow) -> r.Team) displaying tracked

// ---------------------------------------------------------------------------
// The speed floor.
// ---------------------------------------------------------------------------

/// What a player reached in the archive season. The case is private: built by
/// `speedIndex` alone, read by `floorText` alone.
[<Fable.Core.AttachMembers>]
type SpeedFloor =
    private
    | SpeedFloor of float<mph>

    override _.ToString() = "Bdb.SpeedFloor"
    member _.toJSON() = "Bdb.SpeedFloor"

/// The only way a floor reaches text, and it writes the mark.
let floorText (SpeedFloor v) = sprintf "≥%.1f" (float v)

let private suffixes = set [ "jr"; "jr."; "sr"; "sr."; "ii"; "iii"; "iv" ]

/// The join key, the client's `_bdbNameKey`: lower case, one trailing suffix
/// token dropped, everything but a-z stripped. So `DJ Moore` = `D.J. Moore` and
/// `Kyle Pitts Sr.` = `Kyle Pitts`.
let nameKey (name: string) : string =
    let parts = Regex.Split(name.ToLowerInvariant().Trim(), @"\s+") |> Array.filter (fun p -> p <> "") |> List.ofArray
    let kept =
        if parts.Length > 1 && suffixes.Contains(List.last parts) then List.take (parts.Length - 1) parts
        else parts
    Regex.Replace(String.concat "" kept, "[^a-z]", "")

/// Name -> floor, or no floor for a name two archive rows share. Private case:
/// only `speedIndex` builds one, from an archive.
type SpeedIndex =
    private
    | SpeedIndex of season: int<Vintage.season> * floors: Map<string, SpeedFloor option>

/// A fold over ONE file's rows into a fresh map. A repeat load cannot see
/// the previous one, so it cannot mark the names it already holds ambiguous.
let private index (rows: SpeedRow list) : Map<string, SpeedFloor option> =
    rows
    |> List.fold
        (fun (seen: Map<string, SpeedFloor option>) r ->
            let k = nameKey r.Name
            if k = "" then seen
            elif seen.ContainsKey k then seen.Add(k, None)
            else seen.Add(k, Some(SpeedFloor r.MaxMph)))
        Map.empty

/// The index, only when the file is the archive of the season named.
let speedIndex (displaying: int<Vintage.season>) (tracked: Vintage.Tracked<SpeedRow list>) : SpeedIndex option =
    Vintage.archiveAt displaying tracked |> Option.map (fun rows -> SpeedIndex(displaying, index rows))

/// How many names carry a floor, and how many were dropped as shared.
let indexCounts (SpeedIndex(_, floors)) =
    floors |> Map.fold (fun (named, ambiguous) _ f -> if Option.isSome f then named + 1, ambiguous else named, ambiguous + 1) (0, 0)

let floorOf (SpeedIndex(_, floors)) (name: string) : SpeedFloor option =
    floors |> Map.tryFind (nameKey name) |> Option.flatten

/// The positions read, in display order. Not ranked by speed: a ranking over
/// only the players tracked in 2022 leaves out everyone who arrived since.
let skillPositions = [ "QB"; "RB"; "WR"; "TE" ]

/// The CURRENT depth chart's skill starters who have a floor, in position order.
let starterFloors (idx: SpeedIndex) (chart: DepthChart) (team: string) : (string * SpeedFloor) list =
    match chart |> Map.tryFind (team.ToUpperInvariant()) with
    | None -> []
    | Some starters ->
        skillPositions
        |> List.choose (fun pos ->
            starters |> Map.tryFind pos |> Option.bind (fun name -> floorOf idx name |> Option.map (fun f -> name, f)))

/// "Kyler Murray" -> "K.Murray", the client's display form.
let private short (name: string) = Regex.Replace(name, @"^(\w)\w+\s+", "$1.")

/// One side of the row: the team nickname, then each starter with his floor.
let speedSide (idx: SpeedIndex) (chart: DepthChart) (team: string) (nick: string) : string =
    match starterFloors idx chart team with
    | [] -> sprintf "%s —" nick
    | floors -> floors |> List.map (fun (n, f) -> sprintf "%s %s" (short n) (floorText f)) |> String.concat " · " |> sprintf "%s %s" nick

/// "Speed floor mph (2022)": the season is the index's own.
let speedLabel (SpeedIndex(season, _)) = sprintf "Speed floor mph (%d)" (int season)
