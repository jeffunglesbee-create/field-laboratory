module Draw

open Thoth.Json

// A knockout draw, and the one line in it that is allowed to be wrong: none.
//
// WHY THIS IS A SEPARATE MODULE FROM Tennis.fs
//
// `Tennis.fs` models a SCORELINE — what happened inside one match. This models
// the SHAPE — which match feeds which. They fail differently. A scoreline that
// decodes wrongly shows a wrong number beside two correct names. A draw that
// joins wrongly shows a correct number beside a player who was not there.
//
// WHERE THE EDGES COME FROM, AND WHY THAT IS SAFE
//
// BSD serves no bracket. The 2026-09-06 schema census read 217 declared paths
// and the tennis surface carries matches, h2h, point-by-point, players,
// rankings, tournaments and predictions — no /draw/ and no /bracket/. There is
// also no parent-link field on a match row: the key census read id, tournament,
// player1, player2, is_doubles, home_pair, away_pair, match_date, status,
// round_name, player1_sets, player2_sets, sets_detail, winner_id, odds_player1
// and odds_player2, and nothing else.
//
// The edge is nonetheless READ rather than guessed, because in single
// elimination the WINNER is the link. A player appears in at most one match per
// round, so the winner of an R64 match appears in exactly one R32 match.
// Measured 2026-09-06 against a real slam edition:
//
//   YES — 126 edges resolve to exactly one next match by winner identity,
//   0 ambiguous
//
// The alternative — pairing match 1 with match 2 by draw position — is the one
// this module exists to make impossible, because it produces a complete-looking
// bracket out of an ordering nobody promised.
//
// WHAT IS REFUSED, AND WHAT IS ONLY REPORTED
//
// This split is the whole design, and it was decided by measurement rather than
// by taste. Six real slam editions were read on 2026-09-06:
//
//   Roland Garros Women 2026   64 32 16 8 4 2 1     canonical
//   Australian Open ATP 2026   66 32 16 8 4 2 1     two extra first-round rows
//   Australian Open WTA 2026   65 32 16 8 4 2 1     one extra
//   Roland Garros ATP  2026    66 32 16 8 4 2 1     two extra
//   US Open Men 2025           65 31 16 8 4 2 1     one extra, one MISSING
//   US Open Women 2026         65 32 16 8           in progress
//
// One of six is canonical. So "rounds halve" cannot be a construction law: it
// would call five real slams corrupt and leave the sixth as proof the code
// works. This is the same mistake `Tennis.fs` records making about completed
// sets — a rule applied to the whole array called every live match corrupt —
// and it is recorded here before it was made, not after.
//
//   REFUSED (a `Draw` value cannot exist with these): the same player twice in
//   one round; a winner who is not one of the two players in their own match;
//   two matches sharing an id; a round name outside the seven the draw has.
//
//   The first of those is also, exactly, the ambiguity guard. An `AmbiguousEdge`
//   case was written and then deleted, because no input reaches it: a winner can
//   only appear in two next-round matches if that player appears twice in that
//   round, which is refused first. See `build`.
//
//   REPORTED (queryable on a valid `Draw`): a round not at its canonical size,
//   and a player who appears in a round without having won one in the round
//   before. Both are real and both are the DATA, not a decoding fault.
//
// NOT GUARANTEED. That the draw describes a real tournament. A self-consistent
// fabrication decodes cleanly, and should — no type can reach the court.

// --- rounds ------------------------------------------------------------------

/// The seven rounds of a 128-draw, in order. A closed union: there is no eighth
/// round to construct, and FS0025 is an error here, so no reader can silently
/// skip one.
type RoundName =
    | RoundOf128
    | RoundOf64
    | RoundOf32
    | RoundOf16
    | Quarterfinals
    | Semifinals
    | Final

/// The vendor's spelling, measured from a real edition rather than assumed.
/// Qualifying rounds ("Qualification Round 1", "Qualification Round 2",
/// "Qualification Final" — 113 rows in the US Open Men 2025 edition) are NOT
/// rounds of the draw and deliberately do not decode.
let roundOfName (s: string) : RoundName option =
    match s with
    | "Round of 128" -> Some RoundOf128
    | "Round of 64" -> Some RoundOf64
    | "Round of 32" -> Some RoundOf32
    | "Round of 16" -> Some RoundOf16
    | "Quarterfinals" -> Some Quarterfinals
    | "Semifinals" -> Some Semifinals
    | "Final" -> Some Final
    | _ -> None

let roundIndex (r: RoundName) =
    match r with
    | RoundOf128 -> 0
    | RoundOf64 -> 1
    | RoundOf32 -> 2
    | RoundOf16 -> 3
    | Quarterfinals -> 4
    | Semifinals -> 5
    | Final -> 6

let roundLabel (r: RoundName) =
    match r with
    | RoundOf128 -> "Round of 128"
    | RoundOf64 -> "Round of 64"
    | RoundOf32 -> "Round of 32"
    | RoundOf16 -> "Round of 16"
    | Quarterfinals -> "Quarterfinals"
    | Semifinals -> "Semifinals"
    | Final -> "Final"

/// How many matches the round holds when nothing is missing or doubled.
/// DERIVED from the index, not tabulated — a table is a second place for 64 to
/// be wrong.
let canonicalSize (r: RoundName) = 1 <<< (6 - roundIndex r)

let nextRound (r: RoundName) =
    match r with
    | RoundOf128 -> Some RoundOf64
    | RoundOf64 -> Some RoundOf32
    | RoundOf32 -> Some RoundOf16
    | RoundOf16 -> Some Quarterfinals
    | Quarterfinals -> Some Semifinals
    | Semifinals -> Some Final
    | Final -> None

// --- what a node holds -------------------------------------------------------

type Player =
    { Id: int
      Name: string
      ShortName: string option
      CountryCode: string option
      /// The player's world ranking, and NOT their seed. There is no seed field
      /// anywhere on a BSD tennis row or player — measured 2026-09-06, the only
      /// candidate on either object is `current_ranking`. A bracket that prints
      /// this under a seed label prints a different number in the right place.
      Rank: int option }

/// One match in the draw. Private: `build` is the only way in, and it refuses
/// the states below rather than returning a value it cannot justify.
type Node =
    private
        { Id: int
          Round: RoundName
          P1: Player option
          P2: Player option
          WinnerId: int option
          Status: string option }

/// A resolved edge: the winner of `From` went on to play in `To`. Private case,
/// so an edge cannot be assembled by a caller who did not do the join.
type Edge = private Edge of from: int * to_: int * playerId: int

/// A draw that passed every refusal below.
type Draw =
    private
        { Tournament: string
          Season: string
          Nodes: Node list
          Edges: Edge list }

/// Why a draw did not build. Named cases rather than a string, so a caller must
/// handle each and a message cannot drift from the condition that raised it.
type DrawError =
    | EmptyDraw
    | UnknownRound of name: string
    | DuplicateMatchId of id: int
    | WinnerNotInMatch of matchId: int * winnerId: int
    | PlayerTwiceInRound of round: string * playerId: int

// --- building ----------------------------------------------------------------

let private playersOf (n: Node) =
    [ n.P1; n.P2 ] |> List.choose id |> List.map (fun p -> p.Id)

/// Build a draw from decoded rows, joining edges by winner identity.
///
/// Every refusal below is a state that would render a WRONG bracket rather than
/// an incomplete one. Incompleteness — a missing round, a player who appears
/// from nowhere — is left in and queryable, because it is what the vendor
/// actually serves and hiding it is how a bracket gains a match nobody played.
let build (tournament: string) (season: string)
          (rows: (int * RoundName * Player option * Player option * int option * string option) list)
          : Result<Draw, DrawError> =
    if List.isEmpty rows then Error EmptyDraw
    else
        let nodes =
            rows
            |> List.map (fun (id, r, p1, p2, w, st) ->
                { Id = id; Round = r; P1 = p1; P2 = p2; WinnerId = w; Status = st })

        // Two matches with one id would make every join below address the wrong
        // one, silently.
        let dupId =
            nodes
            |> List.countBy (fun n -> n.Id)
            |> List.tryFind (fun (_, c) -> c > 1)
        match dupId with
        | Some(id, _) -> Error(DuplicateMatchId id)
        | None ->

        // A winner who is not one of the two players is not a winner. This is
        // the check that would catch a join performed against the wrong row.
        let badWinner =
            nodes
            |> List.tryPick (fun n ->
                match n.WinnerId with
                | Some w when not (List.contains w (playersOf n)) -> Some(n.Id, w)
                | _ -> None)
        match badWinner with
        | Some(id, w) -> Error(WinnerNotInMatch(id, w))
        | None ->

        // A player twice in one round breaks the premise the whole join rests
        // on — "a player appears in at most one match per round" is what makes
        // a single hit an edge rather than a coincidence. This is also what
        // catches a draw assembled from two editions of the same tournament,
        // which is how the first attempt at this join reported 106 ambiguous
        // matches: id 135 is a SERIES holding 477 matches across 2025 and 2026,
        // and a quarter-finalist in both years appears in two Semifinals rows.
        let twice =
            nodes
            |> List.groupBy (fun n -> n.Round)
            |> List.tryPick (fun (r, ns) ->
                ns
                |> List.collect playersOf
                |> List.countBy id
                |> List.tryFind (fun (_, c) -> c > 1)
                |> Option.map (fun (pid, _) -> roundLabel r, pid))
        match twice with
        | Some(r, pid) -> Error(PlayerTwiceInRound(r, pid))
        | None ->

        // The join. Zero hits is the champion or a player knocked out — not an
        // edge and not a fault.
        //
        // THERE IS NO AMBIGUITY CASE HERE, and its absence is a finding rather
        // than an omission. An `AmbiguousEdge` case was written, and the suite
        // row for it could not be given an input that reached it: for a winner
        // to appear in two next-round matches, that player must appear twice in
        // that round, and `PlayerTwiceInRound` above has already refused. The
        // ambiguity check is STRICTLY SUBSUMED — every draw it would reject is
        // one the player-twice law rejects first, and the reverse does not hold
        // (two unplayed first-round rows sharing a player produce no edge at
        // all, and are still not a draw).
        //
        // The relay's /bsd/tennis/draw returns 409 on the join's ambiguity and
        // has no player-twice law, so its 409 IS reachable — it is the weaker
        // of the two guards, stated at the boundary where the vendor's rows
        // arrive. Written down because the F# type is what found it: the case
        // was unreachable, and an unreachable refusal reads exactly like an
        // enforced one until something tries to trigger it.
        let edges =
            nodes
            |> List.collect (fun n ->
                match n.WinnerId, nextRound n.Round with
                | Some w, Some nr ->
                    nodes
                    |> List.filter (fun c -> c.Round = nr && List.contains w (playersOf c))
                    |> List.map (fun c -> Edge(n.Id, c.Id, w))
                | _ -> [])
        Ok { Tournament = tournament; Season = season; Nodes = nodes; Edges = edges }

// --- reading a built draw ----------------------------------------------------

let tournament (d: Draw) = d.Tournament
let season (d: Draw) = d.Season
let matchCount (d: Draw) = List.length d.Nodes
let edgeCount (d: Draw) = List.length d.Edges
let edgePairs (d: Draw) = d.Edges |> List.map (fun (Edge(f, t, p)) -> f, t, p)

let roundsPresent (d: Draw) =
    d.Nodes |> List.map (fun n -> n.Round) |> List.distinct |> List.sortBy roundIndex

let sizeOfRound (d: Draw) (r: RoundName) =
    d.Nodes |> List.filter (fun n -> n.Round = r) |> List.length

/// Rounds whose match count is not what the round's position says it should be.
///
/// REPORTED, NOT REFUSED, and the reason is in this module's header: five of the
/// six real slam editions read on 2026-09-06 are off-canonical. A construction
/// law here would reject reality and pass on the one edition that happens to be
/// tidy.
let roundsOffCanonicalSize (d: Draw) : (string * int * int) list =
    roundsPresent d
    |> List.map (fun r -> roundLabel r, sizeOfRound d r, canonicalSize r)
    |> List.filter (fun (_, have, want) -> have <> want)

/// Players who appear in a round without having won a match in the round before.
///
/// A bye, a walkover, a qualifier promoted late, or — as in US Open Men 2025,
/// whose Round of 64 holds 31 matches where 32 exist — a row the vendor simply
/// does not serve. Real in all four cases, so it is a question a caller asks,
/// not a reason to refuse the draw.
let playersFromNowhere (d: Draw) : (int * string) list =
    let winnersOf r =
        d.Nodes
        |> List.filter (fun n -> n.Round = r)
        |> List.choose (fun n -> n.WinnerId)
        |> Set.ofList
    d.Nodes
    |> List.collect (fun n ->
        match roundsPresent d |> List.tryFind (fun r -> nextRound r = Some n.Round) with
        | None -> []
        | Some prev ->
            let w = winnersOf prev
            playersOf n
            |> List.filter (fun p -> not (Set.contains p w))
            |> List.map (fun p -> p, roundLabel n.Round))
    |> List.distinct

/// The champion: the winner of the Final, if the Final has been played.
/// `None` is a real answer for a draw in progress, which is why it is an option
/// rather than a name-shaped placeholder.
let champion (d: Draw) : Player option =
    d.Nodes
    |> List.tryFind (fun n -> n.Round = Final)
    |> Option.bind (fun f ->
        match f.WinnerId with
        | None -> None
        | Some w -> [ f.P1; f.P2 ] |> List.choose id |> List.tryFind (fun p -> p.Id = w))

/// Every match one player appeared in, earliest round first.
let pathOf (d: Draw) (playerId: int) =
    d.Nodes
    |> List.filter (fun n -> List.contains playerId (playersOf n))
    |> List.sortBy (fun n -> roundIndex n.Round)
    |> List.map (fun n -> n.Id, roundLabel n.Round, n.WinnerId = Some playerId)

// --- reading the relay's payload ---------------------------------------------
//
// The shape of `/bsd/tennis/draw` on field-relay-nba, which is where the season
// scoping and the vendor's parameter quirks are handled. The field names below
// are the relay's, not BSD's: the relay maps `short_name` to `shortName` and
// `current_ranking.position` to `rank` before this ever sees a row.

let private playerDecoder : Decoder<Player> =
    Decode.object (fun get ->
        { Id = get.Required.Field "id" Decode.int
          Name = get.Required.Field "name" Decode.string
          ShortName = get.Optional.Field "shortName" Decode.string
          CountryCode = get.Optional.Field "countryCode" Decode.string
          Rank = get.Optional.Field "rank" Decode.int })

let private nodeDecoder : Decoder<Result<int * RoundName * Player option * Player option * int option * string option, DrawError>> =
    Decode.object (fun get ->
        let id = get.Required.Field "id" Decode.int
        let roundName = get.Required.Field "round" Decode.string
        let p1 = get.Optional.Field "p1" playerDecoder
        let p2 = get.Optional.Field "p2" playerDecoder
        let winner = get.Optional.Field "winnerId" Decode.int
        let status = get.Optional.Field "status" Decode.string
        match roundOfName roundName with
        | Some r -> Ok(id, r, p1, p2, winner, status)
        | None -> Error(UnknownRound roundName))

/// Decode a whole `/bsd/tennis/draw` response into a `Draw`.
///
/// A row carrying an unrecognised round name FAILS the whole decode rather than
/// being dropped. Dropping it would make a payload with a qualifying round in it
/// build a clean-looking draw, and "every round is a real round" would be true
/// of a list the exceptions had been removed from — a check whose subject is
/// chosen by the check. The relay already excludes qualifying; this is the
/// second lock, not the first.
let decodeResponse (json: string) : Result<Draw, DrawError> =
    let meta =
        Decode.object (fun get ->
            get.Optional.At [ "tournament"; "name" ] Decode.string |> Option.defaultValue "",
            get.Optional.Field "season" Decode.string |> Option.defaultValue "")
    match Decode.fromString meta json, Decode.fromString (Decode.field "nodes" (Decode.list nodeDecoder)) json with
    | Ok(name, sn), Ok rows ->
        let rec collect acc rest =
            match rest with
            | [] -> Ok(List.rev acc)
            | Ok r :: tail -> collect (r :: acc) tail
            | Error e :: _ -> Error e
        match collect [] rows with
        | Error e -> Error e
        | Ok rs -> build name sn rs
    | _ -> Error EmptyDraw
