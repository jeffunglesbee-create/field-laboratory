module DeepCuts

open System
open Fable.Core
open Desk
open Scout

// Deep Cuts — one hidden game per part of the day.
//
// Specified by the owner across 2026-11-15 and 2026-11-16, recorded question by
// question in docs/CC-CMD-2026-11-15-scout-daypart-picks.md. Its own section: Field's
// Pick, Scout's Pick and Pick'em are unchanged. Within each window the choice is
// Scout's, unchanged (`Scout.chooseScoutAt`: gate precedence, nearest to even, ties
// named, finished games skipped), so nothing here ranks or scores anything new.
//
// THE WINDOWS, in ET, each an hour either side of its name:
//   every day      12pm 11:00-13:00   2pm 13:00-15:00   4pm 15:00-17:00
//                  7:30pm 18:30-20:30   10pm 21:00-23:00
//   Sat and Sun    7:30am 06:30-08:30   10am 09:00-11:00
//
// THE EDGES, ruled: a weekend 11:00 kickoff is the 10am window's (on a weekday there is
// no 10am window, so 11:00 is the 12pm window's); 13:00 is the 12pm window's; 15:00 is
// the 4pm window's.
//
// OUTSIDE EVERY WINDOW: the nearest window, by minutes to its edge; exactly halfway goes
// to the later one. Measured over 2026-10-16 to 2026-11-14 before it was ruled: 22 games
// outside, each 30 minutes or less from a window.
//
// A GAME BELONGS ONLY TO THE WINDOW IT KICKS OFF IN, even while it is still being played
// in a later one. An EMPTY WINDOW IS SHOWN.
//
// NOT PLACED, each counted and named rather than dropped:
//   - no kickoff time (golf round rows carry none);
//   - not a two-sided, modelled contest (golf's leaderboard; `PGA Tour`, which the
//     registry marks NOT A SPORT);
//   - a kickoff on another day than its slate's (a rescheduled game keyed to its old
//     date: field-relay-nba's date-keying note of 2026-11-15).

type Window =
    { Id: string
      Label: string
      /// Minutes after midnight ET, inclusive.
      Start: int
      End: int
      WeekendOnly: bool }

let windows : Window list =
    [ { Id = "w0730"; Label = "7:30am"; Start = 390; End = 510; WeekendOnly = true }
      { Id = "w1000"; Label = "10am"; Start = 540; End = 660; WeekendOnly = true }
      { Id = "w1200"; Label = "12pm"; Start = 660; End = 780; WeekendOnly = false }
      { Id = "w1400"; Label = "2pm"; Start = 780; End = 900; WeekendOnly = false }
      { Id = "w1600"; Label = "4pm"; Start = 900; End = 1020; WeekendOnly = false }
      { Id = "w1930"; Label = "7:30pm"; Start = 1110; End = 1230; WeekendOnly = false }
      { Id = "w2200"; Label = "10pm"; Start = 1260; End = 1380; WeekendOnly = false } ]

/// The owner's edge rulings: a minute on two windows' shared edge, and whose it is.
let private edgeRulings = [ 660, "w1000"; 780, "w1200"; 900, "w1600" ]

/// The windows a day carries: all seven on a weekend, five on a weekday.
let windowsFor (weekend: bool) =
    windows |> List.filter (fun w -> weekend || not w.WeekendOnly)

/// The window a kickoff belongs to, at `minute` after midnight ET. Pure.
let windowAt (weekend: bool) (minute: int) : Window =
    let day = windowsFor weekend
    let ruled =
        edgeRulings
        |> List.tryPick (fun (m, id) -> if m = minute then day |> List.tryFind (fun w -> w.Id = id) else None)
    match ruled with
    | Some w -> w
    | None ->
        match day |> List.tryFind (fun w -> minute >= w.Start && minute <= w.End) with
        | Some w -> w
        | None ->
            // Nearest by minutes to the edge; on a tie the later window (the higher
            // Start) wins, which is the owner's halfway rule.
            let distance (w: Window) = if minute < w.Start then w.Start - minute else minute - w.End
            day |> List.sortBy (fun w -> distance w, -w.Start) |> List.head

/// Weekday and minute-of-day in FIELD's zone, through `Intl` and the IANA name, as
/// `Desk.fieldDayAt` does, so EST and EDT come from the platform's rules.
[<Emit("""(() => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date($0));
  const g = t => p.find(x => x.type === t).value;
  return `${g('weekday')} ${g('hour')}:${g('minute')}`;
})()""")>]
let private clockInFieldZone (epochMs: float) : string = jsNative

/// (is it Saturday or Sunday in ET, minute after midnight ET) for an instant.
let fieldClockAt (instant: DateTimeOffset) : bool * int =
    let text = clockInFieldZone (float (instant.ToUnixTimeMilliseconds()))
    let parts = text.Split(' ')
    let hm = parts.[1].Split(':')
    let weekend = parts.[0] = "Sat" || parts.[0] = "Sun"
    weekend, int hm.[0] * 60 + int hm.[1]

/// Whether a slate's date (YYYY-MM-DD, a FIELD-zone day) is a Saturday or Sunday.
/// Noon UTC lies inside the same calendar day in ET, so the UTC weekday is the day's.
[<Emit("""new Date($0 + 'T12:00:00Z').getUTCDay()""")>]
let private weekdayOfDate (isoDate: string) : int = jsNative

let isWeekendDate (isoDate: string) =
    let d = weekdayOfDate isoDate
    d = 0 || d = 6

type NotPlacedReason =
    | NoKickoff
    | NotAContestHere
    | KicksOffAnotherDay

type WindowResult =
    { Window: Window
      Games: Game list
      Outcome: ScoutOutcome }

type Board =
    { Weekend: bool
      Windows: WindowResult list
      NotPlaced: (Game * NotPlacedReason) list }

let private placeable (g: Game) : Result<DateTimeOffset, NotPlacedReason> =
    let meta = sportMeta g.Sport
    let isContest =
        meta.Modelled
        && (match meta.Matchup with
            | NotAContest _ -> false
            | AwayAtHome | HomeVersusAway | UnknownConvention -> true)
    match g.StartTime with
    | None -> Error NoKickoff
    | Some _ when not isContest -> Error NotAContestHere
    | Some kickoff ->
        match g.Day with
        | Some day when fieldDayAt kickoff <> day -> Error KicksOffAnotherDay
        | _ -> Ok kickoff

/// The whole board for a slate, at `now`. Every window of the day is listed, empty or
/// not; every game is either in exactly one window or named in `NotPlaced`.
let boardAt (now: DateTimeOffset) (slateDate: string) (games: Game list) (seriesEntries: int) : Board =
    let weekend = isWeekendDate slateDate
    let placed, notPlaced =
        games
        |> List.map (fun g -> g, placeable g)
        |> List.partition (fun (_, r) -> match r with Ok _ -> true | Error _ -> false)
    let byWindow =
        placed
        |> List.choose (fun (g, r) ->
            match r with
            | Ok kickoff ->
                // The window is the SLATE's day's set; a game's own minute places it.
                let _, minute = fieldClockAt kickoff
                Some((windowAt weekend minute).Id, g)
            | Error _ -> None)
    { Weekend = weekend
      Windows =
        windowsFor weekend
        |> List.map (fun w ->
            let gs = byWindow |> List.filter (fun (id, _) -> id = w.Id) |> List.map snd
            { Window = w; Games = gs; Outcome = chooseScoutAt now gs seriesEntries })
      NotPlaced =
        notPlaced
        |> List.choose (fun (g, r) -> match r with Error why -> Some(g, why) | Ok _ -> None) }

let board (slateDate: string) (games: Game list) (seriesEntries: int) =
    boardAt DateTimeOffset.UtcNow slateDate games seriesEntries

let notPlacedText (why: NotPlacedReason) =
    match why with
    | NoKickoff -> "no kickoff time"
    | NotAContestHere -> "not a two-sided contest"
    | KicksOffAnotherDay -> "kicks off on another day"
