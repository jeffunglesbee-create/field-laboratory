# CC-CMD-2026-08-25-golf-sport-label

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (`handleJournalismCycle`'s `[ARCHIVE-CATCHUP]` path)
**Status:** OPEN, filed 2026-08-25.

**PGA Tour is a league, not a sport.** Golf is the sport; PGA Tour, Korn Ferry
Tour, Champions Tour, LPGA Tour and DP World Tour are tours within it. The
relay's golf-aware writer already gets this right — its rows read
`sport="golf", league="PGA Tour"`. A second writer does not, and produces a
parallel set of rows under `sport="PGA Tour"`.

---

## The evidence: one tournament, two rows

`outbox/sport-vocabulary-2026-08-25T01-24-34-105Z.json`:

```
sport="golf"       id="golf_2026-08-24_bmwchampionship_r4"
                   league="PGA Tour"  home="BMW Championship"  away="R4"
                   home_score=-17     away_score=null
                   note="Wyndham Clark -17"  venue="Bellerive Country Club"
                   espn_event_id="golf_401811963"

sport="PGA Tour"   id="PGA Tour_2026-08-20_src401811963"
                   league="PGA Tour"  home=null  away=null
                   home_score=-6      away_score=-6
                   venue=null  note=null
                   espn_event_id="401811963"
```

**ESPN event 401811963 in both.** The BMW Championship, written twice — once by
a writer that understands golf, once by one that does not.

## The mechanism, from source

`src/index.js:7726` lists golf in the generic ESPN scoreboard walker's table:

```js
{sport:'golf',  league:'pga',  label:'PGA Tour'},
```

`src/index.js:7750-7751`:

```js
const home = teams.find(t => t.homeAway === 'home') || teams[0];
const away = teams.find(t => t.homeAway === 'away') || teams[1];
```

A golf event's `competitors` are **players**. None carries `homeAway`, so both
fallbacks fire: `home` becomes the first player on the leaderboard and `away`
the second. A golf competitor carries `athlete`, not `team`, so
`home?.team?.shortDisplayName` yields `''` on both — persisted as null. But
`home?.score` and `away?.score` exist, which is where `-6, -6` comes from.

**`-6, -6` is not a tie between two sides.** It is the top two players of the
BMW Championship's first round, both at that figure, stripped of their names by
a `.team` lookup golf competitors do not have.

`src/index.js:7842` then writes it:

```js
sport: gm.league,     // gm.league is LEAGUES' `label` -- 'PGA Tour'
league: gm.league,
```

That line is correct for 21 of the 22 `LEAGUES` entries and wrong for one.
CC-CMD-2026-08-06 established it deliberately — `gm.sport` is ESPN's top-level
sport (the literal `'soccer'`), and reading it relabelled every soccer
competition as the World Cup. **Do not revert that.** The golf entry is a
different defect: its `label` is a tour, and there is no other entry where that
is true.

## Why this is not a laboratory `Matchup` problem

field-laboratory's `Sport.PGATour` currently carries an `Omission` saying "a
non-contest `Matchup` case is the fix both share". **That is now known to be
wrong** and will be corrected there. Golf needs the non-contest case
(`docs/NON-CONTEST-DESIGN.md`). PGA Tour needs nothing on the laboratory side
except deleting a `Sport` case that should never have existed — a league in the
sport column is a mislabelled row, not an unmodelled sport, and Rule 60 puts
the fix here.

## Why it gets worse if left

Every tour added to `LEAGUES` produces another bogus `sport` value, another
`Sport` case in the laboratory registry, and another `UNMODELLED SPORT` heading
that can never be cleared. Korn Ferry, Champions, LPGA and DP World are four
more of the same. The same two lines will do it to any ESPN sport whose
competitors are individuals — tennis, MMA, racing — because
`|| teams[0] / || teams[1]` exists to handle neutral-site fixtures and cannot
tell a neutral site from a leaderboard.

## The ask

1. **Probe first.** Do not write from this document. Run:
   ```
   POST /d1/execute  {"sql":"SELECT sport, COUNT(*) n, MIN(date) lo, MAX(date) hi
                             FROM regular_season_games WHERE sport IN ('PGA Tour','golf')
                             GROUP BY sport"}
   POST /d1/execute  {"sql":"SELECT id, sport, espn_event_id, home, away, home_score, away_score
                             FROM regular_season_games WHERE sport='PGA Tour' ORDER BY date DESC LIMIT 10"}
   ```
   Read `src/index.js` around lines 7726, 7750 and 7842 at current HEAD and
   confirm each still says what is quoted above.

2. **Stop the generic catch-up archiving golf events.** The `LEAGUES` entry
   already carries the answer — `sport:'golf'` is right there in the table and
   is discarded. Gate the `/archive/game` POST on it, so a golf event is
   skipped by this path and left to the golf-aware writer that already covers
   it. Do not change `sport: gm.league` for any other entry.

3. **Guard it.** A deploy gate asserting that no `LEAGUES` entry whose ESPN
   `sport` is not a team sport reaches the catch-up write. Enumerate the 22
   entries; assert 21 reach it and golf does not. A sampled assertion does not
   satisfy this.

4. **The existing rows are a separate decision and need explicit approval.**
   Three dates are known (2026-08-08, 2026-08-13, 2026-08-20); step 1's count
   gives the real figure. They are duplicates whose golf counterparts carry the
   same `espn_event_id` with a `golf_` prefix. **Do not delete archive rows
   without the human saying so in this session.** Propose the DELETE with its
   exact WHERE clause and the row count it would remove, and wait.

## Done condition

Not "deploy succeeded". After the fix deploys and one journalism cycle has run
past a live tournament day:

```
POST /d1/execute  {"sql":"SELECT COUNT(*) n FROM regular_season_games
                          WHERE sport='PGA Tour' AND date > '<deploy-date>'"}
```

must return `n = 0`, and the same date's golf-aware row must exist:

```
POST /d1/execute  {"sql":"SELECT id, home, away, note FROM regular_season_games
                          WHERE sport='golf' AND date > '<deploy-date>'"}
```

must return at least one row with `home`, `away` and `note` all non-null. Both
outputs go in the outbox manifest verbatim. A green deploy with no tournament
day in between is NOT the done condition — say so and schedule the re-check.

## Outbox manifest (last task)

Commit hash, deploy run ID, both done-condition probe outputs verbatim, the
step-1 row count, and — if step 4 was approved — the DELETE's affected-row
count. Any residual must be a genuine proxy failure, not deferred work.
