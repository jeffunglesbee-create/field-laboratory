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
// `final` games carried `situation: null` in the two captured (the relay's BSD enrichment can give any game it matches `{ elapsed }`, which reads false too). Not seen: stoppage time of the second half while live, extra time, a shootout. A state word
// this file does not know is a named reading, never a guess (see `readingFor`).
//
// JOINED BY ESPN EVENT ID, never by name: the archive says "Man Utd", the feed "Manchester United" (CC-CMD fact 4). The
// feed carries the id as its own key, `espnEventId`, and the lab already decodes `espn_event_id` from the archive row.
//
// THE OTHER SPORTS (owner, 2026-11-22: "NBA and NHL are needed ... other sports are needed as well"; docs/CC-CMD-2026-11-11-live-scores-other-sports.md). NBA, WNBA, MLB, NFL, CFB and AFL come from
// ESPN through the same relay route and carry `espnEventId`, so they join as soccer does when the archive row carries ESPN's id (read on real rows for NBA, WNBA, NFL, MLB and CFB; NOT yet for AFL, whose two
// committed rows carry 5-digit ids: STAGED in the CC-CMD). Their FINAL state word is `post`, not `final` (relay `adaptESPNBasketball` for WNBA and AFL, `adaptESPNFootball`, `adaptESPNMLB`; read through the relay
// on 2026-11-22, `outbox/relay-cfb-post-body-2026-11-22.md`: a CFB game of 2026-11-21 reads `"state":"post","periodLabel":"F","clock":"0:00"`); NBA, NHL and soccer say `final`. The relay has two words for a finished
// game and has not chosen one (field-relay-nba docs/CC-CMD-2026-10-24-v2-final-word.md, owner's call): reading both is that CC-CMD's option (b), and the `post` branch is dead if the owner picks `final` everywhere.
// NHL comes from api-web.nhle.com and carries `nhleGameId` and NO `espnEventId` (`id: "nhl:2026020293"` for the Sabres v Lightning game of 2026-11-11, `outbox/live-capture-nhl-2026-11-11-0101Z.json`),
// while the archive row carries ESPN's id (`401892690`): the two cannot be joined by id. The NHL card is joined by the two club names on the
// feed's ET day instead (one NHL game per club per day), which is a stand-in for a relay field that does not exist: the relay owns the contract, and the fix is filed there
// (field-relay-nba docs/CC-CMD-2026-11-22-nhl-feed-espn-event-id.md); it is retired when the relay serves `espnEventId` on NHL games.

/// One game of the feed, reduced to what a card is told.
type FeedGame =
    { /// The relay's ESPN event id, or `None` for a game the feed carries no such id for (NHL, from api-web.nhle.com).
      EspnEventId: string option
      /// `home.name` and `away.name`, as served: what an id-less game is joined on.
      HomeName: string option
      AwayName: string option
      /// `periodLabel`, verbatim (`Q2`, `P1`, `T5`, `F`, `NS` or empty); `None` when absent or null.
      PeriodLabel: string option
      /// The feed's own word for the state, verbatim: `pre`, `live`, `final`, or something this file does not read.
      State: string
      HomeScore: int option
      AwayScore: int option
      /// The feed's clock text, verbatim, as served (`34'`, `90'+9'`); `None` when the key is absent or null.
      Clock: string option
      /// `situation.isHalftime`: the relay's own flag, true exactly when ESPN's status is `STATUS_HALFTIME` (relay `adaptESPNWCSoccer`). A game that is not live has `situation: null` unless the relay's BSD enrichment matched it (then `{ elapsed }`),
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
        { EspnEventId = get.Optional.Field "espnEventId" Decode.string
          HomeName = get.Optional.At [ "home"; "name" ] Decode.string
          AwayName = get.Optional.At [ "away"; "name" ] Decode.string
          PeriodLabel = get.Optional.Field "periodLabel" Decode.string
          State = get.Required.Field "state" Decode.string
          HomeScore = get.Optional.At [ "home"; "score" ] wholeScore
          AwayScore = get.Optional.At [ "away"; "score" ] wholeScore
          Clock = get.Optional.Field "clock" Decode.string
          IsHalftime = get.Optional.At [ "situation"; "isHalftime" ] Decode.bool |> Option.defaultValue false })
    // A game the feed gives neither an ESPN id nor both club names for can be joined to nothing: the relay's shape changed, and it is named, as a game with no id used to be.
    |> Decode.andThen (fun g ->
        if g.EspnEventId.IsNone && (g.HomeName.IsNone || g.AwayName.IsNone) then
            Decode.fail "a game with neither an espnEventId nor both team names cannot be joined to a card"
        else
            Decode.succeed g)

/// The games of a `/v2/games` body. A body with no `games` list, or a game with no `espnEventId` or no `state`, is an ERROR
/// that says so: the relay owns this contract, and a slate that quietly reads as empty would be a card saying nothing.
let decodeFeed (text: string) : Result<FeedGame list, string> =
    Decode.fromString (Decode.field "games" (Decode.list feedGameDecoder)) text

/// The path (and query) of the relay's live pull route for one sport key and one ET field day. The relay's default date is the
/// UTC day, which is the wrong day once the UTC date turns (19:00 Eastern in winter, 20:00 in summer), so the day is always passed.
let feedPath (sportKey: string) (etDay: string) : string = sprintf "/v2/games?sport=%s&date=%s" sportKey etDay

/// The words beside the score for a game in play. Soccer: the feed's clock, verbatim (`34'`, `45'+3'`). Other sports: the period and the clock, `Q2 6:17`, `P2 10:11`, because a bare `6:17` says
/// nothing; baseball has no clock, so its note is the inning alone, `Top 5` or `Bot 7` for the relay's `T5` and `B7` (`adaptESPNMLB`). `None` when the feed carried neither. Read live for NBA and NHL (2026-11-11
/// captures: `periodLabel` `Q2` / `P2`, `clock` `2:03` / `10:11`); NFL, CFB, MLB, WNBA and AFL are read from the relay's adapters until a live game of each is captured.
let private liveClockText (sport: Sport) (f: FeedGame) : string option =
    let clock = f.Clock |> Option.filter (fun c -> c <> "")
    if (sportMeta sport).IsSoccer then clock
    else
        let label =
            f.PeriodLabel
            |> Option.filter (fun l -> l <> "")
            |> Option.map (fun l ->
                if sport = Sport.MLB && l.Length > 1 && l.[0] = 'T' && System.Char.IsDigit l.[1] then "Top " + l.Substring 1
                elif sport = Sport.MLB && l.Length > 1 && l.[0] = 'B' && System.Char.IsDigit l.[1] then "Bot " + l.Substring 1
                else l)
        match label, clock with
        | Some l, _ when sport = Sport.MLB -> Some l
        | Some l, Some c -> Some(l + " " + c)
        | Some l, None -> Some l
        | None, c -> c

/// What the feed says about THIS card's game.
///
/// - the game is found by ESPN event id; failing that, among the feed's games that have NO id (NHL), by the card's two club names (`Desk.sameTeam`, home to home and away to away); two such games for one card is
///   an error that says so, and a card with no ESPN id and no name match cannot be joined;
/// - `pre` is no reading: the feed has not seen the match start, and the card keeps whatever the archive says (a delayed
///   kickoff reads `Start time passed, no score served`, which is true). Its `score: 0` (or null) is never read.
/// - `live` with both scores is the live score, or half time when the feed's `situation.isHalftime` is true (soccer: the state word stays `live` at the break, captured 2026-11-11,
///   clock `45'+3'`); `final` or `post` with both scores is full time (the archive has not finalised it
///   yet, or the card would be Final and the reading would not show).
/// - a feed with no game for the card has nothing to say, a state word this file does not read, and a live or final game with no score: each is `LiveUnavailable` with the reason, carried on the card as
///   `data-why` (the words on the card are `live score unavailable`).
let readingFor (feed: FeedGame list) (game: Game) : LiveReading =
    let read (f: FeedGame) =
        match f.State with
        | "pre" -> NoReading
        | "live" ->
            match f.HomeScore, f.AwayScore with
            | Some h, Some a when f.IsHalftime -> HalfTime(h, a)
            | Some h, Some a -> LiveNow(h, a, liveClockText game.Sport f)
            | _ -> LiveUnavailable "the feed says live and carries no score"
        | "final"
        | "post" ->
            match f.HomeScore, f.AwayScore with
            | Some h, Some a -> if (sportMeta game.Sport).IsSoccer then FullTime(h, a) else GameOver(h, a)
            | _ -> LiveUnavailable "the feed says final and carries no score"
        | other -> LiveUnavailable(sprintf "the feed says %s, a state this page does not read" other)
    let byId =
        match game.EspnEventId with
        | Some id -> feed |> List.tryFind (fun f -> f.EspnEventId = Some id)
        | None -> None
    match byId with
    | Some f -> read f
    | None ->
        let byNames =
            feed
            |> List.filter (fun f ->
                f.EspnEventId.IsNone
                && (match f.HomeName, f.AwayName with
                    | Some h, Some a -> sameTeam game.Home h && sameTeam game.Away a
                    | _ -> false))
        match byNames with
        | [ f ] -> read f
        | _ :: _ :: _ -> LiveUnavailable "the feed has more than one game for these two clubs"
        | [] ->
            match game.EspnEventId with
            | None -> LiveUnavailable "the card carries no ESPN event id to join the feed on"
            | Some _ -> LiveUnavailable "the feed has no game for this card"
