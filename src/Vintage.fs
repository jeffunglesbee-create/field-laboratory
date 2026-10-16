module Vintage

// A value that cannot be separated from the season it describes.
//
// WHY
//
// Six Big Data Bowl files are served as 2022 data under `targetYear: 2026`. The
// numbers are well-formed, plausibly sized and four seasons old, and nothing in
// a render path complains, because the season is a field BESIDE the value and
// any reader is free to drop it. docs/CC-CMD-2026-10-15-bdb-frame-types.md is
// the command; this module is its Tasks 1, 2 and 4-6, built for the frames
// artifact first (`Gridiron.decodeFrames`) and generic over the payload so the
// six-file retrofit plugs its own decoder into `decodeEnvelope` rather than
// rewriting it.
//
// WHAT HOLDS IT
//
//   The decoder is the only mint. `Vintage` and `Tracked` have private cases,
//   so outside this module neither can be built or taken apart
//   (docs/VINTAGE-PROOF.md compiles both refusals).
//
//   A missing season fails the decode. It never defaults to the current year:
//   absence reading as "current" is precisely the defect the six existing files
//   have, and the default is what makes it invisible.
//
//   Every exit names a season. `valueAt` releases the value only at the season
//   it was stamped with; `archiveAt` only when that season is an ARCHIVE. There
//   is no accessor that takes a Tracked value alone.
//
// WHAT DOES NOT
//
//   Which season is "current" is the CALLER's argument. This module never reads
//   a clock (the Suite passes literals, the census script passes `nflSeasonOf`
//   of the Eastern field day), so a caller passing a future year mints an
//   archive from a current payload. A 2022 value reaching a 2026 display is a
//   `Result` the caller must handle, not a compile error: the season is a
//   runtime value. The two are said here and in VINTAGE-PROOF rather than left
//   for a reader to infer from the types.

open Thoth.Json

/// An NFL season, named by the calendar year it kicks off in.
[<Measure>]
type season

/// Where a number came from in time. Private cases: only `decodeEnvelope`
/// mints one, so an archive value cannot be relabelled current by hand.
type Vintage = private Archive of int<season> | Current of int<season>

/// A value welded to its vintage. The case is private, so there is no way to
/// build one without the decoder and no pattern that takes one apart.
/// `AttachMembers` makes Fable emit `toJSON` as a method on the value, where
/// `JSON.stringify` looks for it, rather than as a detached function.
[<Fable.Core.AttachMembers>]
type Tracked<'T> =
    private
    | Tracked of value: 'T * vintage: Vintage

    /// Prints its type name and nothing it carries: `string`, `sprintf "%A"` and
    /// interpolation all reach this under Fable. Checked in the Suite.
    override _.ToString() = "Vintage.Tracked"

    /// The same for `JSON.stringify`, which Fable routes through a value's
    /// `toJSON` and which would otherwise serialise the case and its fields.
    member _.toJSON() = "Vintage.Tracked"

/// A refusal to release a value at a season it does not describe.
type VintageMismatch = { displaying: int<season>; value: Vintage }

/// Why an envelope did not decode. Each refusal is its own case, so a caller
/// can tell "no season" from "a season from the future" from "bad bytes".
type DecodeError =
    | NoSeason
    | NoSourceDataset
    | FutureSeason of envelope: int<season> * current: int<season>
    | Malformed of string

/// The season as a JSON NUMBER. Thoth's `Decode.int` also parses a numeric
/// string, so `"season":"2022"` would be stamped 2022 through it; a year
/// written as a string is a different payload from the one the builder writes,
/// and it is refused rather than read.
let private seasonNumber : Decoder<int> =
    fun path value ->
        if Decode.Helpers.isNumber value then Decode.int path value
        else Decode.fail "season is not a JSON number; a year written as a string is refused, not parsed" path value

/// The envelope's two required facts. A null reads as absent (Thoth's optional
/// field), and both absent and null are refusals below.
let private header : Decoder<int option * string option> =
    Decode.object (fun get ->
        get.Optional.Field "season" seasonNumber, get.Optional.Field "sourceDataset" Decode.string)

/// Archive, current, or refused, against the season the caller says is current.
let private stamp (current: int<season>) (stated: int<season>) : Result<Vintage, DecodeError> =
    if stated > current then Error(FutureSeason(stated, current))
    elif stated < current then Ok(Archive stated)
    else Ok(Current stated)

/// The only mint. Reads `season` and `sourceDataset` from the envelope, stamps
/// the payload decoded from the SAME root object, and never reads `targetYear`.
/// The text is parsed once; the header is judged before the payload, so a
/// payload with no season says NoSeason even when its data is also bad.
let decodeEnvelope (current: int<season>) (payload: Decoder<'T>) (text: string) : Result<Tracked<'T>, DecodeError> =
    match Decode.fromString Decode.value text with
    | Error e -> Error(Malformed e)
    | Ok json ->
        match Decode.fromValue "$" header json with
        | Error e -> Error(Malformed e)
        | Ok(None, _) -> Error NoSeason
        | Ok(Some year, source) ->
            match source |> Option.filter (fun s -> s.Trim() <> "") with
            | None -> Error NoSourceDataset
            | Some _ ->
                match stamp current (year * 1<season>) with
                | Error refused -> Error refused
                | Ok vintage ->
                    match Decode.fromValue "$" payload json with
                    | Error e -> Error(Malformed e)
                    | Ok value -> Ok(Tracked(value, vintage))

/// The value, only at the season it describes. Every other season is an
/// Error carrying both, never the value.
let valueAt (displaying: int<season>) (tracked: Tracked<'T>) : Result<'T, VintageMismatch> =
    match tracked with
    | Tracked(value, (Archive s | Current s)) when s = displaying -> Ok value
    | Tracked(_, vintage) -> Error { displaying = displaying; value = vintage }

/// The value only when it is an ARCHIVE of the season being displayed: a season
/// that ended before the current one began. A current-season value is None
/// whatever season is asked for, which is what makes this a witness route and
/// not a second `valueAt`.
let archiveAt (displaying: int<season>) (tracked: Tracked<'T>) : 'T option =
    match tracked with
    | Tracked(value, Archive s) when s = displaying -> Some value
    | Tracked _ -> None

/// The NFL season a calendar month belongs to: from August, the new season.
/// The relay's own rule (field-relay-nba's nflYear), so the two agree on what
/// "current" means. Pure: the caller supplies the year and month.
let nflSeasonOf (year: int) (month: int) : int<season> =
    (if month >= 8 then year else year - 1) * 1<season>
