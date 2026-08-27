module Weather

open System
open Thoth.Json

// Venue weather, built from playground's implementation and FIELD's own record
// of how this feature failed — not ported from either.
//
// THE RECORD, because it decides the whole design. From production's May 22 2026
// session document, describing a weather engine that had shipped and been
// flagged as working since May 19:
//
//   "Six functions were called but never defined anywhere in the file:
//    wxDescription(), wxIcon(), wxAlert(), wxBadge(), isOutdoorVenue(),
//    getVenueCoords(). fetchWeather's try-catch swallowed the ReferenceError
//    silently. wxCache stayed empty. No badges ever appeared. The feature-flag
//    'weather-drama-bonus': '2026-05-19' was a lie."
//
// A feature that never executed once, behind a flag saying it had. In F# each of
// those six names is FS0039 and the build stops — see docs/WEATHER-PROOF.md,
// where that exact call is compiled and refused.
//
// Every type below answers a failure that is written down somewhere, not one I
// imagined:
//
//   FS0039                  six undefined functions, silently swallowed (May 22 doc)
//   Coordinates             `getVenueCoords` returned null for indoor venues, so a
//                           retractable roof got no weather at all
//   RoofType as data        `isOutdoorVenue` fuzzy-matched venue NAMES against
//                           ["arena","dome","garden",...] with an exceptions list
//                           for the ones it got wrong (May 9 doc)
//   RoofState.Unknown       nothing knows whether a retractable roof was CLOSED
//   Precipitation           precipitation includes snow, so snow labelled "rain"
//   degF / mph / mm         the units are query parameters and were consumed as
//                           bare numbers
//   SlateWeather            zero readings from a non-empty venue list must not
//                           render the "no venues have coordinates" empty state
//   cache takes a Reading   failures must never be cached

// --- units -------------------------------------------------------------------
//
// Open-Meteo's units are chosen by QUERY PARAMETER — `temperature_unit=fahrenheit`,
// `wind_speed_unit=mph`. Change the URL and every downstream number silently
// means something else. That is the `prob`/`pct` failure with a different pair of
// scales, so it gets the same treatment.

[<Measure>]
type degF

[<Measure>]
type mph

/// Millimetres. Open-Meteo reports precipitation and snowfall in mm even when
/// temperature is in Fahrenheit, which is exactly the kind of mixed-unit payload
/// that reads as consistent because everything is a `number`.
[<Measure>]
type mm

// --- where -------------------------------------------------------------------

/// A point on the globe, validated once.
///
/// Private, so a caller cannot assemble a pair of floats and call it a location.
/// The relay's venue strings arrive as free text; a latitude of 400 is a data
/// error and must not become a fetch.
type Coordinates =
    private
        { Lat: float
          Lon: float }

/// The cache key. Rounded to 3 decimal places, which is production's own
/// convention ("wxCache, keyed by lat_lon rounded to 3 decimal places") and is
/// about 110 m — far finer than a stadium and coarse enough that two venue
/// ALIASES resolve to one fetch.
///
/// Its own type rather than a string, so nothing can key the cache by venue
/// name. 98 venue keys map to 95 distinct locations here; keying by name would
/// fetch the same place three times and let two aliases disagree.
type CoordKey = private CoordKey of string

let coordinates (lat: float) (lon: float) : Coordinates option =
    if Double.IsNaN lat || Double.IsNaN lon then None
    elif lat < -90.0 || lat > 90.0 then None
    elif lon < -180.0 || lon > 180.0 then None
    else Some { Lat = lat; Lon = lon }

let coordKey ({ Lat = lat; Lon = lon }) : CoordKey =
    CoordKey(sprintf "%.3f_%.3f" lat lon)

let coordKeyText (CoordKey k) = k

// --- the roof ----------------------------------------------------------------

/// What kind of roof a venue has. Three cases, from playground's hand-reviewed
/// table: 87 open, 10 retractable, 1 dome.
///
/// Production models this as a flat `isOutdoor: boolean`, and gets it wrong:
/// loanDepot park is filed `isOutdoor: true` and is retractable. A boolean has
/// no room for the third state, so the error had nowhere to be visible.
type RoofType =
    | OpenAir
    | Retractable
    | Dome

/// Whether the game was actually played in the open.
///
/// This is the honest limit as a type. Nothing in this payload — or in
/// playground's, or in production's — knows whether a retractable roof was
/// CLOSED for a given game. Playground says so in a `title` attribute, which is
/// the right instinct in a language where it can only be prose.
///
/// Here `Retractable` maps to `Unknown` and there is no constructor that turns
/// an unknown into an open-air. The same shape as Scout's `Unanswerable` and the
/// sections' `EmptyOrFailed`: the awkward middle case is the true one.
type RoofState =
    | PlayedInTheOpen
    | Covered
    | UnknownRoofState

let roofState =
    function
    | OpenAir -> PlayedInTheOpen
    | Dome -> Covered
    | Retractable -> UnknownRoofState

// --- what the sky is doing ---------------------------------------------------

/// Precipitation, as ONE fact rather than two independent numbers.
///
/// Open-Meteo reports `precipitation` (everything) and `rain` (only rain), and
/// they are not independent — precipitation includes snow and showers. Two
/// floats side by side invite the mistake playground had to write a comment
/// about: check snow BEFORE rain, or snow (rain = 0, precipitation > 0) gets
/// labelled "rain".
///
/// Constructed once, with the containment invariant checked, so the ordering
/// question cannot arise downstream — there is nothing to order.
type Precipitation =
    private
        { Total: float<mm>
          Rain: float<mm> }

/// What is falling. Derived, total, and the only thing callers see.
type Falling =
    | Dry
    | Raining of float<mm>
    /// Precipitation with no rain component. Snow, sleet or hail — the payload
    /// cannot tell which, and this name says so rather than picking one.
    | FrozenOrMixed of float<mm>
    /// Rain and something else at once.
    | RainAndFrozen of rain: float<mm> * other: float<mm>

/// Rejects rain greater than the total, which is not a possible reading and has
/// meant a units mix-up every time this repo has seen the shape.
let precipitation (total: float<mm>) (rain: float<mm>) : Precipitation option =
    if total < 0.0<mm> || rain < 0.0<mm> then None
    elif rain > total + 0.001<mm> then None
    else Some { Total = total; Rain = min rain total }

/// The snow-before-rain question, answered by construction rather than by
/// remembering to write the branches in the right order.
let falling ({ Total = total; Rain = rain }) : Falling =
    let other = total - rain
    let wet v = v > 0.0<mm>
    match wet rain, wet other with
    | false, false -> Dry
    | true, false -> Raining rain
    | false, true -> FrozenOrMixed other
    | true, true -> RainAndFrozen(rain, other)

// --- a reading ---------------------------------------------------------------

type Reading =
    { Temperature: float<degF>
      /// "Feels like". Open-Meteo's `apparent_temperature`.
      FeelsLike: float<degF> option
      Wind: float<mph>
      Gusts: float<mph> option
      /// Degrees clockwise from true north, the direction the wind is coming FROM.
      WindFrom: int option
      Precip: Precipitation }

/// The compass point wind is coming from.
///
/// Sixteen points would be false precision on a 10 m model; eight is what a
/// reader can use. The arithmetic is `((deg + 22) / 45) % 8` rather than a chain
/// of range comparisons, because the chain is where the wraparound at 360 gets
/// dropped.
let compass (degrees: int) : string =
    let points = [| "N"; "NE"; "E"; "SE"; "S"; "SW"; "W"; "NW" |]
    let normalised = ((degrees % 360) + 360) % 360
    points.[((normalised + 22) / 45) % 8]

/// One line a person can read. Total over `Falling`, so a fifth precipitation
/// state would not compile until it had a sentence.
let describeConditions (r: Reading) : string =
    let temp = sprintf "%d°F" (int (Math.Round(float r.Temperature)))
    let wind =
        match r.WindFrom with
        | Some d -> sprintf "%d mph %s" (int (Math.Round(float r.Wind))) (compass d)
        | None -> sprintf "%d mph" (int (Math.Round(float r.Wind)))
    let sky =
        match falling r.Precip with
        | Dry -> "clear"
        | Raining v -> sprintf "rain %.1fmm" (float v)
        | FrozenOrMixed v -> sprintf "snow or sleet %.1fmm" (float v)
        | RainAndFrozen(rain, other) -> sprintf "rain %.1fmm with %.1fmm frozen" (float rain) (float other)
    sprintf "%s · %s · %s" temp sky wind

// --- a venue's weather -------------------------------------------------------

type VenueWeather =
    { Venue: string
      Where: Coordinates
      Roof: RoofType
      Reading: Reading }

/// The compact form for a scoreboard card.
///
/// Deliberately shorter than `describeConditions`: the card already carries a
/// venue, a matchup, a score, a status, odds and a desk line, and a seventh
/// full sentence would make the card a paragraph. Temperature and sky only.
///
/// The roof caveat does NOT go in this string. A card chip has no room for
/// "not known whether the roof was closed", and dropping the caveat to fit
/// would be the display walking past the honest limit — the exact move
/// `RoofState` exists to prevent. It goes in `cardChipTitle`, which the view
/// puts on the element's `title` and accessible name.
let cardChip (vw: VenueWeather) : string =
    let temp = int (Math.Round(float vw.Reading.Temperature))
    match falling vw.Reading.Precip with
    | Dry -> sprintf "%d°F" temp
    | Raining _ -> sprintf "%d°F · rain" temp
    | FrozenOrMixed _ -> sprintf "%d°F · snow or sleet" temp
    | RainAndFrozen _ -> sprintf "%d°F · rain and ice" temp

/// The caveat that rides with the chip, never dropped to fit.
let cardChipTitle (vw: VenueWeather) : string =
    let conditions = describeConditions vw.Reading
    match roofState vw.Roof with
    | PlayedInTheOpen -> sprintf "%s — open air" conditions
    | Covered -> sprintf "%s — outside a fixed roof, not what the game experiences" conditions
    | UnknownRoofState ->
        sprintf "%s — retractable roof; not known whether it was closed" conditions

/// A reading eligible for the warmest/coldest line.
///
/// Private, and `rankable` is the only way to get one. Playground states the
/// rule in prose — "the verdict line only ranks open venues, because a covered
/// venue's location weather isn't necessarily what the game experiences" — and
/// then relies on every future caller filtering correctly. Here a covered venue
/// has no value to rank, so it cannot enter the comparison by accident.
type RankableReading = private RankableReading of VenueWeather

let rankable (vw: VenueWeather) : RankableReading option =
    match roofState vw.Roof with
    | PlayedInTheOpen -> Some(RankableReading vw)
    | Covered
    | UnknownRoofState -> None

let rankedVenue (RankableReading vw) = vw

/// Warmest and coldest among open-air venues only.
let extremes (readings: VenueWeather list) : (VenueWeather * VenueWeather) option =
    match readings |> List.choose rankable |> List.map rankedVenue with
    | [] -> None
    | open_ ->
        let byTemp = open_ |> List.sortBy (fun v -> float v.Reading.Temperature)
        Some(List.last byTemp, List.head byTemp)

// --- the slate ---------------------------------------------------------------

/// The outcome of asking for a slate's weather.
///
/// The case that matters is the last one. Playground handles it by THROWING:
/// "zero results from a non-empty venue list throws rather than resolving
/// {venues: []} — otherwise a total outage would render the misleading 'no
/// venues with known coordinates' empty state instead of a real error."
///
/// That is the right call and it is enforced by a `throw` that any future
/// `catch` can swallow — which is precisely how production's six undefined
/// functions stayed invisible for three days. As a union it is not swallowable:
/// a renderer must handle every case or fail to compile.
type SlateWeather =
    /// No venue on this slate has coordinates. A real, quiet answer.
    | NoVenuesWithCoordinates
    /// At least one reading. `failed` names venues that were asked for and did
    /// not answer — a partial result stays partial rather than becoming whole.
    | Readings of readings: VenueWeather list * failed: string list
    /// Venues had coordinates and NONE answered. An outage, not an empty slate.
    ///
    /// `why` carries what each request reported — `fetchOne` writes "Fenway
    /// Park: HTTP 429" and the like. This case used to carry the names alone,
    /// which meant the moment EVERY request failed was the moment the reason
    /// was discarded. verify 159 (2026-08-27) is the cost: 13 venues, 0 chips,
    /// and nothing on the page or in the log that could say whether the service
    /// was down, refusing the burst, or unreachable from that runner — three
    /// failures with three different fixes, collapsed into one integer. A count
    /// is not an attribution.
    | EveryFetchFailed of attempted: string list * why: string list

/// Assemble the outcome. The only constructor for `SlateWeather`, so the
/// distinction above cannot be lost by a caller building the wrong case.
let slateWeather (eligible: string list) (readings: VenueWeather list) (failed: string list) : SlateWeather =
    if List.isEmpty eligible then NoVenuesWithCoordinates
    elif List.isEmpty readings then EveryFetchFailed(eligible, failed)
    else Readings(readings, failed)

// --- the cache ---------------------------------------------------------------

/// A per-coordinate cache with a stated lifetime.
///
/// `put` takes a `Reading`, not a result or an option. A failure has no
/// representation here, so "we cached the error and served it for two hours"
/// is not an oversight to avoid — it cannot be written.
type Cache = private Cache of Map<string, float * Reading>

/// Two hours, matching production's `WX_TTL` of 7,200,000 ms. Weather does not
/// move faster than this for game planning, and the poll interval is 45 s.
let CACHE_TTL_MS = 7_200_000.0

let emptyCache = Cache Map.empty

let put (key: CoordKey) (atMs: float) (reading: Reading) (Cache m) : Cache =
    Cache(Map.add (coordKeyText key) (atMs, reading) m)

/// `nowMs` is a parameter, never a clock read. `gameStateAt` learned this the
/// hard way — a cache that reads the clock internally cannot be tested at a
/// fixed instant, and every assertion about it becomes an assertion about when
/// the test ran.
let tryGet (key: CoordKey) (nowMs: float) (Cache m) : Reading option =
    match Map.tryFind (coordKeyText key) m with
    | Some(storedAt, reading) when nowMs - storedAt < CACHE_TTL_MS -> Some reading
    | _ -> None

// --- decoding ----------------------------------------------------------------

/// Open-Meteo's `current` block.
///
/// `precipitation` and `rain` go through `precipitation` above, so a payload
/// where rain exceeds the total is a decode failure rather than a reading that
/// renders confidently and wrongly.
/// Decodes to a `Result`, then `readingDecoder` lifts a bad reading into a real
/// decode FAILURE.
///
/// The first version called `failwith` inside the object decoder, which throws
/// past `Decode.fromString` instead of returning `Error` — so `decodeReading`
/// advertised a `Result` and could raise. That is the same shape as the
/// try-catch at the top of this file: a failure taking a route its own signature
/// says it cannot take.
let private currentDecoder : Decoder<Result<Reading, string>> =
    Decode.object (fun get ->
        let temp = get.Required.Field "temperature_2m" Decode.float
        let wind = get.Required.Field "wind_speed_10m" Decode.float
        let total = get.Optional.Field "precipitation" Decode.float |> Option.defaultValue 0.0
        let rain = get.Optional.Field "rain" Decode.float |> Option.defaultValue 0.0
        match precipitation (total * 1.0<mm>) (rain * 1.0<mm>) with
        | None -> Error(sprintf "rain %g exceeds precipitation %g" rain total)
        | Some precip ->
            Ok
                { Temperature = temp * 1.0<degF>
                  FeelsLike = get.Optional.Field "apparent_temperature" Decode.float |> Option.map (fun v -> v * 1.0<degF>)
                  Wind = wind * 1.0<mph>
                  Gusts = get.Optional.Field "wind_gusts_10m" Decode.float |> Option.map (fun v -> v * 1.0<mph>)
                  WindFrom = get.Optional.Field "wind_direction_10m" Decode.float |> Option.map int
                  Precip = precip })

let readingDecoder : Decoder<Reading> =
    Decode.field "current" currentDecoder
    |> Decode.andThen (function
        | Ok reading -> Decode.succeed reading
        | Error why -> Decode.fail why)

let decodeReading (json: string) : Result<Reading, string> =
    Decode.fromString readingDecoder json

/// The request URL.
///
/// The unit parameters are here, beside the measures the decoder applies, so the
/// two cannot drift apart silently. Changing `fahrenheit` here without changing
/// `degF` above is the mistake this arrangement makes visible.
let forecastUrl (c: Coordinates) : string =
    sprintf
        "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,apparent_temperature,precipitation,rain,wind_speed_10m,wind_direction_10m,wind_gusts_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto"
        c.Lat c.Lon
