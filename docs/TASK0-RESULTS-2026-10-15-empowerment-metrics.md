# Task 0 results — 2026-10-15

Probes for `CC-CMD-2026-10-15-empowerment-metrics.md`, run against the live
relay and R2. Read-only throughout; no types written.

**Three of the four gates moved from where the CC-CMD placed them**, and one of
my own earlier conclusions is overturned below by measurement.

---

## Where the data actually is

`/soccer/xg` is **ESPN-sourced** (`site.api.espn.com`) and takes ESPN ids. It
answers `{"_hasXG": false, "_error": "summary 400"}` for a BSD event id. Different
id spaces — do not cross them.

`/bsd/` has **no per-event route**. `/bsd/` itself returns
`{"error":"Unknown BSD route"}`. The deployed BSD routes are `contract`,
`coverage`, `events/by-date`, `events/live`, `events/season`, `r2/list`,
`r2/read`, and the tennis set.

**Everything these four metrics need is in R2**, under `bsd/wc26/{event}/`:

| file | carries |
|---|---|
| `stats.json` | `shotmap`, `momentum`, `average_positions`, `xg_per_minute`, `stats` |
| `incidents.json` | `incidents[]` — goals, cards, subs, periods |
| `average-positions.json` | standalone, 3 files only |

`incidents.json` is **not** the xG source. It carries no xG field at all, and its
`sequence[]` appears on exactly the 5 goals — it is goal buildup, not a match
event stream. Anyone starting there will conclude the data is absent.

---

## 0.1 Flow State — **CLEAR**

`stats.json.shotmap` is `list[34]` for event 8348, keys:

```
min, added, home, xg, xgot, pos, gm, gml, sit, body, type, block, gtype, player_id
```

`xg` present on **34/34**. `min` and `added` give ordering; `home` gives team.

```json
{"gm":{"x":0,"y":46.9,"z":3.8},"xg":0.0787,"gml":"low-right","min":90,
 "pos":{"x":12.6,"y":34,"z":0},"sit":"assisted","body":"right-foot",
 "home":true,"type":"save","xgot":0.3375,"added":5,"player_id":810}
```

**The field names are `min` and `home`, not `minute` and `is_home`.** My first
pass queried the latter and got "0/34 minutes present, all is_home None" — a
clean false negative off a guessed key name. Do not take those names on trust.

### One semantic narrowing that must reach the type

The shotmap knows about **shots**, not all events. So "three consecutive xG
events without opponent interruption" can only mean **three consecutive own-team
shots with no opposing shot between them** — it cannot see opposing possession,
pressure, or a turnover that did not produce a shot.

That is a weaker claim than "flow" implies, and it is the same denominator
problem in miniature. Name it precisely in the type's doc comment. `InFlow`
should not be read as "this team controlled the game."

## 0.2 Gravity Well (soccer) — **REJECTED**, and my earlier reasoning was wrong

The CC-CMD said the average-position surface answers `empty=true`, implying the
data does not exist. **That is wrong, and I am correcting it with measurement.**
`stats.json.average_positions` is populated:

```json
{"away":[{"n":6,"x":80.1,"y":19.4,"pos":"M","name":"A. Qasem","player_id":9358}, ...],
 "home":[...]}
```

Per player: shirt number, x, y, position label, name, id. Three standalone
`average-positions.json` files exist as well. The **live route** is empty; the
**captures** are not. Those are different facts and the CC-CMD conflated them.

**The rejection stands anyway, on better grounds.** These are *averages over the
match* — one coordinate pair per player. Gravity-at-a-moment is not derivable
from a match-long mean, however the route behaves. The data is the wrong *kind*,
not merely absent, which is a stronger and more durable reason.

**Build the off-ball concept on NFL BDB tracking**, as approved. Soccer gets
nothing here.

## 0.3 Second Wind — **CLEAR** (NHL, unchanged)

`api.nhle.com/stats/rest/en/shiftcharts` returns one row per shift with
`startTime`/`endTime` per player, 692/692 verified. Confirmed by prior work, not
re-probed. Use `/stats/rest/en/shiftcharts`; the documented
`/nhl-stats/shiftcharts` is refused by the allow-list.

## 0.4 Tactical Lock — **CLEAR**, and the denominator exists

`xg_per_minute` is a per-minute series carrying **both incremental and
cumulative** xG for both teams:

```json
[{"m":3,"xg_home":0.046,"xg_away":0.0,"cum_home":0.046,"cum_away":0.0},
 {"m":4,"xg_home":0.549,"xg_away":0.0,"cum_home":0.596,"cum_away":0.0}, ...]
```

A rolling 4-minute opponent-xG window is `cum_away(t) − cum_away(t−4)`. Direct,
no reconstruction needed.

**`momentum` is the territory denominator.** `[{"m":1,"v":-8},{"m":2,"v":-8},
{"m":3,"v":10},{"m":4,"v":42},{"m":5,"v":70}, ...]` — signed per-minute, one
point per minute. Sustained momentum against you with near-zero conceded xG is
`LockedOn`; low momentum and low xG is `Quiet`. The 2×2 is computable today.

`momentum`'s units and sign convention are **not documented in `/bsd/contract`**
and must be established before thresholding. Do not assume the sign favours the
home team.

---

## The blocking finding: coverage, not shape

**R2 holds `wc26` only.** First 100 keys are 100% `bsd/wc26/`, uploaded
**2026-06-25 to 2026-07-19**. The listing reports `truncated: true`, so page it
before trusting the prefix count — but nothing in the sample is current-season,
and `events/by-date` serves MLS and other current fixtures whose stats are not
in R2.

So all four metrics would be built against **World Cup 2026 captures and nothing
live**. That has two consequences the design has to answer:

1. There is no live feed behind these, so `InFlow` and `LockedOn` are
   **post-hoc states over a finished match**, not live ones. Which, incidentally,
   disposes of the ADR-002 amnesty question by construction rather than by the
   ruling — a finished match is the amnesty zone.
2. If live rendering is wanted, a capture path for current fixtures has to exist
   first. **That is a prerequisite, not a follow-up.**

## A frame discrepancy — one sample, not yet a finding

`/bsd/contract` is revision `2026-10-10-1` and its frames were verified against
event **223324 (October)**. The only R2 captures are **wc26 (June–July)**.

In wc26 8348 the 82' goal sequence reads shooter `pos.x 65.1` with
`gk.x 97.1`. The contract's worked example for 223324 reads the defending keeper
at `gk.x 5.4` beside the scorer at `pos.x 7.3` — keeper *nearer* the attacked
goal. Here the keeper is **farther** from it than the shooter, which the
target-goal-relative frame should not produce.

`shotmap[].pos` **is** consistent: `x 12.6` falls inside the contract's stated
2.3–30.8 band.

**One sample. Do not promote this to a finding without checking it across
captures and both teams** — the comparable mistake has been made in this tree
before by reading one day's rows as the population. But do not apply the October
contract to June captures as though the question were settled either. This is
precisely the hazard the frame-in-the-type requirement exists to catch, and it
may already be live in the only data available.

---

## Net

| task | gate | status |
|---|---|---|
| 1 Flow | reconstructible? | **CLEAR** — with the shots-only narrowing stated |
| 2 Tactical Lock | rolling window + territory | **CLEAR** — `xg_per_minute` + `momentum` |
| 3 Second Wind | shift lengths | **CLEAR** — NHL shift charts |
| 4 Gravity Well | off-ball XY | **REJECTED for soccer**; build on NFL BDB |

Open before any type is written: the wc26-only coverage question, the `momentum`
sign/unit convention, and the frame discrepancy above.
