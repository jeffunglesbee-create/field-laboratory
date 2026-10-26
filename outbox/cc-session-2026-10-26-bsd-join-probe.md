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
