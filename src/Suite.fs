module Suite

open System
open Desk

// The first suite written on the F# harness, ported from the JavaScript checks
// that already existed.
//
// These are not new assertions. Each one is a claim `scripts/` already makes,
// restated in a form where the counterexample is compulsory — and in most cases
// the counterexample is the bug this repo actually shipped, which is the point.
// A check whose MustFail input is "the answer we used to give" cannot go green
// on a build that has regressed to it.
//
// Nothing here reads a clock, a file, or the network. Instants are literals.

let private at (iso: string) = DateTimeOffset.Parse(iso, Globalization.CultureInfo.InvariantCulture)

// ---------------------------------------------------------------------------
// The FIELD zone. `zone-check.mjs` was 16/16 green while a build with a fixed
// UTC-4 offset also passed 11/11 — the check agreed with two different
// implementations, one of them wrong. Here the wrong answer has to be written
// down, so a build that returns it fails by construction.
// ---------------------------------------------------------------------------

let private zone =
    [ // 00:30 UTC on the 10th is 20:30 ET on the 9th. This is the window the
      // laboratory was broken in every night of US prime time: the page asked
      // for tomorrow's slate and `datePassed` went true for tonight's fixtures,
      // so live games rendered as Final.
      Verify.check "an instant in US prime time is the ET day, not the UTC day"
          (fun (instant, expected) -> fieldDayIso (fieldDayAt (at instant)) = expected)
          ("2026-08-10T00:30:00Z", "2026-08-09")
          ("2026-08-10T00:30:00Z", "2026-08-10")

      // The other side of DST. A fixed -4 passes the summer cases and fails
      // here, which is exactly what 11/11 could not tell anyone.
      Verify.check "the offset is not a constant — January is UTC-5"
          (fun (instant, expected) -> fieldDayIso (fieldDayAt (at instant)) = expected)
          ("2026-01-10T04:30:00Z", "2026-01-09")
          ("2026-01-10T04:30:00Z", "2026-01-10")

      Verify.check "midday UTC is the same calendar day in ET"
          (fun (instant, expected) -> fieldDayIso (fieldDayAt (at instant)) = expected)
          ("2026-08-10T12:00:00Z", "2026-08-10")
          ("2026-08-10T12:00:00Z", "2026-08-09") ]

// ---------------------------------------------------------------------------
// Home/away convention. `Sport` was a `string`, so every fixture rendered
// `Away @ Home` — a Sydney home game against Collingwood read as
// "Collingwood @ Sydney". Both captures went through it and every check stayed
// green, because no check named the AFL answer.
// ---------------------------------------------------------------------------

let private matchup =
    [ Verify.check "AFL reads home first — the American convention is the bug"
          (fun (sport, expected) -> matchupText sport "Sydney" "Collingwood" = expected)
          (Sport.AFL, "Sydney v Collingwood")
          (Sport.AFL, "Collingwood @ Sydney")

      Verify.check "MLB really does read away-at-home"
          (fun (sport, expected) -> matchupText sport "Diamondbacks" "Rockies" = expected)
          (Sport.MLB, "Rockies @ Diamondbacks")
          (Sport.MLB, "Diamondbacks v Rockies")

      // An unmodelled sport must not be rendered under a guessed convention.
      Verify.check "an unrecognised sport refuses to pick a convention"
          (fun (sport, expected) -> matchupText sport "Home" "Away" = expected)
          (Sport.Unrecognised "kabaddi", "Home vs Away")
          (Sport.Unrecognised "kabaddi", "Away @ Home")

      // The transposition that arrived WITH the fix: names in one order and
      // numbers in the other, internally consistent before and after.
      Verify.check "the score orders through the same function as the names"
          (fun (sport, expected) -> orderByMatchup sport 75 81 = expected)
          (Sport.AFL, (75, 81))
          (Sport.AFL, (81, 75)) ]

// ---------------------------------------------------------------------------
// Grading. A draw is neither correct nor wrong, and an unfinished game is not
// gradeable at all.
// ---------------------------------------------------------------------------

let private grading =
    [ Verify.check "a drawn game yields no verdict"
          (fun state -> Pickem.decide state Pickem.Home = None)
          (Final(2, 2, false))
          (Final(3, 2, false))

      Verify.check "a game in progress is not graded"
          (fun state -> Pickem.decide state Pickem.Home = None)
          (InProgress(3, 2))
          (Final(3, 2, false))

      Verify.check "a won game grades correct for the side that won"
          (fun (state, side) ->
              Pickem.decide state side
              |> Option.map Pickem.verdictIsCorrect = Some true)
          (Final(3, 2, false), Pickem.Home)
          (Final(3, 2, false), Pickem.Away) ]

// ---------------------------------------------------------------------------
// Units. `implied` is not `prob`: -142/+132 implies 0.587 and 0.431, which sum
// to 1.018, and the 1.8% is the book's margin.
// ---------------------------------------------------------------------------

let private units =
    [ Verify.check "a devigged pair sums to exactly 1"
          (fun (home, away) ->
              match Units.devig home away with
              | Some(h, a) -> abs (float h + float a - 1.0) < 1e-12
              | None -> false)
          (0.5305<Units.implied>, 0.5169<Units.implied>)
          (0.0<Units.implied>, 0.0<Units.implied>)

      Verify.check "devig keeps the favourite favoured"
          (fun (home, away) ->
              match Units.devig home away with
              | Some(h, a) -> h > a
              | None -> false)
          (0.5305<Units.implied>, 0.5169<Units.implied>)
          (0.5169<Units.implied>, 0.5305<Units.implied>)

      // Written first as "toPct and toProb are inverses", with the counterexample
      // left to be found later. There isn't one: the round trip holds for every
      // finite float, so the predicate is true of anything and the check is
      // vacuous. The harness would have returned NO TEETH, which is the harness
      // doing its job on its own first suite.
      //
      // The claim with content is the SCALE — a missing or extra factor of ten
      // is the mistake `formatWinProbability` exists to prevent, and it is a
      // counterexample that can actually be written down.
      Verify.check "toPct scales by exactly 100, and toProb comes back"
          (fun (p, expected) ->
              abs (float (Units.toPct p) - float expected) < 1e-9
              && abs (float (Units.toProb (Units.toPct p)) - float p) < 1e-12)
          (0.53<Units.prob>, 53.0<Units.pct>)
          (0.53<Units.prob>, 5.3<Units.pct>) ]

// ---------------------------------------------------------------------------
// Game state at fixed instants. `gameState` used to read the wall clock twice.
// ---------------------------------------------------------------------------

let private state =
    let game (start: DateTimeOffset option) (finalized: string option) home away =
        { Id = "g1"
          Sport = Sport.MLB
          League = "MLB"
          Day = Some(fieldDayAt (at "2026-08-09T18:00:00Z"))
          Home = "Diamondbacks"
          Away = "Rockies"
          HomeScore = home
          AwayScore = away
          Venue = None
          Streams = None
          Note = None
          LocalNote = None
          Crew = None
          Tags = NotPresent
          StartTime = start
          RawStartTime = None
          DramaPeak = None
          DramaArc = NotPresent
          OpeningOdds = NotPresent
          ClosingOdds = NotPresent
          Overtime = RegulationOnly
          EspnEventId = None
          FinalizedAt = finalized }

    let kickoff = Some(at "2026-08-09T23:05:00Z")

    [ // A score of 0-0 exists before kickoff. Status comes from the clock, not
      // from a score being present.
      Verify.check "a game before kickoff is Scheduled, whatever scores exist"
          (fun (now, g) -> gameStateAt (at now) g = Scheduled)
          ("2026-08-09T22:00:00Z", game kickoff None (Some 0) (Some 0))
          ("2026-08-10T02:00:00Z", game kickoff None (Some 0) (Some 0))

      // I wrote this the other way round first — asserting that a game with no
      // start time is Scheduled — and the harness failed it on the first run.
      // `notYetStartedAt` is documented as returning false for an absent start
      // time: "an unknown start time is not evidence that a game has not begun."
      // Reading a missing field as "hasn't started" is the guess that rule
      // exists to refuse, so the check now states the rule rather than my
      // assumption about it.
      Verify.check "an absent start time is not read as 'has not started'"
          (fun (now, g) -> gameStateAt (at now) g = InProgress(4, 2))
          ("2026-08-10T02:00:00Z", game None None (Some 4) (Some 2))
          ("2026-08-09T22:00:00Z", game kickoff None (Some 4) (Some 2))

      // The bug that was live in US prime time: a started game with no
      // finalized_at is In Progress, and must not read as Final.
      Verify.check "a started game without finalized_at is In Progress, not Final"
          (fun (now, g) -> gameStateAt (at now) g = InProgress(4, 2))
          ("2026-08-10T00:30:00Z", game kickoff None (Some 4) (Some 2))
          ("2026-08-10T00:30:00Z", game kickoff (Some "2026-08-10T00:20:00Z") (Some 4) (Some 2)) ]

// ---------------------------------------------------------------------------
// Weather. Each counterexample below is a failure written down in FIELD's own
// documents or in playground's source comments — not one I invented.
// ---------------------------------------------------------------------------

let private weather =
    let reading temp wind total rain =
        { Weather.Temperature = temp * 1.0<Weather.degF>
          Weather.FeelsLike = None
          Weather.Wind = wind * 1.0<Weather.mph>
          Weather.Gusts = None
          Weather.WindFrom = None
          Weather.Precip =
            match Weather.precipitation (total * 1.0<Weather.mm>) (rain * 1.0<Weather.mm>) with
            | Some p -> p
            | None -> failwith "fixture is not a possible reading" }

    let venue name roof temp =
        { Weather.Venue = name
          Weather.Where =
            match Weather.coordinates 40.0 -80.0 with
            | Some c -> c
            | None -> failwith "fixture coordinates"
          Weather.Roof = roof
          Weather.Reading = reading temp 5.0 0.0 0.0 }

    [ // Playground's own comment: "describeConditions checks snow before rain:
      // precipitation includes snow, so snow (rain === 0, precipitation > 0)
      // would otherwise be labelled rain". The must-fail is that label.
      Verify.check "precipitation with no rain is not called rain"
          (fun (total, rain) ->
              match Weather.precipitation (total * 1.0<Weather.mm>) (rain * 1.0<Weather.mm>) with
              | Some p -> (match Weather.falling p with Weather.FrozenOrMixed _ -> true | _ -> false)
              | None -> false)
          (2.0, 0.0)
          (2.0, 2.0)

      // ...and the other direction, which the check above alone does not cover:
      // a harness that called everything frozen would satisfy it.
      Verify.check "rain really is called rain"
          (fun (total, rain) ->
              match Weather.precipitation (total * 1.0<Weather.mm>) (rain * 1.0<Weather.mm>) with
              | Some p -> (match Weather.falling p with Weather.Raining _ -> true | _ -> false)
              | None -> false)
          (2.0, 2.0)
          (2.0, 0.0)

      // Rain cannot exceed total precipitation. Every time this repo has seen
      // that shape it has been a units mix-up.
      Verify.check "a reading where rain exceeds precipitation is refused"
          (fun (total, rain) ->
              (Weather.precipitation (total * 1.0<Weather.mm>) (rain * 1.0<Weather.mm>)).IsNone)
          (1.0, 5.0)
          (5.0, 1.0)

      // Production files loanDepot park as `isOutdoor: true`. It is retractable.
      // A boolean has no third state, so the error had nowhere to be visible.
      Verify.check "loanDepot park is retractable, not open air"
          (fun (name, expected) ->
              match Venues.tryFind name with
              | Some v -> v.Roof = expected
              | None -> false)
          ("loanDepot park", Weather.Retractable)
          ("loanDepot park", Weather.OpenAir)

      // Nothing knows whether a retractable roof was closed. Playground says so
      // in a title attribute; here there is no constructor that turns it into an
      // open-air claim.
      Verify.check "a retractable roof's state is unknown, never assumed open"
          (fun (roof, expected) -> Weather.roofState roof = expected)
          (Weather.Retractable, Weather.UnknownRoofState)
          (Weather.Retractable, Weather.PlayedInTheOpen)

      // Aliases are one place and must be one request. 98 venue keys, 95
      // locations.
      Verify.check "two names for one stadium collapse to a single fetch"
          (fun (a, b) ->
              match Venues.tryFind a, Venues.tryFind b with
              | Some x, Some y -> Weather.coordKey x.Where = Weather.coordKey y.Where
              | _ -> false)
          ("Minute Maid Park", "Daikin Park")
          ("Minute Maid Park", "Wrigley Field")

      Verify.check "distinct locations dedupe aliases but keep real venues"
          (fun names ->
              let found, _ = Venues.weatherEligible names
              List.length (Venues.distinctLocations found) = 2)
          [ "Minute Maid Park"; "Daikin Park"; "Wrigley Field" ]
          [ "Minute Maid Park"; "Wrigley Field"; "Fenway Park" ]

      // The empty state that means four things. Playground throws to avoid it;
      // a throw is swallowable and production's six undefined functions are what
      // swallowing looks like.
      Verify.check "an outage is EveryFetchFailed, not an empty slate"
          (fun (eligible, readings) ->
              Weather.slateWeather eligible readings [] = Weather.EveryFetchFailed eligible)
          ([ "Fenway Park" ], [])
          ([], [])

      Verify.check "a slate with no locatable venue says so separately"
          (fun (eligible, readings) -> Weather.slateWeather eligible readings [] = Weather.NoVenuesWithCoordinates)
          ([], [])
          ([ "Fenway Park" ], [])

      // The verdict line ranks open venues only, because a covered venue's
      // location weather is not necessarily what the game experiences.
      Verify.check "the warmest venue is never a covered one"
          (fun venues ->
              match Weather.extremes venues with
              | Some(warmest, _) -> Weather.roofState warmest.Roof = Weather.PlayedInTheOpen
              | None -> false)
          [ venue "Tropicana Field" Weather.Dome 99.0; venue "Fenway Park" Weather.OpenAir 70.0 ]
          [ venue "Tropicana Field" Weather.Dome 99.0 ]

      // Wraparound at 360 is where a chain of range comparisons loses a case.
      Verify.check "the compass wraps rather than falling off the end"
          (fun (degrees, expected) -> Weather.compass degrees = expected)
          (350, "N")
          (350, "NW")

      // The cache takes an instant rather than reading one, so this is an
      // assertion about the TTL and not about when the suite ran.
      Verify.check "a reading older than the TTL is not served"
          (fun (storedAt, askedAt) ->
              let key =
                  Weather.coordKey (match Weather.coordinates 40.0 -80.0 with
                                    | Some c -> c
                                    | None -> failwith "fixture")
              let c = Weather.put key storedAt (reading 70.0 5.0 0.0 0.0) Weather.emptyCache
              (Weather.tryGet key askedAt c).IsNone)
          (0.0, Weather.CACHE_TTL_MS + 1.0)
          (0.0, Weather.CACHE_TTL_MS - 1.0)

      // The card chip. Short by design — the card already carries six lines —
      // and the roof caveat must NOT be in it, because a caveat trimmed to fit
      // is the display walking past the honest limit.
      Verify.check "a dry card chip is temperature only"
          (fun (roof, expected) ->
              Weather.cardChip { Weather.Venue = "Fenway Park"
                                 Weather.Where = (match Weather.coordinates 42.3467 -71.0972 with
                                                  | Some c -> c
                                                  | None -> failwith "fixture")
                                 Weather.Roof = roof
                                 Weather.Reading = reading 72.0 5.0 0.0 0.0 } = expected)
          (Weather.OpenAir, "72°F")
          (Weather.OpenAir, "72°F · rain")

      Verify.check "a snowy chip says snow, not rain"
          (fun (total, rain) ->
              let vw = { Weather.Venue = "Wrigley Field"
                         Weather.Where = (match Weather.coordinates 41.9484 -87.6553 with
                                          | Some c -> c
                                          | None -> failwith "fixture")
                         Weather.Roof = Weather.OpenAir
                         Weather.Reading = reading 28.0 12.0 total rain }
              (Weather.cardChip vw).Contains "snow")
          (2.0, 0.0)
          (2.0, 2.0)

      // The caveat rides with the chip and is never dropped.
      Verify.check "a retractable venue's chip title says the roof is unknown"
          (fun roof ->
              let vw = { Weather.Venue = "Rogers Centre"
                         Weather.Where = (match Weather.coordinates 43.6414 -79.3894 with
                                          | Some c -> c
                                          | None -> failwith "fixture")
                         Weather.Roof = roof
                         Weather.Reading = reading 70.0 5.0 0.0 0.0 }
              (Weather.cardChipTitle vw).Contains "not known whether it was closed")
          Weather.Retractable
          Weather.OpenAir

      Verify.check "the venue table parses every entry"
          (fun expected -> fst (Venues.venueTableIsSound ()) = expected)
          Venues.count
          (Venues.count - 1)

      // --- the decoder and the URL ---------------------------------------
      //
      // TRANSCRIBED, not captured: this sandbox's egress blocks
      // api.open-meteo.com — the same reason playground verified CORS from a
      // GitHub Actions runner rather than from here. The field names and units
      // come from FIELD's May 9 2026 integration log, which records the exact
      // request FIELD makes. Meeting the real service is a runner's job and is
      // not claimed here.
      Verify.check "a real-shaped current block decodes"
          (fun json ->
              match Weather.decodeReading json with
              | Ok r -> abs (float r.Temperature - 72.4) < 0.001 && r.WindFrom = Some 210
              | Error _ -> false)
          """{"current":{"time":"2026-08-11T17:00","temperature_2m":72.4,"apparent_temperature":74.1,"precipitation":0.0,"rain":0.0,"wind_speed_10m":8.1,"wind_direction_10m":210,"wind_gusts_10m":14.3}}"""
          """{"current":{"time":"2026-08-11T17:00","apparent_temperature":74.1}}"""

      // A payload where rain exceeds total precipitation is a decode FAILURE,
      // not a reading that renders confidently and wrongly. The must-fail is the
      // same payload made valid, so this cannot pass by rejecting everything.
      Verify.check "an impossible reading is refused by the decoder"
          (fun json -> (Weather.decodeReading json) |> Result.isError)
          """{"current":{"temperature_2m":40.0,"precipitation":0.5,"rain":9.9,"wind_speed_10m":4.0}}"""
          """{"current":{"temperature_2m":40.0,"precipitation":9.9,"rain":0.5,"wind_speed_10m":4.0}}"""

      // The URL carries the unit parameters that the measures downstream assume.
      // Changing `fahrenheit` here without changing `degF` is the drift this
      // check exists to make loud — the must-fail is the metric request, which
      // returns numbers that are still numbers and mean something else.
      Verify.check "the request asks for the units the types assume"
          (fun (c, wanted: string) -> (Weather.forecastUrl c).Contains(wanted))
          ((match Weather.coordinates 42.3467 -71.0972 with
            | Some c -> c
            | None -> failwith "fixture"), "temperature_unit=fahrenheit")
          ((match Weather.coordinates 42.3467 -71.0972 with
            | Some c -> c
            | None -> failwith "fixture"), "temperature_unit=celsius") ]

// ---------------------------------------------------------------------------
// The Stats tab. Counterexamples are production's live bugs, quoted in
// docs/STATS-PROOF.md and visible in the screenshot that prompted this build.
// ---------------------------------------------------------------------------

let private stats =
    [ // THE headline bug. "Tied — anyone's game" on all seven pre-game cards,
      // beneath the records, reading as a verdict on them: a 47-73 team called
      // even with a 73-46 team.
      Verify.check "a scheduled game has no margin at all — not a margin of zero"
          (fun state -> (Stats.liveMargin state).IsNone)
          Scheduled
          (InProgress(0, 0))

      // A finished game is refused too. Production's guard excluded `post` and
      // forgot `pre`; a list of states to exclude is maintained by hand.
      Verify.check "a finished game is refused as well, not just a scheduled one"
          (fun state -> (Stats.liveMargin state).IsNone)
          (Final(4, 2, false))
          (InProgress(4, 2))

      // ...and the affirmative direction, or "always None" would satisfy both.
      Verify.check "a game in progress DOES yield a margin"
          (fun state -> (Stats.liveMargin state).IsSome)
          (InProgress(4, 2))
          Scheduled

      // The sentence itself is true exactly when it is reachable.
      Verify.check "a real 0-0 in progress is genuinely tied"
          (fun state ->
              match Stats.liveMargin state with
              | Some m -> Stats.comebackText m = "Tied — anyone's game"
              | None -> false)
          (InProgress(0, 0))
          (InProgress(4, 2))

      // The second bug, visible in the screenshot without reading any source:
      // header "Orioles @ Twins", and anything listing both sides beneath it
      // must lead with the same team.
      Verify.check "the sides lead with the same team as the header"
          (fun (sport, expectedFirst: string) ->
              let r = { Stats.Sport = sport; Stats.Home = "Twins"; Stats.Away = "Orioles"; Stats.Rows = [] }
              fst (Stats.sidesInHeaderOrder r) = expectedFirst
              && (Stats.headerText r).StartsWith expectedFirst)
          (Sport.MLB, "Orioles")
          (Sport.MLB, "Twins")

      // AFL reads home first, so the same function must flip. Without this a
      // hardcoded "away first" would satisfy the check above.
      Verify.check "...and flips for a sport that reads home first"
          (fun (sport, expectedFirst: string) ->
              let r = { Stats.Sport = sport; Stats.Home = "Sydney"; Stats.Away = "Collingwood"; Stats.Rows = [] }
              fst (Stats.sidesInHeaderOrder r) = expectedFirst)
          (Sport.AFL, "Sydney")
          (Sport.AFL, "Collingwood")

      // Every row carries a label and a value. There is no unresolved case to
      // render, which is the point of the rewrite.
      Verify.check "a venue row names the venue and its cover"
          (fun (roof, expected: string) ->
              (Stats.rowValue (Stats.VenueRow("Rogers Centre", roof))).EndsWith expected)
          (Weather.Retractable, "retractable roof")
          (Weather.Retractable, "open air")

      // Written first as "every row kind has a non-empty label", which the
      // harness returned NO TEETH for — correctly. `rowLabel` is derived from
      // the case, so it can never be empty and the property is true of
      // anything. The claim with content is that the five kinds are told apart:
      // two rows sharing a label is a card where the reader cannot tell which
      // is which.
      Verify.check "each row kind carries its own distinct label"
          (fun (rows, expected) ->
              (rows |> List.map Stats.rowLabel |> List.distinct |> List.length) = expected)
          ([ Stats.VenueRow("Fenway Park", Weather.OpenAir); Stats.MarketRow "x"
             Stats.DramaRow "y"; Stats.BroadcastRow "z"; Stats.OvertimeRow "w" ], 5)
          ([ Stats.VenueRow("Fenway Park", Weather.OpenAir); Stats.MarketRow "x"
             Stats.DramaRow "y"; Stats.BroadcastRow "z"; Stats.OvertimeRow "w" ], 4)

      // --- production's tables, carried ------------------------------------
      //
      // Each of these names a value cross-checked against a live production
      // render before it was imported, so a failure here means the import
      // drifted from what the page shows — not that a threshold was retuned.

      // The zero case is real and is the one a naive format gets wrong.
      // loanDepot park is exactly league average for runs, and production
      // renders "0% runs"; `sprintf "%+d"` would render "+0%".
      //
      // EXACT, not `Contains`. The first version asked whether the row
      // contained "0% runs" and the mutation that renders "+0% runs" SURVIVED
      // it — because "+0% runs" contains "0% runs". That is the same substring
      // trap production's own CC-CMD names in its `teamNick()` matching, and I
      // walked into it in the check written to catch it.
      Verify.check "a park exactly at league average reads 0%, not +0%"
          (fun (venue: string, expected: string) ->
              match Scouting.tryParkByVenue venue with
              | Some f -> Stats.rowValue (Stats.ParkRow f) = expected
              | None -> false)
          ("loanDepot park", "loanDepot park · 0% runs · -2% HR")
          ("loanDepot park", "loanDepot park · +0% runs · -2% HR")

      // ADR-002 PROHIBITED #3. The composite index is 128 for Coors; the
      // reader is shown +28%. `Runs` is private, so the prohibited render is
      // not merely avoided here — outside Scouting.fs it is FS1093.
      Verify.check "the park row shows the deviation, never the raw index"
          (fun (venue: string, raw: string) ->
              match Scouting.tryParkByVenue venue with
              | Some f ->
                  let text = Stats.rowValue (Stats.ParkRow f)
                  text.Contains "+28% runs" && not (text.Contains raw)
              | None -> false)
          ("Coors Field", "128")
          ("Coors Field", "+28")

      // The badge is a function of the tier, so the two cannot disagree.
      // Production keeps `badgeClass` as its own field beside `tier`.
      Verify.check "the park badge follows the tier it is derived from"
          (fun (venue: string) ->
              match Scouting.tryParkByVenue venue with
              | Some f -> Scouting.parkBadge f = Some "Pitcher's Park"
              | None -> false)
          "Petco Park"
          "Yankee Stadium"

      // Rule 1, as a type. A venue with no published factor yields no row —
      // not a neutral one.
      Verify.check "a venue with no published factor yields no park row at all"
          (fun (venue: string) -> (Scouting.tryParkByVenue venue).IsNone)
          "Sahlen Field"
          "Fenway Park"

      // `tryParkByVenue` is only unambiguous while the labels are unique, and
      // nothing else would notice two parks sharing one.
      Verify.check "no two parks share a venue label"
          (fun (parks: Scouting.ParkFactor list) ->
              (parks |> List.map Scouting.venueOf |> List.distinct |> List.length) = parks.Length)
          Scouting.parkFactors
          (List.head Scouting.parkFactors :: Scouting.parkFactors)

      // The rate is COMPUTED from the counts. Production stores it as a third
      // field beside them, where it can drift; verified across all 51 imported
      // umpires that it never had.
      Verify.check "an umpire's overturn rate comes from their own counts"
          (fun (lastName: string) ->
              match Scouting.tryUmpire lastName with
              | Some r -> (Stats.rowValue (Stats.UmpireRow("Jimenez", Some r))).Contains "50% overturns"
              | None -> false)
          "jimenez"
          "parra"

      // --- the venue vocabularies disagree, and that used to lose rows -----
      //
      // This is the check whose absence set a confidence docking. The park
      // lookup was verified on TWO venues out of thirty — both from the one
      // capture in this repo — while a confirmed counterexample sat in a
      // production fixture already read: statsapi calls Camden Yards "Oriole
      // Park at Camden Yards", and an exact match against the park table's
      // label would have silently dropped Baltimore's PARK row.
      Verify.check "the statsapi name for a park resolves to that park"
          (fun (venue: string) ->
              match Scouting.tryParkByVenue venue with
              | Some f -> Scouting.venueOf f = "Camden Yards"
              | None -> false)
          "Oriole Park at Camden Yards"
          "Oriole Park at Wrigley Field"

      // Production's venue map still carries the pre-rename name, which is
      // exactly why the pre-rename name has to resolve.
      Verify.check "a renamed park resolves under its former name"
          (fun (venue: string) ->
              match Scouting.tryParkByVenue venue with
              | Some f -> Scouting.venueOf f = "Rate Field"
              | None -> false)
          "Guaranteed Rate Field"
          "Rate Stadium"

      // One character apart, and no rule short of an explicit statement should
      // be trusted to bridge it.
      Verify.check "a park whose map entry is pluralised still resolves"
          (fun (venue: string) ->
              (Scouting.tryParkByVenue venue).IsSome)
          "Angels Stadium"
          "Angel Field"

      // The city-suffixed form, which is most of the imported variants.
      Verify.check "the city-suffixed form of a venue resolves to the same park"
          (fun (a: string, b: string) ->
              Scouting.tryParkByVenue a = Scouting.tryParkByVenue b)
          ("Oracle Park", "Oracle Park, San Francisco")
          ("Oracle Park", "Petco Park, San Diego")

      // EXACT, never a prefix or a contains. The whole alias table exists so
      // that resolution never has to be similar to anything — a name that
      // merely contains a known one must NOT resolve, or the table has bought
      // nothing over the substring matching it replaced.
      Verify.check "a name that merely contains a known venue does not resolve"
          (fun (venue: string) -> (Scouting.tryParkByVenue venue).IsNone)
          "Old Yankee Stadium Site"
          "Yankee Stadium"

      // Written first as "no venue name resolves to two different parks", which
      // the harness returned NO TEETH for — correctly, and it is the better
      // catch of the two. `tryParkByVenue` returns an OPTION, so resolving to
      // two parks is not merely false, it is unrepresentable. The claim was
      // guaranteed by the return type and therefore said nothing, and the
      // empty-list counterexample passed vacuously through `List.forall` on top
      // of that. Six of these now, all found by the harness rather than by me.
      //
      // The claim with content is that each alias lands on the park it names —
      // an alias pointing at the WRONG park is the failure that would put one
      // stadium's run factor on another stadium's game.
      Verify.check "every alias lands on the park it names"
          (fun (pairs: (string * string) list) ->
              pairs
              |> List.forall (fun (alias, expected) ->
                  match Scouting.tryParkByVenue alias with
                  | Some f -> Scouting.venueOf f = expected
                  | None -> false))
          [ "Oriole Park at Camden Yards", "Camden Yards"
            "Oriole Park, Baltimore", "Camden Yards"
            "Guaranteed Rate Field", "Rate Field"
            "Angels Stadium", "Angel Stadium"
            "Oracle Park, San Francisco", "Oracle Park"
            "Progressive Field, Cleveland", "Progressive Field" ]
          [ "Oriole Park at Camden Yards", "Camden Yards"
            "Guaranteed Rate Field", "Wrigley Field" ]

      // A bare name is production's real output for an unrated umpire, and a
      // complete answer rather than a missing one.
      Verify.check "an unrated umpire renders as a bare name"
          (fun (rating: Scouting.UmpireRating option) ->
              Stats.rowValue (Stats.UmpireRow("Márquez", rating)) = "Márquez")
          None
          (Scouting.tryUmpire "jimenez") ]

/// Everything, in one list. Order is presentation only.
let all : Verify.Sealed list = zone @ matchup @ grading @ units @ state @ weather @ stats
