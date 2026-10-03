# Claude Code Command — Premier League forecaster

**Date:** 2026-09-11
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** C (feature)

**Rule F:** cleared by Jeff 2026-09-11 for a modelled forecast, not only a
market-implied one. **Rule A (autonomous push) is NOT cleared** and is out of
scope — pull-only, rendered on request. If the design drifts toward notification
or badge-on-change, stop and report.

**Status:** FILED, not started. `guards` is green as of 2026-09-21 and no longer
blocks. **Substrate re-probed 2026-10-03 and the phases are now SWAPPED.**

## RE-PROBE 2026-10-03 — WHY THE PHASES SWAPPED

| input | 2026-09-11 | 2026-10-03 |
|---|---|---|
| standings | 20 clubs, P4 | **holds** — 20 clubs, P5. City 15pts GF13, Arsenal 12, Brighton 10 |
| `/fpl` fixtures | full season, 380 | route unchanged and deployed |
| **EPL odds** | ~72-hour horizon | **ZERO** |
| fbref xG | empty | **still empty, 3.5 months stale** (`updated 2026-06-23`, `teams: 0`, still labelled 2025-2026) |

`/context/date` returns **no EPL rows on any date probed** — 10-03, 10-04, 10-05,
10-17, 10-24 — while the table shows 5 played. Today's 75 rows are CFB 54,
NHL 13, MLB 4, golf 1, NBA 1, EFL Trophy 1, CFL 1. Oct 17 and Oct 24 return MLS
only; Oct 4 and Oct 5 return zero rows entirely.

**Supply is not the cause.** Vendor `soccer_epl` present and active,
`requests_remaining 98530`. Relay budget 600 of 3800 daily,
`ceiling_reached_at: null`, `by_site_sum 600`, `unaccounted 0`.

**Unresolved, and it gates trusting any odds volume figure:** `/budget/odds`
reports `degraded_open: { events: 444, credits: 2565 }` today — credits that
reached the vendor while a guard fell open and the counter never moved. Four
times the counted spend, and it does not reconcile with the provider's
`requests_used: 1470`. Three sources, three totals.

**THE LESSON THIS DOCUMENT IS AN INSTANCE OF.** Phase 1 was built on the LEAST
stable input and deferred the most stable one. Market-implied was chosen for
carrying "no model risk" — but a model with no data to run on is a worse risk
than a simple model, and that is what happened. Standings and `/fpl` have not
moved in three weeks; odds went to zero in days.

> **Note on this document.** It was revised repeatedly as probes came back. Where
> an earlier revision is retracted, the retraction is stated rather than silently
> removed.

## SUBSTRATE — probed live 2026-09-11, not assumed

**Fixtures — `/fpl`.** A deployed relay route,
`{ k: "proxy", s: "fantasy.premierleague.com", p: 1 }`, already consumed by the
client (`field.js:19640`). `fixtures/` gives all 380 with `event` (GW 1–38),
`kickoff_time`, `team_h`/`team_a`. `bootstrap-static/` gives the team table.
FPL is the source because it is OPEN; the official Premier League API
(`footballapi.pulse.football.co.uk`) is not — `probe-fpl.yml` needs Playwright
for Pulse while plain curl works for FPL.

**Standings — `/espn-standings/soccer/eng.1/standings`.** HTTP 200, 68,769 bytes,
"2026-27 English Premier League", 20 entries. Arsenal P4 12pts GD+7; Man City
P4 12 +6; Leeds P4 8 +4.

**Odds — three-way, ~72-hour horizon.** EPL 2 of 2 rows carried a draw on
2026-09-06 and draw prices move. But odds exist only for fixtures with a D1 row:
measured 7 EPL rows on 2026-09-12, 2 on 09-13, 1 on 09-14, **0 from 09-19
onward**. `Market.threeWay` refuses to construct unless home+draw+away sums to 1
within `SUM_EPS`, so overround removal is enforced by the constructor.

**DO NOT USE — `/soccer-fbref/epl.json` is EMPTY.** HTTP 200, 498 bytes of
well-formed JSON: `competition: "Premier League 2025-26"`, `updated:
"2026-06-23"`, **`teams: {}`**. A schema block naming `xGFor`, `xGAgainst`,
`xGDivergence` with no data behind it. The filling cron (`soccer-fbref-wc.yml`)
runs "every 3 days during WC group stage" and has stopped. This is Rule 99
(`jubilant-bassoon/STANDARDS.md:4906`) in the data layer — a 200 with a valid
envelope is indistinguishable from a 200 with content unless you look inside.
Any xG-based model would silently forecast on an empty set. Separate finding;
do not fix here.

**Team identity — handled by `field-relay-nba` CC-CMD `b8f1a0e`, which RUNS
FIRST.** Do not start this until it has landed. A bad team join fails silently.

## TASK 0 — PROBE (read from HEAD, do not trust this document)

1. Re-probe `/fpl fixtures/`, `/espn-standings/...`, and odds for two dates.
   Record real values. This document's numbers are a starting point, not evidence.
2. Confirm `Market.threeWay`'s signature and `SUM_EPS` at HEAD.
3. Confirm `/soccer-fbref/epl.json` is still empty. If refilled, report it — it
   does not change scope.
4. **Confirm EPL rows exist somewhere before relying on any odds path.** As of
   2026-10-03 `/context/date` returns zero EPL rows on every date probed. Two
   readings remain unseparated: EPL rows are not being written to the archive, or
   they are no longer on this path. Settle which before writing any
   `MarketImplied` code. **This does NOT block Phase 1**, which needs only
   standings and `/fpl`.
5. Team identity is handled by `src/odds-name-match.js` (relay, 2026-09-16,
   80 of 80 on its fixture). The earlier instruction to wait for `b8f1a0e` is
   RETRACTED — that CC-CMD was superseded and never ran. Verify EPL names resolve
   through the matcher; do not wait on it.

## PHASE 1 — THE RECORD, WITH **MODELLED** ROWS IN IT. Build this only.

**Do not build a forecaster and bolt a record on later. Build the record; the
forecast is its latest row.**

This supersedes an earlier revision that made the change record a Phase 2
addition. That phasing was backwards. A forecast is a point observation; a change
record is the sequence of them. If observations are stored with value,
provenance, cause and timestamp, the current forecast is the head of the record
and the change record is the diff between consecutive rows. One store, two views.

Four consequences, and they are why this ordering is chosen:

- A forecast **cannot exist without its provenance**, because it IS a row with
  provenance columns. `MarketImplied` vs `Modelled` stops being a rendering
  convention and becomes a column.
- `ModelRevised` stops being a retrofit. It is a property of the row at write
  time — the only moment it is knowable. A number moving because reality moved
  and a number moving because we changed the model are indistinguishable
  afterwards, permanently.
- The "persisted prior" problem dissolves. There is always either a prior row or
  explicitly none.
- No separate storage design later. **D1 from the first commit.**

It also inverts the risk. Shipping bare numbers first and adding memory later
leaves the window with no record of how forecasts moved being exactly the window
where the model is newest and moves most.

### Scope — MODELLED first, market second

**SWAPPED 2026-10-03.** Phase 1 computes `Modelled` per-fixture probabilities
from standings + `/fpl` fixtures. `MarketImplied` is NOT built in Phase 1; it
becomes a second provenance value in the same store when odds return.

Three reasons this is the better ordering, not merely the possible one:

- **`NoForecast` stops being the dominant state.** Under market-implied it was
  ~370 of 380 fixtures. Under modelled it is near zero — every fixture gets a
  projection, because the model does not need a price to exist.
- **The `Paired` type already assumed it.** `ModelOnly` was specced as the
  dominant case while market sat in the foundation. The types were right and the
  phasing contradicted them.
- **`SubstrateLost` already anticipated it.** Odds vanishing should be a RECORDED
  EVENT in the store, not a broken build. With the model underneath, the odds
  disappearance becomes a row — which is the entire point of building the record
  first.

The season projection and the six outcomes remain PHASE 2. Phase 1 is per-fixture
only: one modelled three-way probability per scheduled fixture, written as a row.

**Keep the model simple and say what it is.** Phase 1 is not the place for a
sophisticated rating system. Points, goal difference and goals scored from the
standings, plus home advantage, is enough to produce a three-way probability that
normalises. State the method in the outbox so a later reader can tell a model
revision from a reality change — which is what `ModelRevised` exists to record.

### The store

One D1 table, **append-only**. One row per observation of one subject:

```
subject        fixture id, or team+outcome for a season slice
value          the probability, or the NoForecast reason
provenance     MarketImplied | Modelled | NoForecast
cause          DeltaCause, stamped at write time
observed_at
```

Append-only matters specifically: `codex_write` replaced content in place and
destroyed 26 entry bodies on 2026-09-08, and the `codex_history` guard exists
because of it. Do not build a store that can overwrite an observation.

The `DeltaCause` union, the `Paired` type, the D1-not-`localStorage` reasoning
and the no-receipts tension are specified under PHASE 2 below. **Read them now —
they govern the schema written in Phase 1.**

### `Forecast.fs` — provenance in the type

```fsharp
type Forecast =
    | MarketImplied of Market.ThreeWay   // what the book says
    | Modelled      of ModelledForecast  // what WE say
    | NoForecast    of NoForecastReason  // and WHY
```

`NoForecastReason` distinguishes at minimum: beyond the odds horizon; no odds
published for this fixture; fixture unscheduled (FPL `event: null` — EPL
rearranges constantly for cup and European ties); substrate unreachable.

**`NoForecast` is the DOMINANT state, not an error.** 16 of 42 rows had no odds
on 2026-09-06. A forecaster that only looks right when odds exist is wrong most
of the time. Follow the `Modelled: bool` + `Omission: string option` precedent in
`Desk.fs`.

### Rule 47 and no-receipts

Rule 47 (RELAY-CPU-A): editorial intelligence stays client-side. The model
computes in Fable; the relay supplies odds and standings only.

The 2026-07-09 UI spec (Drive `1bbRIRG_...`) forbids exposed computation — no
"Drama 87", no "win probability swing +23". A probability is permitted (same
class as win probability, which ADR-002 clears); simulation internals are not.
Render the number, never "34.2% across 10,000 simulations".

### Verification (inside this session)

Paste real per-fixture output for a named EPL matchday, including at least one
`NoForecast` with its reason. If no `NoForecast` occurs that day, say so rather
than asserting the branch works.

Add a `<!-- proof: FSxxxx -->` case to `docs/FORECAST-PROOF.md` showing a
consumer handling only `MarketImplied` fails to compile; verify via
`scripts/proof-check.mjs`, do not assert it in prose.

### DONE CONDITION — Phase 1

- D1 store exists, append-only, with provenance and cause columns.
- **Two observations of the same subject recorded on different runs**, and the
  diff between them produced with a correct `DeltaCause`. One observation proves
  nothing about a record.
- A first-run case shown explicitly reporting "no prior" rather than
  "unchanged".
- `Forecast` union with all three cases; `NoForecastReason` covers the four above.
- Proof case compiles-and-fails as claimed, verified by `proof-check.mjs`.
- Real matchday output pasted, with a named `NoForecast` case or a statement of
  why none occurred.
- Task 0.4 confirmed before any of it.

---

## PHASE 2 — MODELLED. DESIGN IS SETTLED, DO NOT BUILD IN THIS SESSION.

No open decisions remain. Phase 2 adds `Modelled` as a provenance value in the
store Phase 1 already built, plus the season simulation. It introduces NO new
storage.

### The six outcomes are ONE computation

Title, Champions League, Europa League, Conference League, relegation and final
position are six slices of a single **final-position distribution** — a 20×20
matrix where `P[team][k]` is the probability that team finishes k-th.

Simulate once, derive all six. Nothing is computed twice, and the six can never
disagree with each other — which they inevitably would as six separate models.

### The simulation emits SCORELINES, not results

Position is decided by points, then goal difference, then goals scored, then
head-to-head. Arsenal and Man City are both on 12 points, separated only by GD.
A W/D/L simulation cannot order them and every slice inherits the error.

Confirmed present in the standings payload (Arsenal's stats block, 2026-09-11):
`points 12`, `pointsFor 8`, `pointsAgainst 1`, `pointDifferential 7`,
`deductions 0`. `pointsFor`/`pointsAgainst` are goals for and against — ESPN's
generic stat names for a soccer table.

**`deductions` must be carried, not assumed zero.** Points deductions are real in
the EPL and a live one makes every slice wrong for that club.

**Head-to-head is NOT in the payload.** Determine whether simulated results can
supply it; if not, say so and name which positions could be mis-ordered.

### Allocation is a CASCADE, not a position→competition map

The same position yields different competitions depending on cup outcomes.
Domestic cup winners displace league spots **only if they have not already
qualified for Europe by league position.**

```
berths:    UCL ×4 (or 5 by coefficient), EL ×1, ECL ×1
claimants: FA Cup winner → EL, League Cup winner → ECL,
           then league order 1, 2, 3, …
fill:      take next berth, take next UNALLOCATED claimant
```

A cup winner qualifying higher is skipped and the berth **flows down the table**
rather than disappearing. Implement as
`allocate: table -> cupWinners -> Map<Team, Competition>` — a fill loop, not a
lookup.

**Berth counts and claimant order are DATA, not code**, stored with a `Source`
field naming where each rule came from and read per season. England's UCL
allocation has been five in coefficient seasons; Conference League entry has
moved position. Hardcoding "top four" is the `FIELD_V2_SOURCES` failure exactly —
true when written, silently wrong next season, still computing.

### The cup gap is resolved by ENVELOPE — no feed, no cup model

No FA Cup route exists anywhere: not in `src/route-provenance.js`, not in the
client. `eng.league_cup` is in `SOCCER_LEAGUES` (`field.js:15061`); `eng.fa` is
absent. Cup participation is not derivable from a league table.

**Do not build a cup model.** The cascade only bites when a cup winner finishes
OUTSIDE the European places, so the question is never "who wins the FA Cup" — it
is "does the answer change if someone outside Europe does". The simulation
already answers that.

Run `allocate` twice per simulated season:

- **floor** — no cup displacement (both winners already qualify)
- **ceiling** — maximum plausible displacement (both cups won by teams finishing
  outside the European places)

Per team: **identical** → CUP-INVARIANT, report a clean number, and that is a
DERIVED fact rather than an assumption. **Different** → bounded by the two ends,
report the range, never name a cup winner.

**Expectation to be MEASURED, not asserted:** FA Cup winners are usually strong
teams who finish top seven, where the berth displaces nothing — two
anti-correlated events, so the envelope should be zero-width for most of the
table. **Report real per-team widths.** If it is wide for many teams, that is a
finding and this approach needs revisiting.

Only if the envelope proves wide: cup-win probability derives from the same
team-strength parameters the league simulation already uses — the FA Cup is a
knockout among the same clubs. Still no feed; a feed would only add the draw.
`eng.fa` is ESPN's slug, identical in shape to `eng.league_cup`, one line — and
not before the envelope proves it is needed.

### The club list is READ, never hardcoded

Three up, three down every summer. Read the 20 from the standings payload.

### Modelled publishes ALONGSIDE market-implied — decided by Jeff 2026-09-11

**Pairing is the EXCEPTION.** Odds reach ~72 hours; the model projects all 380.
For roughly 370 fixtures there is no market number to sit alongside, so
model-only is the dominant state. Design for that first — a layout that only
looks right when both numbers exist will be wrong for most of the season.

```fsharp
type Paired =
    | Both       of market: Market.ThreeWay * modelled: ModelledForecast
    | ModelOnly  of ModelledForecast * whyNoMarket: NoMarketReason
    | MarketOnly of Market.ThreeWay * whyNoModel: NoModelReason
    | Neither    of reason
```

`whyNoMarket` distinguishes at least: beyond the odds horizon; not published for
this fixture; substrate unreachable. "No price exists" and "we did not fetch" are
different claims (Rule 99). `MarketOnly` is real too — a priced fixture where the
model declines, e.g. a promoted club with insufficient history. The model is not
always-available.

**Agreement must be as visible as disagreement.** If both numbers appear together
only when they differ, a reader sees the model exclusively at its most
contrarian, and every glance implies FIELD thinks the market is wrong. Render
`Both` identically whether the numbers agree or diverge. Agreement is a real
observation — the same reason `Unchanged` is first-class below.

**The divergence is NOT to be rendered as an edge.** Do not compute, label or
surface the gap as a delta, edge, discrepancy or value signal. ADR-002/Rule F
clear an implied probability; "we are 8 points off the market" reads as a
recommendation and Rule F clearance does not carry it. The no-receipts spec
forbids it independently. Show both, labelled by provenance; let the reader
subtract. If the design drifts toward surfacing the gap, stop and report.

### Phase 2 carries a CHANGE RECORD, not an accuracy ledger

Decided by Jeff 2026-09-11. Not "were we right" — **what moved between one game
and the next, and why.** No prediction obligation, no correctness claim.

A forecast that only shows its current value cannot distinguish "we always
thought this" from "this moved hard last night" — the same collapse as
`closing_odds`, where "observed twice, unchanged" and "observed once" rendered
identically until `captured_at` separated them.

```fsharp
type DeltaCause =
    | ResultObserved of fixture   // a match was played
    | MarketMoved                 // prices moved, no match played
    | FixtureScheduled            // the remaining slate changed
    | SubstrateGained             // odds appeared where there were none
    | SubstrateLost               // odds stopped arriving
    | ModelRevised of note        // OUR CODE CHANGED
    | Unchanged                   // first-class, not an absence
```

**`ModelRevised` is what makes this worth building.** A number moving because
reality moved and a number moving because we changed the model are
indistinguishable afterwards unless stamped at the time. Without it every
revision silently rewrites history.

`Unchanged` is first-class, for the same reason `unmoved` is a state in the odds
sentinel. `SubstrateLost` is not hypothetical — MLS went from two-way odds to
none across 17 rows and nothing caught the transition.

**Storage: D1, not `localStorage`.** The Arc Signature spec (Drive
`11DJ6W7h...`) proposed a public record and stored it per-device, so no two users
saw the same numbers. Do not reproduce that. A change record also needs a
PERSISTED PRIOR — there is nothing to diff until one observation exists, and a
first run must say so rather than render as "unchanged".

**Open tension to surface, not to resolve in code:** the no-receipts spec lists
`win probability swing +23` as a bad example, and a change record is literally a
swing. Resolve by scope — **the RECORD is complete; the RENDERING is named.**
Store the full typed delta; surface prose that names what happened ("Arsenal
strengthened after beating City") rather than the arithmetic. If the design
cannot hold that line, stop and report.

## OUTBOX MANIFEST (last task)

`outbox/cc-session-2026-09-11-epl-forecaster-phase1.md` with the Task 0 probe
output verbatim, real matchday output, the proof-check result, the commit SHA,
and an explicit statement that Phase 2 was not built.
