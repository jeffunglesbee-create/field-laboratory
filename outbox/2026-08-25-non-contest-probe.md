# Golf / PGA Tour: what the rows actually hold

**2026-08-25.** Written while designing the non-contest `Matchup` case that
`Sport.Golf` and `Sport.PGATour` both name in their own `Omission` text.

## What changed in this commit

`scripts/sport-vocabulary-check.mjs` samples the **declared-unmodelled** labels,
not only the missing ones, and reads `SELECT *` rather than six named columns.

Two defects, both measured:

1. **The sample loop ran over `out.missing` alone.** A `missing` label is one
   nobody has looked at. A `declared` label is one whose registry entry already
   states, per Rule 74, what would unblock it — and the sampled row IS that
   evidence. Since 2026-08-23 every run has reported `missing: []` and therefore
   `samples: null`. Four labels are waiting on evidence (golf, PGA Tour, IPL,
   UFL) and the probe produced none for any of them, twice a day, for as long
   as they stay declared. A probe that goes quiet exactly when its subject stops
   being new is not a probe.

2. **Six named columns hid the answer.** The projection was
   `id, home, away, date, home_score, away_score`. See below: on a golf row the
   columns that say what the row *is* are `note` and `home_score`, and `note`
   was not selected. `drama_arc` and the two odds blobs are dropped by name —
   a stated size decision, not a claim that they are empty.

Console output now prints every non-null column per row and a count of the null
ones, so a null is visible as a null rather than as an absent key.

## The golf row, measured

`GET /context/game/golf_2026-08-14_fedexstjudechampionship_r2`, 2026-08-25,
via the relay self-probe (the sandbox 403s `*.workers.dev` at the proxy):

```json
{ "id": "golf_2026-08-14_fedexstjudechampionship_r2",
  "sport": "golf", "league": "PGA Tour", "date": "2026-08-14",
  "home": "FedEx St. Jude Championship", "away": "R2",
  "home_score": -11, "away_score": null,
  "venue": "TPC Southwind", "note": "Scottie Scheffler -11",
  "espn_event_id": "golf_401811962", "drama_peak": 0,
  "finalized_at": "2026-08-15 00:01:07", "start_time": null }
```

Every column has a real golf meaning. The row is not a broken contest row —
it is a **leaderboard snapshot wearing a contest's column names**:

| column | contest meaning | golf meaning, measured |
|---|---|---|
| `home` | home side | the tournament |
| `away` | away side | the round |
| `home_score` | home score | the leader's score to par |
| `away_score` | away score | unused |
| `note` | editorial note | the leader, named, with that score |
| `venue` | venue | the course |
| `league` | league | the tour |

This is stronger than the claim the registry currently carries. `Sport.Golf`'s
`Omission` says only that `home`/`away` "are not opponents". True, and
incomplete: the desk today renders `"FedEx St. Jude Championship vs R2"` and
**discards a named leader and a score to par that are already in the payload**.
The non-contest case is therefore not a suppression — it is a second card shape.

## The PGA Tour row

Still measured only as `home = null AND away = null` (2026-08-20, 2026-08-13,
2026-08-08, recorded in `outbox/2026-08-23-sport-vocabulary.md`). The full
column set is what this commit's probe change exists to fetch, and it is not
yet observed — **do not design against an assumption about `note` or
`home_score` on these rows until the next `drift-sentinel` run reports them.**

What IS established, from the relay source rather than from a row: `src/index.js`
line 7726 lists `{sport:'golf', league:'pga', label:'PGA Tour'}` in the generic
ESPN scoreboard walker's `LEAGUES` array — the same walker that handles NFL,
MLB and the soccer competitions, which reads `competitors[0]`/`[1]` for
home/away. A golf scoreboard has no such pair, which is a sufficient mechanism
for both columns being null. That makes the working hypothesis:

> `sport = 'PGA Tour'` rows are the **generic walker's residue** for events the
> golf-aware writer already archives as `sport = 'golf'`.

Hypothesis, not finding. It predicts that PGA Tour rows share `date` and
possibly `espn_event_id` with golf rows for the same tournament, and the next
probe run can check that. Recorded here so it is testable rather than assumed.

## Unblock criteria (Rule 74)

- **Blocked on:** the full column set for `sport = 'PGA Tour'` rows.
- **Unblocked by:** the next `drift-sentinel` run (scheduled 12:00 and 01:30
  UTC), or a `workflow_dispatch` of it.
- **Verify:** newest `outbox/sport-vocabulary-*.json` has
  `samples["PGA Tour"]` as a one-element array with every column present, and
  `samples["golf"]`, `samples["IPL"]`, `samples["UFL"]` likewise (`UFL` may be
  `[]`, which is its own answer and the one its entry predicts).
