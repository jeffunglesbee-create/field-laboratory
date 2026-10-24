# Claude Code Command — one venue name, two grounds: find every table row that serves the wrong city

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-10-24 by CC, from the home-team calibration in `outbox/cc-session-2026-10-24-home-team-rule.md`
**Confidence gate:** `npm run gate` >= 95 before any commit
**Status:** DONE 2026-10-24 — measured, with a stated limit. The one row it flagged was a stale row after a rename, fixed in `96fae24`; the final run (`outbox/venue-collisions-latest.json`, run 40127028227) finds 0 collisions among the 48 pairs it can judge, and cannot judge the other 454.

---

## Related, read before building (BUILD-ON-A)

Searched 2026-10-24 by content (`Red Bull Arena`, `two grounds`, `collision`,
`same name`, `tryFind`) across `docs/CC-CMD-*.md` and `outbox/*.md`. Nothing
covered one name serving two grounds.

- `docs/CC-CMD-2026-10-20-outdoor-venue-sourcing.md`: built the table rows this
  checks and the home-team rule it reuses. Builds on it; undoes nothing in it.
- `docs/CC-CMD-2026-10-20-live-slate-venue-coverage.md` (DONE): the indoor-arena
  list. Option 2 below would reuse its mechanism.
- `outbox/2026-09-03-mls-pair-discriminators.md`: one ground filed under two names
  (Sports Illustrated Stadium and Red Bull Arena for Harrison, in that period).

## What was measured, and what turned out to be true

The table is keyed by venue name alone (`Venues.tryFind`, and the page's
`data-venue`), so a name that means two grounds can serve only one of them. The
home-team calibration (run 40119203719) flagged `Red Bull Arena`: the row was
Harrison NJ, while the matcher picked Leipzig for RB Leipzig's games.

The owner then said the New Jersey ground is now Sports Illustrated Stadium.
Measured against the archive (field-archive D1, 2026-10-24): "Red Bull Arena" with
Red Bull NY ends 2026-09-26; the club's games are filed as Sports Illustrated
Stadium from 2026-09-30; every "Red Bull Arena" game since is RB Leipzig's,
including the 2026-05-27 Conference League final. So this was **a stale row after
a rename, not two live grounds**, and the matcher was right. The row is now
Leipzig's (`96fae24`; `outbox/cc-session-2026-10-24-red-bull-arena-row.md`).

My first write-up called it a collision and built an alias test on the pair. Both
were wrong for the same reason, and are corrected there and in
`outbox/cc-session-2026-10-24-alias-cards.md`.

## Task 0 — probe (done)

The runner reads the archive through the relay's public `/context/date/D`, whose
rows carry `venue`, `home`, `date`, `sport` (shape from `data/games-2026-08-09.json`).

## Task 1 — measure every row (done)

`scripts/venue-collisions.mjs --days 120`, workflow mode `collisions`. For each
table venue the archive has games at, every distinct home team seen there goes
through `chooseByHome` over that name's Wikidata candidates; the pick is compared
with the table row (0.02 degrees).

Final run, 40127028227, after the row fix:
`checked 502 venue/home pairs over 396 of 433 table venues (37 not seen in 120 days)`;
120 of 120 days answered, 4,063 game rows, 0 unanswered.

| verdict | pairs |
|---|---|
| same ground | 38 |
| collision | 0 |
| no pick (national teams, clubs Wikidata does not list there) | 10 |
| one candidate, not judged | 454 |

**The limit, stated where it is read.** The method can only judge a name with two
or more Wikidata stadium candidates, so it judged 48 of 502 pairs. In those, 0
collisions. The other 454 have a single candidate for their name; a name that is
two grounds where Wikidata holds only one is invisible to this method, and "no
other collisions" is NOT established. The first run's second flag (American
Family Field / Brewers: the only candidate was the Brewers' Phoenix spring
training complex, while the 43 home games are in Milwaukee) is why a
single-candidate pick is no longer judged (mutation
`venue-collision-judges-single-candidate`).

What would extend it: a second independent source of "this name is two grounds".
The archive itself is one: a venue string whose games' home teams come from two
different cities. That test has its own false positives (neutral-site national
teams) and is not built here.

## Task 2 — how a real collision would be served (owner; not needed today)

If a name ever does mean two live grounds, the page looks a venue up by name, so
any fix changes a lookup key: a structural change, not mine to choose alone.
Options, recommendation first:

1. Key the lookup by (venue, home) for the collided names only; every other row
   is unchanged.
2. Record the collided names as having no weather, as indoor arenas are
   recorded, until a key exists.
3. Leave them and print the list on every verify, so it is visible.

No collision needs this today.

## Done conditions

1. `outbox/venue-collisions-latest.json` committed, with its denominator: met
   (`tableVenues` 433, 396 seen, 502 pairs).
2. Every `collision` row fixed: met. The one flagged was the stale row, fixed in
   `96fae24`; the final run reports 0.
3. `npm run gate` >= 95: scored on the landing commit (see the session note).
