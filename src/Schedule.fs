module Schedule

open Thoth.Json

// Records and probable pitchers, from the MLB schedule endpoint.
//
// WHY THESE TWO ROWS WERE ABSENT UNTIL NOW
//
// `/context/date` carries neither. Its `standings` key is an empty array in
// both recorded captures, and there is no pitcher field at all. So laboratory
// rendered "missing name, ERA, W–L, arsenal" as UNRESOLVED — and that was the
// worse error, not the safer one. Production's own recorded fixture says:
//
//   "probablePitcher in schedule response has id/fullName/link only — stats
//    NOT embedded even with probablePitcher(stats) hydration"
//
// Three of those four fields do not exist in the payload production itself
// uses. Laboratory invented a requirement and then reported its own invention
// as missing data, which tells a reader something is absent when in fact nobody
// has it. A bare name is production's real output because a bare name is all
// there is.
//
// PRODUCTION'S RECORDS BUG, MADE UNREPRESENTABLE
//
// `src/legacy/field.js:31036` looks both teams up in a standings array by
// substring on nickname:
//
//   const hT = _tgStandings.find(t => (t.team||'').toLowerCase().includes(hSlug));
//   const aT = _tgStandings.find(t => (t.team||'').toLowerCase().includes(aSlug));
//   if (hT && aT) _tgStandingsStr = `...`;
//
// One unmatched nickname silently removes BOTH teams' records — the line is
// dropped whole. That failure needs a lookup to exist in order to happen, and
// here there is none: `leagueRecord` travels with the team inside the same
// object as its name, so there is nothing to match and nothing to fail.
//
// The record is a REQUIRED field of a side. A side that decodes has a record;
// a side without one does not decode. `if (hT && aT)` has no analogue because
// the half-populated state cannot be built.

/// A team's win–loss record, exactly as the schedule payload carries it.
type TeamRecord =
    private
        { Wins: int
          Losses: int
          Ties: int }

/// A probable starting pitcher.
///
/// A name and nothing else, on purpose — see the field note above. Private, so
/// nothing can construct one from an empty string and render a blank row where
/// a pitcher should be.
type ProbablePitcher = private ProbablePitcher of string

type SideEntry =
    private
        { Team: string
          Record: TeamRecord
          Pitcher: ProbablePitcher option }

type ScheduledGame =
    private
        { Venue: string
          Home: SideEntry
          Away: SideEntry }

let pitcherName (ProbablePitcher n) : string = n

/// "64–57", or "64–57–1" when there are ties.
///
/// An en dash, matching production's own render. `pct` is deliberately NOT
/// carried: the payload stores it beside wins and losses, and it holds no fact
/// those two do not — 43/(43+39) = .524 and 39/(39+46) = .459 are exactly what
/// the capture stores. That is the same three-fields-two-facts shape removed
/// from the umpire table, and it is removed here for the same reason.
let recordText (r: TeamRecord) : string =
    if r.Ties = 0 then sprintf "%d–%d" r.Wins r.Losses
    else sprintf "%d–%d–%d" r.Wins r.Losses r.Ties

let teamOf (s: SideEntry) : string = s.Team
let recordOf (s: SideEntry) : TeamRecord = s.Record
let pitcherOf (s: SideEntry) : ProbablePitcher option = s.Pitcher
let homeOf (g: ScheduledGame) : SideEntry = g.Home
let awayOf (g: ScheduledGame) : SideEntry = g.Away
let venueOf (g: ScheduledGame) : string = g.Venue

// --- decoding ----------------------------------------------------------------

/// `ties` is REQUIRED, not defaulted to zero.
///
/// A default would be a fallback, and the failure it hides is the one this repo
/// keeps finding: a field that quietly reads as zero is indistinguishable from a
/// field that is genuinely zero. The capture carries it, so requiring it means a
/// payload that stops carrying it fails loudly instead of reporting every team
/// as tie-free.
let private recordDecoder : Decoder<TeamRecord> =
    Decode.object (fun get ->
        { Wins = get.Required.Field "wins" Decode.int
          Losses = get.Required.Field "losses" Decode.int
          Ties = get.Required.Field "ties" Decode.int })

/// An empty name is rejected rather than wrapped.
///
/// `ProbablePitcher ""` would render as a row with a label and no pitcher —
/// visually identical to a real one, and the reader could not tell. The type is
/// private precisely so this is the only door in.
let private pitcherDecoder : Decoder<ProbablePitcher> =
    Decode.field "fullName" Decode.string
    |> Decode.andThen (fun name ->
        if name.Trim() = "" then Decode.fail "probablePitcher.fullName is empty"
        else Decode.succeed (ProbablePitcher(name.Trim())))

let private sideDecoder : Decoder<SideEntry> =
    Decode.object (fun get ->
        { Team = get.Required.At [ "team"; "name" ] Decode.string
          Record = get.Required.Field "leagueRecord" recordDecoder
          // Optional, and genuinely so: a game whose starter has not been
          // announced has no `probablePitcher` key. That is an absent row, not
          // a malformed payload.
          Pitcher = get.Optional.Field "probablePitcher" pitcherDecoder })

let private gameDecoder : Decoder<ScheduledGame> =
    Decode.object (fun get ->
        { Venue = get.Required.At [ "venue"; "name" ] Decode.string
          Home = get.Required.At [ "teams"; "home" ] sideDecoder
          Away = get.Required.At [ "teams"; "away" ] sideDecoder })

/// BOTH SHAPES, EXPLICITLY.
///
/// The live endpoint nests games under `dates[].games`. Production's recorded
/// fixture flattens them to a top-level `games`, because it is a capture of the
/// normalised form rather than of the wire.
///
/// A decoder written against the fixture alone would pass every check in this
/// repo and fail on the very first live call — which is precisely the gap the
/// venue lookup was docked for, arriving one file later. Both are decoded, and
/// the suite exercises the nested form by wrapping the real capture's game in a
/// `dates` envelope, so the two paths are proven against the same real data.
let private gamesDecoder : Decoder<ScheduledGame list> =
    Decode.oneOf
        [ Decode.field "games" (Decode.list gameDecoder)
          Decode.field "dates" (Decode.list (Decode.field "games" (Decode.list gameDecoder)))
          |> Decode.map List.concat ]

let decodeSchedule (json: string) : Result<ScheduledGame list, string> =
    Decode.fromString gamesDecoder json

// --- joining to the slate ----------------------------------------------------

/// Find the scheduled game played at a venue.
///
/// Matched on VENUE IDENTITY rather than on the venue string, because the two
/// payloads use different vocabularies for the same stadium — `/context/date`
/// says "Yankee Stadium" and statsapi says "Oriole Park at Camden Yards". Both
/// resolve through the alias table, so this is the same join the PARK row uses
/// and it inherits the same thirty-of-thirty coverage.
///
/// Team names cannot do this job: `/context/date` carries the nickname
/// ("Yankees") and statsapi the full name ("New York Yankees"), and bridging
/// those is the substring matching that loses production its records line.
///
/// A doubleheader puts two games at one venue, and this returns the first.
/// Recorded rather than solved: neither capture in this repo contains one, so a
/// second-game rule would be written against nothing.
let tryFindAtVenue (venue: string) (games: ScheduledGame list) : ScheduledGame option =
    match Scouting.tryParkByVenue venue with
    | None -> None
    | Some park ->
        games
        |> List.tryFind (fun g ->
            match Scouting.tryParkByVenue g.Venue with
            | Some other -> Scouting.venueOf other = Scouting.venueOf park
            | None -> false)

// --- fetching ----------------------------------------------------------------

open Fable.Core
open Fetch

/// The schedule URL for a FIELD day.
///
/// Exactly the hydration production's own recorded capture was taken with, down
/// to `probablePitcher(stats)` — kept even though the fixture's field note says
/// the stats are not embedded, because dropping it would silently change what is
/// being asked for and this repo has no capture of the un-hydrated response.
///
/// `sportId=1` is MLB. The date is a FIELD day, already resolved by the caller
/// through `FieldDay`, so this never asks for the UTC day during the four hours
/// when the two disagree.
let scheduleUrl (date: string) : string =
    sprintf
        "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=%s&hydrate=broadcasts(all),team,linescore,probablePitcher(stats),officials"
        date

/// Fetch and decode one day's schedule.
///
/// Every failure is a NAMED `Error`, never an empty list. An empty slate and an
/// unreachable endpoint are different facts, and collapsing them is the failure
/// that let the weather feature ship behind a flag saying it worked for three
/// days — a swallowed error read as "no data".
let fetchSlate (date: string) : JS.Promise<Result<ScheduledGame list, string>> =
    promise {
        try
            let! response = fetch (scheduleUrl date) []
            if not response.Ok then
                return Error(sprintf "statsapi answered %d" response.Status)
            else
                let! body = response.text ()
                return decodeSchedule body
        with e ->
            return Error(sprintf "the schedule request failed: %s" e.Message)
    }
