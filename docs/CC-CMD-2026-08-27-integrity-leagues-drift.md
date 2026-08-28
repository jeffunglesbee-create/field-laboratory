# CC-CMD-2026-08-27-integrity-leagues-drift

**Filed from:** field-laboratory
**Ask to:** field-relay-nba
**Status:** FILED, not started. Split out of
`CC-CMD-2026-08-21-archive-seed-coverage` at its execution rather than carried
forward inside it (Rule 87 #4) — the seed-coverage check found this, and fixing
it is a different change from building that check.

One-liner:
```
git remote get-url origin | grep -q field-relay-nba || { echo "WRONG REPO"; exit 1; }
git pull. Read docs/CC-CMD-2026-08-27-integrity-leagues-drift.md in field-laboratory.
Do not commit unless confidence >= 95. If score < 95, report verbatim and stop.
```

## The defect, measured

`GET /integrity/games?date=` exists to find seeded games that never reached D1.
It carries its own copy of the league list:

```js
// Mirror handleJournalismCycle's LEAGUES list (kept inline so a
// future LEAGUES extraction in the cron doesn't ripple here).
const LEAGUES_LOCAL = [ ... ];
```

**It is not a mirror.** Measured 2026-08-27 by
`scripts/check-seed-coverage.mjs`, which parses both tables out of
`src/index.js`:

```
/integrity/games covers 7 of 21 seeded competition(s).
Blind to 14: La Liga, Serie A, Bundesliga, Ligue 1, EFL Cup, EFL Trophy,
UEFA Champions League, UEFA Europa League, UEFA Europa Conference League,
UEFA Champions League Qualifying, UEFA Europa League Qualifying,
UEFA Europa Conference League Qualifying, NFL, PGA Tour
```

The comment states the reason for the duplication ("so a future LEAGUES
extraction doesn't ripple here") and that reason is exactly what went wrong: the
copy was insulated from the original and then never updated. Every one of the six
UEFA competitions added by `CC-CMD-2026-08-20-uefa-club-competitions` is invisible
to the endpoint whose job is finding exactly that class of gap — and so is NFL,
mid-season.

An integrity endpoint blind to two thirds of what it audits reports "no gaps"
about competitions it never looked at. That is the vacuity failure this
repository keeps finding: a check that passes on the bytes it did not read.

## The ask

Make `/integrity/games` audit what the cron actually seeds. Either:

- **(a)** export the cron's `LEAGUES` from a module both the cron and the route
  import — the honest fix, and it deletes the second copy rather than syncing it;
  or
- **(b)** if (a) is too invasive for one change, have the route derive its list
  from the cron table at runtime.

Do NOT hand-copy the 14 missing rows into `LEAGUES_LOCAL`. That produces a
correct copy today and the same defect in six weeks, which is how this one was
born.

`PGA Tour` needs a decision either way: it carries `individual: true` and is
archived through the golf-aware path, so an integrity comparison against the
team-sport scoreboard shape may be meaningless for it. State the decision; do not
let it fall out of the list silently.

## Probe block — run first, from HEAD (Rule 87)

Line numbers rot. `src/index.js` grew past 16,000 lines and this ask's parent
cited `7587` for a table that had moved to `7704`. Read by content:

```bash
cd field-relay-nba && git log --oneline -5
grep -an "const LEAGUES = \[" src/index.js
grep -an "const LEAGUES_LOCAL = \[" src/index.js
grep -an "pathname === '/integrity/games'" src/index.js
node scripts/check-seed-coverage.mjs      # prints the current coverage line
```

## Done condition

Not "the route deploys". As probe output:

1. `node scripts/check-seed-coverage.mjs` prints
   `/integrity/games covers 21 of 21 seeded competition(s)` — or covers N of N
   with `PGA Tour` explicitly and reasonedly excluded, and the exclusion visible
   in that same output rather than in a comment.
2. `GET /integrity/games?date=<a past date with UEFA or NFL fixtures>` returns a
   per-competition entry for at least one competition the endpoint is blind to
   today. Name it in the artifact with its ESPN and D1 counts — a response that
   merely returns 200 proves nothing.
3. The seed-coverage check gains an assertion that FAILS on the drift rather than
   reporting it. Today it prints the gap and passes, deliberately, because
   nothing could act on it while this ask was unfiled. That leniency ends here.

## Scope boundary

Do not touch: `wrangler.toml` bindings, cron frequencies, the cron's fetch
behaviour, any other route. This is one list, read from one place.
