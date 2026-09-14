# Claude Code Command — Premier League forecaster (Phase 1: market-implied)

**Date:** 2026-09-11
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** C (feature)
**Rule F:** cleared by Jeff 2026-09-11 for a modelled forecast, not only a
market-implied one. Rule A (autonomous push) is NOT cleared and is out of scope —
this is pull-only, rendered on request. If any part of the design drifts toward
notification or badge-on-change, stop and report.

## SUBSTRATE — probed live 2026-09-11, not assumed

**USABLE — `/espn-standings/soccer/eng.1/standings`** — HTTP 200, 68,769 bytes.
One group, "2026-27 English Premier League", 20 entries. Real current table:
Arsenal played 4, 12 pts, GD +7; Manchester City 4, 12, +6; Leeds United 4, 8, +4.

**USABLE — three-way match odds.** Verified 2026-09-06: EPL 2 of 2 rows carried
a draw price, and draw prices move (`{away:100, draw:265, home:265}` ->
`{away:-105, draw:275, home:275}`). `Market.threeWay` already refuses to
construct unless home+draw+away sums to 1 within `SUM_EPS`, so overround removal
is enforced by the constructor.

**DO NOT USE — `/soccer-fbref/epl.json` IS EMPTY.** It returns HTTP 200 and
498 bytes of well-formed JSON:

```
competition: "Premier League 2025-26"   season: "2025-2026"
updated: "2026-06-23T01:58:47"          teams: {}        <-- EMPTY
```

A schema block describing `xGFor`, `xGAgainst`, `xGDivergence`, `pressures`,
`progressivePasses` — and no data behind it. Last season, three months stale,
zero teams. The filling cron is `soccer-fbref-wc.yml`, which runs "every 3 days
**during WC group stage**" and has stopped.

This is Rule 99 (DISTINGUISHABILITY-A, `jubilant-bassoon/STANDARDS.md:4906`) in
the data layer: a 200 with a valid envelope is indistinguishable from a 200 with
content unless you look inside. **Any forecaster using xG would silently forecast
on an empty set.** File this as a separate finding; do not fix it here.

## TASK 0 — PROBE (read from HEAD, do not trust this document)

1. **Establish whether remaining fixtures are reachable.** No EPL fixtures route
   exists in `src/route-provenance.js` (`/cfl/fixtures` exists; there is no
   soccer equivalent). Check `/context/date/{date}`, the ESPN scoreboard proxy,
   and the archive. **A season projection is impossible without them.**
   - If remaining fixtures ARE reachable, record the route and real shape.
   - If they are NOT, say so plainly and build only what the substrate supports
     (see Task 2 fallback). Do not synthesise a fixture list.
2. Re-probe both usable substrates above and record real values. This document's
   numbers are a starting point, not evidence.
3. Confirm `Market.threeWay`'s actual signature and `SUM_EPS` at HEAD before
   depending on them.
4. Confirm `/soccer-fbref/epl.json` is still empty. If it has been refilled,
   report that — it changes what is buildable but does NOT change Phase 1 scope.

## TASK 1 — `Forecast.fs`, provenance in the type

The central design constraint. A market-derived probability and our own
projection are **different claims and must never render identically**:

```fsharp
type Forecast =
    | MarketImplied of Market.ThreeWay      // what the book says
    | Modelled of ModelledForecast          // what WE say
    | NoForecast of NoForecastReason        // and WHY
```

`NoForecastReason` must distinguish, at minimum: no odds published for this
fixture; fixture not yet scheduled; substrate unreachable. **`NoForecast` is not
an error state — it is the dominant state.** Measured 2026-09-06: 16 of 42 rows
had no odds at all. A forecaster that only looks right when odds exist will be
wrong most of the time.

Follow the `Modelled: bool` + `Omission: string option` precedent in `Desk.fs`:
"nobody looked" and "deliberately not forecast" are different and must stay so.

## TASK 2 — Phase 1 is MARKET-IMPLIED ONLY

Ship the market path first. It carries no model risk and no accuracy obligation:
per-fixture three-way implied probabilities, overround removed by the
constructor.

**If Task 0.1 found remaining fixtures**, aggregate to a season projection.
**If it did not**, Phase 1 is per-fixture and the current table only — and the
outbox must say so explicitly rather than shipping a projection built on a
fixture list that was inferred.

Do NOT build the `Modelled` branch in this session. It is Phase 2 and it is
gated below.

## TASK 3 — Rule 47 and the no-receipts constraint

`jubilant-bassoon STANDARDS.md` Rule 47 (RELAY-CPU-A): editorial intelligence
stays client-side. The model computes in Fable. The relay supplies odds and
standings; it does not compute the forecast.

The 2026-07-09 UI spec ("FIELD UI feature ideas — fun charismatic no-receipts
pass", Drive `1bbRIRG_...`) forbids exposed computation: no "Drama 87", no
"win probability swing +23". A probability is permitted — it is the same class
as win probability, which ADR-002 clears — but the SIMULATION INTERNALS are not.
Render the number, never "34.2% across 10,000 simulations".

## TASK 4 — Verification (inside this session)

Paste real per-fixture output for an EPL matchday, naming fixtures. Include at
least one `NoForecast` case with its reason. If no `NoForecast` case occurs on
the day, say so rather than asserting the branch works.

Add a `<!-- proof: FSxxxx -->` case to a new `docs/FORECAST-PROOF.md` showing
that a consumer handling only `MarketImplied` fails to compile, and verify it
through `scripts/proof-check.mjs` rather than asserting it in prose.

## DONE CONDITION

- Task 0.1 answered explicitly: fixtures reachable, or not, with evidence.
- `Forecast` union exists with all three cases; `NoForecastReason` distinguishes
  at least the three causes above.
- Proof case compiles-and-fails as claimed, verified by `proof-check.mjs`.
- Real output pasted for a named matchday.

## PHASE 2 — GATED, DO NOT BUILD

The `Modelled` branch needs one decision from Jeff that has not been made:
whether a modelled forecast publishes alongside the market-implied one, or
instead of it. Record it as open in the outbox. Do not decide it.

### Phase 2 carries a CHANGE RECORD, not an accuracy ledger

Decided by Jeff 2026-09-11. This is not "were we right" — it is **what moved
between one game and the next, and why**. No prediction obligation, no
correctness claim.

The reason it is load-bearing: a forecast that only ever shows its current value
cannot distinguish "we always thought this" from "this moved hard last night."
That is the same collapse as `closing_odds`, where "observed twice, unchanged"
and "observed once" rendered identically until `captured_at` separated them.

**The cause must be typed, because the causes are not interchangeable:**

```fsharp
type DeltaCause =
    | ResultObserved of fixture          // a match was played
    | MarketMoved                        // prices moved, no match played
    | FixtureScheduled                   // the remaining slate changed
    | SubstrateGained                    // odds appeared where there were none
    | SubstrateLost                      // odds stopped arriving
    | ModelRevised of note               // OUR CODE CHANGED
    | Unchanged                          // first-class, not an absence
```

`ModelRevised` is the one that makes this worth building. **A number moving
because reality moved and a number moving because we changed the model are
indistinguishable in the output unless recorded at the time.** Without it, every
revision silently rewrites history and no later reader can tell which happened.

`Unchanged` is first-class for the same reason `unmoved` is a state in the odds
sentinel — it is a true observation, and it must never alarm or be rendered as
an absence.

`SubstrateLost` is not hypothetical: MLS went from two-way odds to none at all
across 17 rows, and nothing caught the transition.

### Storage: D1, not `localStorage`

The Arc Signature spec (Drive `11DJ6W7h...`) proposed a public record and then
stored it in `localStorage` — per-device, so no two users see the same record and
a fresh device shows none. A shared record must be shared storage. That flaw is
not to be reproduced here.

A change record also requires a PERSISTED PRIOR. There is nothing to diff
against until one observation has been stored. State that plainly rather than
rendering a first run as though nothing changed.

### Open tension to surface, NOT to resolve in code

The 2026-07-09 no-receipts UI spec lists `win probability swing +23` as an
explicit BAD example. A change record is, literally, a swing.

Resolve it by scope, and report it rather than deciding it: **the RECORD is
complete; the RENDERING is named.** Store the full typed delta with its cause;
surface it in prose that names what happened ("Arsenal strengthened after
beating City") rather than exposing the arithmetic. If the design cannot hold
that line, stop and report — do not ship a receipt.

## TASK 5 — Outbox manifest (last task)

`outbox/cc-session-2026-09-11-epl-forecaster-phase1.md` with the Task 0 probe
results verbatim, the fixtures answer, real matchday output, the proof-check
result, the commit SHA, and the two Phase 2 decisions stated as open.
