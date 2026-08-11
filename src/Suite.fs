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

/// Everything, in one list. Order is presentation only.
let all : Verify.Sealed list = zone @ matchup @ grading @ units @ state
