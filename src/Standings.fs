module Standings

open Thoth.Json
open Forecast

// THE EPL TABLE, AS THE RELAY SERVES IT, DECODED INTO THE ROWS THE MODEL READS.
//
// Source: `/espn-standings/soccer/eng.1/standings` on the relay. Probed
// 2026-11-08 from the sandbox, which does reach the relay today: HTTP 200,
// `access-control-allow-origin: *`, a 15-minute edge cache, 20 entries, each with
// the stat names `gamesPlayed`, `points`, `pointsFor`, `pointsAgainst` and
// `deductions` (`pointsFor` and `pointsAgainst` are goals for and against, ESPN's
// generic names for a soccer table). The real payload is committed as
// `data/standings-eng1-2026-11-08.json`; `data/PROVENANCE.md` records how.
//
// A STAT THAT IS NOT THERE IS AN ERROR, NEVER A ZERO. Reading a missing
// `gamesPlayed` as 0 would hand `Forecast.rating` a club that "has played
// nothing" and the card would say so in a sentence — a true-looking account of a
// payload that never said it. This repository has shipped that shape before
// (`epa_table.json`: every lookup missed and returned `?? 0`), so the decoder
// fails the whole table and names the club and the stat.
//
// A DUPLICATE CLUB NAME IS AN ERROR TOO. The card joins to this table by name,
// and two rows answering to one name would make the join pick one of them by
// position. A table that cannot be joined unambiguously is not a table.
//
// What is deliberately NOT read: rank, rank change, the note, the logos, the
// season list. Nothing downstream asks for them, and a field decoded for no
// consumer is a field that can go stale unnoticed.

/// One entry of a club's `stats` array. `value` is absent on `overall`, which is
/// a text record ("9-0-1") and not a number, so it is optional here and every
/// stat that IS read below must have one.
type private Stat =
    { Name: string
      Value: float option }

let private statDecoder : Decoder<Stat> =
    Decode.object (fun get ->
        { Name = get.Required.Field "name" Decode.string
          Value = get.Optional.Field "value" Decode.float })

/// A stat by ESPN's own name, as a whole number.
///
/// Whole, because every one of these is a count — played, points, goals — and a
/// fractional 10.5 means the payload is not what this decoder was written
/// against. NaN fails the same test (it is not equal to its own floor).
let private whole (stats: Stat list) (name: string) : Result<int, string> =
    match stats |> List.tryFind (fun s -> s.Name = name) with
    | None -> Error(sprintf "stat \"%s\" is missing" name)
    | Some { Value = None } -> Error(sprintf "stat \"%s\" has no value" name)
    | Some { Value = Some v } ->
        if v = System.Math.Floor v && abs v < 1000000.0 then Ok(int v)
        else Error(sprintf "stat \"%s\" is %g, not a whole number" name v)

let private rowOf (team: string) (abbrev: string) (stats: Stat list) : Result<TableRow, string> =
    let stat = whole stats
    stat "gamesPlayed" |> Result.bind (fun played ->
    stat "points" |> Result.bind (fun points ->
    stat "pointsFor" |> Result.bind (fun goalsFor ->
    stat "pointsAgainst" |> Result.bind (fun goalsAgainst ->
    stat "deductions" |> Result.map (fun deductions ->
        makeRow team abbrev played points goalsFor goalsAgainst deductions)))))

/// One entry. The club is named in the failure so a bad payload says WHICH row
/// it could not read, not just that one failed.
let private entryDecoder : Decoder<TableRow> =
    Decode.object (fun get ->
        get.Required.At [ "team"; "shortDisplayName" ] Decode.string,
        get.Required.At [ "team"; "abbreviation" ] Decode.string,
        get.Required.Field "stats" (Decode.list statDecoder))
    |> Decode.andThen (fun (team, abbrev, stats) ->
        match rowOf team abbrev stats with
        | Ok row -> Decode.succeed row
        | Error why -> Decode.fail (sprintf "%s: %s" team why))

/// The club names that appear more than once.
let private duplicated (rows: TableRow list) : string list =
    rows
    |> List.countBy (fun r -> r.Team)
    |> List.filter (fun (_, count) -> count > 1)
    |> List.map fst

let private rowsDecoder : Decoder<TableRow list> =
    Decode.field "children" (Decode.index 0 (Decode.at [ "standings"; "entries" ] (Decode.list entryDecoder)))
    |> Decode.andThen (fun rows ->
        match rows, duplicated rows with
        | [], _ -> Decode.fail "the table has no entries"
        | _, [] -> Decode.succeed rows
        | _, names -> Decode.fail (sprintf "more than one row answers to: %s" (String.concat ", " names)))

/// The rows of a standings payload, or the reason there are none.
let fromString (json: string) : Result<TableRow list, string> =
    Decode.fromString rowsDecoder json
