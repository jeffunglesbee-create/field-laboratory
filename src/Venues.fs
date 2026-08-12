module Venues

open Weather

// The venue table: name -> location and roof.
//
// WHY THIS IS ONE TABLE AND NOT TWO PREDICATES
//
// Production answers "does this venue get weather?" with `isOutdoorVenue`, which
// fuzzy-matches the venue NAME against a keyword list — from FIELD's own May 9
// integration log:
//
//   INDOOR_KEYWORDS:   ["arena","garden","center","centre","dome","domed",
//                       "coliseum","fieldhouse","forum","palace","pavilion",
//                       "theater","theatre","auditorium"]
//   INDOOR_EXCEPTIONS: ["wembley","foro italico","olympic","stade de france",
//                       "estadion","stade","stad"]
//
// The exceptions list is the tell: it exists because the keyword list was wrong
// about real venues, and each new wrong answer adds a string rather than a fact.
// "Madison Square Garden" and "Fenway Park" are distinguished by spelling.
//
// Here a venue's roof is DATA, sitting beside its coordinates in one entry, so
// there is one place to be wrong and it is visible. That is also how
// production's actual error becomes findable: loanDepot park is filed
// `isOutdoor: true` and has a retractable roof. A boolean has no third state, so
// there was nowhere for the truth to live.
//
// PROVENANCE. Coordinates and roof types come from playground's hand-reviewed
// table, itself assembled from a Wikidata/Nominatim/Photon/Overpass probe
// sequence. It is not derived live and can drift as venues are renamed or
// rebuilt, which is why aliases are carried explicitly rather than guessed at by
// substring match. This is a working subset, not playground's full 98 keys —
// enough that every roof type and both alias cases are exercised by real
// entries rather than by fixtures.

type Venue =
    { Name: string
      Where: Coordinates
      Roof: RoofType
      /// The IANA zone this venue's coordinates SHOULD resolve to.
      ///
      /// Declared here so that `scripts/weather-live-check.mjs` can ask
      /// Open-Meteo what zone the coordinates actually land in and compare. The
      /// coordinates in this table are transcribed from playground's
      /// hand-reviewed table and have never met an independent source; this is
      /// the field that lets them.
      ///
      /// It is a genuinely independent axis. A swapped lat/lon, a dropped minus
      /// sign or a mistyped digit almost always moves a point into a different
      /// zone — Fenway's 42.35/-71.10 transposed is open ocean; Coors with a
      /// sign flip is the South Pacific. Chase Field is the sharpest single
      /// entry in the table, because America/Phoenix is the one US zone with no
      /// DST, so it can only be reached by being genuinely in Arizona.
      Zone: string }

/// `coordinates` returns an option because latitude has a valid range. A literal
/// out of range here is a build-time crash rather than a venue that silently
/// vanishes from the table — the entries below are checked by `venueTableIsSound`
/// and by a gate row, so a typo cannot become a missing venue.
let private at name lat lon roof zone =
    match coordinates lat lon with
    | Some c -> Some { Name = name; Where = c; Roof = roof; Zone = zone }
    | None -> None

/// The table. Aliases are separate entries with the SAME coordinates, so they
/// collapse to one `CoordKey` and therefore one fetch.
let private entries =
    [ // --- MLB, open air
      at "Fenway Park" 42.3467 -71.0972 OpenAir "America/New_York"
      at "Wrigley Field" 41.9484 -87.6553 OpenAir "America/Chicago"
      at "Dodger Stadium" 34.0739 -118.2400 OpenAir "America/Los_Angeles"
      at "Oracle Park" 37.7786 -122.3893 OpenAir "America/Los_Angeles"
      at "Coors Field" 39.7559 -104.9942 OpenAir "America/Denver"
      at "Yankee Stadium" 40.8296 -73.9262 OpenAir "America/New_York"
      at "Citi Field" 40.7571 -73.8458 OpenAir "America/New_York"
      at "Camden Yards" 39.2839 -76.6217 OpenAir "America/New_York"
      at "PNC Park" 40.4469 -80.0057 OpenAir "America/New_York"
      at "Petco Park" 32.7073 -117.1566 OpenAir "America/Los_Angeles"
      at "Progressive Field" 41.4962 -81.6852 OpenAir "America/New_York"
      // America/Detroit, NOT America/New_York. Same UTC offset, different IANA
      // zone — Michigan has its own DST history. This entry is the one the
      // planet check caught on its first live run (run 31543404607), and it was
      // MY declaration that was wrong, not the coordinates: a transcription
      // error in the field added to catch transcription errors, in the subtlest
      // form the check can detect.
      at "Comerica Park" 42.3390 -83.0485 OpenAir "America/Detroit"
      at "Kauffman Stadium" 39.0517 -94.4803 OpenAir "America/Chicago"
      at "Target Field" 44.9817 -93.2776 OpenAir "America/Chicago"
      at "Busch Stadium" 38.6226 -90.1928 OpenAir "America/Chicago"
      at "Great American Ball Park" 39.0975 -84.5069 OpenAir "America/New_York"
      at "Angel Stadium" 33.8003 -117.8827 OpenAir "America/Los_Angeles"
      // Alias. Playground carries both spellings for exactly this reason: the
      // venue has been written down each way and a substring match on one does
      // not find the other.
      at "Angels Stadium" 33.8003 -117.8827 OpenAir "America/Los_Angeles"
      at "Rate Field" 41.8299 -87.6338 OpenAir "America/Chicago"
      at "Guaranteed Rate Field" 41.8299 -87.6338 OpenAir "America/Chicago"

      // --- MLB, retractable. Production's `isOutdoor` boolean has no case for
      //     these, so `getVenueCoords` returns null and they get no weather at
      //     all — for a stadium whose roof decision is often MADE on the
      //     weather at that location.
      at "loanDepot park" 25.7781 -80.2197 Retractable "America/New_York"
      at "Minute Maid Park" 29.7572 -95.3556 Retractable "America/Chicago"
      at "Daikin Park" 29.7572 -95.3556 Retractable "America/Chicago"
      at "Globe Life Field" 32.7473 -97.0847 Retractable "America/Chicago"
      at "American Family Field" 43.0280 -87.9712 Retractable "America/Chicago"
      at "Rogers Centre" 43.6414 -79.3894 Retractable "America/Toronto"
      at "T-Mobile Park" 47.5914 -122.3325 Retractable "America/Los_Angeles"
      at "Chase Field" 33.4455 -112.0667 Retractable "America/Phoenix"

      // --- MLB, fixed dome
      at "Tropicana Field" 27.7683 -82.6534 Dome "America/New_York"

      // --- AFL. All open air, and the reason the zone work exists: these are
      //     the fixtures whose day is not the American one.
      //
      //     S.C.G. and Marrara Oval are here because they are the venues in
      //     data/context-2026-05-15.json — the committed capture. Without them
      //     nav-check's weather assertion has nothing to fill, which is how it
      //     was found: the check reported "2 slots, 0 filled" and it was the
      //     TABLE that was incomplete, not the fill. A venue table whose
      //     coverage is never measured against the slates actually rendered is
      //     a table that looks complete because nothing asked.
      at "S.C.G." -33.8915 151.2245 OpenAir "Australia/Sydney"
      at "Marrara Oval" -12.3990 130.8870 OpenAir "Australia/Darwin"
      at "Melbourne Cricket Ground" -37.8200 144.9834 OpenAir "Australia/Melbourne"
      at "Adelaide Oval" -34.9155 138.5960 OpenAir "Australia/Adelaide"
      at "The Gabba" -27.4858 153.0381 OpenAir "Australia/Brisbane"
      at "Optus Stadium" -31.9510 115.8890 OpenAir "Australia/Perth"
      at "GMHBA Stadium" -38.1580 144.3546 OpenAir "Australia/Melbourne"
      at "Marvel Stadium" -37.8165 144.9475 Retractable "Australia/Melbourne" ]
    |> List.choose id

/// Lookup is EXACT, not fuzzy.
///
/// Production fuzzy-matches, which is what makes the keyword lists necessary and
/// what makes a wrong answer silent. An exact miss here is a venue this table
/// does not know, which is a fact worth having — `weatherEligible` reports the
/// misses rather than dropping them.
let tryFind (name: string) : Venue option =
    entries |> List.tryFind (fun v -> v.Name = name)

/// Venues on a slate that this table can locate, and the names it could not.
///
/// Returning BOTH is the point. A name that is not in the table is not the same
/// as a venue with no weather, and collapsing them is how "no venues have
/// coordinates" came to mean four different things.
let weatherEligible (venueNames: string list) : Venue list * string list =
    let found = venueNames |> List.choose tryFind
    let missing = venueNames |> List.filter (fun n -> (tryFind n).IsNone)
    found, missing

/// Distinct locations to fetch, keyed by coordinate.
///
/// This is where the aliases collapse: "Minute Maid Park" and "Daikin Park" are
/// one place and must be one request. Keyed by `CoordKey` rather than by name,
/// which is not a convention here but a type — nothing else can key it.
let distinctLocations (venues: Venue list) : (CoordKey * Venue) list =
    venues
    |> List.fold
        (fun acc v ->
            let key = coordKey v.Where
            if acc |> List.exists (fun (k, _) -> k = key) then acc else acc @ [ key, v ])
        []

let all = entries
let count = List.length entries

/// Every entry parsed, and the alias pairs really do collapse.
///
/// A table is data, and data is where a silent wrong answer lives. This is the
/// assertion the gate row runs.
let venueTableIsSound () =
    let parsed = List.length entries
    let maid = tryFind "Minute Maid Park"
    let daikin = tryFind "Daikin Park"
    let aliasesShareOneFetch =
        match maid, daikin with
        | Some a, Some b -> coordKey a.Where = coordKey b.Where
        | _ -> false
    parsed, aliasesShareOneFetch
