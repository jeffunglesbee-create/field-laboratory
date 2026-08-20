# CC-CMD-2026-08-20-uefa-club-competitions

**Filed from:** field-laboratory
**Ask to:** field-relay-nba
**Status:** RESOLVED by the relay session (jubilant-bassoon) — commits `8289762`
(six `LEAGUES` rows) and `07b987e` (`check-leagues-label-contract.mjs`,
pre-deploy guard). One live-landing item stays open, tracked relay-side.

One-liner (as originally filed):
```
Add UEFA Champions League, Europa League, and Conference League to the relay's
V2_LEAGUES so their fixtures appear in /context/date, AND declare the exact
`sport`/`league` label each will carry so the laboratory can match it verbatim.
```

---

## CORRECTION — what HEAD actually showed

The relay session probed HEAD before acting and found this ask's **premise was
stale, and its evidence probe read the wrong table.** Both are corrected here so
the laboratory record is honest; the parts that held are marked as such.

### Wrong: "the three are missing from `V2_LEAGUES`"

They have been in `V2_LEAGUES` since the June 26 migration — `ucl` / `europa` /
`conference`, with exactly the ESPN slugs and BSD lids this ask requested, **plus
qualifying variants.** `/v2/games?sport=ucl` has worked on demand the whole time.
Ask part 1 was already done.

### Wrong: the suggested labels

This ask suggested `"Champions League"` / `"Europa League"` /
`"Conference League"` (no `UEFA` prefix) as the emit labels. The relay's
`SOCCER_LEAGUE_LABELS` already declared all of them, and the real labels are:

```
UEFA Champions League          UEFA Champions League Qualifying
UEFA Europa League             UEFA Europa League Qualifying
UEFA Europa Conference League  UEFA Europa Conference League Qualifying
```

`sport` and `league` carry the **same** string. The suggested no-prefix labels
appear nowhere in the relay and would have split each competition across two
archive id namespaces. **Not modelling laboratory-side on the guessed label was
the correct call** — this is exactly the verbatim-match trap `sportOfString`
refuses.

### Wrong: `/archive/query?sport=<label>` as the follow-up probe

This ask recommended registering the follow-up against
`/archive/query?sport=<declared-label>`. That route reads the **briefs** table,
not `regular_season_games` — `count: 0` there proves no journalism brief exists,
which says nothing about game rows. Any landed-probe keyed on it would measure the
wrong thing. The correct probe is a CI-as-proxy `/d1/execute` count against
`regular_season_games WHERE sport LIKE 'UEFA%'`.

### Right: the actual root cause, and why nothing showed

`/context/date` reads **only** `ARCHIVE_DB`, never `V2_LEAGUES` or live ESPN. The
archive is written by the journalism cron iterating a separate `LEAGUES` table,
and that table had no UEFA row. So the competitions were fetchable on demand and
never persisted, and the existing live label-contract CI check stayed green
because an on-demand fetch is healthy with or without a `LEAGUES` row — which is
how the gap survived months. The fix is six `LEAGUES` rows (three main + three
qualifying) plus a pre-deploy guard.

### Right: qualifying had to be included

August is the **qualifying** round. `uefa.champions?dates=20260819` returns
`events: []`; `uefa.champions_qual` returns real fixtures, and 2026-08-19 is this
ask's own cited date. A literal three-entry addition would have satisfied the
request as written and still rendered zero games on the date that motivated it —
a fallback, not a fix. Six rows, not three.

---

## What the laboratory does now

Unchanged from the original plan, and now with the real labels known:

- **Until UEFA rows land in the archive:** these render honestly — home-first
  under `UnknownConvention`, flagged `UNMODELLED`, and the drift-sentinel files
  its unmodelled-sport issue on the first matchday.
- **On first observation:** add `Sport` cases keyed on the confirmed labels —
  `"UEFA Champions League"`, `"UEFA Europa League"`, `"UEFA Europa Conference
  League"`, and their `Qualifying` variants — all `HomeVersusAway`,
  `IsSoccer = true`. Still model-on-observation, per `sport-registry-check`'s
  "sports production actually serves"; the labels are now known, so each is a
  one-line evidence-backed change when the sentinel reports it.

## Open, tracked relay-side

Whether UEFA rows actually land live was ~60% confidence at hand-off: deploy
succeeded (13:09Z) but no UEFA row was observable by 13:35Z, with a stale
`/context/date` (`max-age=300`) and "no post-deploy seed tick yet" both
uneliminated. Closing it needs the `/d1/execute` proxy count above. That
verification is the relay session's to finish; the laboratory's follow-up
registration waits for a landed row rather than a guessed probe.
