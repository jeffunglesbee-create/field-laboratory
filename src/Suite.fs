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

let private zone () =
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

let private matchup () =
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
          (fun (sport, expected) -> presentByMatchup sport 75 81 = expected)
          (Sport.AFL, Contest(75, 81))
          (Sport.AFL, Contest(81, 75))

      // The sentence this case exists to stop the desk from saying.
      Verify.check "golf renders an event, never a contest"
          (fun (sport, expected) -> matchupText sport "BMW Championship" "R4" = expected)
          (Sport.Golf, "BMW Championship · R4")
          (Sport.Golf, "BMW Championship v R4")

      // A non-contest yields no pair AT ALL, which is the whole point of
      // returning a decision rather than two values.
      Verify.check "a non-contest yields no pair to order"
          (fun (sport, expected) -> presentByMatchup sport "BMW Championship" "R4" = expected)
          (Sport.Golf, Event LeaderboardSnapshot)
          (Sport.Golf, Contest("BMW Championship", "R4"))

      // The event score line, over every input it can be handed. Enumerated
      // rather than sampled: the fallback branches are the ones no live row
      // has exercised, so nothing else would notice them going wrong.
      Verify.check "the leader is named when the row names them"
          (fun (input, expected) -> (fun (n, f) -> eventScoreText n f) input = expected)
          ((Some "Wyndham Clark -17", Some -17), "Wyndham Clark -17")
          ((Some "Wyndham Clark -17", Some -17), "-17")

      Verify.check "the bare figure stands in when no note names a leader"
          (fun (input, expected) -> (fun (n, f) -> eventScoreText n f) input = expected)
          ((None, Some -17), "-17")
          ((None, Some -17), "—")

      Verify.check "an event with neither is a dash, not a fabricated zero"
          (fun (input, expected) -> (fun (n, f) -> eventScoreText n f) input = expected)
          ((None, None), "—")
          ((None, None), "0")

      // The two disagreeing is the case that decides which column is the
      // source of truth, and it is asserted rather than left to whoever reads
      // the match order.
      Verify.check "the note wins when the note and the figure disagree"
          (fun (input, expected) -> (fun (n, f) -> eventScoreText n f) input = expected)
          ((Some "Wyndham Clark -17", Some -6), "Wyndham Clark -17")
          ((Some "Wyndham Clark -17", Some -6), "-6")

      // A finished round rendered "Scheduled — no start time" on the live desk
      // until 2026-08-25: an event never reaches Final through the contest
      // state machine, which needs both scores.
      Verify.check "a completed event is Final, not scheduled"
          (fun (input, expected) -> eventStatusText input = expected)
          (Some "2026-08-24 12:39:06", "Final")
          (Some "2026-08-24 12:39:06", "Scheduled — no start time")

      // Absent completion is absent knowledge, not "scheduled". The row may be
      // mid-round or may not have started, and nothing here can tell.
      Verify.check "an event with no completion recorded does not claim to be scheduled"
          (fun (input, expected) -> eventStatusText input = expected)
          (None, "No completion recorded")
          (None, "Scheduled") ]

// ---------------------------------------------------------------------------
// Grading. A draw is neither correct nor wrong, and an unfinished game is not
// gradeable at all.
// ---------------------------------------------------------------------------

let private grading () =
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

let private units () =
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

let private state () =
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

let private weather () =
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

      // --- binary frame ingest ------------------------------------------------
      //
      // This block is the ONLY consumer of PlayFrame, and `unused-check` is what
      // enforces that it stays one. Every round trip is against bytes written
      // here through `PlayFrame.Wire`, so no assertion can be satisfied by the
      // reader agreeing with itself.
      //
      // Every counterexample below fails for a reason specific to its property.
      // A shared "obviously wrong" input would make the whole block one
      // assertion written eight times.

      // Truncation is what MemoryMarshal.Cast does SILENTLY: 25 bytes casts to
      // one record and the trailing byte vanishes. 24 is the counterexample
      // because it is the nearest input that really is whole.
      Verify.check "bytes that are not a whole number of records are refused"
          (fun n ->
              match PlayFrame.frame (PlayFrame.Wire.allocateBytes n) with
              | PlayFrame.PartialRecord(len, rem) -> len = n && rem = n % PlayFrame.RecordBytes
              | _ -> false)
          25 24

      Verify.check "an empty payload is NoRecords, not a truncation"
          (fun n ->
              match PlayFrame.frame (PlayFrame.Wire.allocateBytes n) with
              | PlayFrame.NoRecords -> true
              | _ -> false)
          0 24

      Verify.check "a whole payload reports the record count it really holds"
          (fun n ->
              match PlayFrame.frame (PlayFrame.Wire.allocate n) with
              | PlayFrame.Records(_, count) -> count = n
              | _ -> false)
          3 0

      // float32 round-trip. 0.5 is exact in float32; 0.1 is NOT, and that is the
      // counterexample — it fails for the real reason, a 24-bit significand,
      // which also records where the precision boundary sits.
      Verify.check "a float32 field round-trips through the wire layout"
          (fun x ->
              let b = PlayFrame.Wire.allocate 1
              let w = PlayFrame.Wire.viewOver b
              PlayFrame.Wire.putFloat32 w (PlayFrame.Wire.at 0 PlayFrame.Offset.WinProbability) x
              match PlayFrame.frame b with
              | PlayFrame.Records(v, _) -> PlayFrame.winProbability v 0 = x
              | _ -> false)
          0.5 0.1

      // Big-endianness, proved from raw bytes rather than from the writer's own
      // flag. 3F 00 00 00 is 0.5 read big-endian and 8.99e-44 read little-endian,
      // so the counterexample is the little-endian interpretation of the very
      // same four bytes — the value a flipped flag would produce.
      Verify.check "the reader is big-endian: 3F 00 00 00 is 0.5, not a denormal"
          (fun expected ->
              let b = PlayFrame.Wire.allocate 1
              let w = PlayFrame.Wire.viewOver b
              let o = PlayFrame.Wire.at 0 PlayFrame.Offset.WinProbability
              PlayFrame.Wire.putByte w o 0x3F
              PlayFrame.Wire.putByte w (o + 1) 0
              PlayFrame.Wire.putByte w (o + 2) 0
              PlayFrame.Wire.putByte w (o + 3) 0
              match PlayFrame.frame b with
              | PlayFrame.Records(v, _) -> PlayFrame.winProbability v 0 = expected
              | _ -> false)
          0.5 8.968310171676393e-44

      // Each field reads its own offset. The counterexample writes to
      // LeverageIndex and expects WinProbability to have changed, which is
      // exactly what an off-by-one in the offset table would produce.
      Verify.check "each field reads its own offset, not its neighbour's"
          (fun (writeField, readField) ->
              let b = PlayFrame.Wire.allocate 1
              let w = PlayFrame.Wire.viewOver b
              PlayFrame.Wire.putFloat32 w (PlayFrame.Wire.at 0 writeField) 7.5
              match PlayFrame.frame b with
              | PlayFrame.Records(v, _) ->
                  (if readField = PlayFrame.Offset.WinProbability then PlayFrame.winProbability v 0
                   elif readField = PlayFrame.Offset.ExpectedPointsAdded then PlayFrame.expectedPointsAdded v 0
                   else PlayFrame.leverageIndex v 0) = 7.5
              | _ -> false)
          (PlayFrame.Offset.LeverageIndex, PlayFrame.Offset.LeverageIndex)
          (PlayFrame.Offset.LeverageIndex, PlayFrame.Offset.WinProbability)

      // A wire byte of 2 is legal on the wire and an INVALID bool instance under
      // MemoryMarshal.Cast, where the CLR may take either branch. Here the byte
      // is the storage and the comparison is explicit, so 2 reads true and 0
      // reads false — every value in 0-255 has exactly one meaning.
      Verify.check "the scoring flag is a byte comparison, so a wire byte of 2 is not undefined"
          (fun flag ->
              let b = PlayFrame.Wire.allocate 1
              let w = PlayFrame.Wire.viewOver b
              PlayFrame.Wire.putByte w (PlayFrame.Wire.at 0 PlayFrame.Offset.ScoringFlag) flag
              match PlayFrame.frame b with
              | PlayFrame.Records(v, _) -> PlayFrame.isScoringPlay v 0
              | _ -> false)
          2 0

      // hi * 2^32 + lo <= 2^53 - 1 with lo at most 2^32 - 1 gives hi <= 2^21 - 1.
      // 2097152 is the first high word that does not survive a double, and it
      // must be REFUSED rather than silently rounded.
      Verify.check "an id past 2^53 is flagged rather than silently rounded"
          (fun hi ->
              let b = PlayFrame.Wire.allocate 1
              let w = PlayFrame.Wire.viewOver b
              let o = PlayFrame.Wire.at 0 PlayFrame.Offset.PlayId
              PlayFrame.Wire.putUint32 w o hi
              PlayFrame.Wire.putUint32 w (o + 4) 4294967295.0
              match PlayFrame.frame b with
              | PlayFrame.Records(v, _) -> PlayFrame.playIdIsExact v 0
              | _ -> false)
          2097151.0 2097152.0

      // The producer, round-tripped against the reader. Until this check the
      // suite exercised fields one at a time through hand-placed bytes; this
      // drives `Wire.encode` — the actual producer surface — and reads every
      // field of every record back. A stride error that the single-record
      // checks cannot see (record 2 landing at the wrong offset) fails here.
      Verify.check "a frame the producer encoded reads back exactly, every field"
          (fun (plays: PlayFrame.Wire.Outgoing list) ->
              match PlayFrame.frame (PlayFrame.Wire.encode plays) with
              | PlayFrame.Records(v, count) when count = List.length plays ->
                  plays
                  |> List.mapi (fun i p ->
                      PlayFrame.playId v i = p.PlayId
                      && PlayFrame.winProbability v i = (match p.WinProbability with Some x -> x | None -> nan)
                      && PlayFrame.expectedPointsAdded v i = p.ExpectedPointsAdded
                      && PlayFrame.leverageIndex v i = (match p.LeverageIndex with Some x -> x | None -> nan)
                      && PlayFrame.isScoringPlay v i = p.IsScoringPlay)
                  |> List.forall id
              | _ -> false)
          // Three records, so a stride error has somewhere to show. Values exact
          // in float32 and distinct per field, so a field reading its neighbour
          // fails rather than coincidentally matching.
          [ { PlayId = 4242.0; WinProbability = Some 0.5; ExpectedPointsAdded = 2.0
              LeverageIndex = Some 1.5; IsScoringPlay = true }
            { PlayId = 4243.0; WinProbability = Some -3.25; ExpectedPointsAdded = -0.75
              LeverageIndex = Some 0.25; IsScoringPlay = false }
            { PlayId = 4244.0; WinProbability = Some 1.0; ExpectedPointsAdded = 0.0
              LeverageIndex = Some 8.0; IsScoringPlay = true } ]
          // The counterexample is a value float32 cannot hold. It fails on
          // precision, not on plumbing — the plumbing is what the case above
          // proves, and a counterexample that broke both would prove neither.
          [ { PlayId = 1.0; WinProbability = Some 0.1; ExpectedPointsAdded = 0.0
              LeverageIndex = Some 0.0; IsScoringPlay = false } ]

      // Absence, and its mirror. Two checks because one alone proves half of it:
      // "absent reads as absent" is satisfiable by a reader that calls
      // everything absent, and "zero reads as a value" by one that calls
      // everything present. Each is the other's counterexample.
      //
      // This matters because the layout asks for two fields nothing in FIELD
      // produces. The ESPN NFL play the EPA path reads carries no win
      // probability and no leverage index — verified live, field-relay-nba
      // outbox/nfl-epa-shape-probe-20260815T013003Z.log, 14/14. Writing 0.0
      // there would put a value whose name and measurement disagree into the
      // wire format itself.
      Verify.check "an absent optional field reads as absent, never as zero"
          (fun (wp: float option) ->
              let b = PlayFrame.Wire.encode
                        [ { PlayId = 1.0; WinProbability = wp; ExpectedPointsAdded = 1.0
                            LeverageIndex = None; IsScoringPlay = false } ]
              match PlayFrame.frame b with
              | PlayFrame.Records(v, _) -> not (PlayFrame.isPresent (PlayFrame.winProbability v 0))
              | _ -> false)
          None (Some 0.0)

      Verify.check "...and a measured zero is a value, not an absence"
          (fun (wp: float option) ->
              let b = PlayFrame.Wire.encode
                        [ { PlayId = 1.0; WinProbability = wp; ExpectedPointsAdded = 1.0
                            LeverageIndex = None; IsScoringPlay = false } ]
              match PlayFrame.frame b with
              | PlayFrame.Records(v, _) ->
                  PlayFrame.isPresent (PlayFrame.winProbability v 0)
                  && PlayFrame.winProbability v 0 = 0.0
              | _ -> false)
          (Some 0.0) None

      // The layout says which layout it is.
      //
      // These two are the reason the version exists. Without them a reader given
      // a future record does not fail — it reads the old offsets out of new
      // bytes and returns numbers, which is the worst outcome a binary format
      // has and the one JSON cannot produce.
      Verify.check "a record declaring an unknown layout is refused, and names the version"
          (fun (version: int) ->
              let b = PlayFrame.Wire.encode
                        [ { PlayId = 1.0; WinProbability = None; ExpectedPointsAdded = 1.0
                            LeverageIndex = None; IsScoringPlay = false } ]
              PlayFrame.Wire.putByte (PlayFrame.Wire.viewOver b)
                  (PlayFrame.Wire.at 0 PlayFrame.Offset.FormatVersion) version
              match PlayFrame.frame b with
              | PlayFrame.UnknownLayout(found, at) -> found = version && at = 0
              | _ -> false)
          // 2 is a layout from the future; 1 is this one and must read normally.
          2 PlayFrame.FormatVersion

      Verify.check "a reserved byte in use is refused separately from a version bump"
          (fun (reserved: int) ->
              let b = PlayFrame.Wire.encode
                        [ { PlayId = 1.0; WinProbability = None; ExpectedPointsAdded = 1.0
                            LeverageIndex = None; IsScoringPlay = false } ]
              PlayFrame.Wire.putByte (PlayFrame.Wire.viewOver b)
                  (PlayFrame.Wire.at 0 PlayFrame.Offset.Reserved) reserved
              match PlayFrame.frame b with
              | PlayFrame.ReservedInUse at -> at = 0
              | _ -> false)
          // A writer that used byte 22 knew about a field this reader does not;
          // zero is the counterexample and must still read as Records.
          1 0

      // Not the first record. A sampled check is one that passes on the bytes it
      // did not look at, so the guarantee has to be total or it is decoration.
      //
      // The counterexample is where the FIRST attempt at this check went wrong:
      // it corrupted record `n` and asserted the refusal named record `n`, with
      // 0 as the counterexample — and corrupting record 0 is detected too, so
      // the harness reported NO TEETH. Correctly: nothing about a record INDEX
      // can be a counterexample here. The counterexample has to be a wrong
      // ANSWER, so the input carries both the record corrupted and the record
      // the refusal is expected to name.
      Verify.check "the version is checked on every record, not just the first"
          (fun (corruptAt: int, expectAt: int) ->
              let one : PlayFrame.Wire.Outgoing =
                  { PlayId = 1.0; WinProbability = None; ExpectedPointsAdded = 1.0
                    LeverageIndex = None; IsScoringPlay = false }
              let b = PlayFrame.Wire.encode [ one; one; one ]
              PlayFrame.Wire.putByte (PlayFrame.Wire.viewOver b)
                  (PlayFrame.Wire.at corruptAt PlayFrame.Offset.FormatVersion) 9
              match PlayFrame.frame b with
              | PlayFrame.UnknownLayout(9, at) -> at = expectAt
              | _ -> false)
          // Corrupt the LAST record and expect it named there: a first-record-
          // only reader returns `Records` and never gets here at all.
          (2, 2)
          // Corrupt the last record and expect record 0 named: true only for a
          // reader that reports a fixed location instead of the one it found.
          (2, 0)

      // The empty state that means four things. Playground throws to avoid it;
      // a throw is swallowable and production's six undefined functions are what
      // swallowing looks like.
      Verify.check "an outage is EveryFetchFailed, not an empty slate"
          (fun (eligible, readings) ->
              Weather.slateWeather eligible readings [] = Weather.EveryFetchFailed(eligible, []))
          ([ "Fenway Park" ], [])
          ([], [])

      // The reasons survive the total failure. Until 2026-08-27 this case
      // carried the venue NAMES alone, so "all 13 requests failed", "all 13
      // were refused with HTTP 429" and "all 13 could not reach the host" were
      // one value. verify 159 hit exactly this and could report only the count,
      // which is why WHICH of the three it was is still unknown.
      Verify.check "a total failure carries what each request reported"
          (fun (eligible, failed) ->
              match Weather.slateWeather eligible [] failed with
              | Weather.EveryFetchFailed(_, why) -> why = failed && not (List.isEmpty why)
              | _ -> false)
          ([ "Fenway Park" ], [ "Fenway Park: HTTP 429" ])
          ([ "Fenway Park" ], [])

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

let private stats () =
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
              (match Stats.sidesInHeaderOrder r with Contest(f, _) -> f | Event _ -> "") = expectedFirst
              && (Stats.headerText r).StartsWith expectedFirst)
          (Sport.MLB, "Orioles")
          (Sport.MLB, "Twins")

      // AFL reads home first, so the same function must flip. Without this a
      // hardcoded "away first" would satisfy the check above.
      Verify.check "...and flips for a sport that reads home first"
          (fun (sport, expectedFirst: string) ->
              let r = { Stats.Sport = sport; Stats.Home = "Sydney"; Stats.Away = "Collingwood"; Stats.Rows = [] }
              (match Stats.sidesInHeaderOrder r with Contest(f, _) -> f | Event _ -> "") = expectedFirst)
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

      // --- pitchers and records, from the real statsapi capture -------------
      //
      // `data/statsapi-schedule-2026-06-29.json` is production's own recorded
      // response, verified BYTE-IDENTICAL against the upstream blob sha
      // (aba791bd…) rather than trusted as transcribed. Every value below is
      // that file's, not one I chose.

      Verify.check "a record renders as W–L"
          (fun (json: string) ->
              match Schedule.decodeSchedule json with
              | Ok [ g ] -> Schedule.recordText (Schedule.recordOf (Schedule.homeOf g)) = "39–46"
              | _ -> false)
          (Fixtures.statsapiSchedule ())
          ((Fixtures.statsapiSchedule ()).Replace("\"wins\": 39", "\"wins\": 40"))

      // The nested wire shape. A decoder proven only against the flattened
      // fixture would pass everything here and fail on the first live call.
      Verify.check "the live dates[].games envelope decodes to the same thing"
          (fun (json: string) ->
              Schedule.decodeSchedule json = Schedule.decodeSchedule (Fixtures.statsapiSchedule ()))
          (Fixtures.statsapiNested ())
          (Fixtures.statsapiNestedAltered ())

      // Production's Gap 2, which cannot be expressed here: `if (hT && aT)`
      // drops BOTH records when one nickname fails to match. The record is a
      // required field of a side, so a side that decodes has one.
      //
      // The counterexample removes the WHOLE `leagueRecord`, not a field inside
      // it. Written first as `.Replace("\"losses\": 46,", "")`, which exercises
      // the record decoder's own strictness and says nothing about whether the
      // field is required — so `record-becomes-optional` SURVIVED it. A
      // counterexample has to remove the thing the claim is about.
      Verify.check "a side with no record does not decode at all"
          (fun (json: string) -> (Schedule.decodeSchedule json).IsOk)
          (Fixtures.statsapiSchedule ())
          ((Fixtures.statsapiSchedule ()).Replace(
              "\"leagueRecord\": { \"wins\": 39, \"losses\": 46, \"ties\": 0, \"pct\": \".459\" },", ""))

      // And the field inside it, which is a different claim and needs its own
      // input: a record missing a number must not decode as a record.
      Verify.check "a record missing one of its numbers does not decode"
          (fun (json: string) -> (Schedule.decodeSchedule json).IsOk)
          (Fixtures.statsapiSchedule ())
          ((Fixtures.statsapiSchedule ()).Replace("\"losses\": 46,", ""))

      // A blank name would render as a labelled row with nothing in it —
      // indistinguishable from a real pitcher to a reader.
      Verify.check "an empty pitcher name is refused, not rendered blank"
          (fun (json: string) -> (Schedule.decodeSchedule json).IsOk)
          (Fixtures.statsapiSchedule ())
          ((Fixtures.statsapiSchedule ()).Replace("\"fullName\": \"Shane Baz\"", "\"fullName\": \"   \""))

      // The join. statsapi says "Oriole Park at Camden Yards" and the slate
      // says something else entirely; both go through the alias table.
      Verify.check "a game is found by the venue name the OTHER payload uses"
          (fun (venue: string) ->
              match Schedule.decodeSchedule (Fixtures.statsapiSchedule ()) with
              | Ok games ->
                  match Schedule.tryFindAtVenue venue games with
                  | Some g -> Schedule.teamOf (Schedule.homeOf g) = "Baltimore Orioles"
                  | None -> false
              | Error _ -> false)
          "Camden Yards"
          "Fenway Park"

      // A bare name is production's real output for an unrated umpire, and a
      // complete answer rather than a missing one.
      Verify.check "an unrated umpire renders as a bare name"
          (fun (rating: Scouting.UmpireRating option) ->
              Stats.rowValue (Stats.UmpireRow("Márquez", rating)) = "Márquez")
          None
          (Scouting.tryUmpire "jimenez") ]

// ---------------------------------------------------------------------------
// The URL grammar for view state. Every MustFail here is the answer a
// REBUILT query gives — the obvious implementation, `sprintf "?date=%s&tab=%s"`,
// which is correct on the case you are looking at and wrong on the four you
// are not.
// ---------------------------------------------------------------------------

let private route () =
    let rewrites (search, slug, expected) = Route.withTab search slug = expected

    [ Verify.check "a tab is appended and the date survives"
          rewrites
          ("?date=2026-08-29", "briefs", "?date=2026-08-29&tab=briefs")
          ("?date=2026-08-29", "briefs", "?tab=briefs")

      // Appending unconditionally leaves ?tab=stats&tab=briefs, and which one
      // wins is then a question about the reader's browser.
      Verify.check "switching surfaces REPLACES the tab, never appends a second"
          rewrites
          ("?date=2026-08-29&tab=stats", "briefs", "?date=2026-08-29&tab=briefs")
          ("?date=2026-08-29&tab=stats", "briefs", "?date=2026-08-29&tab=stats&tab=briefs")

      Verify.check "the default surface is omitted, so one link has one spelling"
          rewrites
          ("?date=2026-08-29&tab=briefs", "scoreboard", "?date=2026-08-29")
          ("?date=2026-08-29&tab=briefs", "scoreboard", "?date=2026-08-29&tab=scoreboard")

      // THE ONE THAT MATTERS MOST. A bare load means "today". Stamping today's
      // date in on a tab click pins a shared link to this calendar day, so
      // opening it tomorrow shows yesterday under a link that promised today.
      Verify.check "a bare url does NOT acquire a date from a tab click"
          rewrites
          ("", "briefs", "?tab=briefs")
          ("", "briefs", "?date=2026-09-01&tab=briefs")

      // `data=` pins the page to a committed capture and disables the date nav.
      // A rebuilt query drops it, and the page silently unpins on reload.
      Verify.check "pinning to a committed capture survives a tab click"
          rewrites
          ("?data=games-2026-08-09", "stats", "?data=games-2026-08-09&tab=stats")
          ("?data=games-2026-08-09", "stats", "?tab=stats")

      Verify.check "simulate survives too"
          rewrites
          ("?date=2026-08-29&simulate=1", "pickem", "?date=2026-08-29&simulate=1&tab=pickem")
          ("?date=2026-08-29&simulate=1", "pickem", "?date=2026-08-29&tab=pickem")

      // An empty url argument to replaceState resolves to the CURRENT url, so
      // returning "?" here would leave the parameter in place — the one case
      // this function exists for, failing in the way that looks like nothing.
      Verify.check "clearing the last parameter yields an empty query, not \"?\""
          rewrites
          ("?tab=briefs", "scoreboard", "")
          ("?tab=briefs", "scoreboard", "?")

      Verify.check "a url with no tab reads as the default surface"
          (fun (search, expected) -> Route.tabOf search = expected)
          ("?date=2026-08-29", "scoreboard")
          ("?date=2026-08-29", "briefs")

      Verify.check "a url with a tab reads as that surface"
          (fun (search, expected) -> Route.tabOf search = expected)
          ("?date=2026-08-29&tab=briefs", "briefs")
          ("?date=2026-08-29&tab=briefs", "scoreboard")

      Verify.check "the slug and the element id round-trip"
          (fun (tabId: string) -> Route.tabIdOf (Route.slugOf tabId) = tabId)
          "tab-scoreboard"
          "briefs" ]

// ---------------------------------------------------------------------------
// Team tints. Every MustFail here is the RAW BRAND HEX — the thing that was
// asked for, and the thing measurement rejected: thirteen of fifteen real club
// colours fail AA on this ground and seven fail even the 3.0 floor this palette
// already enforces. A check whose counterexample is "just use the team's colour"
// cannot go green on a build that quietly does.
// ---------------------------------------------------------------------------

let private teamTints () =
    let tint hex = Option.get (Palette.teamTint hex)
    // AGAINST THE CARD, not the page. Team names sit inside `.desk-card`, so
    // `bg` is the one surface they are never on — and a suite measuring `bg`
    // agreed with a bug a rendered check then caught at 4.35.
    let clears (hex: string) = Palette.contrastWithCard (tint hex) >= Palette.TEAM_TINT_CONTRAST

    [ // Navy on near-black is the ordinary case in American sport. 1.32 raw.
      Verify.check "the tint clears AA ON THE CARD, which is where it renders"
          (fun (hex, wantClear) ->
              (Palette.contrastWithCard (tint hex) >= Palette.TEAM_TINT_CONTRAST) = wantClear)
          ("#134a8e", true)
          ("#134a8e", false)

      Verify.check "the derived tint clears AA where the brand hex does not"
          (fun (hex, wantClear) -> clears hex = wantClear)
          ("#132448", true)
          ("#132448", false)

      // Black has no hue to preserve, and inventing one would be inventing data.
      Verify.check "a black club colour becomes GREY, not an invented hue"
          (fun (hex, wantSat) -> Palette.saturationOf (tint hex) = wantSat)
          ("#000000", 0.0)
          ("#000000", 0.5)

      Verify.check "THE HUE SURVIVES — that is the whole justification"
          (fun (hex, wantHue) -> abs (Palette.hueOf (tint hex) - wantHue) < 2.0)
          ("#005A9C", 205.0)
          ("#005A9C", 20.0)

      // The cap is the least saturated CHROMATIC semantic, computed from the
      // registry. A tint at full brand saturation would compete with colour that
      // carries meaning, which is the larger hazard than legibility.
      // ONE QUANTISATION STEP OF TOLERANCE, and that number is 1/255 rather than
      // a widened guess. The cap is applied in HSL and the result is then
      // rounded to a hex; reading the saturation back off that hex returns a
      // value up to one 8-bit step away. #CE1141 measured 0.0013 over, which is
      // a third of a step. A tighter tolerance would fail on rounding; a looser
      // one would stop catching a real breach of the cap.
      Verify.check "a fully saturated brand colour is capped, not passed through"
          (fun (hex, wantCapped) ->
              (Palette.saturationOf (tint hex) <= Palette.teamTintSaturationCap + (1.0 / 255.0)) = wantCapped)
          ("#CE1141", true)
          ("#CE1141", false)

      // Already legible, so nothing to do. A derivation that moves every colour
      // would be a filter, not a repair.
      Verify.check "a club colour that already clears AA is left alone"
          (fun (hex, wantSame) -> (Palette.cssValue (tint hex) = hex) = wantSame)
          ("#5d9741", true)
          ("#5d9741", false)

      // None is a third state. A default tint would put a colour on the page
      // that no source supplied.
      // PAIRWISE, which is the whole reason a club no longer drops globally.
      Verify.check "two clubs in the same white cannot be told apart"
          (fun (a, b) -> Palette.distinguishable (tint a) (tint b))
          ("#ffffff", "#a50044")
          ("#ffffff", "#ffffff")

      Verify.check "TWO REDS ARE AS BAD AS ONE RED — a distance, not an equality"
          (fun (a, b) -> Palette.distinguishable (tint a) (tint b))
          ("#007A33", "#CE1141")
          ("#f42727", "#e31837")

      // Derived from the registry: the closest pair among the five semantics is
      // the smallest separation this page already asks anyone to distinguish.
      // Found by looking at the rendered page, not at a number: a pale tint reads
      // as unstyled, and its partner's colour then reads as emphasis.
      Verify.check "A TINT TOO CLOSE TO THE TEXT COLOUR IS NOT A COLOUR"
          (fun (hex: string) -> Palette.readsAsColour (tint hex))
          "#005A9C"
          "#aec7e6"

      Verify.check "the separation floor comes from the palette, not from taste"
          (fun (floor: float) -> floor > 1.0 && floor < 100.0)
          Palette.tintSeparationFloor
          0.0

      Verify.check "a malformed colour yields NO tint, never a default one"
          (fun (hex, wantSome) -> (Palette.teamTint hex).IsSome = wantSome)
          ("not-a-hex", false)
          ("not-a-hex", true)

      // THE PER-CARD CHOICE. Real pairs from the frozen capture, because a
      // synthetic one would let the rule be right about nothing in particular.
      //
      // LAFC and D.C. United are both #000000 and derive the identical tint, so
      // the primaries are indistinguishable and the card rendered plain. D.C.
      // United's own second colour is #d61018.
      Verify.check "an alternate recovers a pair the primaries cannot"
          (fun (a, b) -> (Palette.choosePair a b).IsSome)
          ([ "#000000"; "#c7a36f" ], [ "#000000"; "#d61018" ])
          ([ "#000000" ], [ "#000000" ])

      // THE RULE, not the enumeration order. The first-named side keeps its
      // primary whenever changing only the second suffices — and the
      // counterexample is a card where the first side is the one that has to
      // move, Spurs' white against Newcastle's black.
      Verify.check "THE FEWEST-CHANGES COMBINATION WINS, first-named side first"
          (fun (a, b) ->
              match Palette.choosePair a b with
              | Some(x, _) -> Palette.cssValue x = Palette.cssValue (tint (List.head a))
              | None -> false)
          ([ "#000000"; "#c7a36f" ], [ "#000000"; "#d61018" ])
          ([ "#ffffff"; "#0b1426" ], [ "#000000" ])

      // Angers and Auxerre carry the same two colours in opposite order. No
      // combination separates them and the card must stay plain — a page that
      // showed a difference here would be inventing one.
      Verify.check "NO COMBINATION MEANS BOTH PLAIN, never a borrowed colour"
          (fun (a, b) -> (Palette.choosePair a b).IsNone)
          ([ "#1a1a1a"; "#ffffff" ], [ "#ffffff"; "#1a1a1a" ])
          ([ "#1a1a1a"; "#ffffff" ], [ "#da0308"; "#d4d4d4" ])

      // A spelling the table has never seen resolves to no colours at all, and
      // that is not the same failure as a club whose colours do not work.
      Verify.check "a club with no colours yields None rather than a half-tinted card"
          (fun (a, b) -> (Palette.choosePair a b).IsNone)
          ([], [ "#000000" ])
          ([ "#da0308" ], [ "#000000" ]) ]


/// Tennis: a scoreline that is an array, and the rules that constrain it.
///
/// Every row here was written AFTER `data/tennis-live.json` was captured, and
/// two of the five invariants drafted before the capture did not survive it —
/// see the header of `Tennis.fs`. The rows below are the ones the real payload
/// supports.
///
/// COVERAGE, stated where the result is read (Rule 91). The capture carries
/// statuses `live` and `interrupted` only. NO FINISHED MATCH is in it, so
/// `Finished` is exercised by constructed inputs and not by a captured one. A
/// finished tennis match is not a shape this fixture proves.
let private tennis () : Verify.Sealed list =
    [
      // The set a match is CURRENTLY playing sits in the same array as the ones
      // it has finished, with nothing marking it. What says which is which is
      // the summary falling one short of the list — measured on all 11 rows.
      Verify.check "the in-progress set is identified by the summary, not by a flag"
          (fun (won, sets) ->
              match Tennis.decode 1 "t" won sets with
              | Ok m -> Tennis.inPlay m && Tennis.currentSet m = Some(5, 5)
              | Error _ -> false)
          // Menšik v Tien, US Open R32, exactly as captured: 1-1 in sets, third
          // set live at 5-5.
          (2, [ (3, 6, None); (6, 1, None); (5, 5, None) ])
          // Same list, summary says all three are done. Then nothing is live.
          (3, [ (3, 6, None); (6, 1, None); (5, 5, None) ])

      // The summary and the list are two statements of the same fact, and a
      // payload where they disagree by more than the one live set is not a
      // match state — it is a decode error, and saying so is the point.
      Verify.check "A SUMMARY THAT DISAGREES WITH THE SET LIST IS REFUSED"
          (fun (won, sets) ->
              match Tennis.decode 1 "t" won sets with
              | Error(Tennis.SummaryDisagreesWithSets _) -> true
              | _ -> false)
          (0, [ (6, 3, None); (6, 4, None) ])
          (2, [ (6, 3, None); (6, 4, None) ])

      // The invariant the capture BROKE before it could ship. Applied to the
      // whole array, "a set ends 6-n, 7-5 or 7-6" calls every live match
      // corrupt: 5-5 is a perfectly good in-progress set. Applied to all but
      // the last, it is true of all 11 captured rows.
      Verify.check "a set BEFORE the last must be one a set can end on"
          (fun (won, sets) ->
              match Tennis.decode 1 "t" won sets with
              | Error(Tennis.IllegalCompletedSet _) -> true
              | _ -> false)
          // 5-5 as a FINISHED first set is impossible.
          (1, [ (5, 5, None); (2, 1, None) ])
          // The same 5-5 as the LAST set is ordinary live play.
          (0, [ (5, 5, None) ])

      // A tiebreak is played at 6-6 and nowhere else, so it may accompany a 7-6
      // and no other score. Both tiebreaks in the capture are on 7-6 sets.
      Verify.check "a tiebreak belongs to a 7-6 set and no other"
          (fun sets ->
              match Tennis.decode 1 "t" 1 sets with
              | Ok _ -> true
              | Error _ -> false)
          [ (7, 6, Some(8, 6)) ]
          [ (6, 3, Some(7, 5)) ]

      // The capture supplied this one; it was not guessed. `[8,6]` means a
      // tiebreak is first to seven WIN BY TWO, not a race capped at seven.
      Verify.check "A TIEBREAK IS WON BY TWO, so 7-6 in the breaker is refused"
          (fun tb ->
              match Tennis.decode 1 "t" 1 [ (7, 6, Some tb) ] with
              | Ok _ -> true
              | Error _ -> false)
          (8, 6)
          (7, 6)

      // Sets won are RECOMPUTED from the completed sets rather than read back
      // from the payload's summary. The summary chose which set is live; if the
      // two could disagree afterwards, one of them would be decoration.
      Verify.check "sets won are derived from the sets, not echoed from the summary"
          (fun (won, sets) ->
              match Tennis.decode 1 "t" won sets with
              | Ok m -> Tennis.setsWon m = (1, 1)
              | Error _ -> false)
          (2, [ (3, 6, None); (6, 1, None); (5, 5, None) ])
          (2, [ (6, 3, None); (6, 1, None); (5, 5, None) ])

      // A finished match cannot be level. Reported rather than made
      // unrepresentable: without a best-of — and the capture shows there is
      // none, with `circuit` reading ATP on a women's match — "3-1 is
      // impossible in a best-of-3" is not decidable here. "2-2 with nothing
      // left to play" is, and it is what a decoder bug would actually produce.
      Verify.check "A FINISHED MATCH CANNOT BE LEVEL"
          (fun (won, sets) ->
              match Tennis.decode 1 "t" won sets with
              | Ok m -> Tennis.endedLevel m
              | Error _ -> false)
          (4, [ (6, 3, None); (3, 6, None); (6, 4, None); (4, 6, None) ])
          (4, [ (6, 3, None); (3, 6, None); (6, 4, None); (6, 4, None) ])

      // The whole captured payload decodes. Not a spot check on one row: every
      // match in data/tennis-live.json, or this fails.
      Verify.check "EVERY MATCH IN THE REAL CAPTURE DECODES"
          (fun json -> Tennis.decodeAll json |> List.forall (fun r -> Result.isOk r))
          (Fixtures.tennisLive ())
          // The same capture with one completed set changed to 5-1, a score no
          // set can end on. The mutation guards its own anchor — see
          // (Fixtures.tennisLiveCorrupted ()). Written inline first, against a JSON
          // shape the file does not use, and this row reported NO TEETH.
          (Fixtures.tennisLiveCorrupted ())

      // ── Sets.Finished, from a real capture at last ──────────────────────
      //
      // The coverage note at the top of this list said `Finished` was exercised
      // by constructed inputs only, because the live capture comes from
      // /bsd/tennis/matches/live and carries `live` and `interrupted` and
      // nothing else. That note is now out of date, and this is why.
      Verify.check "A FINISHED SLAM DECODES, AND NOTHING IN IT IS STILL BEING PLAYED"
          (fun json ->
              let rows = Tennis.decodeDrawNodes json
              let ok = rows |> List.filter Result.isOk
              // A PROPORTION, not "all", and the reason is a real row: node
              // 36028 carries "tiebreak": [40, 15] on a 6-4 set. 40 and 15 are
              // game points, not a breaker, so `completedSet` refuses it —
              // correctly. Asserting all 127 would be asserting something
              // false about the vendor's data.
              //
              // Nine tenths rather than a count, because a count would couple
              // this row to one capture's contents. That coupling is what took
              // the tennis fixture row to NO TEETH when the capture workflow
              // ran a second time.
              not (List.isEmpty rows)
              && List.length ok * 10 >= List.length rows * 9
              && ok |> List.forall (fun r ->
                     match r with
                     | Ok m -> not (Tennis.inPlay m)
                     | Error _ -> false))
          (Fixtures.tennisDraw ())
          // Every set corrupted, not one — a proportion cannot be falsified by
          // breaking a single match out of 127.
          (Fixtures.tennisDrawSetCorrupted ())

      // The refusal above is not a shrug. Every failure must be a scoreline the
      // sport cannot produce, named as such — not a decoder that gave up.
      //
      // `IllegalTiebreak` ADDED 2026-09-07, and the reason is the row itself: the
      // capture's one refusal is match 36028, whose second set is 6-4 carrying
      // `tiebreak: [40, 15]`. That was reported as `IllegalCompletedSet` until
      // the Draw panel printed the message out loud — "set 2 is 6-4, which is not
      // a score a set ends on" — over a set whose games are perfectly legal. One
      // case for two defects named the half of the row that was fine.
      Verify.check "...and every match it refuses is refused for a stated reason"
          (fun json ->
              Tennis.decodeDrawNodes json
              |> List.forall (fun r ->
                     match r with
                     | Ok _ -> true
                     | Error(Tennis.IllegalCompletedSet _) -> true
                     | Error(Tennis.IllegalTiebreak _) -> true
                     | Error _ -> false))
          (Fixtures.tennisDraw ())
          // A payload whose sets list is empty: NoSets, which is a different
          // error and must not be waved through by this row.
          """{"nodes":[{"id":1,"round":"Final","sets":[{"p1":99,"p2":99}]}]}"""

      // The split itself, on the shape that forced it. A 6-4 set carrying a
      // tiebreak must report the TIEBREAK, because the games are legal and
      // saying otherwise is a report about the wrong half of the row.
      //
      // The counterexample is the same set with the same illegal tiebreak on a
      // score that is ALSO not a legal set — 4-3 — so it comes back as
      // `IllegalCompletedSet`. That is what gives this row teeth: a
      // `completedSetError` that always answered `IllegalTiebreak` whenever a
      // tiebreak was present would pass the first input and fail this one.
      Verify.check "an illegal tiebreak on a LEGAL set score is reported as a tiebreak"
          (fun json ->
              Tennis.decodeDrawNodes json
              |> List.exists (fun r ->
                     match r with
                     | Error(Tennis.IllegalTiebreak _) -> true
                     | Ok _ | Error _ -> false))
          """{"nodes":[{"id":1,"round":"Final","sets":[{"p1":6,"p2":4,"tiebreak":[40,15]},{"p1":6,"p2":0}]}]}"""
          """{"nodes":[{"id":1,"round":"Final","sets":[{"p1":4,"p2":3,"tiebreak":[40,15]},{"p1":6,"p2":0}]}]}"""

      // ...and the other direction, so the pair cannot both be satisfied by a
      // classifier that has stopped distinguishing. An illegal set score with NO
      // tiebreak must stay `IllegalCompletedSet`.
      Verify.check "...and an illegal set score with no tiebreak stays a set-score refusal"
          (fun json ->
              Tennis.decodeDrawNodes json
              |> List.exists (fun r ->
                     match r with
                     | Error(Tennis.IllegalCompletedSet _) -> true
                     | Ok _ | Error _ -> false))
          """{"nodes":[{"id":1,"round":"Final","sets":[{"p1":4,"p2":3},{"p1":6,"p2":0}]}]}"""
          """{"nodes":[{"id":1,"round":"Final","sets":[{"p1":6,"p2":4,"tiebreak":[40,15]},{"p1":6,"p2":0}]}]}"""

      // The three retirements. A match that ENDED on an unfinished set is not
      // in play and is not finished — measured in the capture, not anticipated:
      // 35384 (4-5), 35152 (3-6 6-0 4-1) and 35142 (7-6 2-1), all status
      // `finished`, all stopping mid-set.
      Verify.check "A RETIREMENT IS NEITHER IN PLAY NOR FINISHED"
          (fun json ->
              Tennis.decodeDrawNodes json
              |> List.choose (fun r -> match r with Ok m -> Some m | Error _ -> None)
              |> List.exists (fun m -> (Tennis.abandonedSet m).IsSome && not (Tennis.inPlay m)))
          (Fixtures.tennisDraw ())
          // A draw of one match played out to a completed set. No retirement in
          // it, so nothing should report an abandoned set — which is what makes
          // this row fail if `abandonedSet` ever answers on a finished match.
          """{"nodes":[{"id":1,"round":"Final","sets":[{"p1":6,"p2":3},{"p1":6,"p2":4}]}]}"""

      // ...and it is 127 matches, not one. `forall` is vacuous on an empty
      // list, and `decodeDrawNodes` DROPS nodes with no sets — so a capture of
      // an unplayed draw would satisfy the row above by having nothing in it.
      Verify.check "...and a finished slam is 127 matches, not a handful"
          (fun json -> List.length (Tennis.decodeDrawNodes json) >= 127)
          (Fixtures.tennisDraw ())
          // One node, played. Decodes cleanly, is not a slam.
          """{"nodes":[{"id":1,"round":"Final","sets":[{"p1":6,"p2":3}]}]}"""

      // A capture that decoded zero matches would satisfy `List.forall` on an
      // empty list, and the row above would pass while proving nothing. This is
      // that hole, closed.
      //
      // NOT a fixed count. This asserted `= 11` against a file that
      // capture-tennis-fixture.yml overwrites, so the next capture — eight
      // matches instead of eleven — turned a correct suite red. A recapture is
      // the fixture working as intended and must never read as a regression.
      // What the row actually needs is that the list is not empty, which is
      // exactly what makes forall vacuous.
      Verify.check "...and the capture is not empty, which forall would not catch"
          (fun json -> not (List.isEmpty (Tennis.decodeAll json)))
          (Fixtures.tennisLive ())
          "[]" ]

/// The knockout draw. Every row here was written against a real slam edition
/// read on 2026-09-06, and the split it exercises — what is REFUSED versus what
/// is only REPORTED — was decided by that reading rather than by taste.
///
/// COVERAGE, stated where the result is read (Rule 91). Six editions were read.
/// One of the six (Roland Garros Women 2026) has a canonical 64/32/16/8/4/2/1
/// ladder; the other five do not. That is why "rounds halve" is a query here and
/// not a construction law: as a law it would reject five real slams and pass on
/// the tidy one, which is the shape of every apparatus defect this repo has
/// counted.
///
/// The rows below use four-player mini draws (Semifinals + Final) rather than a
/// captured 127-match edition, because a mutation has to be READABLE to be
/// trustworthy — see the NO TEETH the tennis fixture row earned when its
/// mutation was anchored to a set score the next capture overwrote. The real
/// edition is exercised separately by the fixture rows at the end.
let private draw () : Verify.Sealed list =
    let p id name : Draw.Player =
        { Id = id; Name = name; ShortName = None; CountryCode = None; Rank = None }
    // A four-player draw: two semi-finals feeding one final.
    // (matchId, round, p1, p2, winnerId, status)
    let sf1 = (1, Draw.Semifinals, Some(p 10 "Alcaraz"), Some(p 11 "Djokovic"), Some 10, Some "finished")
    let sf2 = (2, Draw.Semifinals, Some(p 12 "Sinner"), Some(p 13 "Zverev"), Some 12, Some "finished")
    let fin = (3, Draw.Final, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished")
    let ok = [ sf1; sf2; fin ]
    [
      // The join is what makes this module worth having, and ambiguity is the
      // one condition under which it must not answer. An `AmbiguousEdge` case
      // was written for exactly that — and this row could not be given an input
      // that reached it.
      //
      // For a winner to appear in two next-round matches, that player must
      // appear twice in that round, and the player-twice law refuses first. The
      // ambiguity check is strictly subsumed, so the case was deleted rather
      // than left as an unreachable refusal that reads like an enforced one.
      // This row is what remains: the shape that WOULD make a join ambiguous,
      // refused one step earlier and under the stronger name.
      //
      // The relay keeps its 409, and it is reachable there: /bsd/tennis/draw
      // performs the join with no player-twice law, so ambiguity is the only
      // guard standing at the boundary where the vendor's rows arrive.
      Verify.check "the shape that would make a join ambiguous is refused, one step earlier"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Error(Draw.PlayerTwiceInRound(r, pid)) -> r = "Final" && pid = 10
              | _ -> false)
          // One semi-final, two finals, Alcaraz in both — which is what joining
          // two editions of one tournament produces. BSD id 135 holds 477
          // matches across 2025 and 2026, and the first attempt at this join
          // read that as ambiguity in the data.
          [ sf1
            (3, Draw.Final, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished")
            (4, Draw.Final, Some(p 10 "Alcaraz"), Some(p 13 "Zverev"), None, Some "scheduled") ]
          ok

      // A winner who is not one of the two players is not a winner. This is what
      // would catch a join performed against the wrong row — the failure mode
      // that produces a complete-looking bracket out of mismatched ids.
      Verify.check "a winner who did not play in the match REFUSES the draw"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Error(Draw.WinnerNotInMatch _) -> true
              | _ -> false)
          [ sf1; sf2; (3, Draw.Final, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 99, Some "finished") ]
          ok

      // "A player appears in at most one match per round" is the premise the
      // whole join rests on. Without it a single hit is a coincidence rather
      // than an edge, so a violation is refused rather than reported.
      Verify.check "the same player twice in one round REFUSES the draw"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Error(Draw.PlayerTwiceInRound _) -> true
              | _ -> false)
          [ sf1
            (2, Draw.Semifinals, Some(p 10 "Alcaraz"), Some(p 13 "Zverev"), Some 10, Some "finished")
            fin ]
          ok

      // Two matches sharing an id would make every edge address the wrong one,
      // silently — the edges would still resolve, and to the wrong match.
      Verify.check "two matches with one id REFUSE the draw"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Error(Draw.DuplicateMatchId _) -> true
              | _ -> false)
          [ sf1; (1, Draw.Semifinals, Some(p 12 "Sinner"), Some(p 13 "Zverev"), Some 12, Some "finished"); fin ]
          ok

      // The other half of the split, and the one a construction law would have
      // got wrong. A Semifinals round holding ONE match is off canonical size —
      // and five of the six real slam editions read on 2026-09-06 are
      // off-canonical somewhere. It must BUILD.
      Verify.check "a round short of its size still builds — it is reported, not refused"
          (fun rows -> Draw.build "t" "2026" rows |> Result.isOk)
          // One semi-final where two belong: an INNER round short by one, which
          // is exactly Toronto 2025's Round of 32 = 15.
          [ (1, Draw.Quarterfinals, Some(p 10 "Alcaraz"), Some(p 11 "Djokovic"), Some 10, Some "finished")
            (2, Draw.Quarterfinals, Some(p 12 "Sinner"), Some(p 13 "Zverev"), Some 12, Some "finished")
            (3, Draw.Quarterfinals, Some(p 14 "Medvedev"), Some(p 15 "Rune"), Some 14, Some "finished")
            (4, Draw.Quarterfinals, Some(p 16 "Ruud"), Some(p 17 "Fritz"), Some 16, Some "finished")
            (5, Draw.Semifinals, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished")
            (7, Draw.Final, Some(p 10 "Alcaraz"), Some(p 14 "Medvedev"), Some 10, Some "finished") ]
          // Nothing builds from nothing, which is the only way this predicate
          // can be made to fail without breaking the very law it asserts.
          []

      // ...and having built, it says so. A draw that quietly returned an empty
      // anomaly list would satisfy the row above while hiding the thing the row
      // above exists to permit.
      Verify.check "...and the short INNER round is REPORTED on the built draw"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Ok d -> Draw.roundsOffCanonicalSize d |> List.exists (fun (r, have, want) ->
                            r = "Semifinals" && have = 1 && want = 2)
              | Error _ -> false)
          [ (1, Draw.Quarterfinals, Some(p 10 "Alcaraz"), Some(p 11 "Djokovic"), Some 10, Some "finished")
            (2, Draw.Quarterfinals, Some(p 12 "Sinner"), Some(p 13 "Zverev"), Some 12, Some "finished")
            (3, Draw.Quarterfinals, Some(p 14 "Medvedev"), Some(p 15 "Rune"), Some 14, Some "finished")
            (4, Draw.Quarterfinals, Some(p 16 "Ruud"), Some(p 17 "Fritz"), Some 16, Some "finished")
            (5, Draw.Semifinals, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished")
            (7, Draw.Final, Some(p 10 "Alcaraz"), Some(p 14 "Medvedev"), Some 10, Some "finished") ]
          // The same one-semi-final shape with the quarter-finals removed. Now
          // Semifinals IS the entry round, holds whoever did not get a bye, and
          // has nothing to be short of. This row went red when that rule
          // landed, on this exact input — which is the rule working, not the
          // row: the old input asserted that an entry round reports.
          [ sf1; (3, Draw.Final, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished") ]

      // US Open Men 2025 serves 31 second-round matches where 32 exist, so a
      // player reaches Round of 32 without a winning row behind them. Real, and
      // therefore a question rather than a refusal.
      Verify.check "a player who appears without winning the round before is reported"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Ok d -> Draw.playersFromNowhere d |> List.exists (fun (pid, r) -> pid = 14 && r = "Final")
              | Error _ -> false)
          // Medvedev is in the final having played no semi-final.
          [ sf1; sf2; (3, Draw.Final, Some(p 10 "Alcaraz"), Some(p 14 "Medvedev"), None, Some "scheduled") ]
          ok

      // The champion is the Final's winner, read from the Final. A draw still
      // being played has no champion, and None is the answer rather than a
      // name-shaped placeholder.
      Verify.check "the champion is the winner OF THE FINAL, and is None while it is unplayed"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Ok d -> Draw.champion d |> Option.map (fun p -> p.Name) = Some "Alcaraz"
              | Error _ -> false)
          ok
          // The same draw with the final unplayed. Alcaraz has still won a
          // semi-final, so a champion read from "whoever won most" or from the
          // last row would answer Alcaraz here.
          [ sf1; sf2; (3, Draw.Final, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), None, Some "scheduled") ]

      // Edges are the product. Two semi-finals feeding one final is two edges,
      // and the final feeds nothing — the champion is not an edge.
      Verify.check "every completed match feeds exactly one edge, and the final feeds none"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Ok d -> Draw.edgePairs d |> List.sort = [ (1, 3, 10); (2, 3, 12) ]
              | Error _ -> false)
          ok
          // The final marked as feeding onward would be a third edge. It cannot
          // be expressed as a Final row, so the mutation is the shape that
          // WOULD produce one: a semi-final whose winner is not in the final.
          [ sf1
            (2, Draw.Semifinals, Some(p 12 "Sinner"), Some(p 13 "Zverev"), Some 13, Some "finished")
            fin ]

      // A qualifying round is not a round of the draw. The relay excludes them;
      // this is the second lock. A row carrying one must fail the decode rather
      // than be dropped, because a dropped row makes a payload with qualifying
      // in it build a clean-looking draw.
      Verify.check "a round name outside the draw fails the decode, it is not dropped"
          (fun json ->
              match Draw.decodeResponse json with
              | Error(Draw.UnknownRound n) -> n = "Qualification Final"
              | _ -> false)
          """{"tournament":{"name":"US Open, Men"},"season":"2025","nodes":[
             {"id":1,"round":"Qualification Final","p1":{"id":1,"name":"A"},"p2":{"id":2,"name":"B"},"winnerId":1}]}"""
          """{"tournament":{"name":"US Open, Men"},"season":"2025","nodes":[
             {"id":1,"round":"Final","p1":{"id":1,"name":"A"},"p2":{"id":2,"name":"B"},"winnerId":1}]}"""

      // A 96-draw Masters: 32 players get a bye, so the first round holds 32
      // matches where a 128 ladder says 64. Measured against the relay on
      // 2026-09-06 — nine of ten masters_1000 ids were flagged on their entry
      // round and not one was missing a match.
      Verify.check "the ENTRY round's size is never off-canonical, whatever the draw"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Ok d -> Draw.roundsOffCanonicalSize d |> List.isEmpty
              | Error _ -> false)
          // A Masters shape in miniature: an entry round of ONE match where
          // Semifinals says two, feeding a final. Under the old rule this
          // reported Semifinals=1 want 2.
          [ (1, Draw.Semifinals, Some(p 10 "Alcaraz"), Some(p 11 "Djokovic"), Some 10, Some "finished")
            (3, Draw.Final, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished") ]
          // ...and an INNER round short by one still reports. Toronto 2025
          // serves Round of 32 = 15 where 16 belong, and that is a match the
          // vendor does not have. Two semi-finals, one quarter-final: the QF is
          // the entry round and exempt, the SF is inner and one short of two.
          [ (1, Draw.Quarterfinals, Some(p 10 "Alcaraz"), Some(p 11 "Djokovic"), Some 10, Some "finished")
            (2, Draw.Quarterfinals, Some(p 12 "Sinner"), Some(p 13 "Zverev"), Some 12, Some "finished")
            (3, Draw.Quarterfinals, Some(p 14 "Medvedev"), Some(p 15 "Rune"), Some 14, Some "finished")
            (4, Draw.Quarterfinals, Some(p 16 "Ruud"), Some(p 17 "Fritz"), Some 16, Some "finished")
            (5, Draw.Semifinals, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished")
            (7, Draw.Final, Some(p 10 "Alcaraz"), Some(p 14 "Medvedev"), Some 10, Some "finished") ]

      // The mirror. A draw still being played is filling its innermost round,
      // and that round's size is not a fact about it yet. Found on the live
      // page minutes after the entry-round rule shipped: US Open Women 2026
      // served Quarterfinals=1 and the page said three were missing.
      Verify.check "the innermost round of an UNFINISHED draw is not off-canonical"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Ok d -> Draw.roundsOffCanonicalSize d |> List.isEmpty
              | Error _ -> false)
          // Four quarter-finals and ONE semi-final, no final at all: the
          // semi-final round is still being played.
          [ (1, Draw.Quarterfinals, Some(p 10 "Alcaraz"), Some(p 11 "Djokovic"), Some 10, Some "finished")
            (2, Draw.Quarterfinals, Some(p 12 "Sinner"), Some(p 13 "Zverev"), Some 12, Some "finished")
            (3, Draw.Quarterfinals, Some(p 14 "Medvedev"), Some(p 15 "Rune"), Some 14, Some "finished")
            (4, Draw.Quarterfinals, Some(p 16 "Ruud"), Some(p 17 "Fritz"), Some 16, Some "finished")
            (5, Draw.Semifinals, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished") ]
          // The same shape with the final PLAYED. The draw is finished, the
          // semi-final round is now interior, and one semi-final where two
          // belong is a match that does not exist — US Open Men 2025's Round of
          // 64 = 31 in miniature. It must still be found.
          [ (1, Draw.Quarterfinals, Some(p 10 "Alcaraz"), Some(p 11 "Djokovic"), Some 10, Some "finished")
            (2, Draw.Quarterfinals, Some(p 12 "Sinner"), Some(p 13 "Zverev"), Some 12, Some "finished")
            (3, Draw.Quarterfinals, Some(p 14 "Medvedev"), Some(p 15 "Rune"), Some 14, Some "finished")
            (4, Draw.Quarterfinals, Some(p 16 "Ruud"), Some(p 17 "Fritz"), Some 16, Some "finished")
            (5, Draw.Semifinals, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished")
            (7, Draw.Final, Some(p 10 "Alcaraz"), Some(p 14 "Medvedev"), Some 10, Some "finished") ]

      // A Final that EXISTS is not a Final that has been played. It is
      // scheduled before it is played, so the innermost exemption keys on the
      // WINNER, not on the round being present.
      Verify.check "a scheduled final does not make a draw complete"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Ok d -> not (Draw.isComplete d)
              | Error _ -> false)
          [ sf1; sf2
            (3, Draw.Final, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), None, Some "scheduled") ]
          ok

      // The entry round is the outermost one PRESENT, not Round of 128. Monte
      // Carlo and Paris start at Round of 64; Indian Wells, mid-tournament,
      // started at Round of 32.
      Verify.check "the entry round is the outermost round present, not a fixed one"
          (fun rows ->
              match Draw.build "t" "2026" rows with
              | Ok d -> Draw.entryRound d = Some Draw.Quarterfinals
              | Error _ -> false)
          [ (1, Draw.Quarterfinals, Some(p 10 "Alcaraz"), Some(p 11 "Djokovic"), Some 10, Some "finished")
            (5, Draw.Semifinals, Some(p 10 "Alcaraz"), Some(p 12 "Sinner"), Some 10, Some "finished") ]
          // A draw that starts a round earlier. If entryRound returned a fixed
          // round rather than the outermost present, both of these would answer
          // the same thing.
          [ (0, Draw.RoundOf16, Some(p 20 "A"), Some(p 21 "B"), Some 20, Some "finished")
            (1, Draw.Quarterfinals, Some(p 20 "A"), Some(p 11 "Djokovic"), Some 20, Some "finished")
            (5, Draw.Semifinals, Some(p 20 "A"), Some(p 12 "Sinner"), Some 20, Some "finished") ]

      // `pathOf` and `setScores` exist because a bracket prints both: which
      // matches a player appeared in, and what the scores were. Neither had a
      // caller until these rows, and `check:unused` said so by name.
      //
      // The champion's path is the draw's spine — one match per round, every
      // one won, in order.
      Verify.check "the champion's path is one match per round, all won, in order"
          (fun json ->
              match Draw.decodeResponse json with
              | Error _ -> false
              | Ok d ->
                  match Draw.champion d with
                  | None -> false
                  | Some c ->
                      let path = Draw.pathOf d c.Id
                      // Seven rounds, every one a win, and no round twice —
                      // which is the premise the whole winner-join rests on.
                      List.length path = List.length (Draw.roundsPresent d)
                      && path |> List.forall (fun (_, _, won) -> won)
                      && (path |> List.map (fun (_, r, _) -> r) |> List.distinct |> List.length)
                         = List.length path)
          (Fixtures.tennisDraw ())
          // A two-match draw where the "champion" lost their semi-final: the
          // final's winner never played the round before it. Decodes cleanly,
          // and no path through it is all wins.
          """{"tournament":{"name":"x"},"season":"2026","nodes":[
             {"id":1,"round":"Semifinals","p1":{"id":10,"name":"A"},"p2":{"id":11,"name":"B"},"winnerId":11},
             {"id":3,"round":"Final","p1":{"id":10,"name":"A"},"p2":{"id":11,"name":"B"},"winnerId":10}]}"""

      // Every completed set of the real capture is a score a set can end on.
      // Guaranteed by construction — `completedSet` is the only way to build
      // one — so this is the guarantee being READ BACK rather than a new claim,
      // and it is what gives `setScores` and `completedPair` a consumer.
      Verify.check "every completed set read back from a real slam is a legal set score"
          (fun json ->
              let ms = Tennis.decodeDrawNodes json
                       |> List.choose (fun r -> match r with Ok m -> Some m | Error _ -> None)
              let legal (a, b) =
                  let hi = max a b
                  let lo = min a b
                  (hi = 6 && lo <= 4) || (hi = 7 && (lo = 5 || lo = 6))
              not (List.isEmpty ms)
              && ms |> List.forall (fun m -> Tennis.setScores m |> List.forall legal)
              // ...and it read something. `forall` on a match with no completed
              // sets is vacuous, and a retirement in the first set has none.
              //
              // MORE SETS THAN MATCHES, which is true of any real tennis — the
              // shortest completed match is two sets — and false of a read that
              // returned nothing. The first version of this line said `> 300`,
              // a number picked by eye; the capture holds 284 completed sets
              // across 126 matches and the row went red. A floor guessed from
              // the shape of the data is a floor that fails on the next capture.
              && ms |> List.sumBy (fun m -> List.length (Tennis.setScores m))
                 > List.length ms)
          (Fixtures.tennisDraw ())
          // Every set corrupted to 9-n. If `setScores` returned the abandoned
          // or live set alongside the completed ones, this is where it would
          // show — those are exactly the scores that are not legal set scores.
          (Fixtures.tennisDrawSetCorrupted ())

      // ── the real capture ───────────────────────────────────────────────
      //
      // Roland Garros WTA 2026, 127 main-draw matches, captured from the
      // deployed relay. The eleven rows above use four-player mini draws so
      // their mutations stay readable; this is the one that proves the module
      // decodes an actual slam.
      Verify.check "A REAL SLAM DRAW DECODES AND BUILDS"
          (fun json -> Draw.decodeResponse json |> Result.isOk)
          (Fixtures.tennisDraw ())
          // The same capture with one match's round renamed to a qualifying
          // round. The mutation derives its anchor from the file rather than
          // naming a value in it — see (Fixtures.tennisDrawCorrupted ()), and the
          // NO TEETH the tennis fixture row earned for doing the opposite.
          (Fixtures.tennisDrawCorrupted ())

      // A capture that decoded to a one-match draw would satisfy the row above
      // while proving nothing about seven rounds. Not a fixed count: the
      // capture workflow can be pointed at a different edition, and a suite
      // coupled to the CONTENTS of a file a workflow rewrites turns a working
      // recapture into a red run. What the row needs is that the ladder is a
      // full one.
      Verify.check "...and it is a WHOLE draw — seven rounds, not one match"
          (fun json ->
              match Draw.decodeResponse json with
              | Ok d -> List.length (Draw.roundsPresent d) = 7 && Draw.matchCount d >= 127
              | Error _ -> false)
          (Fixtures.tennisDraw ())
          // A final and nothing else: decodes cleanly, and is not a draw.
          """{"tournament":{"name":"x"},"season":"2026","nodes":[
             {"id":1,"round":"Final","p1":{"id":1,"name":"A"},"p2":{"id":2,"name":"B"},"winnerId":1}]}"""

      // 126 edges from 127 matches: every match feeds the next except the
      // final. This is the product of the whole module and the number the
      // relay's own verify run re-derives independently.
      Verify.check "every match of the real draw but the final feeds exactly one edge"
          (fun json ->
              match Draw.decodeResponse json with
              | Ok d -> Draw.edgeCount d = Draw.matchCount d - 1
              | Error _ -> false)
          (Fixtures.tennisDraw ())
          // A draw whose semi-final winner never reaches the final: three
          // matches, one edge, and matchCount - 1 is two.
          """{"tournament":{"name":"x"},"season":"2026","nodes":[
             {"id":1,"round":"Semifinals","p1":{"id":10,"name":"A"},"p2":{"id":11,"name":"B"},"winnerId":10},
             {"id":2,"round":"Semifinals","p1":{"id":12,"name":"C"},"p2":{"id":13,"name":"D"},"winnerId":12},
             {"id":3,"round":"Final","p1":{"id":10,"name":"A"},"p2":{"id":99,"name":"E"},"winnerId":10}]}"""

      // The real draw is canonical, which is what makes it the right capture:
      // it is the one edition of the three the relay verifies where nothing is
      // off size. A row asserting the OPPOSITE would be satisfied by any draw
      // at all, so this asserts the empty list and falsifies with a real one.
      Verify.check "the captured draw is canonical in every round after the entry round"
          (fun json ->
              match Draw.decodeResponse json with
              | Ok d -> Draw.roundsOffCanonicalSize d |> List.isEmpty
              | Error _ -> false)
          (Fixtures.tennisDraw ())
          // An INNER round short by one — four quarter-finals and a single
          // semi-final. The first version of this row used a lone semi-final
          // and a final, which the entry-round rule made exempt: the row went
          // NO TEETH the moment that rule landed, and said so.
          """{"tournament":{"name":"x"},"season":"2026","nodes":[
             {"id":1,"round":"Quarterfinals","p1":{"id":10,"name":"A"},"p2":{"id":11,"name":"B"},"winnerId":10},
             {"id":2,"round":"Quarterfinals","p1":{"id":12,"name":"C"},"p2":{"id":13,"name":"D"},"winnerId":12},
             {"id":3,"round":"Quarterfinals","p1":{"id":14,"name":"E"},"p2":{"id":15,"name":"F"},"winnerId":14},
             {"id":4,"round":"Quarterfinals","p1":{"id":16,"name":"G"},"p2":{"id":17,"name":"H"},"winnerId":16},
             {"id":5,"round":"Semifinals","p1":{"id":10,"name":"A"},"p2":{"id":12,"name":"C"},"winnerId":10},
             {"id":7,"round":"Final","p1":{"id":10,"name":"A"},"p2":{"id":14,"name":"E"},"winnerId":10}]}"""

      // The relay's field names, not BSD's. The relay maps short_name to
      // shortName and current_ranking.position to rank before this sees a row,
      // and `rank` is a RANKING — there is no seed field anywhere on a BSD
      // tennis row or player, measured 2026-09-06.
      Verify.check "the relay's payload decodes, rank included"
          (fun json ->
              match Draw.decodeResponse json with
              | Ok d ->
                  Draw.champion d
                  |> Option.map (fun p -> p.Name, p.Rank)
                  |> (=) (Some("Alcaraz", Some 2))
              | Error _ -> false)
          """{"tournament":{"name":"US Open, Men"},"season":"2025","nodes":[
             {"id":3,"round":"Final","p1":{"id":10,"name":"Alcaraz","shortName":"C. Alcaraz","countryCode":"ES","rank":2},
              "p2":{"id":12,"name":"Sinner","shortName":"J. Sinner","countryCode":"IT","rank":1},
              "winnerId":10,"status":"finished"}]}"""
          // The same payload with rank absent. A decoder that defaulted a
          // missing rank to a number would pass this.
          """{"tournament":{"name":"US Open, Men"},"season":"2025","nodes":[
             {"id":3,"round":"Final","p1":{"id":10,"name":"Alcaraz"},
              "p2":{"id":12,"name":"Sinner"},"winnerId":10,"status":"finished"}]}"""
    ]

/// Everything, in one list. Order is presentation only.
/// The suite, in named groups.
///
// ---------------------------------------------------------------------------
// The forecaster. Provenance is a case, so the counterexample for every one of
// these is a DIFFERENT case rather than a different number — which is the
// property `docs/FORECAST-PROOF.md` proves at the compiler and these prove at
// runtime.
// ---------------------------------------------------------------------------

let private forecast () =
    let club name played points gf ga = Forecast.makeRow name name played points gf ga 0
    let strong = club "Strong" 5 15 13 5
    let weak = club "Weak" 5 2 3 11
    let priced f = match f with | Forecast.Modelled _ -> true | _ -> false
    let reason f = match f with | Forecast.NoForecast r -> Some r | _ -> None
    let home f = match f with | Forecast.Modelled m -> float (Market.threeWayHome m.Market) | _ -> nan
    let away f = match f with | Forecast.Modelled m -> float (Market.threeWayAway m.Market) | _ -> nan
    let draw f = match f with | Forecast.Modelled m -> float (Market.threeWayDraw m.Market) | _ -> nan
    let at (h: Forecast.TableRow) (a: Forecast.TableRow) = Forecast.forecastFor (Some 6) (Some h) (Some a)
    let obs tag = { Forecast.Subject = "fx"; Forecast.Forecast = Forecast.unscheduled; Forecast.ObservedAt = tag }

    [ // FPL's `event: null`. The counterexample is the OTHER refusal, not a
      // number: reading an unscheduled fixture as a failed join sends a reader
      // to the matcher when the answer is in the fixture list.
      Verify.check "an unscheduled fixture is FixtureUnscheduled, never a failed join"
          (fun event ->
              let f = Forecast.forecastFor event (Some strong) (Some weak)
              reason f = Some Forecast.FixtureUnscheduled)
          None
          (Some 6)

      // The mirror. The abbreviation join fails on two real clubs, so this
      // distinction decides whether a reader looks at FPL or at the matcher.
      Verify.check "a club missing from the table is SubstrateUnreachable, not unscheduled"
          (fun (h: Forecast.TableRow option) ->
              let f = Forecast.forecastFor (Some 6) h (Some weak)
              reason f = Some Forecast.SubstrateUnreachable)
          None
          (Some strong)

      // A promoted club before a ball is kicked. Played = 0 is not strength 0.
      Verify.check "a club that has played nothing yields no rating and no forecast"
          (fun played -> Forecast.rating (club "New" played 0 0 0) = None)
          0
          5

      Verify.check "a scheduled fixture with both clubs joined is priced"
          (fun (h, a) -> priced (at h a))
          (strong, weak)
          (club "Nil" 0 0 0 0, weak)

      // Direction. The counterexample is the same fixture REVERSED, so a model
      // that ignored its inputs entirely would fail rather than pass twice.
      Verify.check "the stronger club at home is favoured over the weaker visitor"
          (fun (h, a) ->
              let f = at h a
              home f > away f)
          (strong, weak)
          (weak, strong)

      // THE SHAPE A TWO-WAY MODEL CANNOT EXPRESS, and the reason
      // `Market.threeWay` exists: a mismatch has fewer draws than a level tie.
      Verify.check "the draw share shrinks as the gap widens"
          (fun (h, a) ->
              let level = draw (at strong strong)
              draw (at h a) < level)
          (strong, weak)
          (strong, strong)

      // A deduction is carried, and the question it raises is surfaced rather
      // than answered by guessing which reading of `points` ESPN serves.
      Verify.check "a club carrying a points deduction is named, not silently modelled"
          (fun d ->
              let rows = [ Forecast.makeRow "D" "D" 5 10 8 4 d ]
              Forecast.deductionsUnsettled rows = [ "D" ])
          (-6)
          0

      // THE FIRST RUN IS NOT AN UNCHANGED ONE. The counterexample is a real
      // prior, so a diff that always said NoPrior would fail here.
      Verify.check "a first observation reports no prior, never Unchanged"
          (fun (prior: Forecast.Observation option) ->
              let ctx = { Forecast.ResultSince = None; Forecast.ModelNote = None }
              Forecast.diff prior (obs "t1") ctx = Forecast.NoPrior)
          None
          (Some (obs "t0"))

      // OUR CHANGE OUTRANKS REALITY'S. If the model moved, attributing the
      // delta to a played match is the error ModelRevised exists to stop, so
      // the counterexample supplies a result and no model note.
      Verify.check "a model revision outranks a result when both are true"
          (fun (note, result) ->
              let ctx = { Forecast.ResultSince = result; Forecast.ModelNote = note }
              match Forecast.diff (Some (obs "t0")) (obs "t1") ctx with
              | Forecast.Delta (Forecast.ModelRevised _) -> true
              | _ -> false)
          (Some "table-v2", Some "fx-1")
          (None, Some "fx-1") ]

/// ADDED FOR THE PAGE, and the flat `all` below is now DERIVED from it rather
/// than assembled a second time. Two lists of the same eleven bindings would be
/// two places to forget one, and forgetting one is not a compile error — it is a
/// suite that runs 137 rows and reports 137/137, which is the arithmetic this
/// repo already has a scar from.
/// FUNCTIONS, not values, all the way down — and this is not a style choice.
///
/// A group's rows carry their inputs, and the tennis and draw inputs are
/// `Fixtures.tennisDraw ()` and friends. A module-level `let zone = [ ... ]`
/// evaluates when the module is IMPORTED, and ES module imports are hoisted:
/// under node that is before `FixturesNode.loadAll ()` in `VerifyMain`'s body,
/// and in a browser it is before any fetch has resolved. Either way the suite
/// would throw while building itself, naming a fixture nobody had loaded yet.
///
/// So nothing here is built until a caller asks, by which time a host has filled
/// the registry.
// ---------------------------------------------------------------------------
// Lineups. Seven answers to one request, and the thing being asserted is that
// they stay seven.
//
// Every MustFail here is a DIFFERENT CASE OF THE SAME TYPE rather than
// malformed input, which is the only way these checks have teeth: the failure
// mode this guards against is not a decoder that throws, it is a decoder that
// quietly resolves a non-answer to a sheet. So "an empty sheet is not a missing
// one" is checked by handing it the missing one and requiring the predicate to
// refuse — not by handing it nonsense.
// ---------------------------------------------------------------------------

let private lineups () =
    // Inline rather than read from data/lineups-*.json ON PURPOSE. Those two
    // files are rewritten by capture-lineups-fixture.yml every time it runs, and
    // src/Fixtures.fs records what happens to a check anchored on a captured
    // value: the tennis suite dropped 119 -> 117 when a recapture changed a
    // scoreline the assertions named. The bodies below are the SHAPES, which are
    // the contract; the captures exercise the real bytes in the render check.
    let served = """{"lineups":{"home":{"team_name":"H","formation":"4-4-2","confidence":0.8,"players":[{"name":"A","position":"G","jersey_number":1,"ai_score":0.7}],"substitutes":[]},"away":{"team_name":"A","players":[{"name":"B"}],"substitutes":[]}}"""
    let body status = sprintf """%s,"lineup_status":%s}""" served status
    let predicted = body "\"predicted\""
    let confirmed = body "\"confirmed\""
    let unstated = served + "}"
    let nulled = body "null"
    let blankStatus = body "\"\""
    let unknown = body "\"probable\""
    let emptySheet = """{"lineups":{},"lineup_status":"predicted"}"""
    let noKey = """{"lineup_status":"predicted"}"""
    let nullSheet = """{"lineups":null,"lineup_status":"predicted"}"""
    let garbage = """{"lineups":{"home":"""
    // A name on the sheet AND on the injury list, and the same shape without it.
    let clash =
        """{"lineup_status":"confirmed","lineups":{"home":{"team_name":"H","players":[{"name":"A"}],"substitutes":[]},"away":{"team_name":"A","players":[{"name":"B"}],"substitutes":[]}},"unavailable_players":{"home":[{"name":"A","status":"injured","reason":"Knee Injury"}],"away":[]}}"""
    let noClash =
        """{"lineup_status":"confirmed","lineups":{"home":{"team_name":"H","players":[{"name":"A"}],"substitutes":[]},"away":{"team_name":"A","players":[{"name":"B"}],"substitutes":[]}},"unavailable_players":{"home":[{"name":"Z","status":"injured","reason":"Knee Injury"}],"away":[]}}"""
    let clashUnstated =
        """{"lineups":{"home":{"team_name":"H","players":[{"name":"A"}],"substitutes":[]},"away":{"team_name":"A","players":[{"name":"B"}],"substitutes":[]}},"unavailable_players":{"home":[{"name":"A","status":"injured","reason":"Knee Injury"}],"away":[]}}"""

    let answerOf (json: string) = (Lineups.fromString json).Answer

    /// A real decoded side, so a `Sheet` can be constructed for the
    /// standings-iteration check below without hand-building a record.
    let aSide =
        match Lineups.sidesOf (answerOf predicted) with
        | Some(h, _) -> h
        | None -> failwith "the predicted fixture body must decode to two sides"

    let isPredictedSheet json =
        match answerOf json with
        | Lineups.Sheet(Lineups.Standing.Predicted, _, _) -> true
        | _ -> false

    let isConfirmedSheet json =
        match answerOf json with
        | Lineups.Sheet(Lineups.Standing.Confirmed, _, _) -> true
        | _ -> false

    let isAnySheet json =
        match answerOf json with
        | Lineups.Sheet _ -> true
        | _ -> false

    let is (expected: Lineups.Answer) json = answerOf json = expected

    [ // --- the two answers ------------------------------------------------
      Verify.check "a predicted body decodes as a PREDICTED sheet" isPredictedSheet predicted confirmed
      Verify.check "a confirmed body decodes as a CONFIRMED sheet" isConfirmedSheet confirmed predicted

      // --- the five non-answers, each refusing a different neighbour ------
      //
      // THE ONE THAT MATTERS MOST. `status-unrecognised` is the non-answer the
      // commissioning document does not name — it lists three. A decoder built
      // to three falls through on the fourth, and falling through means drawing
      // the sheet under whichever standing the fall-through lands on. A sheet
      // drawn as confirmed over a status nobody has seen is the fabrication the
      // document exists to prevent.
      Verify.check "an unrecognised status is NOT a sheet of a known kind"
          (fun json -> not (isAnySheet json))
          unknown
          predicted

      Verify.check "an unrecognised status KEEPS THE WORD, so the page can name it"
          (fun json ->
              match answerOf json with
              | Lineups.SheetOfUnknownKind(s, _, _) -> s = "probable"
              | _ -> false)
          unknown
          unstated

      Verify.check "an absent status is UNSTATED, never predicted"
          (fun json ->
              match answerOf json with
              | Lineups.SheetOfUnstatedKind _ -> true
              | _ -> false)
          unstated
          predicted

      Verify.check "a NULL status is unstated too, not a sheet"
          (fun json ->
              match answerOf json with
              | Lineups.SheetOfUnstatedKind _ -> true
              | _ -> false)
          nulled
          confirmed

      Verify.check "an EMPTY-STRING status is unstated as well — the third of Rule 99's four"
          (fun json ->
              match answerOf json with
              | Lineups.SheetOfUnstatedKind _ -> true
              | _ -> false)
          blankStatus
          predicted

      // --- the three fills that are not a sheet ---------------------------
      //
      // Each MustFail is one of the OTHER two, so none of these can pass by
      // being generically "not a sheet".
      Verify.check "an EMPTY lineups object is served-empty, not a missing key"
          (is Lineups.ServedEmpty)
          emptySheet
          noKey

      Verify.check "a MISSING lineups key is not-in-payload, not served-empty"
          (is Lineups.NotInPayload)
          noKey
          emptySheet

      Verify.check "an explicit NULL lineups is its own case, not served-empty"
          (is Lineups.ExplicitlyNull)
          nullSheet
          emptySheet

      Verify.check "...and not a missing key either"
          (is Lineups.ExplicitlyNull)
          nullSheet
          noKey

      // --- the failure -----------------------------------------------------
      //
      // A body that will not parse means the state is UNKNOWN. Rendering it as
      // an empty sheet tells the reader nobody has been named, which the payload
      // never said.
      Verify.check "a body that does not decode is UPSTREAM FAILED, not an empty sheet"
          (fun json ->
              match answerOf json with
              | Lineups.UpstreamFailed _ -> true
              | _ -> false)
          garbage
          emptySheet

      // --- the seven sentences differ -------------------------------------
      //
      // Task 3: the non-answers "must not render as a thin team sheet" and they
      // are not each other. If two of these ever collapse to the same string,
      // two different facts are being reported identically, which is the defect
      // in a different place.
      Verify.check "ALL SEVEN HEADLINES ARE DISTINCT"
          (fun (answers: Lineups.Answer list) ->
              let said = answers |> List.map Lineups.headline
              List.length (List.distinct said) = List.length said)
          [ answerOf predicted
            answerOf confirmed
            answerOf unstated
            answerOf unknown
            answerOf emptySheet
            answerOf noKey
            answerOf nullSheet ]
          [ answerOf predicted; answerOf predicted ]

      // None of the seven may say the phrase the relay's own source forbids.
      //
      // THIS CHECK FAILED ON ITS FIRST RUN, on the code it was written against,
      // and it is the reason `headline` no longer interpolates anything into
      // the failure sentence. The original wrote the upstream detail into its
      // prose, so `UpstreamFailed "no lineup announced"` produced a page that
      // said the phrase in its own voice — through a field the page does not
      // control. The sentences are fixed text now and the detail is a separate
      // diagnostic line.
      //
      // The predicate takes SENTENCES rather than answers so it has a
      // counterexample at all: once the sentences are fixed, no `Answer` can
      // produce the phrase, and a check with no reachable failure is the
      // toothless shape this harness refuses.
      Verify.check "NO headline says \"no lineup announced\""
          (fun (said: string list) ->
              said |> List.forall (fun t -> not (t.Contains "no lineup announced")))
          [ Lineups.headline (answerOf predicted)
            Lineups.headline (answerOf confirmed)
            Lineups.headline (answerOf unstated)
            Lineups.headline (answerOf unknown)
            Lineups.headline (answerOf emptySheet)
            Lineups.headline (answerOf noKey)
            Lineups.headline (answerOf nullSheet)
            Lineups.headline (Lineups.UpstreamFailed "no lineup announced") ]
          [ Lineups.headline (answerOf predicted)
            "the vendor reports no lineup announced for this fixture" ]

      // The specific defect, asserted directly: the upstream detail does not
      // reach the sentence.
      //
      // The assertion is "the detail does not APPEAR", which is weaker than
      // "the detail is not interpolated" for a detail that happens to be a
      // substring of the fixed wording — which is exactly what the MustFail
      // below is, and why it fails. That boundary is stated rather than left
      // for a reader to discover.
      Verify.check "an upstream detail does not reach the headline"
          (fun (detail: string) ->
              not ((Lineups.headline (Lineups.UpstreamFailed detail)).Contains detail))
          "the response did not decode: Expecting an object at $.lineups"
          "The request failed."

      // ...and it is still reported, in its own channel.
      Verify.check "the detail is REPORTED, in a diagnostic rather than in prose"
          (fun (a: Lineups.Answer) -> Option.isSome (Lineups.failureDetail a))
          (Lineups.UpstreamFailed "boom")
          (answerOf predicted)

      // A status is a token, not a sentence. The word survives so the page can
      // name what it refused; a sentence smuggled through the same field does
      // not survive intact.
      Verify.check "an unrecognised status survives as a TOKEN"
          (fun (raw: string) -> Lineups.safeToken raw = Some "probable")
          "probable"
          "probable lineup, per the vendor"

      Verify.check "a status with nothing token-shaped in it yields None, not an empty quote"
          (fun (raw: string) -> Option.isNone (Lineups.safeToken raw))
          "   ...   "
          "xi"

      // --- the mark is a property of the row ------------------------------
      Verify.check "a predicted sheet and a confirmed one carry DIFFERENT row marks"
          (fun (a: Lineups.Answer, b: Lineups.Answer) ->
              match Lineups.markFor a, Lineups.markFor b with
              | Some x, Some y -> x <> y
              | _ -> false)
          (answerOf predicted, answerOf confirmed)
          (answerOf predicted, answerOf predicted)

      Verify.check "an answer with no players has NO row mark rather than a default one"
          (fun (a: Lineups.Answer) -> Option.isNone (Lineups.markFor a))
          (answerOf emptySheet)
          (answerOf predicted)

      Verify.check "a sheet of unstated kind is marked as such, not as either answer"
          (fun (a: Lineups.Answer) -> Lineups.markFor a = Some Lineups.KindNotStated)
          (answerOf unstated)
          (answerOf confirmed)

      // THE TWO CHECKS ABOVE COMPARE CASES, AND THE PAGE PRINTS WORDS.
      //
      // That gap was not noticed by reading. It was found by mutation
      // (`lineups-mark-says-one-thing`): changing `markWord Announced` from
      // "confirmed" to "predicted" left every check above green, because
      // `Unannounced <> Announced` is still true — while every row of a
      // CONFIRMED team sheet rendered the word "predicted". Which is the
      // commissioning document's opening sentence, arrived at through the one
      // layer its checks were not looking at.
      //
      // So the word is asserted as well as the case. A mark is only a treatment
      // if what it prints differs.
      Verify.check "THE THREE MARKS PRINT THREE DIFFERENT WORDS"
          (fun (marks: Lineups.RowMark list) ->
              let words = marks |> List.map Lineups.markWord
              List.length (List.distinct words) = List.length words)
          [ Lineups.Unannounced; Lineups.Announced; Lineups.KindNotStated ]
          [ Lineups.Unannounced; Lineups.Announced; Lineups.Unannounced ]

      Verify.check "...and a predicted sheet's WORD is not a confirmed sheet's"
          (fun (a: Lineups.Answer, b: Lineups.Answer) ->
              match Lineups.markFor a, Lineups.markFor b with
              | Some x, Some y -> Lineups.markWord x <> Lineups.markWord y
              | _ -> false)
          (answerOf predicted, answerOf confirmed)
          (answerOf predicted, answerOf predicted)

      // The colours are the redundant channel and must not collapse either —
      // same failure one layer over.
      Verify.check "...and they resolve to different palette tokens"
          (fun (a: Lineups.Answer, b: Lineups.Answer) ->
              match Lineups.markFor a, Lineups.markFor b with
              | Some x, Some y -> Lineups.markSemantic x <> Lineups.markSemantic y
              | _ -> false)
          (answerOf predicted, answerOf confirmed)
          (answerOf predicted, answerOf predicted)

      // EVERY standing, iterated rather than spelled out. A third `Standing`
      // added without a distinct word would pass the pairwise check above,
      // which only knows about two.
      //
      // The predicate takes the list so it HAS a counterexample: the property
      // holds for every real `Standing`, so a predicate over `Standing` alone
      // could not be made to fail and would have no teeth.
      Verify.check "EVERY standing yields a mark, and no two standings share a word"
          (fun (standings: Lineups.Standing list) ->
              let words =
                  standings
                  |> List.map (fun st -> Lineups.markFor (Lineups.Sheet(st, aSide, aSide)))
                  |> List.choose id
                  |> List.map Lineups.markWord
              List.length words = List.length standings
              && List.length (List.distinct words) = List.length words)
          Lineups.allStandings
          [ Lineups.Standing.Predicted; Lineups.Standing.Predicted ]

      // `hasPlayers` and `markFor` are two functions over the same seven cases
      // and they must agree. Disagreement is either a marked sheet with nothing
      // to mark, or rows drawn with no mark on them — the second being the
      // failure this whole surface exists to prevent.
      //
      // Expectations are carried in the input so a wrong one is a real
      // counterexample, rather than a property no list of answers can violate.
      Verify.check "hasPlayers and markFor AGREE on all seven answers"
          (fun (pairs: (Lineups.Answer * bool) list) ->
              pairs
              |> List.forall (fun (a, expected) ->
                  Lineups.hasPlayers a = expected
                  && Option.isSome (Lineups.markFor a) = expected))
          [ answerOf predicted, true
            answerOf confirmed, true
            answerOf unstated, true
            answerOf unknown, true
            answerOf emptySheet, false
            answerOf noKey, false
            answerOf nullSheet, false
            Lineups.UpstreamFailed "boom", false ]
          [ answerOf predicted, true
            answerOf emptySheet, true ]

      // --- the name seal ---------------------------------------------------
      //
      // A nameless row renders as a player who has not been announced, which the
      // payload did not say. The MustFail is a real name: a predicate that
      // dropped everything would pass the first half and fail here.
      Verify.check "a BLANK name is dropped rather than rendered as an empty row"
          (fun (raw: string) -> Option.isNone (Lineups.tryPlayerName raw))
          "   "
          "Kristijan Kahlina"

      Verify.check "an empty name is dropped too"
          (fun (raw: string) -> Option.isNone (Lineups.tryPlayerName raw))
          ""
          "A"

      Verify.check "a player with no usable name does not shorten the sheet silently"
          (fun json ->
              match Lineups.playersSeen (answerOf json) with
              | Some(h, _) -> h = 1
              | None -> false)
          predicted
          emptySheet

      // --- the score is sealed ---------------------------------------------
      //
      // There is no formatter for a SealedScore, so "the number is not printed"
      // is a compile-time property and cannot be asserted at runtime. What CAN
      // be asserted is the thing the seal exists to enable: presence, used as
      // corroboration and nothing else.
      Verify.check "a predicted sheet's players carry a model score"
          (fun json ->
              match Lineups.sidesOf (answerOf json) with
              | Some(h, _) -> h.Players |> List.forall (fun p -> Lineups.isScored p.Score)
              | None -> false)
          predicted
          emptySheet

      // --- corroboration reports, never overrides --------------------------
      Verify.check "a CONFIRMED sheet still carrying model scores is reported as a disagreement"
          (fun (json: string) -> not (List.isEmpty (Lineups.disagreements(Lineups.fromString json))))
          confirmed
          predicted

      // The standing itself is NOT changed by the disagreement. The vendor's
      // statement stands; the note is for the reader.
      Verify.check "...and the standing is NOT rewritten by it"
          isConfirmedSheet
          confirmed
          predicted

      // --- a name on both lists --------------------------------------------
      //
      // NOT HYPOTHETICAL. data/lineups-confirmed.json names Idan Toklomati in
      // Charlotte FC's starting eleven and lists him under unavailable_players
      // as "injured · Knee Injury" — on a CONFIRMED sheet, the kind this page
      // tells the reader is the names as submitted. Both halves rendered, side
      // by side, and nothing said so.
      //
      // The MustFail is the SAME SHAPE with a different name on the injury
      // list, so the check cannot pass by firing on any sheet that has an
      // unavailable list at all.
      Verify.check "A NAME ON THE SHEET AND ON THE INJURY LIST IS REPORTED"
          (fun (json: string) ->
              Lineups.disagreements (Lineups.fromString json)
              |> List.exists (fun n -> n.Contains "AND listed unavailable"))
          clash
          noClash

      // It is a fact about two lists, not about the standing, so it must fire
      // on a sheet whose kind the vendor never stated.
      Verify.check "...on a sheet of unstated kind too, where there is no standing to contradict"
          (fun (json: string) ->
              Lineups.disagreements (Lineups.fromString json)
              |> List.exists (fun n -> n.Contains "AND listed unavailable"))
          clashUnstated
          noClash

      // Reported, never resolved. Which half is wrong is the vendor's question
      // and dropping either would be this page answering it.
      Verify.check "...and NEITHER half is dropped — the player stays on the sheet"
          (fun (json: string) ->
              match Lineups.sidesOf (Lineups.fromString json).Answer with
              | Some(h, _) -> h.Players |> List.exists (fun p -> Lineups.playerName p.Name = "A")
              | None -> false)
          clash
          emptySheet

      Verify.check "...and stays on the injury list"
          (fun (json: string) ->
              (Lineups.fromString json).UnavailableHome
              |> List.exists (fun u -> Lineups.playerName u.Who = "A"))
          clash
          noClash ]

let groups () : (string * Verify.Sealed list) list =
    [ "Forecasts", forecast ()
      "Time zones", zone ()
      "Matchups", matchup ()
      "Grading", grading ()
      "Units", units ()
      "Game state", state ()
      "Weather", weather ()
      "Stats", stats ()
      "Routing", route ()
      "Team colours", teamTints ()
      "Tennis scorelines", tennis ()
      "Tennis draws", draw ()
      "Lineups", lineups () ]

/// The flat suite, DERIVED from the groups rather than assembled a second time.
/// Two lists of the same eleven bindings would be two places to forget one, and
/// forgetting one is not a compile error — it is a suite that runs 137 rows and
/// reports 137/137, which is arithmetic this repo already has a scar from.
let all () : Verify.Sealed list = groups () |> List.collect snd
