# Data verification — Constrictor, Catalyst, Anchor (2026-10-15)

Each of the three replacement metrics arrived with its data requirement marked
verified. **Two of the three claims are false, and the third is true in a way
that is worse than false being true.**

Measured against wc26 captures already on disk, the 223324 fixture, the live
`/nflverse/` surface and relay `src/index.js` at HEAD.

---

## 1. The Constrictor — claim is **FALSE for soccer**

> *"Standard play-by-play EPA/yard-line data (verified to exist in both
> `nflverse` and `wc26` captures)."*

**There is no EPA and no yard line in any `wc26` capture, nor in the 223324
fixture.** Searched 8 matches plus the October fixture: `epa` ABSENT, `yard`
ABSENT, `yardline` ABSENT.

A grep did return one `epa` hit. It is the player **M. Depay**.

> A string match is not evidence unless it is confirmed to be matching for the
> right reason.

EPA is a down-and-distance construct. Soccer has no downs, no yard lines, and no
EPA. The nearest soccer analogues do exist in `stats.json` — `final_third_entries`,
`shots_inside_box`, `touches_in_penalty_area`, `dangerous_attack`,
`dangerous_attack_pct` — but they are not EPA and support no "inside the
30-yard line" predicate. **Drop the "(NFL/Soccer)" framing; this is NFL-only.**

### The NFL half: denominator confirmed, numerator unverified

`/nflverse/epa_table.json` is live, 17,830 bytes, and carries exactly the
denominator this metric needs:

```
keys: generated, method, description, inputs, ytg_buckets, yl100_buckets,
      ep, turnover_ep          generated 2026-08-15T00:47:34Z
```

`yl100_buckets` + `ep` is expected points by field position — the league-average
baseline, already built.

The **numerator** (opponent EPA per play) routes through
`/nfl/epa/plays?event={ESPN id}`. **I could not exercise it.** The three ids I
tried returned one 403 and two 404s, all `espn-summary returned …` — but I drew
those ids from a mixed-sport `/context/date` payload without filtering to NFL,
so they were probably not NFL games. **That is my sampling error, not evidence
the route is broken.** Unverified, not disproven. It needs one confirmed NFL
ESPN game id.

## 2. The Catalyst — claim is **FALSE**

> *"Sequential event tagging and possession IDs (standard in `stats.json`)."*

`stats.json` top-level keys are exactly: `event_id`, `stats`, `shotmap`,
`momentum`, `average_positions`, `xg_per_minute`.

- **No possession id.** The only match is `ball_possession`, a match-level
  percentage in the 54-key team stat block.
- **No event stream and no sequential tagging.** `chain`, `sequence`, `poss_id`
  all ABSENT from `stats.json`.
- `shotmap` entries carry `player_id`, `min`, `xg` — and **no link to any
  possession or chain**.

Sequences exist only in `incidents.json`, and **only on goals**: 5 of 25
incidents in 8348, 1 of 16 in 223324.

So "the sum of xG generated in uninterrupted possessions where the player was
involved prior to the final pass" can only be evaluated over **goal buildups**.
The xG of a goal sequence is the xG of a goal, so `chainXg` collapses to roughly
the goal's own `xg`, over 1–5 samples per match.

The second half of the trigger fails harder: *"measured against the team's
baseline xG when they are uninvolved"* requires enumerating the possessions he
was **not** in. That set does not exist in this data at all.

**Not buildable on these captures.** It needs an event-stream feed with
possession ids — a different acquisition, not a decoding problem.

## 3. The Anchor — the field exists, and that is the problem

> *"NFL Next Gen Stats / BDB pressure timelines."*

**`avgTimeToPressure` is real.** `/nflverse/bdb_xblock_pass_rush.json`, 48,688
bytes, 321 rushers:

```json
{"name":"Aaron Donald","team":"LA","pos":"DT","rushSnaps":251,
 "pressureRate":0.12,"qbHitRate":0.032,"avgTimeToPressure":2.3}
```

I was one sentence from reporting that time-to-pressure did not exist. Fetching
the file instead of trusting the allow-list is what caught it — and the
allow-list carries its own warning about exactly that: five files were removed
in August 2026 because they *"were allow-listed but had NO builder and NO client
consumer — every request 404'd against a file nothing produced."*

### The defect, which is worse than absence

```
bdb_xblock_pass_rush.json   season: 2022   targetYear: 2026
bdb_time_to_throw.json      season: 2022   targetYear: 2026
ngs-passing.json            season: 2026   targetYear: 2026
```

**The BDB tables are 2022-season data served under `targetYear: 2026**, sourced
from `kaggle alexandermeau/nfl-big-data-bowl-archived-data-2025`.

An Anchor built on this would describe **2022 defensive fronts and render them
as the current season**. The number is well-formed, correctly named, plausible
in magnitude, and four years stale. Nothing in the render path would complain.

Worse, the two vintages **collide on field names**: `bdb_time_to_throw` (2022)
and `ngs-passing` (2026) both carry `avgTimeToThrow`. Joining them mixes seasons
silently.

`season` and `targetYear` must be carried in the type, not read and discarded.
A value whose season does not match the season being rendered should not be
constructible.

### What is actually buildable

Not the metric as specified:

- **No per-play pressure timeline.** `avgTimeToPressure` is a *per-rusher season
  average* over `rushSnaps`. There is no play-level series to fit a decay curve to.
- **No down split.** Nothing supports "on 3rd/4th down."
- **No defensive front identification.** `bdb_tendency_fingerprint.json` is a
  *team* PA/dropback/formation profile, not per-snap alignment.

A per-rusher pressure-rate comparison against positional baseline **is**
buildable from `pressureRate`, `qbHitRate`, `avgTimeToPressure` and `rushSnaps`.
That is a different and weaker metric than the Anchor, and it would be reporting
on 2022.

---

## Net

| metric | claim as given | verdict |
|---|---|---|
| Constrictor | EPA/yard-line in nflverse **and wc26** | **soccer half FALSE**; NFL denominator confirmed, numerator unverified |
| Catalyst | possession ids standard in `stats.json` | **FALSE** — no possession ids, no event stream |
| Anchor | NGS/BDB pressure timelines | field **exists**, but per-rusher season average, **2022 data under targetYear 2026** |

**Before any of these is typed:** settle the BDB vintage question. It is not
specific to the Anchor — every BDB-derived surface in FIELD inherits it, and
`bdb_separation` and `bdb_route_entropy` already have client consumers.
