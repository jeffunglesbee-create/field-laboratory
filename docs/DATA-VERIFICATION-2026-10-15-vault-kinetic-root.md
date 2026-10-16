# Data verification — Vault, Kinetic Separation, Root (2026-10-15)

**None of the three is buildable in FIELD today.** Not because the concepts are
wrong — pinning to `pass_forward` is a sharper analytical choice than anything
in the previous batch — but because all three need the same thing, and FIELD
does not have it.

## What they all need, and what exists

| metric | needs |
|---|---|
| The Vault | QB **and** nearest rusher XY at the `pass_forward` frame |
| Kinetic Separation | receiver **and** nearest defender XY at `pass_forward` |
| The Root | DT XY from `snap` through `pass_forward`, plus double-team identification |

Plus the Vault's render — *"an SVG polygon connecting the offensive linemen"* —
needs five more coordinate pairs per play.

FIELD's **entire** NFL tracking surface is six files. All fetched and inspected:

| file | n | shape | season |
|---|---|---|---|
| `bdb_route_entropy` | 354 | `{name, team, pos, routesRun, distinctRoutes, entropyBits}` | 2022 |
| `bdb_separation` | 250 | `{name, team, pos, targets, avgSepYds}` | 2022 |
| `bdb_speed` | 1648 | `{name, team, maxSpeedMph, maxSpeedYps}` | 2022 |
| `bdb_time_to_throw` | 32 | `{team, dropbacks, avgTimeToThrow}` | 2022 |
| `bdb_xblock_pass_rush` | 321 | `{name, team, pos, rushSnaps, pressureRate, qbHitRate, avgTimeToPressure}` | 2022 |
| `bdb_tendency_fingerprint` | 32 | `{team, plays, dropbackRate, playActionRate, topFormation}` | 2022 |

**Zero coordinate keys across all six.** No `x`, no `y`, no position field of any
kind. Every row is a per-player or per-team season aggregate. There is no play,
no frame, and no event in any of them.

## Why the frames are missing, measured rather than assumed

`scripts/bdb-access-probe.mjs` exists in the relay for exactly this question —
its header reads *"verify whether NFL Big Data Bowl tracking data (P3) is
reachable WITHOUT Kaggle credentials (Rule 72: verify the 'needs Kaggle'
claim)."* Its recorded result, `outbox/bdb-access-probe-20260815T143125Z.log`:

```
kaggle-competition-download: HTTP 401
kaggle-dataset-download:     HTTP 404
nflverse-releases-tracking:  HTTP 404     <- tracking_2025.parquet
nflverse-pbp-participation:  HTTP 302     <- works, but is participation
```

So: **nflverse publishes no tracking release.** The only route to frame-level
data is Kaggle, credentialed — and what came through it is the archived
**2022** dataset, which is why all six files read `season: 2022` under
`targetYear: 2026` (see `incident-2026-10-15-bdb-tables-2022-season-served-as-2026`).

The builder consumes tracking upstream and emits season means. **The reduction
happens before anything reaches the relay**, so no decoder, type or query can
recover a frame that was never stored.

## One frame mismatch worth noting on its own

`bdb_separation` is `metric: avg_separation_yds`, and the allow-list comment in
relay `src/index.js` specifies **"avg sep at `pass_arrived`"**.

Kinetic Separation asks for separation at **`pass_forward`**. That is the better
question — separation at release is what the quarterback actually throws into,
while separation at arrival folds in everything that happened during ball
flight. The brief's instinct is right.

It is also exactly why the existing aggregate cannot serve as a fallback: it
answers a different question at a different instant. A `Covered | FlashedOpen`
built on `avgSepYds` would be a season mean at the wrong frame wearing the name
of an instantaneous measurement at the right one.

## This is the Gravity Well rejection, a second time

Gravity Well was rejected for soccer because `average_positions` is a match-long
mean — one coordinate per player — and no instantaneous quantity can be derived
from it. The NFL pivot was approved on the premise that BDB tracking supplies
real off-ball XY.

**It does — upstream, at Kaggle. FIELD never stores it.** Between the tracking
source and this application sits a reduction step that discards every frame, and
what survives is the same shape as `average_positions`: one number per player
per season.

So the pivot moved the metric to a different sport whose data FIELD also does
not hold, **in precisely the same shape**. Three metrics, two sports, one
recurring failure: *an instantaneous quantity specified against a surface that
stores only aggregates.*

The F# type was never the hard part. All three would compile in fifteen minutes
and have nothing to decode.

## What would make them buildable

A `build-bdb-frames` step emitting **per-play rows at named event frames**
(`snap`, `pass_forward`, `pass_arrived`) carrying player id, team, position and
XY, for a bounded subset of plays. The source exists, the credentials exist, and
the access question is already answered.

Two conditions on that work:

1. **It yields 2022.** Anything built on it describes the 2022 season and must
   be labelled so, in the type and not only in a comment.
2. **Size it first.** Frame-level tracking is orders of magnitude larger than
   six aggregate files totalling ~280 KB. A bounded subset — one week, or one
   event frame per play — is the deliverable, not the full set.

Until that exists, all three stay rejected. Recording them as rejected with the
measured reason is the result; it is not a gap.
