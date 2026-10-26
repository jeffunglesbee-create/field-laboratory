# BSD join probe (2026-10-26)

Question: lineups attach to a game through a BSD event id, and a lab game row carries none.
What joins them? The owner asked whether lineups can attach to every game; the blocker found
on 2026-10-25 is this missing key.

## Premises, and the one command that tests each

| premise | command | status |
|---|---|---|
| Matching names exactly fails on real club names | normalise "Bayern" and "FC Bayern München" | measured: `bayern` against `fcbayernmunchen`, no match |
| The relay serves BSD events by date | read `/bsd/events/by-date` in the relay source | read: pages at 50, `date`, `league_id`, `offset`, `limit` |
| The route returns events for the lab's six soccer leagues on a committed date | the probe, on a runner | MEASURED: 227 events on 2026-08-29 (5 pages) and 326 on 2026-09-05 (7 pages), run 40303868771 |
| Each event carries both team ids | the probe prints the event's field names and counts events with both ids | MEASURED: `home_team_id` and `away_team_id` are on every event's field list; 56 of the 56 events joined by name carried both |
| A loose name pair plus kickoff identifies one event | the probe counts strict, loose+kickoff, loose-only, ambiguous, none | MEASURED: 34 joined that way, 0 ambiguous; but see below, it reaches only half the games |

## What was built

The probe script (named bsd-join-probe, a Node script): a join rule with a self-test (8 cases) and a live measurement over
the two committed dates that hold soccer games (`data/context-2026-08-29.json`,
`data/context-2026-09-05.json`). The workflow "bsd join probe": runs it on a runner
(the authoring sandbox's egress proxy does not reach the relay), triggered by a push to
`outbox/.trigger-bsd-join-probe` so it runs from this branch without being on main first.

The self-test was mutated before it was trusted: making `kickoffNear` always true fails 2 cases;
dropping the four-letter floor on containment fails 1. A third mutation (an `ambiguous` branch)
survived because the branch was redundant (a later check returned the same answer), so the
branch was deleted rather than defended.

## Coverage is printed with every verdict

The probe prints `N of M lab soccer games` for each key and a final `COVERAGE:` line, so a
partial measurement cannot read as complete. It measures two dates; it says so.

## Result (run 40303868771, 2026-10-26, relay `/bsd/events/by-date`)

Measured over **2 committed dates, 93 lab soccer games** (the only two contexts that hold soccer;
22 of the 93 carry no `start_time`). Not a sample of the season.

| key | games joined | of |
|---|---|---|
| exact normalised name pair | 16 | 93 |
| loose name pair AND kickoff within 15 min | 34 | 93 |
| loose name pair, no kickoff to confirm (all 6 read as correct pairs) | 6 | 93 |
| ambiguous (two events fit) | 0 | 93 |
| no join | 37 | 93 |

So 50 of 93 (54%) join with a kickoff-confirmed or exact key, 56 of 93 counting the 6 loose-only
pairs, and 37 do not join by any name rule.

What the 37 are, from `outbox/bsd-join-probe-latest.json`:
- **12 are MLS games with no `start_time`** in the lab row, so no kickoff can confirm them.
- **25 have a kickoff and still fail on names**: the lab's display names are short forms
  (`Man City`, `C Palace`, `Spurs`, `Nottm Forest`, `Cologne`, `Miami`, `Houston`, `Red Bull NY`,
  `Salt Lake`) against BSD's full club names. No affix rule reaches `Spurs` to `Tottenham Hotspur`.

**Kickoff, when the lab row has one, is an exact key.** Among the 46 joined games that carried a
`start_time`, the gap to the BSD event was 0 minutes at the median and at the maximum (24 and 22
games, per date). Names are the weak half of the join; the time is not.

## What this says about the design (not yet built, not yet tested)

1. A name rule alone cannot be the join: 25 of the failures are display-name short forms.
2. BSD team ids exist and are on every event, so a table keyed by BSD team id removes the
   name problem once and for all. The table is small: the six leagues' clubs, not games.
3. Untested candidate: join on exact kickoff plus a one-side loose match, then confirm both ids
   from the table. It is not measured here, because the artifact does not keep the events; the
   probe would need to write them. MLS games without `start_time` cannot use it.
4. The lab's own gap is upstream of this: an MLS game with no `start_time` has no key but names.
   Whether the relay can serve a kickoff for those rows is a separate probe.

## Where the code is

The probe script, its workflow and the trigger file stay on
`claude/bsd-list-caller-search-5jd70z` and are NOT on main: they are a measurement, not a feature,
and landing them would need a gate run for no consumer. To measure again, dispatch the
workflow "bsd join probe" on that branch. The artifacts and this note are on main.

## Second run: the name-free keys (ids)

Added to the probe: a join on exact kickoff plus one side's loose name match, and a team-id table
learned on one committed date and applied to the OTHER, so no game is scored by a table it taught.
Self-test 17 cases; mutations: `kickoffExact` always true fails the different-kickoff case, a
table that keeps conflicting ids fails the conflict case, an `idJoin` that ignores the away id
SURVIVED the first test set and a case was added to kill it. Results appended when the run lands.

### Third run: the UTC-day window

Replaying the second run's artifact (events are now kept in it) showed 14 of the 17 undecided games
that carried a kickoff had a kickoff on the NEXT UTC date than the lab's context date (MLS, 00:30Z
to 02:30Z). The relay's `date` is a UTC day, so asking for the context date alone never returned
them; none of the 58 decided games had that property. The probe now also asks for the following
day and merges by event id. Results appended when the run lands.

### Result of the third run (run 40350349376 and the run after it; relay `/bsd/events/by-date`, UTC day and the next)

**CORRECTION to the first result above.** The first run reported 37 of 93 games joined by no name
rule and said 25 of them failed on short display names. That was partly the probe's own defect:
14 of those games kicked off on the next UTC day (MLS, 00:30Z to 02:30Z), and the probe asked for the
context date only. With the following UTC day added (432 and 541 events, 10 and 12 pages) the same 93
games resolve as:

| outcome | games | of |
|---|---|---|
| joined by an exact or loose name pair with the kickoff, or by the kickoff plus one side (union, replayed from the artifact) | 79 | 93 |
| name pair matches one event, but the lab row has no `start_time` or the time differs (inspected by eye: all 12 are the right pair, e.g. `Houston Dynamo FC v San Jose Earthquakes` to `Houston Dynamo v San Jose Earthquakes`) | 12 | 93 |
| unresolved by any rule (`Nottm Forest v Spurs`; `Red Bull New York v Philadelphia Union`) | 2 | 93 |

Counts per key from the run: strict name 23, loose name with kickoff 46, kickoff plus one side 68
(overlapping), ambiguous 0. Two dates, 93 games; not a season.

What the second key and the table showed:
- **Kickoff plus one side** needs no full name match: `Spurs v Newcastle` joins on `Newcastle` alone at
  the same instant. It cannot help a row with no `start_time` (22 of 93, MLS mostly).
- **Team-id table, learned on one date and tested on the other**: 31 games joined by both ids,
  **0 disagreements** with the name join, 3 joined only by the table. Coverage was limited by its
  teachers (a table taught by games only knows clubs that were in them) and by naming: **13 of 97 BSD
  team ids appear under more than one lab name** (`Inter Miami CF` and `Miami`, `San Diego FC` and `San
  Diego`), so a name-keyed table must be an alias table, several names to one id.
- Of 14 undecided at the first window, 12 are the loose-only pairs above, 1 is `Nottm Forest v Spurs`
  (neither side matches by name; both abbreviate) and 1 has no kickoff and a short form.

## What this says about the design

1. Feasible and cheap: 79 of 93 resolve with no table, and 12 more are plain to the eye. The relay
   needs no change: the by-date route, asked for the UTC day and the next, carries every event with
   both team ids.
2. The rule that follows from the data: join on kickoff plus one side; for a row with no `start_time`,
   require BOTH sides to match loosely and exactly one event; otherwise NOT JOINED. A game that does
   not join shows no lineup affordance. Never a guess.
3. The table is still worth building, built from BSD's own team list rather than from games, with
   aliases per id: it is what resolves `Spurs`, `Nottm Forest`, `Red Bull New York`. Untested: that
   BSD serves a team list through the relay, and that ids are stable across seasons.
4. The lab's missing kickoff is the larger cost: 22 of 93 rows carry no `start_time`.
