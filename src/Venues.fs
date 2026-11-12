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
      // Leipzig's ground, not New Jersey's. This row was Harrison NJ until
      // 2026-10-24: the MLS club's ground is filed as "Sports Illustrated
      // Stadium" (a row below) and has been since 2026-09-30; every "Red Bull
      // Arena" game since is RB Leipzig's, as is the 2026-05-27 Conference
      // League final (field-archive D1, queried 2026-10-24: Red Bull Arena /
      // Red Bull NY last 2026-09-26; Sports Illustrated Stadium / Red Bull NY
      // from 2026-09-30). Coordinates are Wikidata Q210466 and Nominatim, which
      // agree (51.3458, 12.3481). Told by the owner and then measured.
      at "Red Bull Arena" 51.3458 12.3481 OpenAir "Europe/Berlin"
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

      // Golf. Six of these rows were wrong as copied from playground on
      //     2026-10-20 (Quail Hollow, Harbour Town, TPC Scottsdale, Muirfield
      //     Village, East Lake, Royal St George's). The venue-source calibration
      //     (run 39708856185) found Wikidata, Nominatim and Photon agreeing on a
      //     different point for each, and a reverse geocode of the table's own
      //     point (run 39802669644) found a residential street for five and open
      //     water for Harbour Town. Corrected 2026-10-22 to the sources' agreed
      //     point. Zones are unchanged; weather-live-check verifies them again.
      at "Quail Hollow Club" 35.1143 -80.8420 OpenAir "America/New_York"
      at "Aronimink Golf Club" 39.9654 -75.4165 OpenAir "America/New_York"
      at "Augusta National Golf Club" 33.5024 -82.0238 OpenAir "America/New_York"
      at "Pinehurst No. 2" 35.1946 -79.4657 OpenAir "America/New_York"
      at "Pebble Beach Golf Links" 36.5683 -121.9478 OpenAir "America/Los_Angeles"
      at "TPC Sawgrass" 30.1975 -81.3957 OpenAir "America/New_York"
      at "Riviera Country Club" 34.0397 -118.5085 OpenAir "America/Los_Angeles"
      at "Torrey Pines South Course" 32.8971 -117.2519 OpenAir "America/Los_Angeles"
      at "Harbour Town Golf Links" 32.1325 -80.8105 OpenAir "America/New_York"
      at "TPC Scottsdale" 33.6380 -111.9085 OpenAir "America/Phoenix"
      at "Muirfield Village Golf Club" 40.1430 -83.1472 OpenAir "America/New_York"
      at "East Lake Golf Club" 33.7434 -84.3026 OpenAir "America/New_York"
      at "St Andrews Links Old Course" 56.3435 -2.8013 OpenAir "Europe/London"
      at "Royal Troon Golf Club" 55.5333 -4.6667 OpenAir "Europe/London"
      at "Royal St George's Golf Club" 51.2738 1.3669 OpenAir "Europe/London"
      at "Dunes Golf and Beach Club" 33.7490 -78.8138 OpenAir "America/New_York"
      at "Colonial Country Club" 32.7247 -97.3592 OpenAir "America/Chicago"
      at "TPC Twin Cities" 45.1858 -93.2119 OpenAir "America/Chicago"

      // Two college football grounds that no two independent sources would confirm,
      // accepted by the owner on 2026-10-25 with the evidence below. Not in the
      // generated block: the sourcing rule did not accept them, a person did.
      // They were the last two of 2026-10-24's 12 uncovered CFB venues.
      //
      // Ryan Field (Northwestern, Evanston IL). OpenStreetMap, forward by name and
      // reverse at the point, both say Ryan Field [building/stadium] at
      // 1501 Central Street, Evanston. Wikidata's point (42.0875, -87.7006) is
      // 2.5 km north and OpenStreetMap names it amenity/parking: the one
      // disagreeing source is the demonstrably wrong one.
      at "Ryan Field" 42.0654 -87.6915 OpenAir "America/Chicago"
      // M. M. Roberts Stadium (Southern Miss, Hattiesburg MS). Wikidata's name
      // search and Southern Miss football's own home-venue claim (P115) agree on
      // 31.3289, -89.3314. OpenStreetMap's name search returns a stadium of the
      // same name in Picayune, Pearl River County (30.5319, -89.6852), and has no
      // named object at the Hattiesburg point. Sourcing run 40141634179 left it in
      // review for exactly that, and was right to.
      at "M. M. Roberts Stadium" 31.3289 -89.3314 OpenAir "America/Chicago"
      // St James Park (Exeter City, EFL Trophy). The archive spells Exeter's ground
      // `St James Park`, with no punctuation, and Newcastle's `St. James' Park`
      // (period, straight apostrophe): two keys, two places. Sourcing run
      // 40141634179 left this one in review because its three sources named three
      // places: Nominatim Newcastle, Photon Toronto, Wikidata (reached through
      // Exeter City as the home team, Q1856701) Exeter. Wikidata alone is at
      // Exeter. Accepted by the owner on 2026-10-25 on that evidence;
      // OpenStreetMap's reverse geocode at this point was not checked. It was once
      // accepted at Newcastle's coordinates by mistake (see KNOWN_BAD).
      at "St James Park" 50.7307 -3.5212 OpenAir "Europe/London"

      // Manadon Sports Hub (Plymouth; the FA Cup tie Plymouth v Berkhamsted of
      // 2026-11-09). Accepted by the owner on 2026-11-11 ("Manadon Sports Hub
      // approved") on the evidence below. Not in the generated block: sourcing run
      // 42861596952 left it in review, no two sources agreeing (Wikidata no entity,
      // Nominatim no result, Photon a stadium in Singapore).
      // The council's premises licence register has "Manadon Sports and Community
      // Hub, 121 St Peters Road, Plymouth, Devon, PL5 3FD". The OS postcode
      // directory (postcodes.io, quality 1) puts PL5 3FD at 50.40913, -4.145326.
      // Sport England's listing of the Manadon Football Development Centre (a
      // sand-filled pitch; postcode PL5 3JG, which is the postcode the club's 2018
      // page gives for the site of the project that became the hub) has OS grid
      // 247664.88, 58727.59: 58.6 m from PL5 3FD's grid point and 133.8 m from PL5
      // 3JG's, so it is neither postcode's centre. OpenStreetMap names nothing there
      // and is not counted. Open air (3G and grass pitches, cricket wickets).
      // Europe/London by geo-tz 8.1.4 and by Open-Meteo at the point. The answers are
      // in outbox/venue-manadon-evidence-2026-11-11.txt and the files beside it.
      at "Manadon Sports Hub" 50.4091 -4.1453 OpenAir "Europe/London"

      // --- BEGIN hand rows 2026-11-12 (generated by `node outbox/venue-hand-rows-2026-11-12.mjs rows`; its evidence is
      //     outbox/venue-hand-rows-evidence-2026-11-12.json and the record the owner reads is outbox/venue-hand-rows-2026-11-12.md)
      //     Task 4 of docs/CC-CMD-2026-11-09-venue-review-remainder.md, built on the owner's "Yes to all" (2026-11-12): a hand row for each
      //     review venue whose evidence gives one ground, a roof class and a zone. Not in the generated block below: sourcing run
      //     42861596952 left each in review. The comment over a row names its witnesses (two families inside 0.02 degrees, the rule's own
      //     test, or for Rodney Parade a Wikipedia point and a postcode centroid), the roof and its basis, the zone and every flag the
      //     verifier computed from the saved pages. The owner's keep or revert is recorded in the CC-CMD's Result.
      // AIL Arena (UEFA Europa Conference League Qualifying, UEFA Europa Conference League; 3 games
      // on 3 days, 2026-08-20 to 2026-11-05). Wikidata Q140038602 46.0230878, 8.9601204; Wikipedia
      // "Cornaredo Stadium" (Q671287) 46.02361111, 8.96166667; OpenStreetMap "Stadio Cornaredo"
      // [leisure/stadium] 46.0238282, 8.9611777. Roof open: inferred: the lead names no roof. Zone
      // Europe/Zurich (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness carries neither the
      // venue string nor the article title in its label; the venue name is not in the article's
      // lead; it is tied by a Wikidata label ("AIL Arena").
      at "AIL Arena" 46.0235 8.9610 OpenAir "Europe/Zurich"
      // Allianz Stadium (Serie A, UEFA Europa League; 7 games on 7 days, 2026-08-29 to 2026-11-01).
      // Wikipedia "Juventus Stadium" (Q62149) 45.10944444, 7.64111111; OpenStreetMap "Allianz
      // Stadium" [leisure/stadium] 45.1095759, 7.6421338. Disagreeing: nominatim 51.4560051,
      // -0.3415047. Roof open: inferred: the lead names no roof. Zone Europe/Rome (geo-tz/all
      // 8.1.4).
      at "Allianz Stadium" 45.1095 7.6416 OpenAir "Europe/Rome"
      // Almaty Ortalyk Stadium (UEFA Europa League Qualifying, UEFA Europa Conference League; 2
      // games on 2 days, 2026-08-20 to 2026-10-22). Wikipedia "Almaty Central Stadium" (Q190788)
      // 43.23833333, 76.92444444; OpenStreetMap "Орталық Стадион" [leisure/stadium] 43.2383698,
      // 76.9241891. Roof open: inferred: the lead names no roof. Zone Asia/Almaty (geo-tz/all
      // 8.1.4). Flags: the OpenStreetMap witness carries neither the venue string nor the article
      // title in its label.
      at "Almaty Ortalyk Stadium" 43.2384 76.9243 OpenAir "Asia/Almaty"
      // American Express Stadium (EPL, UEFA Europa Conference League Qualifying, UEFA Europa
      // Conference League; 7 games on 7 days, 2026-08-23 to 2026-11-08). Wikipedia "Falmer Stadium"
      // (Q619409) 50.86182222, -0.08327778; OpenStreetMap "American Express Stadium"
      // [leisure/stadium] 50.8615471, -0.0836931. Roof open: inferred: the lead names no roof. Zone
      // Europe/London (geo-tz/all 8.1.4).
      at "American Express Stadium" 50.8617 -0.0835 OpenAir "Europe/London"
      // Arena Egnatia (UEFA Europa League Qualifying; 1 game on 1 day, 2026-08-20 to 2026-08-20).
      // Wikipedia "Egnatia Arena" (Q24915950) 41.07680556, 19.66163889; OpenStreetMap "KF Egnatia"
      // [leisure/pitch] 41.0766641, 19.6617507. Disagreeing: photon 41.7168435, 44.7975094. Roof
      // open: inferred: the lead names no roof. Zone Europe/Tirane (geo-tz/all 8.1.4). Flags: the
      // OpenStreetMap witness (W338024660) is classed leisure/pitch, not leisure/stadium; the
      // OpenStreetMap witness carries neither the venue string nor the article title in its label.
      at "Arena Egnatia" 41.0767 19.6617 OpenAir "Europe/Tirane"
      // Bloomfield Road (EFL Cup, EFL Trophy; 4 games on 3 days, 2026-08-25 to 2026-10-27).
      // Wikidata Q870859 53.804722, -3.048056; OpenStreetMap "Bloomfield Road Stadium"
      // [leisure/stadium] 53.8047875, -3.0482513. Roof open: inferred: the lead names no roof; 1
      // hit read by hand. Zone Europe/London (geo-tz/all 8.1.4). Flags: roof hit read by hand:
      // phrase: "The plans included a 20,000 capacity stadium with retractable roof" (a plan for a
      // different stadium).
      at "Bloomfield Road" 53.8048 -3.0482 OpenAir "Europe/London"
      // Chase Field (NH) (MLB; 5 games on 5 days, 2026-07-04 to 2026-07-19). In the archive's MLB
      // games of the Diamondbacks from 2026-06-28 to 2026-07-22 their home games are filed under
      // two spellings, 5 under this one and 6 under "Chase Field", and a series is split between
      // them: Brewers (2026-07-03 under "Chase Field"; 2026-07-04, 2026-07-05 under this spelling).
      // The row is "Chase Field"'s row, taken from this file. What "(NH)" stands for is not
      // established.
      at "Chase Field (NH)" 33.4455 -112.0667 Retractable "America/Phoenix"
      // Children's Mercy Park (MLS; 2 games on 2 days, 2026-07-22 to 2026-08-01). Wikipedia
      // "Sporting Park" (Q1787141) 39.12174, -94.82318; OpenStreetMap "Sporting Park"
      // [leisure/stadium] 39.1216438, -94.8233522. Disagreeing: photon 38.9303298, -94.6518569.
      // Roof open: inferred: the lead names no roof. Zone America/Chicago (geo-tz/all 8.1.4).
      // Flags: the venue name is not in the article's lead; it is tied by a search hit on the
      // article ("Children's Mercy Park").
      at "Children's Mercy Park" 39.1217 -94.8233 OpenAir "America/Chicago"
      // Clarence T.C. Ching Athletics Complex (CFB; 4 games on 4 days, 2026-09-05 to 2026-10-17).
      // Wikipedia "Clarence T. C. Ching Athletics Complex" (Q85752700) 21.294, -157.818;
      // OpenStreetMap "Clarence T.C. Ching Athletics Complex" [leisure/pitch] 21.2942909,
      // -157.8171209. Roof open: inferred: the lead names no roof. Zone Pacific/Honolulu
      // (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness (undefined) is classed leisure/pitch,
      // not leisure/stadium; home not tied to the ground: "Hawai'i" (4 games).
      at "Clarence T.C. Ching Athletics Complex" 21.2941 -157.8176 OpenAir "Pacific/Honolulu"
      // Cotton Bowl (CFB; 1 game on 1 day, 2026-10-10 to 2026-10-10). Wikipedia "Cotton Bowl
      // (stadium)" (Q1136764) 32.77944444, -96.75972222; OpenStreetMap "Cotton Bowl Stadium"
      // [leisure/stadium] 32.7796119, -96.7596025. Roof open: inferred: the lead names no roof.
      // Zone America/Chicago (geo-tz/all 8.1.4). Flags: the Wikipedia title needs a qualifier, so
      // the plain name is shared with other places.
      at "Cotton Bowl" 32.7795 -96.7597 OpenAir "America/Chicago"
      // Coventry Building Society Arena (EPL, EFL Cup; 6 games on 6 days, 2026-08-29 to
      // 2026-10-31). Wikipedia "Coventry Building Society Arena" (Q842077) 52.44805556,
      // -1.49555556; OpenStreetMap "Coventry Building Society Arena" [leisure/sports_centre]
      // 52.4481582, -1.4970174. Roof open: inferred: the lead names no roof; 1 hit read by hand.
      // Zone Europe/London (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness (R1832945) is
      // classed leisure/sports_centre, not leisure/stadium; roof hit read by hand: phrase:
      // "original design for the arena was for a state-of-the-art stadium with a retractable roof"
      // (the original design, past tense).
      at "Coventry Building Society Arena" 52.4481 -1.4963 OpenAir "Europe/London"
      // Crabble Athletic Ground (FA Cup; 1 game on 1 day, 2026-11-07 to 2026-11-07). Wikipedia
      // "Crabble Athletic Ground" (Q5180263) 51.138, 1.285; OpenStreetMap "Crabble"
      // [leisure/stadium] 51.1377819, 1.285164. Disagreeing: photon 51.4668519, -0.3033217. Roof
      // open: inferred: the lead names no roof. Zone Europe/London (geo-tz/all 8.1.4). Flags: the
      // OpenStreetMap witness carries neither the venue string nor the article title in its label.
      at "Crabble Athletic Ground" 51.1379 1.2851 OpenAir "Europe/London"
      // Crown Oil Arena (EFL Trophy; 2 games on 2 days, 2026-09-22 to 2026-11-03). Wikipedia
      // "Spotland Stadium" (Q619466) 53.62083333, -2.18; OpenStreetMap "Crown Oil Arena"
      // [leisure/stadium] 53.6207953, -2.1799129. Roof open: inferred: the lead names no roof. Zone
      // Europe/London (geo-tz/all 8.1.4).
      at "Crown Oil Arena" 53.6208 -2.1800 OpenAir "Europe/London"
      // De Kuip (UEFA Champions League; 2 games on 2 days, 2026-10-14 to 2026-11-03). Wikipedia "De
      // Kuip" (Q330298) 51.89388889, 4.52305556; OpenStreetMap "Feijenoord Stadium"
      // [leisure/stadium] 51.8938646, 4.5232281. Roof open: inferred: the lead names no roof; 1 hit
      // read by hand. Zone Europe/Amsterdam (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness
      // carries neither the venue string nor the article title in its label; roof hit read by hand:
      // phrase: "as well as adding a retractable roof. Construction was planned to start in summer
      // 2015" (a planned expansion).
      at "De Kuip" 51.8939 4.5231 OpenAir "Europe/Amsterdam"
      // DW Stadium (EFL Trophy; 2 games on 2 days, 2026-08-18 to 2026-09-22). Wikipedia "Brick
      // Community Stadium" (Q494388) 53.54777778, -2.65388889; OpenStreetMap "The Brick Community
      // Stadium" [leisure/stadium] 53.5477333, -2.6540131. Disagreeing: nominatim 12.7118006,
      // 22.159893; photon 33.9405051, -83.3788206. Roof open: inferred: the lead names no roof.
      // Zone Europe/London (geo-tz/all 8.1.4). Flags: the venue name is not in the article's lead;
      // it is tied by a search hit on the article ("DW Stadium").
      at "DW Stadium" 53.5478 -2.6540 OpenAir "Europe/London"
      // EnviroVent Stadium (FA Cup; 1 game on 1 day, 2026-11-07 to 2026-11-07). Wikipedia "Wetherby
      // Road" (Q28195119) 53.99166667, -1.51444444; OpenStreetMap "Harrogate Town" [leisure/pitch]
      // 53.9917212, -1.5144875. Disagreeing: photon 51.648648, -0.4018332. Roof open: inferred: the
      // lead names no roof. Zone Europe/London (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness
      // (W102722693) is classed leisure/pitch, not leisure/stadium; the venue name is not in the
      // article's lead; it is tied by a search hit on the article ("EnviroVent").
      at "EnviroVent Stadium" 53.9917 -1.5145 OpenAir "Europe/London"
      // Estadi de la FAF d'Encamp (UEFA Europa Conference League Qualifying, UEFA Europa Conference
      // League; 2 games on 2 days, 2026-08-27 to 2026-10-22). Wikipedia "Estadi de la FAF"
      // (Q134706123) 42.5335, 1.5759; Photon "Estadi de la FAF" [leisure/pitch] 42.5335131,
      // 1.5759392; OpenStreetMap "Carrer del Torrent de la Canadilla" [leisure/stadium] 42.5335027,
      // 1.5757405. Roof open: inferred: the lead names no roof. Zone Europe/Andorra (geo-tz/all
      // 8.1.4). Flags: the OpenStreetMap witness (W1412155487) carries no name; the OpenStreetMap
      // witness carries neither the venue string nor the article title in its label.
      at "Estadi de la FAF d'Encamp" 42.5335 1.5759 OpenAir "Europe/Andorra"
      // Estadio Universitario (MLS; 1 game on 1 day, 2026-08-12 to 2026-08-12). Wikipedia "Estadio
      // Universitario (UANL)" (Q771800) 25.723, -100.312; OpenStreetMap "Estadio Universitario"
      // [leisure/stadium] 25.7226067, -100.3119863. Roof open: inferred: the lead names no roof.
      // Zone America/Monterrey (geo-tz/all 8.1.4). Flags: the Wikipedia title needs a qualifier, so
      // the plain name is shared with other places.
      at "Estadio Universitario" 25.7228 -100.3120 OpenAir "America/Monterrey"
      // Europa Point Stadium (UEFA Europa Conference League Qualifying, UEFA Europa Conference
      // League; 3 games on 3 days, 2026-08-20 to 2026-11-05). Wikipedia "Europa Sports Park"
      // (Q15946460) 36.11069444, -5.34675; OpenStreetMap "Europa Sports Park" [leisure/stadium]
      // 36.1105288, -5.3468182. Disagreeing: photon 40.3288593, -78.9248074. Roof open: inferred:
      // the lead names no roof. Zone Europe/Gibraltar (geo-tz/all 8.1.4). Flags: home not tied to
      // the ground: "Red Imps" (3 games).
      at "Europa Point Stadium" 36.1106 -5.3468 OpenAir "Europe/Gibraltar"
      // Field of Dreams (MLB; 1 game on 1 day, 2026-08-13 to 2026-08-13). Wikipedia "Field of
      // Dreams (Dubuque County, Iowa)" (Q5447096) 42.49777778, -91.055; OpenStreetMap "Field of
      // Dreams" [tourism/attraction] 42.4978144, -91.0549113. Disagreeing: nominatim 33.7619065,
      // -118.2908033; photon 30.3078742, -97.9622018. Roof open: inferred: the lead names no roof.
      // Zone America/Chicago (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness (N471267259) is
      // classed tourism/attraction, not leisure/stadium; the Wikipedia title needs a qualifier, so
      // the plain name is shared with other places.
      at "Field of Dreams" 42.4978 -91.0550 OpenAir "America/Chicago"
      // Gaughan Group Stadium (EFL Cup, EFL Trophy; 5 games on 5 days, 2026-08-08 to 2026-11-07).
      // Wikipedia "Brisbane Road" (Q917727) 51.56027778, -0.01277778; OpenStreetMap "Brisbane Road"
      // [leisure/stadium] 51.5600713, -0.0125999. Roof open: inferred: the lead names no roof. Zone
      // Europe/London (geo-tz/all 8.1.4). Flags: the venue name is not in the article's lead; it is
      // tied by a search hit on the article ("Gaughan Group").
      at "Gaughan Group Stadium" 51.5602 -0.0127 OpenAir "Europe/London"
      // GEHA Field at Arrowhead Stadium (FIFA World Cup, NFL; 3 games on 3 days, 2026-07-03 to
      // 2026-08-15). Wikipedia "Arrowhead Stadium" (Q544553) 39.04888889, -94.48388889;
      // OpenStreetMap "Arrowhead Stadium" [leisure/stadium] 39.0489358, -94.4839993. Roof open:
      // inferred: the lead names no roof. Zone America/Chicago (geo-tz/all 8.1.4). Flags: the venue
      // name is not in the article's lead; it is tied by a search hit on the article ("GEHA
      // Field"); home not tied to the ground: "Argentina" (2 games), "Colombia" (1 game), "Algeria"
      // (1 game), "Ecuador" (1 game), "Tunisia" (1 game).
      at "GEHA Field at Arrowhead Stadium" 39.0489 -94.4839 OpenAir "America/Chicago"
      // Generali-Arena (UEFA Europa Conference League Qualifying; 1 game on 1 day, 2026-08-27 to
      // 2026-08-27). Wikipedia "Franz Horr Stadium" (Q696476) 48.16222222, 16.38666667; Photon
      // "Generali Arena" [leisure/stadium] 48.1624078, 16.3883392. Disagreeing: nominatim
      // 50.0997126, 14.4158918. Roof open: inferred: the lead names no roof. Zone Europe/Vienna
      // (geo-tz/all 8.1.4). Flags: no OpenStreetMap witness; home not tied to the ground: "Vienna"
      // (1 game).
      at "Generali-Arena" 48.1623 16.3875 OpenAir "Europe/Vienna"
      // Goodison Park (EFL Cup; 1 game on 1 day, 2026-08-08 to 2026-08-08). Wikipedia "Goodison
      // Park" (Q968420) 53.4389, -2.9664; OpenStreetMap "Goodison Park" [leisure/stadium]
      // 53.4386898, -2.9664193. Roof open: inferred: the lead names no roof; 1 hit read by hand.
      // Zone Europe/London (geo-tz/all 8.1.4). Flags: home not tied to the ground: "Preston" (1
      // game); roof hit read by hand: phrase: "The proposed stadium would have had a retractable
      // roof" (a proposal for a different stadium).
      at "Goodison Park" 53.4388 -2.9664 OpenAir "Europe/London"
      // Highmark Stadium (NFL; 6 games on 6 days, 2026-08-15 to 2026-11-01). Wikipedia "Highmark
      // Stadium" (Q16251517) 42.77305556, -78.79222222; OpenStreetMap "Highmark Stadium"
      // [leisure/stadium] 42.7730357, -78.7912031. Roof open: inferred: the lead names no roof; 1
      // hit read by hand. Zone America/New_York (geo-tz/all 8.1.4). Flags: roof hit read by hand:
      // phrase: "The plan included a $1.4 billion, 72,000-seat" (a plan for a different stadium).
      at "Highmark Stadium" 42.7730 -78.7917 OpenAir "America/New_York"
      // Hillsborough (EFL Cup, EFL Trophy; 4 games on 4 days, 2026-08-08 to 2026-11-11). Wikipedia
      // "Hillsborough Stadium" (Q642557) 53.41138889, -1.50055556; OpenStreetMap "Hillsborough
      // Stadium" [leisure/stadium] 53.411379, -1.5006311. Roof open: inferred: the lead names no
      // roof. Zone Europe/London (geo-tz/all 8.1.4).
      at "Hillsborough" 53.4114 -1.5006 OpenAir "Europe/London"
      // Kenilworth Road (EFL Trophy; 2 games on 2 days, 2026-09-22 to 2026-11-07). Wikipedia
      // "Kenilworth Road" (Q1613767) 51.88416667, -0.43166667; OpenStreetMap "Kenilworth Road
      // Stadium" [leisure/stadium] 51.884126, -0.4316701. Roof open: inferred: the lead names no
      // roof; 1 hit read by hand. Zone Europe/London (geo-tz/all 8.1.4). Flags: roof hit read by
      // hand: phrase: "envisioned by Kohler as a 20,000 all-seater indoor arena with a retractable
      // roof and pitch" (a proposal for a different arena).
      at "Kenilworth Road" 51.8841 -0.4317 OpenAir "Europe/London"
      // McLane Stadium (CFB; 5 games on 5 days, 2026-09-12 to 2026-11-07). Wikipedia "McLane
      // Stadium" (Q4874608) 31.5582, -97.1157; OpenStreetMap "McLane Stadium" [leisure/stadium]
      // 31.5582247, -97.1156821. Roof open: inferred: the lead names no roof. Zone America/Chicago
      // (geo-tz/all 8.1.4).
      at "McLane Stadium" 31.5582 -97.1157 OpenAir "America/Chicago"
      // Medinah CC (No. 3) (golf; 5 games on 5 days, 2026-09-24 to 2026-09-28). Wikipedia "Medinah
      // Country Club" (Q3495893) 41.966, -88.048; OpenStreetMap "Medinah Country Club"
      // [leisure/golf_course] 41.9654003, -88.0447771. Roof open: lead, read by hand: "Moroccan
      // domed clubhouse topped with minarets" (the dome is the clubhouse's, not a roof over the
      // courses). Zone America/Chicago (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness
      // (W143789356) is classed leisure/golf_course, not leisure/stadium; roof word in the lead
      // after its first sentence, read by hand: "Moroccan domed clubhouse topped with minarets"
      // (the dome is the clubhouse's, not a roof over the courses).
      at "Medinah CC (No. 3)" 41.9657 -88.0464 OpenAir "America/Chicago"
      // Miejski Stadion Pilkarski Raków (UEFA Europa Conference League Qualifying; 1 game on 1 day,
      // 2026-08-27 to 2026-08-27). Wikipedia "Miejski Stadion Piłkarski Raków" (Q11780237)
      // 50.776748, 19.159229; Wikidata Q11780237 50.7767, 19.1592; OpenStreetMap "Stadion Raków"
      // [leisure/stadium] 50.7768397, 19.1592602. Disagreeing: photon 52.1690119, 20.8129694. Roof
      // open: inferred: the lead names no roof. Zone Europe/Warsaw (geo-tz/all 8.1.4). Flags: the
      // OpenStreetMap witness carries neither the venue string nor the article title in its label.
      at "Miejski Stadion Pilkarski Raków" 50.7768 19.1592 OpenAir "Europe/Warsaw"
      // Mikheil Meskhi Stadioni (UEFA Europa League Qualifying, UEFA Europa Conference League; 2
      // games on 2 days, 2026-08-27 to 2026-10-22). Wikipedia "Mikheil Meskhi Stadium" (Q1535913)
      // 41.70972222, 44.74611111; OpenStreetMap "მიხეილ მესხის სახელობის სტადიონი"
      // [leisure/stadium] 41.7098044, 44.7462714. Roof open: inferred: the lead names no roof. Zone
      // Asia/Tbilisi (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness carries neither the venue
      // string nor the article title in its label.
      at "Mikheil Meskhi Stadioni" 41.7098 44.7462 OpenAir "Asia/Tbilisi"
      // Mornflake Stadium (EFL Cup, EFL Trophy; 4 games on 4 days, 2026-08-08 to 2026-11-10).
      // Wikipedia "Gresty Road" (Q389544) 53.0875, -2.43583333; OpenStreetMap "Mornflake Stadium"
      // [leisure/stadium] 53.087402, -2.4357344. Roof open: inferred: the lead names no roof. Zone
      // Europe/London (geo-tz/all 8.1.4).
      at "Mornflake Stadium" 53.0875 -2.4358 OpenAir "Europe/London"
      // Municipal Stadium-Poznan (UEFA Europa League Qualifying, UEFA Europa League; 3 games on 3
      // days, 2026-08-20 to 2026-10-22). Wikipedia "Poznań Stadium" (Q188699) 52.3975, 16.85777778;
      // OpenStreetMap "ENEA Stadion" [leisure/stadium] 52.3976795, 16.8581003. Disagreeing: photon
      // 33.4492717, -111.9542209. Roof open: inferred: the lead names no roof. Zone Europe/Warsaw
      // (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness carries neither the venue string nor
      // the article title in its label.
      at "Municipal Stadium-Poznan" 52.3976 16.8579 OpenAir "Europe/Warsaw"
      // Nu Stadium (MLS; 30 games on 20 days, 2026-07-22 to 2026-11-07). Wikipedia "Nu Stadium"
      // (Q17018920) 25.7931, -80.259; OpenStreetMap "Nu Stadium" [leisure/stadium] 25.7924491,
      // -80.2602921. Roof open: inferred: the lead names no roof. Zone America/New_York (geo-tz/all
      // 8.1.4).
      at "Nu Stadium" 25.7928 -80.2596 OpenAir "America/New_York"
      // Olimpico (Serie A, UEFA Champions League; 13 games on 13 days, 2026-08-24 to 2026-11-07).
      // Wikipedia "Stadio Olimpico" (Q159884) 41.93388889, 12.45472222; OpenStreetMap "5"
      // [leisure/pitch] 41.9337916, 12.454824. Roof open: inferred: the lead names no roof. Zone
      // Europe/Rome (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness (W667711166) is classed
      // leisure/pitch, not leisure/stadium; the OpenStreetMap witness (W667711166) carries no name;
      // the OpenStreetMap witness carries neither the venue string nor the article title in its
      // label.
      at "Olimpico" 41.9338 12.4548 OpenAir "Europe/Rome"
      // Olympia (UEFA Europa Conference League; 2 games on 2 days, 2026-10-15 to 2026-11-05).
      // Wikipedia "Olympia (Helsingborg)" (Q638087) 56.04944444, 12.70694444; Photon "Olympia"
      // [leisure/stadium] 56.0499907, 12.7077617. Roof open: inferred: the lead names no roof. Zone
      // Europe/Stockholm (geo-tz/all 8.1.4). Flags: no OpenStreetMap witness; the Wikipedia title
      // needs a qualifier, so the plain name is shared with other places.
      at "Olympia" 56.0497 12.7074 OpenAir "Europe/Stockholm"
      // Our Lady of Lourdes Stadium (CFB; 5 games on 5 days, 2026-09-05 to 2026-11-07). Wikipedia
      // "Cajun Field" (Q5018009) 30.21583333, -92.04194444; OpenStreetMap "Cajun Field"
      // [leisure/stadium] 30.2158728, -92.041736. Disagreeing: nominatim 38.9637302, -92.3695326.
      // Roof open: inferred: the lead names no roof. Zone America/Chicago (geo-tz/all 8.1.4).
      at "Our Lady of Lourdes Stadium" 30.2159 -92.0418 OpenAir "America/Chicago"
      // Parken Stadium (UEFA Europa Conference League Qualifying, UEFA Europa Conference League; 3
      // games on 3 days, 2026-08-27 to 2026-11-05). Wikipedia "Parken Stadium" (Q33003) 55.7025,
      // 12.57222222; OpenStreetMap "Parken" [leisure/stadium] 55.7027043, 12.5722638. Roof
      // retractable: lead, read by hand: "The stadium, which features a retractable roof" (the
      // second sentence of the lead says the ground has one); 1 hit read by hand. Zone
      // Europe/Copenhagen (geo-tz/all 8.1.4). Flags: home not tied to the ground: "København" (3
      // games); roof hit read by hand: phrase: "The stadium, which features a [[ retractable
      // roof]]" (the article says the ground has it); roof word in the lead after its first
      // sentence, read by hand: "The stadium, which features a retractable roof" (the second
      // sentence of the lead says the ground has one).
      at "Parken Stadium" 55.7026 12.5722 Retractable "Europe/Copenhagen"
      // Peninsula Stadium (EFL Cup, EFL Trophy; 2 games on 2 days, 2026-08-08 to 2026-09-22).
      // Wikipedia "Moor Lane" (Q54817852) 53.51361111, -2.27666667; OpenStreetMap "Moor Lane"
      // [leisure/stadium] 53.5136044, -2.2769071. Disagreeing: nominatim 51.5029366, 0.0032029;
      // photon 21.3745464, -157.9997115. Roof open: inferred: the lead names no roof. Zone
      // Europe/London (geo-tz/all 8.1.4). Flags: the venue name is not in the article's lead; it is
      // tied by a search hit on the article ("Peninsula Stadium").
      at "Peninsula Stadium" 53.5136 -2.2768 OpenAir "Europe/London"
      // RAW Charging Stadium (FA Cup; 1 game on 1 day, 2026-11-06 to 2026-11-06). Wikipedia "Oxford
      // City F.C." (Q5213276) 51.77388889, -1.22777778; OpenStreetMap "The MGroup Stadium"
      // [leisure/stadium] 51.773938, -1.2277959. Disagreeing: photon 44.7832203, 20.4646751. Roof
      // open: inferred: the lead names no roof. Zone Europe/London (geo-tz/all 8.1.4). Flags: the
      // OpenStreetMap witness carries neither the venue string nor the article title in its label;
      // the venue name is not in the article's lead; it is tied by a search hit on the article
      // ("RAW Charging").
      at "RAW Charging Stadium" 51.7739 -1.2278 OpenAir "Europe/London"
      // Reale Arena (La Liga, UEFA Europa League; 8 games on 8 days, 2026-08-29 to 2026-11-08).
      // Wikipedia "Anoeta Stadium" (Q917845) 43.30138889, -1.97361111; OpenStreetMap "Estadio
      // Municipal de Anoeta" [leisure/stadium] 43.3013899, -1.9735689. Roof open: inferred: the
      // lead names no roof. Zone Europe/Madrid (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness
      // carries neither the venue string nor the article title in its label; the venue name is not
      // in the article's lead; it is tied by a search hit on the article ("Reale Arena").
      at "Reale Arena" 43.3014 -1.9736 OpenAir "Europe/Madrid"
      // Riazor (La Liga; 6 games on 6 days, 2026-08-17 to 2026-11-02). Wikidata Q22130 43.368667,
      // -8.417372; OpenStreetMap "Estadio ABANCA-RIAZOR" [leisure/stadium] 43.3687157, -8.4175098.
      // Roof open: inferred: the lead names no roof. Zone Europe/Madrid (geo-tz/all 8.1.4).
      at "Riazor" 43.3687 -8.4174 OpenAir "Europe/Madrid"
      // Rodney Parade (EFL Trophy; 3 games on 3 days, 2026-10-06 to 2026-11-07). Wikipedia "Rodney
      // Parade" (Q2343802) 51.58833333, -2.98777778; OS postcode directory NP19 0UU 51.589578,
      // -2.991256. Roof open: inferred: the lead names no roof. Zone Europe/London (geo-tz/all
      // 8.1.4). Flags: no OpenStreetMap witness: a postcode centroid of the OS postcode directory
      // stands for the second family.
      at "Rodney Parade" 51.5890 -2.9895 OpenAir "Europe/London"
      // Stade Boréale (MLS; 3 games on 2 days, 2026-07-08 to 2026-09-01). Wikipedia "Centre Sportif
      // Bois-de-Boulogne" (Q938990) 45.57416667, -73.70527778; OpenStreetMap "Stade Boréale"
      // [leisure/stadium] 45.5751793, -73.7031279; Photon "Stade Boréale" [leisure/stadium]
      // 45.5751793, -73.7031279. Roof open: inferred: the lead names no roof. Zone America/Toronto
      // (geo-tz/all 8.1.4).
      at "Stade Boréale" 45.5748 -73.7038 OpenAir "America/Toronto"
      // Stade de France (NFL; 1 game on 1 day, 2026-10-25 to 2026-10-25). Wikipedia "Stade de
      // France" (Q13205) 48.9244, 2.36; OpenStreetMap "Stade de France" [leisure/stadium]
      // 48.9244726, 2.3601325. Roof open: inferred: the lead names no roof; 1 hit read by hand.
      // Zone Europe/Paris (geo-tz/all 8.1.4). Flags: home not tied to the ground: "Saints" (1
      // game); roof hit read by hand: phrase: "was to be built on a former horse racing track" (a
      // stadium that was to be built on a former horse racing track).
      at "Stade de France" 48.9244 2.3601 OpenAir "Europe/Paris"
      // Stade Jean Bouin (Ligue 1; 5 games on 5 days, 2026-08-30 to 2026-11-01). Wikipedia "Stade
      // Jean-Bouin (Paris)" (Q670499) 48.84305556, 2.25277778; OpenStreetMap "Stade Jean-Bouin"
      // [leisure/stadium] 48.8433187, 2.2529615. Roof open: inferred: the lead names no roof. Zone
      // Europe/Paris (geo-tz/all 8.1.4). Flags: the Wikipedia title needs a qualifier, so the plain
      // name is shared with other places.
      at "Stade Jean Bouin" 48.8432 2.2529 OpenAir "Europe/Paris"
      // Stade Vélodrome (Ligue 1, UEFA Europa League; 6 games on 6 days, 2026-08-21 to 2026-11-01).
      // Wikipedia "Stade Vélodrome" (Q202150) 43.26972222, 5.39583333; OpenStreetMap "CEPAC
      // Vélodrome" [leisure/stadium] 43.2698474, 5.3959082. Disagreeing: nominatim -4.3387319,
      // 15.2659266; photon 48.6699392, -4.1053931. Roof open: inferred: the lead names no roof.
      // Zone Europe/Paris (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness carries neither the
      // venue string nor the article title in its label.
      at "Stade Vélodrome" 43.2698 5.3959 OpenAir "Europe/Paris"
      // Stadio Artemio Franchi (Serie A; 6 games on 6 days, 2026-08-29 to 2026-11-08). Wikipedia
      // "Stadio Artemio Franchi" (Q270474) 43.78083333, 11.28222222; OpenStreetMap "Stadio comunale
      // Artemio Franchi" [leisure/stadium] 43.7808838, 11.2828191. Disagreeing: nominatim
      // 43.3216868, 11.326179. Roof open: inferred: the lead names no roof. Zone Europe/Rome
      // (geo-tz/all 8.1.4).
      at "Stadio Artemio Franchi" 43.7809 11.2825 OpenAir "Europe/Rome"
      // Stanford Stadium (MLS, CFB; 8 games on 7 days, 2026-07-25 to 2026-10-23). Wikipedia
      // "Stanford Stadium" (Q692470) 37.43444444, -122.16111111; OpenStreetMap "Stanford Stadium"
      // [leisure/stadium] 37.4345264, -122.1619867. Roof open: inferred: the lead names no roof.
      // Zone America/Los_Angeles (geo-tz/all 8.1.4). Flags: home not tied to the ground: "San Jose
      // Earthquakes" (2 games), "San Jose" (1 game).
      at "Stanford Stadium" 37.4345 -122.1615 OpenAir "America/Los_Angeles"
      // TDECU Stadium (CFB; 5 games on 5 days, 2026-09-05 to 2026-11-07). Wikipedia "TDECU Stadium"
      // (Q14711138) 29.72194444, -95.34916667; OpenStreetMap "John O'Quinn Field" [leisure/pitch]
      // 29.7219969, -95.3491839. Roof open: inferred: the lead names no roof. Zone America/Chicago
      // (geo-tz/all 8.1.4). Flags: the OpenStreetMap witness (W1350963741) is classed
      // leisure/pitch, not leisure/stadium; the OpenStreetMap witness carries neither the venue
      // string nor the article title in its label.
      at "TDECU Stadium" 29.7220 -95.3492 OpenAir "America/Chicago"
      // The Cherry Red Records Stadium (EFL Cup, EFL Trophy; 3 games on 3 days, 2026-08-08 to
      // 2026-10-27). Wikipedia "Plough Lane" (Q48699006) 51.43138889, -0.18666667; OpenStreetMap
      // "Cherry Red Records Stadium" [leisure/stadium] 51.4312322, -0.1865259. Disagreeing:
      // nominatim 51.4051256, -0.2819645. Roof open: inferred: the lead names no roof. Zone
      // Europe/London (geo-tz/all 8.1.4).
      at "The Cherry Red Records Stadium" 51.4313 -0.1866 OpenAir "Europe/London"
      // The Completely-Suzuki Stadium (EFL Cup, EFL Trophy; 4 games on 4 days, 2026-08-08 to
      // 2026-11-07). Wikipedia "Whaddon Road" (Q541299) 51.90611111, -2.06027778; Photon
      // "Completely-Suzuki Stadium" [leisure/stadium] 51.9061648, -2.0602259. Roof open: inferred:
      // the lead names no roof. Zone Europe/London (geo-tz/all 8.1.4). Flags: no OpenStreetMap
      // witness; the venue name is not in the article's lead; it is tied by a search hit on the
      // article ("Completely-Suzuki").
      at "The Completely-Suzuki Stadium" 51.9061 -2.0603 OpenAir "Europe/London"
      // The County Ground (EFL Trophy; 2 games on 2 days, 2026-09-15 to 2026-09-22). Wikipedia
      // "County Ground (Swindon)" (Q1137293) 51.56444444, -1.77055556; OpenStreetMap "The Nigel
      // Eady County Ground" [leisure/stadium] 51.564507, -1.7709987. Disagreeing: nominatim
      // 52.9428729, -1.1374871; photon 51.419935, -0.0276431. Roof open: inferred: the lead names
      // no roof. Zone Europe/London (geo-tz/all 8.1.4). Flags: the Wikipedia title needs a
      // qualifier, so the plain name is shared with other places.
      at "The County Ground" 51.5645 -1.7708 OpenAir "Europe/London"
      // The Croud Meadow (EFL Trophy; 2 games on 2 days, 2026-10-06 to 2026-10-27). Wikipedia "New
      // Meadow" (Q619070) 52.6886, -2.7493; OpenStreetMap "New Meadow" [leisure/stadium] 52.688616,
      // -2.7493565. Disagreeing: photon 52.9428729, -1.1374871. Roof open: inferred: the lead names
      // no roof. Zone Europe/London (geo-tz/all 8.1.4).
      at "The Croud Meadow" 52.6886 -2.7493 OpenAir "Europe/London"
      // Ulker Stadyumu (UEFA Champions League; 1 game on 1 day, 2026-09-10 to 2026-09-10).
      // Wikipedia "Şükrü Saracoğlu Stadium" (Q222865) 40.98777778, 29.03694444; OpenStreetMap
      // "Chobani Stadium" [leisure/stadium] 40.9875807, 29.0369773. Disagreeing: photon 38.2179187,
      // -85.7535705. Roof open: inferred: the lead names no roof. Zone Europe/Istanbul (geo-tz/all
      // 8.1.4). Flags: the OpenStreetMap witness carries neither the venue string nor the article
      // title in its label; the venue name is not in the article's lead; it is tied by a search hit
      // on the article ("Ülker").
      at "Ulker Stadyumu" 40.9877 29.0370 OpenAir "Europe/Istanbul"
      // URSAPHARM-Arena an der Kaiserlinde (Bundesliga; 4 games on 4 days, 2026-08-29 to
      // 2026-10-30). Wikipedia "Waldstadion an der Kaiserlinde" (Q474858) 49.31861111, 7.12166667;
      // OpenStreetMap "Ursapharm-Arena" [leisure/stadium] 49.3188045, 7.1215724. Roof open:
      // inferred: the lead names no roof. Zone Europe/Berlin (geo-tz/all 8.1.4).
      at "URSAPHARM-Arena an der Kaiserlinde" 49.3187 7.1216 OpenAir "Europe/Berlin"
      // Vare Areena TN (UEFA Europa Conference League Qualifying; 1 game on 1 day, 2026-08-27 to
      // 2026-08-27). Wikipedia "Kuopio Football Stadium" (Q545321) 62.88463, 27.6718; Photon
      // "Kuopion keskuskenttä" [leisure/stadium] 62.8846496, 27.6715566. Roof open: inferred: the
      // lead names no roof. Zone Europe/Helsinki (geo-tz/all 8.1.4). Flags: no OpenStreetMap
      // witness.
      at "Vare Areena TN" 62.8846 27.6717 OpenAir "Europe/Helsinki"
      // Via Del Mare (Serie A; 5 games on 5 days, 2026-08-31 to 2026-11-01). Wikipedia "Stadio Via
      // del mare" (Q684727) 40.36527778, 18.20888889; OpenStreetMap "Via del Mare Stadium"
      // [leisure/stadium] 40.3651144, 18.2089177. Roof open: inferred: the lead names no roof. Zone
      // Europe/Rome (geo-tz/all 8.1.4).
      at "Via Del Mare" 40.3652 18.2089 OpenAir "Europe/Rome"
      // Vodafone Park (UEFA Europa League Qualifying, UEFA Europa League; 3 games on 3 days,
      // 2026-08-20 to 2026-10-22). Wikipedia "Beşiktaş Stadium" (Q14914703) 41.03916667,
      // 28.99472222; OpenStreetMap "Tüpraş Stadyumu" [leisure/stadium] 41.0394982, 28.9943382.
      // Disagreeing: nominatim -36.7854899, 174.7546906; photon 51.5513825, -1.8471012. Roof open:
      // inferred: the lead names no roof; 1 hit read by hand. Zone Europe/Istanbul (geo-tz/all
      // 8.1.4). Flags: the OpenStreetMap witness carries neither the venue string nor the article
      // title in its label; the venue name is not in the article's lead; it is tied by a search hit
      // on the article ("Vodafone Park"); home not tied to the ground: "SC Freiburg" (1 game); roof
      // hit read by hand: combined: "===Roof===" (the combined search matched the section heading;
      // the phrase and infobox searches have no hit).
      at "Vodafone Park" 41.0393 28.9945 OpenAir "Europe/Istanbul"
      // Wham Stadium (EFL Trophy; 3 games on 3 days, 2026-09-22 to 2026-11-07). Wikipedia "Crown
      // Ground" (Q620815) 53.76527778, -2.37083333; OpenStreetMap "Crown Ground" [leisure/stadium]
      // 53.7654011, -2.370969. Roof open: inferred: the lead names no roof. Zone Europe/London
      // (geo-tz/all 8.1.4).
      at "Wham Stadium" 53.7653 -2.3709 OpenAir "Europe/London"
      // Yager Stadium (CFB; 6 games on 6 days, 2026-09-12 to 2026-11-10). Wikidata Q8046702
      // 39.5194, -84.7328; Wikipedia "Yager Stadium (Miami University)" (Q8046702) 39.51944444,
      // -84.73277778; OpenStreetMap "Fred C. Yager Stadium" [leisure/stadium] 39.5194147,
      // -84.7330855. Disagreeing: photon 39.0335559, -95.7010336. Roof open: inferred: the lead
      // names no roof. Zone America/New_York (geo-tz/all 8.1.4). Flags: the Wikipedia title needs a
      // qualifier, so the plain name is shared with other places.
      at "Yager Stadium" 39.5194 -84.7329 OpenAir "America/New_York"
      // --- END hand rows 2026-11-12

      // --- BEGIN sourced (generated by scripts/venue-sourced-check.mjs --write; do not edit by hand)
      //     From outbox/venue-source-results-latest.json, run 42861596952 at 2026-11-10T17:12:32.969Z: 384 of 459 candidates
      //     accepted (two independent families within 0.02 degrees, an unambiguous name, a roof and a zone).
      //     The rest are in its review list, deliberately not here.
      at "Acrisure Bounce House" 28.6085 -81.1926 OpenAir "America/New_York"
      at "Acrisure Stadium" 40.4467 -80.0158 OpenAir "America/New_York"
      at "Adams Park" 51.6305 -0.8003 OpenAir "Europe/London"
      at "AESSEAL New York Stadium" 53.4272 -1.3625 OpenAir "Europe/London"
      at "AFAS Stadion" 52.6127 4.7419 OpenAir "Europe/Amsterdam"
      at "Aggborough Stadium" 52.3805 -2.2427 OpenAir "Europe/London"
      at "Aggie Memorial Stadium" 32.2797 -106.7411 OpenAir "America/Denver"
      at "Alamodome" 29.4169 -98.4789 Dome "America/Chicago"
      at "Albertsons Stadium" 43.6028 -116.1965 OpenAir "America/Boise"
      at "Allegacy Federal Credit Union Stadium" 36.1306 -80.2547 OpenAir "America/New_York"
      at "Allegiant Stadium" 36.0907 -115.1832 Dome "America/Los_Angeles"
      at "Allen E. Paulson Stadium" 32.4122 -81.7833 OpenAir "America/New_York"
      at "Allianz Riviera" 43.7051 7.1926 OpenAir "Europe/Paris"
      at "Allianz Stadion" 48.1981 16.2652 OpenAir "Europe/Vienna"
      at "Alphamega Stadium" 34.6926 32.9391 OpenAir "Asia/Nicosia"
      at "Alumni Stadium (Chestnut Hill, MA)" 42.3351 -71.1663 OpenAir "America/New_York"
      at "AmFirst Stadium" 33.8203 -85.7662 OpenAir "America/Chicago"
      at "Amon G. Carter Stadium" 32.7097 -97.3680 OpenAir "America/Chicago"
      at "Arasen Stadion" 59.9627 11.0635 OpenAir "Europe/Oslo"
      at "Arrowhead Stadium" 39.0489 -94.4840 OpenAir "America/Chicago"
      at "Aspmyra Stadion" 67.2769 14.3843 OpenAir "Europe/Oslo"
      at "AT&T Stadium" 32.7478 -97.0928 Retractable "America/Chicago"
      at "ATCO Field" 50.8839 -114.0987 OpenAir "America/Edmonton"
      at "Athens Olympic Stadium" 38.0362 23.7876 OpenAir "Europe/Athens"
      at "Autzen Stadium" 44.0583 -123.0685 OpenAir "America/Los_Angeles"
      at "Aviva Stadium" 53.3351 -6.2282 OpenAir "Europe/Dublin"
      at "Baku Olympic Stadium" 40.4299 49.9196 OpenAir "Asia/Baku"
      at "Balaidos" 42.2118 -8.7400 OpenAir "Europe/Madrid"
      at "Batumi Stadium (Adjarabet Arena)" 41.6352 41.6192 OpenAir "Asia/Tbilisi"
      at "BayArena" 51.0382 7.0028 OpenAir "Europe/Berlin"
      at "Beaver Stadium" 40.8121 -77.8560 OpenAir "America/New_York"
      at "Bellerive Country Club" 38.6617 -90.4835 OpenAir "America/Chicago"
      at "Ben Hill Griffin Stadium" 29.6500 -82.3487 OpenAir "America/New_York"
      at "Bescot Stadium" 52.5655 -1.9906 OpenAir "Europe/London"
      at "bet365 Stadium" 52.9883 -2.1756 OpenAir "Europe/London"
      at "Bill Snyder Family Stadium" 39.2020 -96.5938 OpenAir "America/Chicago"
      at "Blundell Park" 53.5702 -0.0465 OpenAir "Europe/London"
      at "Bobby Dodd Stadium" 33.7725 -84.3929 OpenAir "America/New_York"
      at "Boone Pickens Stadium" 36.1257 -97.0672 OpenAir "America/Chicago"
      at "BORUSSIA-PARK" 51.1746 6.3854 OpenAir "Europe/Berlin"
      at "Boundary Park" 53.5552 -2.1284 OpenAir "Europe/London"
      at "Brann Stadium" 60.3666 5.3572 OpenAir "Europe/Oslo"
      at "Bridgeforth Stadium" 38.4352 -78.8731 OpenAir "America/New_York"
      at "Broadfield Stadium" 51.0996 -0.1948 OpenAir "Europe/London"
      at "Broadview Stadium" 42.9991 -78.7775 OpenAir "America/New_York"
      at "Brooks Stadium (SC)" 33.7929 -79.0175 OpenAir "America/New_York"
      at "Brunton Park" 54.8956 -2.9136 OpenAir "Europe/London"
      at "Bryant-Denny Stadium" 33.2077 -87.5505 OpenAir "America/Chicago"
      at "Caesars Superdome" 29.9510 -90.0819 Dome "America/Chicago"
      at "California Memorial Stadium" 37.8710 -122.2508 OpenAir "America/Los_Angeles"
      at "Camp Randall Stadium" 43.0700 -89.4127 OpenAir "America/Chicago"
      at "Canvas Stadium" 40.5698 -105.0883 OpenAir "America/Denver"
      at "Cardiff City Stadium" 51.4728 -3.2030 OpenAir "Europe/London"
      at "Carrow Road" 52.6221 1.3093 OpenAir "Europe/London"
      at "Carter-Finley Stadium" 35.8008 -78.7196 OpenAir "America/New_York"
      at "Casino Del Sol Stadium" 32.2289 -110.9488 OpenAir "America/Phoenix"
      at "CEFCU Stadium" 37.3197 -121.8683 OpenAir "America/Los_Angeles"
      at "Celtic Park" 55.8500 -4.2064 OpenAir "Europe/London"
      at "Centennial Bank Stadium" 35.8489 -90.6673 OpenAir "America/Chicago"
      at "Center Parc Stadium" 33.7354 -84.3889 OpenAir "America/New_York"
      at "Cepheus Park Randers" 56.4660 10.0102 OpenAir "Europe/Copenhagen"
      at "Cledara Abbey Stadium" 52.2117 0.1536 OpenAir "Europe/London"
      at "Daio Wasabi Stayen Stadium" 50.8135 5.1659 OpenAir "Europe/Brussels"
      at "DATCU Stadium" 33.2038 -97.1594 OpenAir "America/Chicago"
      at "David Booth Kansas Memorial Stadium" 38.9631 -95.2463 OpenAir "America/Chicago"
      at "Davis Wade Stadium" 33.4564 -88.7935 OpenAir "America/Chicago"
      at "De Grolsch Veste" 52.2365 6.8377 OpenAir "Europe/Amsterdam"
      at "Decathlon Arena - Stade Pierre-Mauroy" 50.6119 3.1305 Retractable "Europe/Paris"
      at "Deepdale" 53.7722 -2.6884 OpenAir "Europe/London"
      at "Delaware Stadium" 39.6617 -75.7489 OpenAir "America/New_York"
      at "Detroit Golf Club" 42.4253 -83.1270 OpenAir "America/Detroit"
      at "Deutsche Bank Park" 50.0686 8.6454 Retractable "Europe/Berlin"
      at "Dick's Sporting Goods Park" 39.8058 -104.8919 OpenAir "America/Denver"
      at "Diósgyőri Stadion" 48.0997 20.7174 OpenAir "Europe/Budapest"
      at "Djúpumyrar" 62.2250 -6.5797 OpenAir "Atlantic/Faroe"
      at "DKR-Texas Memorial Stadium" 30.2838 -97.7327 OpenAir "America/Chicago"
      at "Doak Campbell Stadium" 30.4381 -84.3044 OpenAir "America/New_York"
      at "Donald W. Reynolds Razorback Stadium" 36.0681 -94.1789 OpenAir "America/Chicago"
      at "Doosan Arena" 49.7500 13.3853 OpenAir "Europe/Prague"
      at "Dowdy-Ficklen Stadium" 35.5964 -77.3653 OpenAir "America/New_York"
      at "Doyt L. Perry Stadium" 41.3781 -83.6225 OpenAir "America/New_York"
      at "Easter Road" 55.9617 -3.1653 OpenAir "Europe/London"
      at "Eco-Power Stadium" 53.5098 -1.1138 OpenAir "Europe/London"
      at "Edgeley Park" 53.3997 -2.1664 OpenAir "Europe/London"
      at "El Sadar" 42.7970 -1.6374 OpenAir "Europe/Madrid"
      at "El Sardineros" 43.4763 -3.7936 OpenAir "Europe/Madrid"
      at "Elbasan Arena" 41.1159 20.0920 OpenAir "Europe/Tirane"
      at "Elland Road" 53.7778 -1.5722 OpenAir "Europe/London"
      at "Elliott T. Bowers Stadium" 30.7139 -95.5418 OpenAir "America/Chicago"
      at "Emirates Stadium" 51.5550 -0.1084 OpenAir "Europe/London"
      at "Empower Field at Mile High" 39.7439 -105.0195 OpenAir "America/Denver"
      at "Energizer Park" 38.6308 -90.2107 OpenAir "America/Chicago"
      at "Ennio Tardini" 44.7948 10.3384 OpenAir "Europe/Rome"
      at "Estadi Ciutat de València" 39.4947 -0.3640 OpenAir "Europe/Madrid"
      at "Estadio Banorte" 19.3030 -99.1505 OpenAir "America/Mexico_City"
      at "Estadio Benito Villamarín" 37.3564 -5.9811 OpenAir "Europe/Madrid"
      at "Estadio Coliseum" 40.3256 -3.7148 OpenAir "Europe/Madrid"
      at "Estádio da Luz" 38.7527 -9.1847 OpenAir "Europe/Lisbon"
      at "Estadio de la Cerámica" 39.9442 -0.1035 OpenAir "Europe/Madrid"
      at "Estadio de Vallecas" 40.3918 -3.6588 OpenAir "Europe/Madrid"
      at "Estádio do Dragão" 41.1618 -8.5838 OpenAir "Europe/Lisbon"
      at "Estádio Dr. Magalhaes Pessoa" 39.7488 -8.8130 OpenAir "Europe/Lisbon"
      at "Estádio José Alvalade" 38.7612 -9.1608 OpenAir "Europe/Lisbon"
      at "Estadio La Cartuja" 37.4172 -6.0043 OpenAir "Europe/Madrid"
      at "Estadio Martínez Valero" 38.2662 -0.6637 OpenAir "Europe/Madrid"
      at "Estádio Municipal de Braga" 41.5625 -8.4302 OpenAir "Europe/Lisbon"
      at "Estadio Municipal de Butarque" 40.3405 -3.7607 OpenAir "Europe/Madrid"
      at "Estadio Nemesio Diez" 19.2872 -99.6666 OpenAir "America/Mexico_City"
      at "EverBank Stadium" 30.3240 -81.6374 OpenAir "America/New_York"
      at "Ewood Park" 53.7286 -2.4892 OpenAir "Europe/London"
      at "Falcon Stadium" 38.9970 -104.8432 OpenAir "America/Denver"
      at "Fargodome" 46.9030 -96.8014 Dome "America/Chicago"
      at "Fir Park" 55.7802 -3.9802 OpenAir "Europe/London"
      at "First Community Stadium" 29.7164 -95.4092 OpenAir "America/Chicago"
      at "FirstBank Stadium" 36.1440 -86.8089 OpenAir "America/Chicago"
      at "FK Partizan Stadium" 44.7887 20.4591 OpenAir "Europe/Belgrade"
      at "Flagler Credit Union Stadium" 26.3758 -80.1010 OpenAir "America/New_York"
      at "Folsom Field" 40.0094 -105.2664 OpenAir "America/Denver"
      at "Ford Field" 42.3400 -83.0456 Dome "America/Detroit"
      at "Fortuna Arena" 50.0675 14.4712 OpenAir "Europe/Prague"
      at "Galaxy Stadium" 33.5912 -101.8730 OpenAir "America/Chicago"
      at "Generali Arena" 50.0997 14.4160 OpenAir "Europe/Prague"
      at "Georgios Karaiskakis Stadium" 37.9464 23.6645 OpenAir "Europe/Athens"
      at "Gerald J. Ford Stadium" 32.8374 -96.7832 OpenAir "America/Chicago"
      at "Ghelamco Arena" 51.0161 3.7331 OpenAir "Europe/Brussels"
      at "Gies Memorial Stadium" 40.0992 -88.2359 OpenAir "America/Chicago"
      at "Giulesti Stadium" 44.4558 26.0570 OpenAir "Europe/Bucharest"
      at "Giuseppe Sinigaglia" 45.8138 9.0723 OpenAir "Europe/Rome"
      at "Glass Bowl" 41.6570 -83.6136 OpenAir "America/New_York"
      at "Goffertstadion" 51.8225 5.8370 OpenAir "Europe/Amsterdam"
      at "Gradski Stadion Banja Luka" 44.7761 17.1996 OpenAir "Europe/Sarajevo"
      at "Groupama Arena" 47.4754 19.0955 OpenAir "Europe/Budapest"
      at "Groupama Stadium" 45.7653 4.9821 OpenAir "Europe/Paris"
      at "GSP Stadium" 35.1145 33.3634 OpenAir "Asia/Nicosia"
      at "Gtech Community Stadium" 51.4908 -0.2889 OpenAir "Europe/London"
      at "H. A. Chapman Stadium" 36.1486 -95.9439 OpenAir "America/Chicago"
      at "Hamilton Stadium" 43.2524 -79.8301 OpenAir "America/Toronto"
      at "Hancock Whitney Stadium" 30.6969 -88.1924 OpenAir "America/Chicago"
      at "Hard Rock Stadium" 25.9580 -80.2389 OpenAir "America/New_York"
      at "Highbury Stadium" 53.9164 -3.0247 OpenAir "Europe/London"
      at "Hill Dickinson Stadium" 53.4250 -3.0027 OpenAir "Europe/London"
      at "Home Deluxe Arena" 51.7311 8.7109 OpenAir "Europe/Berlin"
      at "Home Park" 50.3881 -4.1509 OpenAir "Europe/London"
      at "Hornchurch Stadium" 51.5566 0.2383 OpenAir "Europe/London"
      at "Hornet Stadium" 38.5557 -121.4229 OpenAir "America/Los_Angeles"
      at "Houchens Industries-L.T. Smith Stadium" 36.9847 -86.4594 OpenAir "America/Chicago"
      at "Huntington Bank Field" 41.5061 -81.6996 OpenAir "America/New_York"
      at "Huntington Bank Stadium" 44.9765 -93.2242 OpenAir "America/Chicago"
      at "Huskie Stadium" 41.9340 -88.7779 OpenAir "America/Chicago"
      at "Husky Stadium" 47.6503 -122.3019 OpenAir "America/Los_Angeles"
      at "Ibrox Stadium" 55.8532 -4.3093 OpenAir "Europe/London"
      at "InfoCision Stadium" 41.0724 -81.5083 OpenAir "America/New_York"
      at "Inter.co Stadium" 28.5411 -81.3891 OpenAir "America/New_York"
      at "Inver Park" 54.8499 -5.8268 OpenAir "Europe/London"
      at "J. Davidson Stadium" 53.3834 -2.3352 OpenAir "Europe/London"
      at "Jack Trice Stadium" 42.0141 -93.6358 OpenAir "America/Chicago"
      at "Jan Breydel Stadium" 51.1933 3.1808 OpenAir "Europe/Brussels"
      at "Jerry Richardson Stadium" 35.3105 -80.7402 OpenAir "America/New_York"
      at "JMA Wireless Dome" 43.0362 -76.1364 Dome "America/New_York"
      at "Joan C. Edwards Stadium" 38.4249 -82.4209 OpenAir "America/New_York"
      at "JobServe Community Stadium" 51.9234 0.8977 OpenAir "Europe/London"
      at "Joe Aillet Stadium" 32.5321 -92.6559 OpenAir "America/Chicago"
      at "Johan Cruijff Arena" 52.3143 4.9425 Retractable "Europe/Amsterdam"
      at "John Smith's Stadium" 53.6543 -1.7683 OpenAir "Europe/London"
      at "Johnny \"Red\" Floyd Stadium" 35.8512 -86.3683 OpenAir "America/Chicago"
      at "Jordan-Hare Stadium" 32.6022 -85.4892 OpenAir "America/Chicago"
      at "Journey Bank Ballpark at Historic Bowman Field" 41.2423 -77.0470 OpenAir "America/New_York"
      at "Kardinia Park" -38.1582 144.3541 OpenAir "Australia/Melbourne"
      at "Kelly/Shorts Stadium" 43.5776 -84.7710 OpenAir "America/Detroit"
      at "Kenan Stadium" 35.9069 -79.0478 OpenAir "America/New_York"
      at "Kidd Brewer Stadium" 36.2116 -81.6856 OpenAir "America/New_York"
      at "King Power at Den Dreef Stadion" 50.8684 4.6943 OpenAir "Europe/Brussels"
      at "King Power Stadium" 52.6204 -1.1423 OpenAir "Europe/London"
      at "Kinnick Stadium" 41.6586 -91.5512 OpenAir "America/Chicago"
      at "Kroger Field" 38.0227 -84.5052 OpenAir "America/New_York"
      at "Kybunpark" 47.4085 9.3066 OpenAir "Europe/Zurich"
      at "Kyle Field" 30.6099 -96.3408 OpenAir "America/Chicago"
      at "L&N Federal Credit Union Stadium" 38.2060 -85.7588 OpenAir "America/Kentucky/Louisville"
      at "La Rosaleda" 36.7345 -4.4265 OpenAir "Europe/Madrid"
      at "Lambeau Field" 44.5011 -88.0621 OpenAir "America/Chicago"
      at "Lamex Stadium" 51.8897 -0.1937 OpenAir "Europe/London"
      at "Lane Stadium" 37.2199 -80.4180 OpenAir "America/New_York"
      at "LaVell Edwards Stadium" 40.2574 -111.6545 OpenAir "America/Denver"
      at "Levi's Stadium" 37.4031 -121.9698 OpenAir "America/Los_Angeles"
      at "Lincoln Financial Field" 39.9009 -75.1676 OpenAir "America/New_York"
      at "LNER Community Stadium" 53.9843 -1.0528 OpenAir "Europe/London"
      at "London Road Stadium" 52.5646 -0.2402 OpenAir "Europe/London"
      at "Los Angeles Memorial Coliseum" 34.0140 -118.2878 OpenAir "America/Los_Angeles"
      at "Lotto Park" 50.8341 4.2980 OpenAir "Europe/Brussels"
      at "Lucas Oil Stadium" 39.7594 -86.1638 Retractable "America/Indiana/Indianapolis"
      at "M&T Bank Stadium" 39.2780 -76.6227 OpenAir "America/New_York"
      at "Mackay Stadium" 39.5469 -119.8174 OpenAir "America/Los_Angeles"
      at "Madejski Stadium" 51.4223 -0.9830 OpenAir "Europe/London"
      at "Maksimir Stadium" 45.8188 16.0180 OpenAir "Europe/Zagreb"
      at "Malone Stadium" 32.5309 -92.0660 OpenAir "America/Chicago"
      at "Malsovická Aréna" 50.2064 15.8451 OpenAir "Europe/Prague"
      at "Mapei Stadium" 44.7146 10.6497 OpenAir "Europe/Rome"
      at "Maracanã Stadium" -22.9122 -43.2309 OpenAir "America/Sao_Paulo"
      at "Martin Stadium" 46.7318 -117.1597 OpenAir "America/Los_Angeles"
      at "MATRADE Loftus Road" 51.5093 -0.2321 OpenAir "Europe/London"
      at "Maverik Stadium" 41.7518 -111.8117 OpenAir "America/Denver"
      at "MCH Arena" 56.1167 8.9517 OpenAir "Europe/Copenhagen"
      at "Meadow Lane" 52.9427 -1.1374 OpenAir "Europe/London"
      at "Meadow Park" 51.6620 -0.2724 OpenAir "Europe/London"
      at "Memorial Stadium (Bloomington, IN)" 39.1809 -86.5256 OpenAir "America/Indiana/Indianapolis"
      at "Memorial Stadium (Clemson, SC)" 34.6787 -82.8432 OpenAir "America/New_York"
      at "Memorial Stadium (Lincoln, NE)" 40.8208 -96.7050 OpenAir "America/Chicago"
      at "Memorial Stadium (Norman, OK)" 35.2057 -97.4423 OpenAir "America/Chicago"
      at "Mendizorrotza" 42.8371 -2.6882 OpenAir "Europe/Madrid"
      at "Merkur Arena" 47.0463 15.4542 OpenAir "Europe/Vienna"
      at "Merkur Spiel-Arena" 51.2616 6.7331 Retractable "Europe/Berlin"
      at "Mestalla Stadium" 39.4746 -0.3582 OpenAir "Europe/Madrid"
      at "MetLife Stadium" 40.8135 -74.0744 OpenAir "America/New_York"
      at "MEWA ARENA" 49.9840 8.2244 OpenAir "Europe/Berlin"
      at "MHPArena" 48.7922 9.2320 OpenAir "Europe/Berlin"
      at "Michie Stadium" 41.3874 -73.9643 OpenAir "America/New_York"
      at "Michigan Stadium" 42.2658 -83.7481 OpenAir "America/Detroit"
      at "Milan Puskar Stadium" 39.6502 -79.9549 OpenAir "America/New_York"
      at "Molineux Stadium" 52.5903 -2.1304 OpenAir "Europe/London"
      at "Mountain America Stadium" 33.4263 -111.9326 OpenAir "America/Phoenix"
      at "Národny Futbalovy Stadión" 48.1635 17.1368 OpenAir "Europe/Bratislava"
      at "Navy-Marine Corps Memorial Stadium" 38.9847 -76.5070 OpenAir "America/New_York"
      at "Nethermoor Park" 53.8772 -1.7194 OpenAir "Europe/London"
      at "New Balance Arena" 45.7091 9.6808 OpenAir "Europe/Rome"
      at "Neyland Stadium" 35.9550 -83.9244 OpenAir "America/New_York"
      at "Nippert Stadium" 39.1311 -84.5162 OpenAir "America/New_York"
      at "Nissan Stadium" 36.1665 -86.7713 OpenAir "America/Chicago"
      at "Northwest Stadium" 38.9077 -76.8645 OpenAir "America/New_York"
      at "Northwestern Medicine Field at Martin Stadium" 42.0584 -87.6708 OpenAir "America/Chicago"
      at "Notre Dame Stadium" 41.6984 -86.2339 OpenAir "America/Indiana/Indianapolis"
      at "NRG Stadium" 29.6848 -95.4108 Retractable "America/Chicago"
      at "Oakwell" 53.5522 -1.4676 OpenAir "Europe/London"
      at "Ohio Stadium" 40.0017 -83.0197 OpenAir "America/New_York"
      at "Old Trafford" 53.4631 -2.2914 OpenAir "Europe/London"
      at "One Call Stadium" 53.1381 -1.2007 OpenAir "Europe/London"
      at "OPAP Arena" 38.0372 23.7411 OpenAir "Europe/Athens"
      at "Oriole Park at Camden Yards" 39.2838 -76.6216 OpenAir "America/New_York"
      at "Pankritio Stadium" 35.3365 25.1047 OpenAir "Europe/Athens"
      at "Papara Park" 40.9987 39.6457 OpenAir "Europe/Istanbul"
      at "Parc des Princes" 48.8414 2.2531 OpenAir "Europe/Paris"
      at "Paycor Stadium" 39.0955 -84.5160 OpenAir "America/New_York"
      at "Peden Stadium" 39.3211 -82.1030 OpenAir "America/New_York"
      at "Perth Stadium" -31.9511 115.8891 OpenAir "Australia/Perth"
      at "Philips Stadion" 51.4417 5.4674 OpenAir "Europe/Amsterdam"
      at "Pirelli Stadium" 52.8219 -1.6269 OpenAir "Europe/London"
      at "Pitbull Stadium" 25.7525 -80.3779 OpenAir "America/New_York"
      at "Portman Road" 52.0550 1.1453 OpenAir "Europe/London"
      at "Pratt & Whitney Stadium" 41.7596 -72.6189 OpenAir "America/New_York"
      at "Prenton Park" 53.3737 -3.0326 OpenAir "Europe/London"
      at "PreZero Arena" 49.2385 8.8880 OpenAir "Europe/Berlin"
      at "Pride Park" 52.9150 -1.4473 OpenAir "Europe/London"
      at "Priestfield Stadium" 51.3842 0.5609 OpenAir "Europe/London"
      at "Protective Stadium" 33.5276 -86.8090 OpenAir "America/Chicago"
      at "Raiffeisen Arena (Linz)" 48.2936 14.2766 OpenAir "Europe/Vienna"
      at "Rajko Mitic Stadium" 44.7833 20.4647 OpenAir "Europe/Belgrade"
      at "Ramón Sánchez Pizjuán Stadium" 37.3840 -5.9706 OpenAir "Europe/Madrid"
      at "Raymond James Stadium" 27.9759 -82.5033 OpenAir "America/New_York"
      at "RCDE Stadium" 41.3479 2.0762 OpenAir "Europe/Madrid"
      at "Red Bull Arena Salzburg" 47.8163 12.9982 OpenAir "Europe/Vienna"
      at "Reliant Stadium" 29.6848 -95.4108 Retractable "America/Chicago"
      at "Renato Dall'Ara" 44.4923 11.3099 OpenAir "Europe/Rome"
      at "Reser Stadium" 44.5595 -123.2814 OpenAir "America/Los_Angeles"
      at "RheinEnergieStadion" 50.9335 6.8751 OpenAir "Europe/Berlin"
      at "Rice Stadium" 29.7163 -95.4093 OpenAir "America/Chicago"
      at "Rice-Eccles Stadium" 40.7599 -111.8489 OpenAir "America/Denver"
      at "Right to Dream Park" 55.8161 12.3531 OpenAir "Europe/Copenhagen"
      at "Riyadh Air Metropolitano" 40.4360 -3.5996 OpenAir "Europe/Madrid"
      at "Roazhon Park" 48.1075 -1.7127 OpenAir "Europe/Paris"
      at "Robert W. Plaster Stadium" 37.1976 -93.2798 OpenAir "America/Chicago"
      at "Romssa Arena" 69.6489 18.9346 OpenAir "Europe/Oslo"
      at "Rose Bowl" 34.1614 -118.1676 OpenAir "America/Los_Angeles"
      at "Ross-Ade Stadium" 40.4345 -86.9184 OpenAir "America/Indiana/Indianapolis"
      at "Royal Birkdale GC" 53.6218 -3.0328 OpenAir "Europe/London"
      at "Rynearson Stadium" 42.2558 -83.6473 OpenAir "America/Detroit"
      at "S. Darius and S. Gireno Stadium" 54.8973 23.9371 OpenAir "Europe/Vilnius"
      at "S.B. Ballard Stadium" 36.8889 -76.3049 OpenAir "America/New_York"
      at "San Mamés" 43.2642 -2.9494 OpenAir "Europe/Madrid"
      at "San Siro" 45.4781 9.1239 OpenAir "Europe/Rome"
      at "Sanford Stadium" 33.9498 -83.3733 OpenAir "America/New_York"
      at "Santiago Bernabéu" 40.4531 -3.6883 Retractable "Europe/Madrid"
      at "Scheumann Stadium" 40.2160 -85.4168 OpenAir "America/Indiana/Indianapolis"
      at "Scott Stadium" 38.0310 -78.5136 OpenAir "America/New_York"
      at "ScottsMiracle-Gro Field" 39.9684 -83.0168 OpenAir "America/New_York"
      at "SeatGeek Stadium" 41.7648 -87.8062 OpenAir "America/Chicago"
      at "SECU Stadium" 38.9903 -76.9474 OpenAir "America/New_York"
      at "Sedgefield Country Club" 36.0134 -79.8872 OpenAir "America/New_York"
      at "SHI Stadium" 40.5135 -74.4652 OpenAir "America/New_York"
      at "Signal Iduna Park" 51.4925 7.4518 OpenAir "Europe/Berlin"
      at "Silverlake Stadium" 50.9524 -1.3719 OpenAir "Europe/London"
      at "Simmons Bank Liberty Stadium" 35.1211 -89.9774 OpenAir "America/Chicago"
      at "Sixfields Stadium" 52.2352 -0.9335 OpenAir "Europe/London"
      at "Skonto Stadions" 56.9613 24.1163 OpenAir "Europe/Riga"
      at "SMH Group Stadium" 53.2535 -1.4263 OpenAir "Europe/London"
      at "SoFi Stadium" 33.9524 -118.3387 Dome "America/Los_Angeles"
      at "Spartan Stadium" 42.7281 -84.4852 OpenAir "America/Detroit"
      at "Sports Illustrated Stadium" 40.7368 -74.1503 OpenAir "America/New_York"
      at "Spotify Camp Nou" 41.3809 2.1228 OpenAir "Europe/Madrid"
      at "St. Andrew's Stadium" 52.4756 -1.8681 OpenAir "Europe/London"
      at "St. James' Park" 54.9755 -1.6218 OpenAir "Europe/London"
      at "St. Mary's Stadium" 50.9059 -1.3910 OpenAir "Europe/London"
      at "Stade Bollaert-Delelis" 50.4328 2.8150 OpenAir "Europe/Paris"
      at "Stade de l'Abbé-Deschamps" 47.7868 3.5887 OpenAir "Europe/Paris"
      at "Stade de l'Aube" 48.3041 4.0922 OpenAir "Europe/Paris"
      at "Stade de Tourbillon" 46.2334 7.3761 OpenAir "Europe/Zurich"
      at "Stade du Moustoir - Yves Allainmat" 47.7487 -3.3694 OpenAir "Europe/Paris"
      at "Stade Francis-Le Blé" 48.4030 -4.4614 OpenAir "Europe/Paris"
      at "Stade Louis II" 43.7276 7.4155 OpenAir "Europe/Monaco"
      at "Stade Marie-Marvingt" 47.9593 0.2225 OpenAir "Europe/Paris"
      at "Stade Océane" 49.4988 0.1695 OpenAir "Europe/Paris"
      at "Stade Raymond Kopa" 47.4601 -0.5310 OpenAir "Europe/Paris"
      at "Stadio Benito Stirpe" 41.6341 13.3218 OpenAir "Europe/Rome"
      at "Stadio Diego Armando Maradona" 40.8280 14.1929 OpenAir "Europe/Rome"
      at "Stadio Friuli" 46.0815 13.1999 OpenAir "Europe/Rome"
      at "Stadio Luigi Ferraris" 44.4165 8.9525 OpenAir "Europe/Rome"
      at "Stadio Olimpico Grande Torino" 45.0417 7.6500 OpenAir "Europe/Rome"
      at "Stadio Pier Luigi Penzo" 45.4277 12.3639 OpenAir "Europe/Rome"
      at "Stadion An der Alten Försterei" 52.4571 13.5681 OpenAir "Europe/Berlin"
      at "Stadion HNK Rijeka" 45.3433 14.3909 OpenAir "Europe/Zagreb"
      at "Stadion im. Ernesta Pohla" 50.2963 18.7685 OpenAir "Europe/Warsaw"
      at "Stadion Miejski Bialystok" 53.1060 23.1472 OpenAir "Europe/Warsaw"
      at "Stadion Poljud" 43.5195 16.4318 OpenAir "Europe/Zagreb"
      at "Stadion Strelnice" 50.7150 15.1623 OpenAir "Europe/Prague"
      at "Stadion Z'dezele" 46.2466 15.2701 OpenAir "Europe/Ljubljana"
      at "Stadionul Ion Oblemenco" 44.3140 23.7842 OpenAir "Europe/Bucharest"
      at "Stadium MK" 52.0096 -0.7335 OpenAir "Europe/London"
      at "Stadium Municipal de Toulouse" 43.5833 1.4341 OpenAir "Europe/Paris"
      at "Stadiumi Fadil Vokrri" 42.6629 21.1570 OpenAir "Europe/Belgrade"
      at "Stamford Bridge" 51.4817 -0.1911 OpenAir "Europe/London"
      at "State Farm Stadium" 33.5272 -112.2620 Retractable "America/Phoenix"
      at "Stockhorn Arena" 46.7447 7.6064 OpenAir "Europe/Zurich"
      at "Strandvallen" 56.0123 14.7170 OpenAir "Europe/Stockholm"
      at "Şükrü Saracoğlu Stadium" 40.9876 29.0369 OpenAir "Europe/Istanbul"
      at "Sun Bowl" 31.7732 -106.5080 OpenAir "America/Denver"
      at "Swangard Stadium" 49.2309 -123.0215 OpenAir "America/Vancouver"
      at "Swansea.com Stadium" 51.6426 -3.9349 OpenAir "Europe/London"
      at "Tallaght Stadium" 53.2834 -6.3738 OpenAir "Europe/Dublin"
      at "Tammelan Stadion" 61.5004 23.7853 OpenAir "Europe/Helsinki"
      at "TD Place Stadium" 45.3983 -75.6836 OpenAir "America/Toronto"
      at "The City Ground" 52.9400 -1.1329 OpenAir "Europe/London"
      at "The Hive Stadium" 51.6026 -0.2917 OpenAir "Europe/London"
      at "The Kassam Stadium" 51.7164 -1.2066 OpenAir "Europe/London"
      at "The MKM Stadium" 53.7462 -0.3678 OpenAir "Europe/London"
      at "The Raymond McEnhill Stadium" 51.1043 -1.7858 OpenAir "Europe/London"
      at "The Renaissance Club" 56.0530 -2.8093 OpenAir "Europe/London"
      at "Tiger Stadium (LA)" 30.4120 -91.1842 OpenAir "America/Chicago"
      at "Tofiq Bahramov Republican Stadium" 40.3975 49.8524 OpenAir "Asia/Baku"
      at "Tottenham Hotspur Stadium" 51.6043 -0.0663 OpenAir "Europe/London"
      at "Toumba Stadium" 40.6135 22.9779 OpenAir "Europe/Athens"
      at "TPC Deere Run" 41.4771 -90.3921 OpenAir "America/Chicago"
      at "TPC Southwind" 35.0549 -89.7831 OpenAir "America/Chicago"
      at "Truist Park" 33.8909 -84.4678 OpenAir "America/New_York"
      at "Tynecastle Park" 55.9390 -3.2323 OpenAir "Europe/London"
      at "U-Power Stadium" 45.5830 9.3080 OpenAir "Europe/Rome"
      at "U.S. Bank Stadium" 44.9739 -93.2581 Dome "America/Chicago"
      at "UFCU Stadium" 29.8911 -97.9256 OpenAir "America/Chicago"
      at "Unipol Domus" 39.1994 9.1374 OpenAir "Europe/Rome"
      at "University Stadium (NM)" 35.0669 -106.6283 OpenAir "America/Denver"
      at "Vale Park" 53.0499 -2.1926 OpenAir "Europe/London"
      at "Valley Children's Stadium" 36.8144 -119.7580 OpenAir "America/Los_Angeles"
      at "Valley Parade" 53.8043 -1.7592 OpenAir "Europe/London"
      at "Vasil Levski National Stadium" 42.6876 23.3353 OpenAir "Europe/Sofia"
      at "Vaught-Hemingway Stadium" 34.3620 -89.5342 OpenAir "America/Chicago"
      at "Vazgen Sargsyan Republican Stadium" 40.1720 44.5256 OpenAir "Asia/Yerevan"
      at "Veltins Arena" 51.5546 7.0676 Retractable "Europe/Berlin"
      at "Veritas Stadion" 60.4427 22.2918 OpenAir "Europe/Helsinki"
      at "Veterans Memorial Stadium (AL)" 31.7996 -85.9520 OpenAir "America/Chicago"
      at "Vicarage Road" 51.6498 -0.4015 OpenAir "Europe/London"
      at "Viking Stadion" 58.9146 5.7308 OpenAir "Europe/Oslo"
      at "Vikingsvöllur" 64.1171 -21.8526 OpenAir "Atlantic/Reykjavik"
      at "Vitality Stadium" 50.7352 -1.8383 OpenAir "Europe/London"
      at "Volksparkstadion" 53.5871 9.8987 OpenAir "Europe/Berlin"
      at "Waldo Stadium" 42.2858 -85.6011 OpenAir "America/Detroit"
      at "Walens Family Field at Fifth Third Stadium" 34.0289 -84.5677 OpenAir "America/New_York"
      at "Wallace Wade Stadium" 35.9954 -78.9418 OpenAir "America/New_York"
      at "War Memorial Stadium" 41.3116 -105.5682 OpenAir "America/Denver"
      at "Warren McGuirk Alumni Stadium" 42.3773 -72.5360 OpenAir "America/New_York"
      at "Wembley Stadium" 51.5559 -0.2796 Retractable "Europe/London"
      at "Weserstadion" 53.0664 8.8376 OpenAir "Europe/Berlin"
      at "Williams Stadium (VA)" 37.3542 -79.1749 OpenAir "America/New_York"
      at "Williams-Brice Stadium" 33.9731 -81.0192 OpenAir "America/New_York"
      at "Willoughby Community Park" 49.1447 -122.6651 OpenAir "America/Vancouver"
      at "WWK Arena" 48.3232 10.8859 OpenAir "Europe/Berlin"
      at "Yulman Stadium" 29.9447 -90.1163 OpenAir "America/Chicago"
      at "Zoeller Field at Dix Stadium" 41.1391 -81.3134 OpenAir "America/New_York"
      // --- END sourced
    ]
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

/// Every name the table holds for the place `name` is at: the aliases that one
/// fetch serves. `distinctLocations` keeps ONE name per place, so the reading
/// comes back labelled with that name alone; a card that says the other name is
/// still that place's card.
///
/// Found 2026-10-24 (verify 40116546191, 73 known venues, 71 chips): the slate
/// had both "DICK'S Sporting Goods Park" and "Dick's Sporting Goods Park", and
/// both "Red Bull Arena" and "Sports Illustrated Stadium" (then one place in this
/// table by mistake: Red Bull Arena is Leipzig's, see its row). The page filled
/// the first name's cards and left the others empty. The table had 3 alias
/// groups until the 301 sourced rows made it 10, which is what made a slate with
/// both spellings likely.
let namesAt (name: string) : string list =
    match tryFind name with
    | None -> [ name ]
    | Some v ->
        let key = coordKey v.Where
        entries |> List.filter (fun e -> coordKey e.Where = key) |> List.map (fun e -> e.Name)

/// Does a reading taken for `readingVenue` belong on a card that says `cardVenue`?
/// A plain comparison of names, so a name carrying a double quote
/// (Johnny "Red" Floyd Stadium) is just a string and not a CSS selector.
let servesCard (readingVenue: string) (cardVenue: string) : bool =
    List.contains cardVenue (namesAt readingVenue)

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
          "crypto.com Arena"
          // WNBA, added 2026-10-22 (docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md):
          // the exact venue strings field-archive holds for WNBA games since
          // 2026-07-01 that were in neither list. A WNBA game is played indoors.
          "CareFirst Arena"
          "Coca-Cola Coliseum"
          "College Park Center"
          "Galen Center"
          "Gateway Center"
          "Michelob ULTRA Arena"
          "Mohegan Sun Arena"
          "PeoplesBank Arena"
          "Wintrust Arena" ]

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
