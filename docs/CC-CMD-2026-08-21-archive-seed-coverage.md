# CC-CMD-2026-08-21-archive-seed-coverage

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (the journalism cron / archive seed path)
**Status:** **PARTIAL — asks 1 and 2 are OPEN and unbuilt.** Ask 3 is WITHDRAWN:
EPL was already in the seed table and already seeded, so there was no gap. Asks
1–2 (declared seed manifest + a check that fails when a configured competition
with fixtures is silently absent) survive and are the valuable part, and ask 2's
artifact must be rewritten against the game-day model. See the correction;
original text kept below for the record.

> **Status line corrected 2026-08-27.** It previously opened "ASK 3 WITHDRAWN",
> which is true of ask 3 and false of the document: a reader scanning status
> lines saw a withdrawal and moved on, while two unbuilt asks sat underneath it.
> Re-verified the same day against field-relay-nba HEAD — no seed manifest and
> no seed-coverage check exist there (`ls scripts/ | grep -i seed` returns only
> `probe-epl-seed-premise.mjs` and two CFL backfill scripts). A multi-ask
> document's status is the status of the DOCUMENT, with the per-ask detail after
> it.

One-liner (as filed):
```
/context/date serves only what the archive was SEEDED with, which is an implicit
subset of what the relay is CONFIGURED to fetch. Competitions in that gap (UEFA,
now EPL) never appear, and the gap is discovered by a human pointing at ESPN
rather than by a check. Make the seed set a declared manifest, and fail when a
configured competition with fixtures is silently absent.
```

---

## CORRECTION — what HEAD showed (relay/client execution, 2026-08-21)

The relay session probed HEAD and found **ask 3's premise false two independent
ways**; do not build it.

**Wrong: "EPL is not seeded."** EPL is already in the seed table —
`src/index.js:7587`, `{sport:'soccer', league:'eng.1', label:'EPL'}`, sitting
between MLS and La Liga, predating this session. The UEFA fix worked because those
six rows were genuinely absent; this is not that. The row the ask asks for exists.

**Wrong: the "gap" on a future date.** EPL *is* seeded — `/context/date/2026-08-21`
carries `EPL 1` (Arsenal v Coventry, which rendered 3-0 Final on the desk with
venue, arc, and drama). What I read as a gap on `/context/date/2026-08-22` (all
MLS) is just game-day seeding: **MLB — indisputably seeded and playing — is present
3/3 past days and 0/2 future days, exactly like EPL.** Only MLS pre-seeds ahead,
which this doc's own evidence table already stated ("MLB … seeded ~10:00 local on
the day"). A future-dated query returning only MLS is the system working. This is
the same future-date misreading that produced the two wrong flags in the
brief-data-quality doc — I read a symptom off `/context/date` and inferred a cause
without a HEAD probe.

**What survives — asks 1 and 2, with one artifact fix.** A declared seed manifest
and a check that fails when a configured competition with fixtures is absent are
still worth building — that is what would have answered this in one CI run instead
of a screenshot. **But ask 2's artifact as written ("on 2026-08-22 the check flags
EPL") encodes the false positive permanently** — it would fire every day on every
competition that has not yet reached its seeding tick. Rewrite it against the
**game-day model**: evaluate on a date that has already passed its tick (a past
day), not a future one. Ask 3 is dropped entirely.

---

## Probe block — run first, from HEAD, not memory (Rule 87)

Two of this session's assertions were falsified by measurement (see the UEFA and
brief-data-quality CC-CMDs). Verify every premise below before acting.

```bash
git log --oneline -5

# PREMISE A: /context/date reads ARCHIVE_DB only, and the archive is written by
# the cron iterating a LEAGUES table. Stated by the relay session in the UEFA
# thread; confirm against src/index.js (the /context/date handler and the
# journalism-cycle seed writer).
grep -n "ARCHIVE_DB\|LEAGUES\|handleJournalismCycle" src/index.js | head -40

# PREMISE B: the fetch config (V2_LEAGUES) is a SUPERSET of the seed set
# (LEAGUES). List both and diff them.
node -e '/* print V2_LEAGUES keys */'    # the configured-to-fetch set
node -e '/* print LEAGUES rows        */' # the seeded set
# The delta is the silent gap. EPL and the UEFA competitions are the known
# members; confirm the full list.

# PREMISE C (measured from the laboratory side, 2026-08-21): the gap is real and
# user-visible on a future date.
#   /context/date/2026-08-22            -> 15 games, ALL MLS, zero EPL
#   /archive/query?date=2026-08-22      -> count 0
#   ESPN eng.1 scoreboard?dates=20260822-> full 2026-27 Premier League matchday
#     (Arsenal v Coventry 401879301 @ Emirates; Man Utd @ Hull City 401879322)
curl -s "$RELAY/context/date/2026-08-22" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
  console.log("regular:", d.games.regular.length,
    "sports:", [...new Set(d.games.regular.map(g=>g.sport))].join(","));'
```

---

## The gap, measured from the laboratory side

`/context/date` is the only surface the laboratory reads, and it serves the
archive, not the fetch layer. The archive is seeded per competition, and the seed
behaviour is not uniform:

| competition | in `/context/date`? | how it gets there |
| -- | -- | -- |
| MLS | yes, far in advance | schedule pre-seeded (rows `created_at` 2026-06-30 / 07-06) |
| MLB | yes, game-day | seeded ~10:00 local on the day (`created_at 2026-08-20 10:00`) |
| UEFA UCL / Europa / Conference | **was absent** | not seeded until the relay added six `LEAGUES` rows (commit `8289762`) |
| **EPL** | **absent** | not seeded at all — see below |

The through-line: a competition appears in `/context/date` only if something wrote
it into the archive. Being *fetchable* on demand (`/v2/games?sport=…`, or the
`V2_LEAGUES` config) is not the same as being *seeded*, and nothing asserts the
two agree. The UEFA competitions proved this by being fetch-configured for months
while serving zero rows; EPL is the same defect, caught the same way — a human
comparing FIELD's slate to ESPN's.

**EPL, concretely (verified against ESPN 2026-08-21, not assumed):** the 2026-27
Premier League opens **tomorrow, 2026-08-22**. ESPN
`soccer/eng.1/scoreboard?dates=20260822` returns league id 700, *"2026-27 English
Premier League"*, with Arsenal v Coventry City (`401879301`, Emirates) and
Manchester United at Hull City (`401879322`) among others. FIELD's
`/context/date/2026-08-22` is 15 games, **all MLS**, and `/archive/query` for that
date is `count: 0`. The whole opening matchday is missing from the surface the
laboratory renders.

## Why a per-competition fix is not enough

The UEFA fix added six rows. The EPL fix will add more. Each closes one instance
of a gap that keeps being *discovered* rather than *caught*. The defect is that
the seed set is an implicit subset with no manifest and no check: a competition
can be dropped, renamed, or never-added, and the only signal is a user noticing
FIELD is thinner than ESPN on a given night. This is the exact shape the venue
table hit (`render-check`'s "the venue table covers at least one venue on this
slate" exists because coverage was previously unmeasured) and the sport registry
hit (`sport-registry-check` measures the registry against the sports actually
served). The seed layer needs the same treatment.

## The asks

### Ask 1 — Make the seed set a declared manifest

Every competition the relay is configured to fetch is one of exactly two things,
declared explicitly:

1. **seeded** — written into the archive on a stated cadence (schedule-ahead like
   MLS, or game-day like MLB), so it appears in `/context/date`; or
2. **fetch-only by decision** — on an explicit exclusion list with a reason, the
   same device as `Sport.Golf`'s `Omission` ("declared unmodelled, not
   unrecognised") and the drift-sentinel's "declared omissions are not the whole
   slate."

No competition may be in the fetch config, have fixtures, and be absent from both
lists. That silent third state is the bug.

### Ask 2 — A check that fails on a silent gap

For a given date, the set of competitions with fixtures available to the fetch
layer, minus the declared fetch-only set, must equal the set present in
`/context/date`. A configured competition that has fixtures and is neither seeded
nor declared-excluded fails the check — negative-tested, failing by name, the
same shape as `check-leagues-label-contract.mjs`.

**Artifact:** on 2026-08-22 as it stands today, the check flags EPL (fixtures on
ESPN `eng.1`, zero rows in `/context/date`, not on a declared exclusion list). It
must go green either by seeding EPL (ask 3) or by an explicit, reasoned exclusion
— not by silence.

### Ask 3 — Seed EPL, the live instance

Add EPL to the seed path so the 2026-27 season appears in `/context/date` from its
opening matchday. This is the UEFA fix again (rows in the seed driver), for the
competition whose first games are tomorrow.

**Artifact:** `/context/date/2026-08-22` contains the EPL fixtures ESPN lists for
`eng.1` on that date, under a declared `sport` label (coordinate the exact label
with `CC-CMD-2026-08-20-brief-data-quality` ask 3 — the label must be declared
*before* the rows land, or they orphan). Home/away must match ESPN's `homeAway`
field (Arsenal home at the Emirates), not the URL slug order.

## What this does NOT change

- Not the pull/push architecture. `/context/date` stays a pull-served read of the
  archive; this is about what the archive is seeded with, not how it is served.
- Not the fetch layer. `/v2/games?sport=…` already works for these competitions;
  the gap is purely that the archive does not persist what the fetch layer can
  return.
- Not the laboratory. When EPL lands under a declared label, the laboratory models
  it on first observation (`Sport` registry currently has `EFL Cup` and `La Liga`,
  not EPL) — recorded here only for sequencing: manifest + seed + label contract
  first, model second.

## Relationship to the open CC-CMDs

- `CC-CMD-2026-08-20-uefa-club-competitions` closed one instance of this gap (six
  `LEAGUES` rows). This ask generalises it so the next competition is caught, not
  discovered.
- `CC-CMD-2026-08-20-brief-data-quality` ask 3 owns the *label* EPL arrives under.
  This ask owns whether EPL arrives at all. Both must land before tomorrow's
  matchday renders correctly; label-first, then seed.
