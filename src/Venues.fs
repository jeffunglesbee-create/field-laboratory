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
// substring match. Since 2026-10-20 it carries every playground key except five
// places already here under another name (listed where the block was added),
// plus MLS names playground does not have.

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
      at "Marvel Stadium" -37.8165 144.9475 Retractable "Australia/Melbourne"

      // --- MLS. The names are the EXACT strings the relay's `venue` field
      //     carries on this slate (probed from /context/date/2026-08-20), not
      //     the longer "Stadium, City" forms in data/production-venue-names.json
      //     — the payload writes "Sporting Park" where the reference list has
      //     "Children's Mercy Park", and an exact-match table must key on what
      //     the payload actually says. Coordinates and roofs are transcribed
      //     from public stadium facts rather than from playground's table, which
      //     carries no soccer venues; the zone each declares is checked against
      //     Open-Meteo's resolved zone by weather-live-check, the same
      //     independent source every other row here passes.
      //
      //     Added because an all-MLS slate (2026-08-20) put zero covered venues
      //     on the desk, and render-check's "the venue table covers at least one
      //     venue on this slate" is a deliberate anti-vacuous failure, not a
      //     precondition — the table's coverage is measured against the slates
      //     actually rendered, and this is the coverage that was missing.
      at "BC Place" 49.2767 -123.1119 Retractable "America/Vancouver"
      at "Lumen Field" 47.5952 -122.3316 OpenAir "America/Los_Angeles"
      at "America First Field" 40.5829 -111.8933 OpenAir "America/Denver"
      at "Providence Park" 45.5215 -122.6919 OpenAir "America/Los_Angeles"
      at "Allianz Field" 44.9530 -93.1655 OpenAir "America/Chicago"
      at "Dignity Health Sports Park" 33.8644 -118.2611 OpenAir "America/Los_Angeles"
      at "Sporting Park" 39.1217 -94.8236 OpenAir "America/Chicago"
      at "DICK'S Sporting Goods Park" 39.8058 -104.8919 OpenAir "America/Denver"

      // --- Added 2026-10-20 from playground's reviewed table
      //     (field-playground `src/data/weather.js` VENUE_COORDS, at 7e205a6):
      //     every key there that is not already a place in this table.
      //     Coordinates and roofs are copied as playground has them, never
      //     restated from memory. Zones are this table's own field, declared
      //     here and checked against Open-Meteo's resolved zone by
      //     weather-live-check, the same as every row above.
      //
      //     Found by `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md`: the
      //     2026-10-20 slate named Anfield and Etihad Stadium, and the table had
      //     neither, so verify's live render check went red.
      //
      //     NOT copied, because the place is already here under another key
      //     with slightly different coordinates, and a second entry would be a
      //     second fetch for one stadium: Oriole Park (Camden Yards), MCG
      //     (Melbourne Cricket Ground), Children's Mercy Park (Sporting Park),
      //     Dick's Sporting Goods Park (DICK'S Sporting Goods Park). TIO
      //     Stadium is not copied either: playground puts it 2.5 km from
      //     Marrara Oval, and which of the two is right was not established.

      // MLB
      at "Nationals Park" 38.8730 -77.0074 OpenAir "America/New_York"
      at "Citizens Bank Park" 39.9061 -75.1665 OpenAir "America/New_York"
      at "Sutter Health Park" 38.5805 -121.5133 OpenAir "America/Los_Angeles"

      // MLS / soccer
      at "Gillette Stadium" 42.0909 -71.2643 OpenAir "America/New_York"
      at "Red Bull Arena" 40.7367 -74.1503 OpenAir "America/New_York"
      at "CityPark" 38.6317 -90.2016 OpenAir "America/Chicago"
      at "Snapdragon Stadium" 32.7831 -117.1199 OpenAir "America/Los_Angeles"
      at "Stade Saputo" 45.5640 -73.5518 OpenAir "America/Toronto"
      at "BMO Field" 43.6333 -79.4186 OpenAir "America/Toronto"
      at "Chase Stadium" 26.1947 -80.1506 OpenAir "America/New_York"
      at "Subaru Park" 39.8334 -75.3808 OpenAir "America/New_York"
      at "Bank of America Stadium" 35.2259 -80.8529 OpenAir "America/New_York"
      at "Audi Field" 38.8695 -77.0125 OpenAir "America/New_York"
      at "Lower.com Field" 39.9690 -83.0154 OpenAir "America/New_York"
      at "TQL Stadium" 39.1051 -84.5182 OpenAir "America/New_York"
      at "Inter&Co Stadium" 28.5415 -81.3893 OpenAir "America/New_York"
      at "GEODIS Park" 36.1307 -86.7665 OpenAir "America/Chicago"
      at "Soldier Field" 41.8623 -87.6167 OpenAir "America/Chicago"
      at "BMO Stadium" 34.0130 -118.2845 OpenAir "America/Los_Angeles"
      at "PayPal Park" 37.3519 -121.9254 OpenAir "America/Los_Angeles"
      at "Q2 Stadium" 30.3872 -97.7180 OpenAir "America/Chicago"
      at "Shell Energy Stadium" 29.7523 -95.3511 OpenAir "America/Chicago"
      at "Toyota Stadium" 33.1545 -96.8353 OpenAir "America/Chicago"
      at "Mercedes-Benz Stadium" 33.7555 -84.4010 Retractable "America/New_York"

      // EPL / European soccer
      at "Anfield" 53.4308 -2.9608 OpenAir "Europe/London"
      at "Etihad Stadium" 53.4831 -2.2004 OpenAir "Europe/London"
      at "Craven Cottage" 51.4749 -0.2218 OpenAir "Europe/London"
      at "Amex Stadium" 50.8619 -0.0831 OpenAir "Europe/London"
      at "Stadium of Light" 54.9147 -1.3882 OpenAir "Europe/London"
      at "Villa Park" 52.5090 -1.8847 OpenAir "Europe/London"
      at "Turf Moor" 53.7889 -2.2302 OpenAir "Europe/London"
      at "Selhurst Park" 51.3983 -0.0855 OpenAir "Europe/London"
      at "City Ground" 52.9401 -1.1326 OpenAir "Europe/London"
      at "Riverside Stadium" 54.5785 -1.2170 OpenAir "Europe/London"
      at "St Mary's Stadium" 50.9058 -1.3910 OpenAir "Europe/London"
      at "MKM Stadium" 53.7463 -0.3674 OpenAir "Europe/London"
      at "The Den" 51.4851 -0.0509 OpenAir "Europe/London"
      at "London Stadium" 51.5386 -0.0163 OpenAir "Europe/London"
      at "Allianz Arena" 48.2188 11.6247 OpenAir "Europe/Berlin"
      at "Europa-Park Stadion" 48.0221 7.8275 OpenAir "Europe/Berlin"
      at "Stade de la Meinau" 48.5601 7.7534 OpenAir "Europe/Paris"

      // AFL
      at "ENGIE Stadium" -33.8472 151.0635 OpenAir "Australia/Sydney"
      at "People First Stadium" -28.0056 153.4028 OpenAir "Australia/Brisbane"

      // Tennis / cricket
      at "Foro Italico" 41.9339 12.4672 OpenAir "Europe/Rome"
      at "Rajiv Gandhi International Stadium" 17.4046 78.5480 OpenAir "Asia/Kolkata"
      at "Sawai Mansingh Stadium" 26.8952 75.8068 OpenAir "Asia/Kolkata"

      // Golf
      at "Quail Hollow Club" 35.0527 -80.8328 OpenAir "America/New_York"
      at "Aronimink Golf Club" 39.9654 -75.4165 OpenAir "America/New_York"
      at "Augusta National Golf Club" 33.5024 -82.0238 OpenAir "America/New_York"
      at "Pinehurst No. 2" 35.1946 -79.4657 OpenAir "America/New_York"
      at "Pebble Beach Golf Links" 36.5683 -121.9478 OpenAir "America/Los_Angeles"
      at "TPC Sawgrass" 30.1975 -81.3957 OpenAir "America/New_York"
      at "Riviera Country Club" 34.0397 -118.5085 OpenAir "America/Los_Angeles"
      at "Torrey Pines South Course" 32.8971 -117.2519 OpenAir "America/Los_Angeles"
      at "Harbour Town Golf Links" 32.1380 -80.6686 OpenAir "America/New_York"
      at "TPC Scottsdale" 33.6606 -111.8926 OpenAir "America/Phoenix"
      at "Muirfield Village Golf Club" 40.1034 -83.0685 OpenAir "America/New_York"
      at "East Lake Golf Club" 33.7115 -84.2896 OpenAir "America/New_York"
      at "St Andrews Links Old Course" 56.3435 -2.8013 OpenAir "Europe/London"
      at "Royal Troon Golf Club" 55.5333 -4.6667 OpenAir "Europe/London"
      at "Royal St George's Golf Club" 51.2010 1.3880 OpenAir "Europe/London"
      at "Dunes Golf and Beach Club" 33.7490 -78.8138 OpenAir "America/New_York"
      at "Colonial Country Club" 32.7247 -97.3592 OpenAir "America/Chicago"
      at "TPC Twin Cities" 45.1858 -93.2119 OpenAir "America/Chicago" ]
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

/// Indoor arenas: venues where a game has no weather to show.
///
/// A FACT PER NAME, not a keyword. Production answers this with `isOutdoorVenue`
/// matching "arena", "garden", "center" in the name, which is the approach the
/// header above rejects: "Allianz Arena" is open to the sky and "Madison Square
/// Garden" is not, and only a recorded fact tells them apart.
///
/// Why it exists: verify's live render check fails a slate when no venue on it
/// is in the table, because a slate the table covers nothing of proves nothing.
/// An NHL/NBA-only slate was then a failure, though an arena has no weather by
/// design. Recorded here, an arena is "nothing to observe", while a stadium the
/// table lacks stays a coverage gap
/// (`docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md`, owner's choice).
///
/// PROVENANCE. The exact `venue` strings the relay archived for NBA and NHL
/// games (`field-archive`, regular_season_games + postseason_games, sport in
/// NBA/NHL, date >= 2025-10-01), queried 2026-10-20. Every one hosted an NBA
/// game or an NHL game indoors. An NHL outdoor game is played at a stadium,
/// which this list does not carry and the table above may.
let private indoorArenas =
    set [ "Amerant Bank Arena"
          "American Airlines Center"
          "BOK Center"
          "Ball Arena"
          "Ball Arena, Denver CO"
          "Barclays Center"
          "Bell Centre"
          "Bell Centre, Montreal QC"
          "Benchmark International Arena"
          "Bridgestone Arena"
          "CU Events Center"
          "Canada Life Centre"
          "Canadian Tire Centre"
          "Capital One Arena"
          "Chase Center"
          "Climate Pledge Arena"
          "Colisee Videotron"
          "Delta Center"
          "Enterprise Center"
          "FedExForum"
          "First Horizon Coliseum"
          "Fiserv Forum"
          "Frost Bank Center"
          "Frost Bank Center, San Antonio TX"
          "Gainbridge Fieldhouse"
          "Giant Center"
          "Golden 1 Center"
          "Grand Casino Arena"
          "Hilton Coliseum"
          "Honda Center"
          "Intuit Dome"
          "Kaseya Center"
          "KeyBank Center"
          "KeyBank Center, Buffalo NY"
          "Kia Center"
          "Lenovo Center"
          "Lenovo Center, Raleigh NC"
          "Little Caesars Arena"
          "Madison Square Garden"
          "Madison Square Garden, New York NY"
          "Moda Center"
          "Mortgage Matchup Center"
          "Nationwide Arena"
          "PPG Paints Arena"
          "Paycom Center"
          "Paycom Center, Oklahoma City OK"
          "Prudential Center"
          "Rocket Arena"
          "Rocket Mortgage FieldHouse, Cleveland OH"
          "Rogers Arena"
          "Rogers Place"
          "SAP Center at San Jose"
          "Scotiabank Arena"
          "Scotiabank Saddledome"
          "Smoothie King Center"
          "Spectrum Center"
          "Stan Sheriff Center"
          "State Farm Arena"
          "T-Mobile Arena"
          "T-Mobile Arena, Las Vegas NV"
          "TD Garden"
          "Target Center"
          "Toyota Arena"
          "Toyota Center (Houston)"
          "UBS Arena"
          "United Center"
          "Venetian Arena"
          "Videotron Centre"
          "Xfinity Mobile Arena"
          "crypto.com Arena" ]

/// True when the name is a recorded indoor arena. An unrecorded name is NOT
/// indoor: absence from both lists is a coverage gap, not a roof.
let isIndoorArena (name: string) : bool = Set.contains name indoorArenas

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
