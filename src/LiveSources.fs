module LiveSources

open Thoth.Json

// docs/CC-CMD-2026-11-26-single-page-composition.md, Task 6b. Owner requirement 2026-11-26: "we should always know when anything is live".
//
// The two BSD live feeds the relay serves, read for ONE thing: is it live. `/bsd/tennis/matches/live` (a JSON array of matches) and
// `/bsd/events/live` (`{count, events[]}`). Nothing here fetches or reads a clock.
//
// THE SHAPES, as captured on 2026-11-26 (outbox/live-capture-bsd-tennis-live-20261126-2338Z.json, 3 matches; outbox/live-capture-bsd-events-live-
// 20261126-2338Z.json, 1 event, a Brasileirao game at minute 37). The fields read are the ones liveness needs; the others are LEFT OUT ON PURPOSE:
// the tennis route also serves `odds_player1` / `odds_player2` and about forty `p1_*` / `p2_*` statistics, and a decoder whose job is "is it live"
// has no business carrying an odds-bearing record.
//
// THE WORDS. Tennis `status` was `live` on 3 of 3 captured matches; no other word has been observed. Soccer `status` was `inprogress` and `period`
// `1st_half`; halftime and extra-time words have not been observed. A word not seen is a NAMED unknown (`UnknownWord`), never read as live and never
// read as not live: the same refusal `LiveFeed` makes for a game with no state.
//
// A FEED THAT DID NOT ANSWER IS NOT A FEED THAT SAID "NOTHING LIVE". `Answered []` is a real answer; `Unavailable why` is not an answer, and no
// function here turns the second into the first.

/// Where a live item came from. Named, never inferred.
type Source =
    | BsdTennis
    | BsdSoccer

let sourceName (s: Source) : string =
    match s with
    | BsdTennis -> "BSD tennis"
    | BsdSoccer -> "BSD soccer"

type Liveness =
    | Live
    /// A status word this decoder has not seen. Carried, not guessed.
    | UnknownWord of word: string

type LiveItem =
    { Source: Source
      Id: int
      Label: string
      Detail: string
      /// Tennis only: the tournament a draw is joined to by id, never by name.
      TournamentId: int option
      /// Tennis only: its name, for the page to say which draw is live. Never used to join.
      TournamentName: string option
      Liveness: Liveness
      /// Soccer only: the feed's own `last_updated`, verbatim. The staleness threshold is NOT chosen here (Task 6d needs a census of observed ages first).
      LastUpdated: string option }

type FeedState =
    /// The feed answered. An empty list is a real "nothing live".
    | Answered of LiveItem list
    /// It did not answer, or its answer could not be read. Never shown as "nothing live".
    | Unavailable of why: string

let private tennisDecoder: Decoder<LiveItem> =
    Decode.object (fun get ->
        let matchId = get.Required.Field "id" Decode.int
        let name field = get.Optional.At [ field; "name" ] Decode.string
        let label =
            match name "player1", name "player2" with
            | Some a, Some b -> sprintf "%s v %s" a b
            // A doubles match carries pairs, not player objects, and none has been captured. Named, so it can be seen and fixed, not dropped.
            | _ -> sprintf "match %d (players not named in this payload)" matchId
        let round = get.Optional.Field "round_name" Decode.string
        let set = get.Optional.Field "current_set" Decode.int |> Option.map (sprintf "set %d")
        let status = get.Required.Field "status" Decode.string
        { Source = BsdTennis
          Id = matchId
          Label = label
          Detail = [ round; set ] |> List.choose id |> String.concat " · "
          TournamentId = get.Optional.At [ "tournament"; "id" ] Decode.int
          TournamentName = get.Optional.At [ "tournament"; "name" ] Decode.string
          Liveness = (if status = "live" then Live else UnknownWord status)
          LastUpdated = None })

let private soccerDecoder: Decoder<LiveItem> =
    Decode.object (fun get ->
        let eventId = get.Required.Field "id" Decode.int
        let home = get.Required.Field "home_team" Decode.string
        let away = get.Required.Field "away_team" Decode.string
        let minute = get.Optional.Field "current_minute" Decode.int |> Option.map (sprintf "%d'")
        let period = get.Optional.Field "period" Decode.string
        let league = get.Optional.Field "league_name" Decode.string
        let status = get.Required.Field "status" Decode.string
        { Source = BsdSoccer
          Id = eventId
          Label = sprintf "%s v %s" home away
          Detail = [ league; period; minute ] |> List.choose id |> String.concat " · "
          TournamentId = None
          TournamentName = None
          Liveness = (if status = "inprogress" then Live else UnknownWord status)
          LastUpdated = get.Optional.Field "last_updated" Decode.string })

/// The matches of a `/bsd/tennis/matches/live` body: a JSON array. Anything else is an error that says so.
let decodeTennis (text: string) : Result<LiveItem list, string> =
    Decode.fromString (Decode.list tennisDecoder) text

/// The events of a `/bsd/events/live` body. A body with no `events` list is an error, never an empty answer.
let decodeSoccer (text: string) : Result<LiveItem list, string> =
    Decode.fromString (Decode.field "events" (Decode.list soccerDecoder)) text

/// A decoded feed, or the reason it could not be read, as the state the page shows.
let stateOf (decoded: Result<LiveItem list, string>) : FeedState =
    match decoded with
    | Ok items -> Answered items
    | Error why -> Unavailable why

type DrawLiveness =
    | DrawLive of matches: int
    | DrawNotLive
    | DrawUnknown of why: string

/// Is the draw of tournament `tournamentId` being played? Joined by id. An unreadable feed is UNKNOWN, and so is a match of this tournament whose
/// status word has not been seen: neither is read as "not live".
let drawLiveness (tournamentId: int) (feed: FeedState) : DrawLiveness =
    match feed with
    | Unavailable why -> DrawUnknown why
    | Answered items ->
        let ofThis = items |> List.filter (fun i -> i.TournamentId = Some tournamentId)
        let live = ofThis |> List.filter (fun i -> i.Liveness = Live) |> List.length
        if live > 0 then DrawLive live
        elif ofThis |> List.exists (fun i -> match i.Liveness with UnknownWord _ -> true | Live -> false) then
            DrawUnknown "a match of this tournament carries a status word not seen before"
        else DrawNotLive

/// One feed's part of the `Live now` line: how many are live, or that it is unknown and why.
let feedText (source: Source) (feed: FeedState) : string =
    match feed with
    | Unavailable why -> sprintf "%s: unknown (%s)" (sourceName source) why
    | Answered items ->
        let live = items |> List.filter (fun i -> i.Liveness = Live) |> List.length
        let unknown = List.length items - live
        if unknown > 0 then sprintf "%s: %d live, %d with a status word not seen before" (sourceName source) live unknown
        else sprintf "%s: %d live" (sourceName source) live

/// The tennis tournaments with a match in play, each with its id, its name and how many of its matches are live: what the Live now line links to.
/// An unreadable feed names none, and says nothing about whether any is live; the line's own text says the feed is unknown.
let liveTournaments (feed: FeedState) : (int * string * int) list =
    match feed with
    | Unavailable _ -> []
    | Answered items ->
        items
        |> List.filter (fun i -> i.Source = BsdTennis && i.Liveness = Live)
        |> List.choose (fun i ->
            i.TournamentId
            |> Option.map (fun tid -> (tid, i.TournamentName |> Option.defaultValue (sprintf "tournament %d" tid))))
        |> List.countBy (fun pair -> pair)
        |> List.map (fun ((tid, name), n) -> (tid, name, n))

/// The state word and the sentence the draw panel shows for one `DrawLiveness`. The word is what a check reads; the sentence is what a reader reads.
let drawLivenessLine (liveness: DrawLiveness) : string * string =
    match liveness with
    | DrawLive n -> ("live", sprintf "Live now: %d match%s of this tournament in play (BSD tennis)" n (if n = 1 then "" else "es"))
    | DrawNotLive -> ("not-live", "Not live now: no match of this tournament is in play (BSD tennis)")
    | DrawUnknown why -> ("unknown", sprintf "Live status unknown: %s" why)
