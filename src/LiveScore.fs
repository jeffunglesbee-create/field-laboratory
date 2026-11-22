module LiveScore

open System
open Desk

// docs/CC-CMD-2026-11-11-soccer-live-scores.md, Task 6. The pure half of the live score: what a card may be told, when it is
// worth asking, and which sport key to ask. Nothing in this file reads the clock, a network or the DOM; the page's poll
// (src/Program.fs, in its own marked region) supplies an instant and a feed, and the decoder of the feed lives apart from this.
//
// WHY A SEPARATE READING AND NOT A NEW GameState CASE. A fourth case would be an exhaustive-match site in eight places
// (the card, Stats, Pick'em, the amnesty zone...) and each would have to decide what a live soccer score means for it. Instead
// the feed's answer becomes a `LiveReading` and `foldReading` folds it into the SAME three-case `GameState` the page already
// understands. The fold happens in ONE place, the card (`Scoreboard.render` folds over its own state signal); Pick'em and Stats still
// read the archive row alone and do not see a reading, so for the minutes a match is in play the card says `In progress` where the
// Pick'em chip says `PENDING`. That is the state before this feature too (both read Scheduled), now disagreeing instead of agreeing
// wrongly; the parity is filed as docs/CC-CMD-2026-11-11-live-scores-tabs.md. (An earlier version of this comment said the three
// "keep agreeing": that was the design's intent and not what was built, found by review 2026-11-11.)
// A reading never makes a game `Final`: `Final` is what opens the
// amnesty zone (drama text, the sparkline, Pick'em grading), and the owner's ruling is that only the archive says a game is over
// (docs/CC-CMD-2026-10-15-empowerment-metrics.md ruling 2(b)).

/// What the relay's live feed said about ONE game, reduced to what a card can show.
type LiveReading =
    /// Nothing asked, or nothing to add: the card is as the archive row leaves it.
    | NoReading
    /// The feed says the game is in play. The clock is the feed's own text, verbatim, when it carried one.
    | LiveNow of home: int * away: int * clock: string option
    /// The feed says the game is in play and ESPN's status is half time (`situation.isHalftime`). The feed's clock at the one sample of the break (2026-11-11 19:54:02Z) was the first half's last
    /// reading (`45'+3'` on 2026-11-11, captured), which reads as stoppage time in play; the card says `Half time` instead. The owner approved it 2026-11-11.
    | HalfTime of home: int * away: int
    /// The feed says the game is over and the archive row has not finalised it yet. The card stays `In progress`, marked.
    | FullTime of home: int * away: int
    /// The same for every sport that is not soccer (owner, 2026-11-22: other sports are wanted): the feed says the game is over, the archive has not finalised it, the card stays `In progress` and says
    /// `Game over`. "Full time" is the owner's approved word for soccer and is not a word for a basketball or a hockey game, so it has its own case.
    | GameOver of home: int * away: int
    /// The card's window ended while it still held a live answer (`LiveNow` or `HalfTime`): a suspended match, or a tie that ran past three hours after its start. The poll no longer asks
    /// about this card, so its score is the last one heard and nothing else would say so. The card keeps that score, still `In progress`, and says in words that live updates stopped
    /// (owner, 2026-11-22, "Go with Claude's best recommendations": CC-CMD Open question 1, the named state at the window's end; the review's `as of HH:mm` after two polls is not built).
    | LiveStopped of home: int * away: int
    /// The feed failed, or has no game for this card. Said on the card in words; never a blank and never `Scheduled`.
    | LiveUnavailable of why: string

/// The relay's `/v2/games` sport key for a laboratory soccer sport; `None` for a sport the feed is not asked about.
/// A new soccer `Sport` with no key here fails the Suite (every `IsSoccer` sport must have one), so the table cannot drift
/// quietly. The keys are the relay's `V2_LEAGUES` (field-relay-nba `src/index.js`, which `handleV2Games` resolves). Measured on the
/// DEPLOYED relay on 2026-11-11 through `probe_relay_route`: `/v2/games?sport=<key>&date=2026-11-11` answered 200 for each of the 16
/// keys below, and an unknown key answers 400 with a `supported` list that contains all 16. (An earlier version of this comment
/// named `SPORT_CONFIG`, which holds three of the sixteen; the values were right, the cited table was not.)
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
    // The other sports the relay's /v2/games serves (field-relay-nba `V2_LEAGUES`, read 2026-11-22: nba, nhl, mlb, wnba, afl, nfl, cfb). Owner, 2026-11-22: "NBA and NHL are needed ... other sports are needed as well"
    // (docs/CC-CMD-2026-11-11-live-scores-other-sports.md). Tennis and golf have keys too (atp, wta, pga) and a different shape (an event, not a contest): not here.
    | Sport.NBA -> Some "nba"
    | Sport.WNBA -> Some "wnba"
    | Sport.NHL -> Some "nhl"
    | Sport.MLB -> Some "mlb"
    | Sport.NFL -> Some "nfl"
    | Sport.CFB -> Some "cfb"
    | Sport.AFL -> Some "afl"
    | _ -> None

/// THE POLL'S NAMED CONDITIONS (the CC-CMD's "Design"; the owner may change them, and `check:live-score-poll` reads them).
/// One tick a minute, for the reason in the CC-CMD's arithmetic (fact 6): each request costs the relay one uncached BSD call whether
/// or not a game is live. For the six keys the relay's own poller (`AmbientDO`) covers in November it already makes up to 720 requests per key per three hours while a game
/// is live, so a viewer adds at most 25% there; for the other ten lab keys, `efltrophy` among them, a viewer is the only caller (CC-CMD, the poll bullet's arithmetic).
[<Literal>]
let LivePollMs = 60000

/// How long one poll request may stay unanswered. A key is held while its request is in flight, so a request that never answered
/// would stop that key being asked for good with the card saying nothing (review 2026-11-11, poll S4 and S18). One and a half
/// periods, on purpose LONGER than the period: a slow answer still counts, and while one is open its key is not asked again
/// within that poll (`inFlight` belongs to one `startLivePoll`; a re-render starts a new poll with its own, so a reader pressing Today
/// during a hung request adds a request each time: CC-CMD open question 2). After that long the request is cut and the card reads
/// `live score unavailable`, with `the feed did not answer` as its `data-why`. (Under a deadline SHORTER than the period every
/// request would end before the next tick and that guard could never fire.) A bound, not a measurement: how long the relay takes to answer `/v2/games` is not measured here.
[<Literal>]
let LivePollTimeoutMs = 90000

/// A card is in its live window from its start time to this long after it. A soccer match is about two hours with its breaks
/// and stoppage, and the archive's first score has been seen 115.5 to 135 minutes after kickoff (CC-CMD fact 3), so three hours
/// covers the gap the `Full time` marker is for. Measured once on a real match, 2026-11-11 (EFL Trophy, kickoff 19:00Z): the feed said `final` at
/// 20:59:30Z in a committed capture (and at about 20:58Z in an uncommitted direct read), the archive rows were still unscored then, and both were finalised at 21:00:26Z and 21:00:28Z, the `*/15` tick, 120.4 minutes
/// after kickoff (`outbox/live-score-real-bodies-2026-11-11.md`). One match, two games: a sample, not a bound.
let liveWindowAfterStart = TimeSpan.FromHours 3.0

/// How long after its start a card of this sport is worth asking about. Soccer is `liveWindowAfterStart`. The others are CHOSEN, not measured, from two things: the usual length of the game, and
/// the committed captures' start-to-`finalized_at` minutes (they include late cron finalisations, so they say how long a game ran at most, not how long it usually does; re-measured 2026-11-22 on
/// `data/context-*.json` and `data/games-*.json`, rows deduplicated by id: CFB 103 rows, median 211, 90th percentile 256, longest 661; NHL 16 rows, median 180, longest 481; NBA 8 rows, median 166, longest 570;
/// MLB 2 rows, 161 and 166; NFL, WNBA and AFL have no row with both a start and a finalisation, so their windows rest on the usual length of the game alone). A longer window costs a request per key per minute for each card the archive has not finalised; a shorter one stops asking while a game is still on, and the
/// card then says `live updates stopped` (CC-CMD-2026-11-11-soccer-live-scores, Open question 1). A game delayed past its window (weather, a suspension) lands on that stopped state by design.
let liveWindowFor (sport: Sport) : TimeSpan =
    match sport with
    | Sport.NBA
    | Sport.WNBA
    | Sport.NHL
    | Sport.AFL -> TimeSpan.FromHours 3.5
    | Sport.NFL -> TimeSpan.FromHours 4.0
    | Sport.MLB
    | Sport.CFB -> TimeSpan.FromHours 4.5
    | _ -> liveWindowAfterStart

/// Is the card inside its live window at this instant? Inclusive at both ends. A row with no start time is never in one: an
/// unknown start time is no evidence of either side, as `Desk.notYetStartedAt` already says.
let inLiveWindowAt (now: DateTimeOffset) (g: Game) : bool =
    match g.StartTime with
    | Some start -> now >= start && now <= start + liveWindowFor g.Sport
    | None -> false

/// Is the card worth asking the feed about at this instant? In its window, and not already `Final` in the archive: the archive's
/// `Final` always wins over a reading (`foldReading`), so an answer about a finished card changes nothing and only costs the relay a
/// request (review 2026-11-11, poll S1: at 18:45Z on the committed 2026-10-10 slate it asked for six keys, two of them for cards the
/// archive had finalised 15 minutes earlier).
let pollableAt (now: DateTimeOffset) (g: Game) : bool =
    inLiveWindowAt now g
    && (match gameStateAt now g with
        | Final _ -> false
        | _ -> true)

/// Is this card one of those an answer for `key` is told? Its sport is the key's and it is inside its window. Pure, so the Suite can
/// pin the selection: dropping the sport test made every other league's card read `live score unavailable` and no check noticed
/// (review 2026-11-11, poll S9 and S16, when it was an inline closure in the poll).
let answersTo (key: string) (now: DateTimeOffset) (g: Game) : bool =
    liveSportKey g.Sport = Some key && inLiveWindowAt now g

/// The distinct feed keys to ask at this instant: one per sport that has a pollable card, in first-seen order. Empty means no
/// request is made on this tick, which is the common case.
let liveKeysAt (now: DateTimeOffset) (games: Game list) : string list =
    games
    |> List.filter (pollableAt now)
    |> List.choose (fun g -> liveSportKey g.Sport)
    |> List.distinct

/// May the poll still have something to do? True while any soccer card the archive has not finalised is in its window or has a
/// window ahead. When it is false the timer is stopped, so a page left open on a finished slate holds no timer.
let liveWorkAheadAt (now: DateTimeOffset) (games: Game list) : bool =
    games
    |> List.exists (fun g ->
        (liveSportKey g.Sport).IsSome
        && (match gameStateAt now g with
            | Final _ -> false
            | _ -> true)
        && (match g.StartTime with
            | Some start -> now <= start + liveWindowFor g.Sport
            | None -> false))

/// Has the feed said this game is over? Then asking again changes nothing (a final score does not move), and the poll stops asking about the card and stops telling it answers (`Program.fs`): the page
/// never re-reads the archive, so the card stays as it is whether or not the archive finalises meanwhile. Efficiency: `pollableAt` reads the archive state AT LOAD, so before this a key was asked every
/// minute until the card's window ended, three hours after kickoff for soccer, which is about an hour after a 105-minute match; now it stops at the whistle.
let isSettled (reading: LiveReading) : bool =
    match reading with
    | FullTime _
    | GameOver _ -> true
    | _ -> false

/// Has the card's window ended at this instant? Strictly after its last instant (`inLiveWindowAt` is inclusive), and false for a row with no start time, which has no window.
let windowEndedAt (now: DateTimeOffset) (g: Game) : bool =
    match g.StartTime with
    | Some start -> now > start + liveWindowFor g.Sport
    | None -> false

/// What a card holds once its window has ended: a live answer (`LiveNow`, `HalfTime`) becomes `LiveStopped` and keeps its score. Every other reading is left as it is: `FullTime` is
/// the feed's own statement that the game is over and stays true, `LiveUnavailable` already says in words that there is no score, and no reading says nothing.
let stoppedFrom (reading: LiveReading) : LiveReading =
    match reading with
    | LiveNow(h, a, _)
    | HalfTime(h, a) -> LiveStopped(h, a)
    | other -> other

/// The state a card shows once the feed has spoken. The ARCHIVE's `Final` always wins: a reading is never allowed to take a game
/// back from `Final`, and never to make one. A reading that adds a score turns a started `Scheduled` row into `InProgress`; no
/// reading, or an unavailable one, leaves the archive's own answer.
let foldReading (archive: GameState) (reading: LiveReading) : GameState =
    match archive with
    | Final _ -> archive
    | _ ->
        match reading with
        | LiveNow(h, a, _)
        | HalfTime(h, a)
        | FullTime(h, a)
        | GameOver(h, a)
        | LiveStopped(h, a) -> InProgress(h, a)
        | NoReading
        | LiveUnavailable _ -> archive

/// The words beside the score for a reading: the feed's clock, `Half time`, `Full time`, or the reason the score is missing. Empty when there
/// is nothing to say. It is a sibling of the status line, which stays `In progress` (the live grouping reads that exact text).
let liveNoteText (reading: LiveReading) : string =
    match reading with
    | NoReading -> ""
    | LiveNow(_, _, Some clock) -> clock
    | LiveNow(_, _, None) -> ""
    | HalfTime _ -> "Half time"
    | FullTime _ -> "Full time"
    | GameOver _ -> "Game over"
    | LiveStopped _ -> "live updates stopped"
    | LiveUnavailable _ -> "live score unavailable"

/// The note beside the score, given what the ARCHIVE says. A game the archive has finalised carries no live note: the card says
/// `Final`, and a clock or `Full time` beside it would contradict that.
let liveNoteFor (archive: GameState) (reading: LiveReading) : string =
    match archive with
    | Final _ -> ""
    | _ -> liveNoteText reading

/// WHY there is no score, for the node that says `live score unavailable`: the reading's own reason while that is what the note says,
/// and nothing otherwise (a clock, `Half time`, `Full time`, no reading, or an archive `Final`, which carries no live note). The card carries it as
/// `data-why`: the words beside the score stay `live score unavailable`, and a person with devtools, and the render check, can read
/// what the feed said or did not say (review 2026-11-11, decoder S8 and S10: the reason was built at seven sites (five in `LiveFeed.readingFor`, two in the poll's answer callback) and shown nowhere).
let liveWhyFor (archive: GameState) (reading: LiveReading) : string =
    match archive, reading with
    | Final _, _ -> ""
    | _, LiveUnavailable why -> why
    | _ -> ""
