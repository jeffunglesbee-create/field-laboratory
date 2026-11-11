module LiveFeed

open Thoth.Json
open Desk
open LiveScore

// docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 6. The relay's GET /v2/games, read the way the laboratory reads it: the
// keys it needs, an error that says what was wrong, and a `LiveReading` for each card. Nothing here fetches or reads a clock.
//
// THE SHAPE, as served (a probe of ?sport=epl&date=2026-11-08 on 2026-11-11, five finished games): a body
// { sport, date, games: [ { id: "espn:401879240", espnEventId: "401879240", state: "final", start: "2026-11-08T16:30Z",
//   home: { name, abbr, score: 4 }, away: { ... }, clock: "90'+9'", periodNum: 0, periodLabel: "", situation: null,
//   matchEvents: [...], ... } ], count, source, ts }. A game that has not started reports `state: "pre"` with `score: 0` (an
// integer, NOT null) and `clock: "0'"`, so a score is never read without the state beside it. A game in PLAY was captured on
// 2026-11-11 (the 19:00Z EFL Trophy matches, `outbox/live-capture-efltrophy-2026-11-11-*.json`): `state: "live"`, integer scores, a clock string
// (`18'`, `45'+3'`), `periodNum`, and `situation` an object with `isHalftime`; at half time the state word stays `live`. The relay's
// `final` games carry `situation: null`. Not seen: stoppage time of the second half while live, extra time, a shootout. A state word
// this file does not know is a named reading, never a guess (see `readingFor`).
//
// JOINED BY ESPN EVENT ID, never by name: the archive says "Man Utd", the feed "Manchester United" (CC-CMD fact 4). The
// feed carries the id as its own key, `espnEventId`, and the lab already decodes `espn_event_id` from the archive row.

/// One game of the feed, reduced to what a card is told.
type FeedGame =
    { EspnEventId: string
      /// The feed's own word for the state, verbatim: `pre`, `live`, `final`, or something this file does not read.
      State: string
      HomeScore: int option
      AwayScore: int option
      /// The feed's clock text, verbatim, as served (`34'`, `90'+9'`); `None` when the key is absent or null.
      Clock: string option
      /// `situation.isHalftime`: the relay's own flag, true exactly when ESPN's status is `STATUS_HALFTIME` (relay `adaptESPNWCSoccer`). A game that is not live has `situation: null`,
      /// so absent, null and a null `situation` all read false; a value that is not a boolean is an error, as a string score is.
      IsHalftime: bool }

/// A score is a JSON NUMBER that is a whole number from 0 to the largest int32. `Decode.int` also reads the string "1" (and " 1") as 1, and the relay never serves one:
/// `adaptESPNWCSoccer` emits `Number(x)` or null, so a string means the relay's shape changed, and it is named, not coerced (the same strictness `Decode.string`
/// already has for the clock, the state and the id). Review 2026-11-11, decoder S7 and S11; `scripts/check-live-probe-keys.mjs` holds the probe's copy of this
/// decoder to the page's on one battery.
/// A negative score is refused too (fix-review 2026-11-11, decoder F6 and defence F24): no football score is negative, so one in a body means the relay's shape changed,
/// and `-1–0` drawn on a card would read as a score. The lower bound used to be the int32 minimum, which has no meaning in the domain and which nothing pinned.
let private wholeScore: Decoder<int> =
    Decode.float
    |> Decode.andThen (fun n ->
        if n = System.Math.Floor n && n >= 0.0 && n <= 2147483647.0 then
            Decode.succeed (int n)
        else
            Decode.fail (sprintf "Expecting a whole number from 0 that fits an int but instead got: %s" (string n)))

let private feedGameDecoder: Decoder<FeedGame> =
    Decode.object (fun get ->
        { EspnEventId = get.Required.Field "espnEventId" Decode.string
          State = get.Required.Field "state" Decode.string
          HomeScore = get.Optional.At [ "home"; "score" ] wholeScore
          AwayScore = get.Optional.At [ "away"; "score" ] wholeScore
          Clock = get.Optional.Field "clock" Decode.string
          IsHalftime = get.Optional.At [ "situation"; "isHalftime" ] Decode.bool |> Option.defaultValue false })

/// The games of a `/v2/games` body. A body with no `games` list, or a game with no `espnEventId` or no `state`, is an ERROR
/// that says so: the relay owns this contract, and a slate that quietly reads as empty would be a card saying nothing.
let decodeFeed (text: string) : Result<FeedGame list, string> =
    Decode.fromString (Decode.field "games" (Decode.list feedGameDecoder)) text

/// The path (and query) of the relay's live pull route for one sport key and one ET field day. The relay's default date is the
/// UTC day, which is the wrong day once the UTC date turns (19:00 Eastern in winter, 20:00 in summer), so the day is always passed.
let feedPath (sportKey: string) (etDay: string) : string = sprintf "/v2/games?sport=%s&date=%s" sportKey etDay

/// What the feed says about THIS card's game.
///
/// - `pre` is no reading: the feed has not seen the match start, and the card keeps whatever the archive says (a delayed
///   kickoff reads `Start time passed, no score served`, which is true). Its `score: 0` is never read.
/// - `live` with both scores is the live score, or half time when the feed's `situation.isHalftime` is true (the state word stays `live` at the break: captured 2026-11-11,
///   clock `45'+3'`); `final` with both scores is full time (the archive has not finalised it
///   yet, or the card would be Final and the reading would not show).
/// - a card with no ESPN event id cannot be joined, a feed with no game for the card has nothing to say, a state word this file
///   does not read, and a live or final game with no score: each is `LiveUnavailable` with the reason, carried on the card as `data-why` (the words on the card are `live score unavailable`).
let readingFor (feed: FeedGame list) (game: Game) : LiveReading =
    match game.EspnEventId with
    | None -> LiveUnavailable "the card carries no ESPN event id to join the feed on"
    | Some id ->
        match feed |> List.tryFind (fun f -> f.EspnEventId = id) with
        | None -> LiveUnavailable "the feed has no game for this card"
        | Some f ->
            match f.State with
            | "pre" -> NoReading
            | "live" ->
                match f.HomeScore, f.AwayScore with
                | Some h, Some a when f.IsHalftime -> HalfTime(h, a)
                | Some h, Some a -> LiveNow(h, a, f.Clock |> Option.filter (fun c -> c <> ""))
                | _ -> LiveUnavailable "the feed says live and carries no score"
            | "final" ->
                match f.HomeScore, f.AwayScore with
                | Some h, Some a -> FullTime(h, a)
                | _ -> LiveUnavailable "the feed says final and carries no score"
            | other -> LiveUnavailable(sprintf "the feed says %s, a state this page does not read" other)
