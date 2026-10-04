module Forecast

open Units

// THE RECORD, WITH MODELLED ROWS IN IT — Phase 1 of
// docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md.
//
// Provenance is a CASE, not a rendering convention. A forecast cannot exist in
// this type without saying where it came from, and "there isn't one" is a case
// too, carrying its reason. `NoForecast` was the dominant state under the
// market-implied phasing — roughly 370 of 380 fixtures — and the phases were
// swapped on 2026-10-03 precisely because a model needs no price to exist.
//
// WHAT THE SUBSTRATE ACTUALLY SERVES, probed 2026-10-03 from a runner because
// the sandbox reaches neither *.workers.dev nor fantasy.premierleague.com:
//
//   /espn-standings/soccer/eng.1/standings   20 entries, all nine stat keys,
//                                            `deductions` present on all 20
//   /fpl/fixtures                            380 fixtures, 38 gameweeks, 50 finished
//   /fpl/bootstrap-static                    20 teams; its own table is ZEROED
//                                            (played/points 0 on every club) and
//                                            strength_overall_home takes three
//                                            distinct values across 20 clubs
//
// So the standings are the only source of strength, and FPL is the only source
// of fixtures. The join between them is the load-bearing fact and it is not
// free: by name it is 13 of 20, through the relay's own matcher 12 of 20, by
// ABBREVIATION 18 of 20 — failing on exactly the two Manchester clubs
// (ESPN MNC/MAN against FPL MCI/MUN). That is why `TableRow` carries an
// abbreviation and why the caller must assert a complete join rather than
// let unmatched clubs quietly produce nothing.

/// Why there is no forecast. The four the CC-CMD requires, and no catch-all:
/// a fifth situation must be named here rather than folded into an existing
/// case, because "we have no price" and "we did not look" are different claims.
type NoForecastReason =
    /// The fixture is further out than any book has priced.
    | BeyondOddsHorizon
    /// Within the horizon, but no price was published for this fixture.
    | NoOddsForFixture
    /// FPL carries the fixture with `event: null` — EPL rearranges constantly
    /// for cup and European ties. MEASURED 2026-10-03: zero of 380 fixtures are
    /// in this state today, so the case is modelled and cannot yet be
    /// demonstrated from live data.
    | FixtureUnscheduled
    /// A source this fixture needs did not answer, or answered with nothing in
    /// it. `/soccer-fbref/epl.json` is the standing example: HTTP 200, valid
    /// envelope, `teams: {}`.
    | SubstrateUnreachable

/// A number WE produced, carrying the method that produced it. `Method` is not
/// decoration: `ModelRevised` below can only be honest if a row records which
/// model wrote it.
type ModelledForecast =
    { Market: Market.ThreeWay
      Method: string }

/// PROVENANCE IN THE TYPE. A consumer that handles only `MarketImplied` does
/// not compile — FS0025 is an error in this project, not a warning. See
/// docs/FORECAST-PROOF.md.
type Forecast =
    | MarketImplied of Market.ThreeWay
    | Modelled of ModelledForecast
    | NoForecast of NoForecastReason

/// One club's line in the standings payload, under ESPN's own stat names.
/// `PointsFor`/`PointsAgainst` are goals for and against — ESPN's generic names
/// for a soccer table, confirmed against Arsenal's stats block.
type TableRow =
    { Team: string
      Abbrev: string
      Played: int
      Points: int
      GoalsFor: int
      GoalsAgainst: int
      /// CARRIED, NOT ASSUMED ZERO. Points deductions are real in the EPL.
      /// UNSETTLED: all 20 clubs read 0 on 2026-10-03, so whether ESPN's
      /// `points` is already net of a deduction cannot be decided from the
      /// payload. `deductionsUnsettled` below makes a non-zero value refuse
      /// rather than silently pick one reading.
      Deductions: int }

// ── the model ─────────────────────────────────────────────────────────────
//
// SIMPLE, AND NAMED, because the CC-CMD requires a later reader to be able to
// tell a model revision from a reality change. Points, goal difference and
// goals scored per game, plus home advantage. No xG: `/soccer-fbref/epl.json`
// has been empty since 2026-06-23.
//
// THE FOUR CONSTANTS ARE DECLARED PRIORS, NOT FITTED, and that is stated rather
// than hidden. Five gameweeks is not enough to fit four parameters without
// overfitting them, and a fitted number presented as measured would be the
// worse failure. They come from EPL long-run base rates — draws around a
// quarter of matches, home wins around 45%. `METHOD` carries the version so a
// row written under these constants is distinguishable from a row written
// under later ones.

// NOT `[<Literal>]`. Fable INLINES a literal at every use site and emits no
// export for it, so `import { METHOD }` failed at run time with "does not
// provide an export named 'METHOD'" while the F# compiled clean and the suite
// passed — the value is only missing at the JS boundary.
let METHOD = "table-v1: ppg + 0.25*gdpg + 0.10*gfpg, home +0.30"

let private HOME_ADVANTAGE = 0.30
let private DRAW_BASE = 0.28
let private DRAW_DECAY = 1.10
let private SCALE = 0.55

/// True when a club carries a deduction, which this model cannot yet handle
/// honestly. Surfaces the question the day it matters instead of guessing.
let deductionsUnsettled (rows: TableRow list) =
    rows |> List.filter (fun r -> r.Deductions <> 0) |> List.map (fun r -> r.Team)

/// A club's strength, or `None` when it has played nothing to judge it on.
let rating (r: TableRow) : float option =
    if r.Played <= 0 then None
    else
        let n = float r.Played
        Some (float r.Points / n
              + 0.25 * (float (r.GoalsFor - r.GoalsAgainst) / n)
              + 0.10 * (float r.GoalsFor / n))

/// A three-way probability for one fixture, or the reason there is none.
///
/// The draw share SHRINKS AS THE GAP WIDENS, which is the one shape a two-way
/// model cannot express and the reason `Market.threeWay` exists: a mismatch has
/// fewer draws than a level fixture, and folding the draw into the away side is
/// the defect that type was written to remove.
///
/// `Market.threeWay` is the guard, not a formality — it refuses to construct
/// unless the three sum to 1 within SUM_EPS, so a normalisation slip here
/// becomes `SubstrateUnreachable` rather than a plausible wrong number.
let private threeWayFrom (h: float) (a: float) : Forecast =
    let d = h - a + HOME_ADVANTAGE
    let pDraw = DRAW_BASE * exp (-abs d / DRAW_DECAY)
    let pHome = (1.0 - pDraw) * (1.0 / (1.0 + exp (-d / SCALE)))
    let pAway = 1.0 - pDraw - pHome
    match Market.threeWay (pHome * 1.0<prob>) (pDraw * 1.0<prob>) (pAway * 1.0<prob>) with
    | Some m -> Modelled { Market = m; Method = METHOD }
    | None -> NoForecast SubstrateUnreachable

/// The whole per-fixture decision, with every refusal named.
///
/// `event` is FPL's gameweek: `None` is the `event: null` the CC-CMD requires a
/// reason for. A club missing from the table is `SubstrateUnreachable` and NOT
/// `FixtureUnscheduled` — the fixture is scheduled; our join failed. Those are
/// different facts and the abbreviation join fails on two real clubs, so this
/// distinction decides whether a reader goes looking at FPL or at the matcher.
let forecastFor (event: int option) (home: TableRow option) (away: TableRow option) : Forecast =
    match event with
    | None -> NoForecast FixtureUnscheduled
    | Some _ ->
        match home, away with
        | Some h, Some a ->
            match rating h, rating a with
            | Some rh, Some ra -> threeWayFrom rh ra
            | _ -> NoForecast SubstrateUnreachable
        | _ -> NoForecast SubstrateUnreachable

// ── the boundary the JS writer calls across ───────────────────────────────
//
// OPTIONS DO NOT CROSS THE FABLE BOUNDARY CLEANLY, and faking one from JS would
// put a provenance decision in JavaScript — which is the whole thing the union
// exists to prevent. So the refusals are exported as values and the caller
// picks one; every `Forecast` in the store was still constructed here.
//
// `scripts/forecast-run.mjs` imports these rather than reimplementing the
// maths. A second copy of the model in JS would drift from the one the suite
// proves, and the number written to the store would then be about the copy.

/// Build a `TableRow` from primitives. JS cannot construct an F# record.
let makeRow team abbrev played points goalsFor goalsAgainst deductions : TableRow =
    { Team = team; Abbrev = abbrev; Played = played
      Points = points; GoalsFor = goalsFor; GoalsAgainst = goalsAgainst
      Deductions = deductions }

/// FPL carries this fixture with `event: null`.
let unscheduled : Forecast = NoForecast FixtureUnscheduled

/// One or both clubs did not join to a standings row. The fixture is
/// scheduled; our join failed, and those are different facts.
let unjoined : Forecast = NoForecast SubstrateUnreachable

/// The ordinary path: a scheduled fixture with both clubs joined.
let forecastOf (event: int) (home: TableRow) (away: TableRow) : Forecast =
    forecastFor (Some event) (Some home) (Some away)

/// The three-way as a plain triple, for a writer that has to serialise it.
/// Returns an empty array for anything that is not a priced forecast, so a
/// `NoForecast` cannot be written as three zeroes.
///
/// AN ARRAY, NOT AN F# LIST, and that is a boundary fact rather than taste.
/// Fable compiles `float list` to a linked-list object with no `length`, so
/// `t.length === 3` in the JS writer read `undefined` and every priced fixture
/// printed as three dashes beside a `Modelled` provenance. The STORED values
/// were correct throughout — the writer serialises through its own reader, not
/// through this — so the defect was confined to the printed table. `float[]`
/// compiles to a real JS array.
let triple (f: Forecast) : float[] =
    match f with
    | MarketImplied m | Modelled { Market = m } ->
        [| float (Market.threeWayHome m); float (Market.threeWayDraw m); float (Market.threeWayAway m) |]
    | NoForecast _ -> [||]

// ── the record ────────────────────────────────────────────────────────────

/// Why a number moved. `Unchanged` is FIRST-CLASS, for the same reason
/// `unmoved` is a state in the odds sentinel: "observed twice, the same" and
/// "observed once" rendered identically until `captured_at` separated them.
type DeltaCause =
    | ResultObserved of fixture: string
    | MarketMoved
    | FixtureScheduled
    | SubstrateGained
    | SubstrateLost
    /// OUR CODE CHANGED. The only moment this is knowable is write time; a
    /// number moving because reality moved and one moving because we changed
    /// the model are indistinguishable afterwards, permanently.
    | ModelRevised of note: string
    | Unchanged

/// One row of the append-only store.
type Observation =
    { Subject: string
      Forecast: Forecast
      ObservedAt: string }

/// THE FIRST RUN IS NOT `Unchanged`. There is either a prior row or explicitly
/// none, and the CC-CMD's done condition requires the difference to be visible.
/// A `DeltaCause` with no prior would have to lie in one direction or the other.
type DeltaOutcome =
    | NoPrior
    | Delta of DeltaCause

/// What happened between two observations, beyond the numbers themselves.
/// A diff of two probabilities cannot tell why they differ; these are the facts
/// that decide it, supplied by the caller that knows them.
type Context =
    { /// A fixture that finished between the two observations.
      ResultSince: string option
      /// Set when the code that produced `now` differs from the code that
      /// produced the prior row. Read from `Method`, never inferred.
      ModelNote: string option }

/// PRECEDENCE IS DECLARED, because several causes can be true at once and a
/// row carries one. Our own change outranks everything — if the model moved,
/// attributing the delta to reality is the error `ModelRevised` exists to stop.
/// A played match outranks a scheduling change, which outranks substrate
/// appearing or vanishing, which outranks a price moving.
let diff (prior: Observation option) (now: Observation) (ctx: Context) : DeltaOutcome =
    match prior with
    | None -> NoPrior
    | Some p ->
        match ctx.ModelNote with
        | Some note -> Delta (ModelRevised note)
        | None ->
            match ctx.ResultSince with
            | Some fx -> Delta (ResultObserved fx)
            | None ->
                match p.Forecast, now.Forecast with
                | NoForecast FixtureUnscheduled, Modelled _
                | NoForecast FixtureUnscheduled, MarketImplied _ -> Delta FixtureScheduled
                | NoForecast _, Modelled _
                | NoForecast _, MarketImplied _ -> Delta SubstrateGained
                | Modelled _, NoForecast _
                | MarketImplied _, NoForecast _ -> Delta SubstrateLost
                | a, b when a = b -> Delta Unchanged
                | _ -> Delta MarketMoved
