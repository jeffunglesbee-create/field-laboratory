module LiveScore

open System
open Desk

// docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 6. The pure half of the live score: what a card may be told, when it is
// worth asking, and which sport key to ask. Nothing in this file reads the clock, a network or the DOM; the page's poll
// (src/Program.fs, in its own marked region) supplies an instant and a feed, and the decoder of the feed lives apart from this.
//
// WHY A SEPARATE READING AND NOT A NEW GameState CASE. A fourth case would be an exhaustive-match site in eight places
// (the card, Stats, Pick'em, the amnesty zone...) and each would have to decide what a live soccer score means for it. Instead
// the feed's answer becomes a `LiveReading` and `stateWith` folds it into the SAME three-case `GameState` the page already
// understands, so the card, Stats and Pick'em keep agreeing. A reading never makes a game `Final`: `Final` is what opens the
// amnesty zone (drama text, the sparkline, Pick'em grading), and the owner's ruling is that only the archive says a game is over
// (docs/CC-CMD-2026-10-15-empowerment-metrics.md ruling 2(b)).

/// What the relay's live feed said about ONE game, reduced to what a card can show.
type LiveReading =
    /// Nothing asked, or nothing to add: the card is as the archive row leaves it.
    | NoReading
    /// The feed says the game is in play. The clock is the feed's own text, verbatim, when it carried one.
    | LiveNow of home: int * away: int * clock: string option
    /// The feed says the game is over and the archive row has not finalised it yet. The card stays `In progress`, marked.
    | FullTime of home: int * away: int
    /// The feed failed, or has no game for this card. Said on the card in words; never a blank and never `Scheduled`.
    | LiveUnavailable of why: string

/// The relay's `/v2/games` sport key for a laboratory soccer sport; `None` for a sport the feed is not asked about.
/// A new soccer `Sport` with no key here fails the Suite (every `IsSoccer` sport must have one), so the table cannot drift
/// quietly. The keys are the relay's, read from its `SPORT_CONFIG` on 2026-11-11 (field-relay-nba `src/index.js`).
let liveSportKey (sport: Sport) : string option =
    match sport with
    | Sport.EPL -> Some "epl"
    | Sport.MLS -> Some "mls"
    | Sport.LaLiga -> Some "laliga"
    | Sport.SerieA -> Some "seriea"
    | Sport.Bundesliga -> Some "bundesliga"
    | Sport.Ligue1 -> Some "ligue1"
    | Sport.UEFAChampionsLeague -> Some "ucl"
    | Sport.UEFAChampionsLeagueQualifying -> Some "uclqual"
    | Sport.UEFAEuropaLeague -> Some "europa"
    | Sport.UEFAEuropaLeagueQualifying -> Some "europaqual"
    | Sport.UEFAEuropaConferenceLeague -> Some "conference"
    | Sport.UEFAEuropaConferenceLeagueQualifying -> Some "conferencequal"
    | Sport.FIFAWorldCup -> Some "wc26"
    | Sport.EFLCup -> Some "eflcup"
    | Sport.EFLTrophy -> Some "efltrophy"
    | Sport.FACup -> Some "facup"
    | _ -> None

/// THE POLL'S NAMED CONDITIONS (the CC-CMD's "Design"; the owner may change them, and `check:live-score-poll` reads them).
/// One tick a minute, for the reason in the CC-CMD's arithmetic: each request for a live game costs the relay an uncached BSD
/// call and a game-object write, and the relay already makes 720 of them per key per three hours on its own.
[<Literal>]
let LivePollMs = 60000

/// A card is in its live window from its start time to this long after it. A soccer match is about two hours with its breaks
/// and stoppage, and the archive finalises 15 to 45 minutes after that, so three hours covers the gap the `Full time` marker is for.
let liveWindowAfterStart = TimeSpan.FromHours 3.0

/// Is the card inside its live window at this instant? Inclusive at both ends. A row with no start time is never in one: an
/// unknown start time is no evidence of either side, as `Desk.notYetStartedAt` already says.
let inLiveWindowAt (now: DateTimeOffset) (g: Game) : bool =
    match g.StartTime with
    | Some start -> now >= start && now <= start + liveWindowAfterStart
    | None -> false

/// The distinct feed keys to ask at this instant: one per sport that has a card in its window, in first-seen order. Empty means
/// no request is made on this tick, which is the common case.
let liveKeysAt (now: DateTimeOffset) (games: Game list) : string list =
    games
    |> List.filter (inLiveWindowAt now)
    |> List.choose (fun g -> liveSportKey g.Sport)
    |> List.distinct

/// May the poll still have something to do? True while any soccer card is in its window or has a window ahead. When it is
/// false the timer is stopped, so a page left open on a finished slate holds no timer.
let liveWorkAheadAt (now: DateTimeOffset) (games: Game list) : bool =
    games
    |> List.exists (fun g ->
        (liveSportKey g.Sport).IsSome
        && (match g.StartTime with
            | Some start -> now <= start + liveWindowAfterStart
            | None -> false))

/// The state a card shows once the feed has spoken. The ARCHIVE's `Final` always wins: a reading is never allowed to take a game
/// back from `Final`, and never to make one. A reading that adds a score turns a started `Scheduled` row into `InProgress`; no
/// reading, or an unavailable one, leaves the archive's own answer.
let foldReading (archive: GameState) (reading: LiveReading) : GameState =
    match archive with
    | Final _ -> archive
    | _ ->
        match reading with
        | LiveNow(h, a, _)
        | FullTime(h, a) -> InProgress(h, a)
        | NoReading
        | LiveUnavailable _ -> archive

/// `foldReading` over the archive's own answer at a named instant. The card folds over its current state signal instead, so a
/// state set from outside the page's data (the test affordance) is the "archive" it folds over.
let stateWith (now: DateTimeOffset) (g: Game) (reading: LiveReading) : GameState = foldReading (gameStateAt now g) reading

/// The words beside the score for a reading: the feed's clock, `Full time`, or the reason the score is missing. Empty when there
/// is nothing to say. It is a sibling of the status line, which stays `In progress` (the live grouping reads that exact text).
let liveNoteText (reading: LiveReading) : string =
    match reading with
    | NoReading -> ""
    | LiveNow(_, _, Some clock) -> clock
    | LiveNow(_, _, None) -> ""
    | FullTime _ -> "Full time"
    | LiveUnavailable _ -> "live score unavailable"
