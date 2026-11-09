# Claude Code Command — Premier League forecaster

**Date:** 2026-09-11
**Repo:** field-laboratory
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** C (feature)

**Rule F:** cleared by Jeff 2026-09-11 for a modelled forecast, not only a
market-implied one. **Rule A (autonomous push) is NOT cleared** and is out of
scope — pull-only, rendered on request. If the design drifts toward notification
or badge-on-change, stop and report.

**Status:** PARTIAL. Phase 1 BUILT 2026-10-03/04 — `src/Forecast.fs`
(`NoForecastReason`, `ModelledForecast`, `threeWayFrom`, `forecastFor`,
`METHOD = "table-v1: ppg + 0.25*gdpg + 0.10*gfpg, home +0.30"`) and
`scripts/forecast-run.mjs`, recorded in
`outbox/cc-session-2026-10-03-epl-forecaster-phase1.md` and
`outbox/cc-session-2026-10-04-epl-forecaster-phase1.md`. **`METHOD` has read
`table-v2: ppg + 0.25*gdpg + 0.10*gfpg, home +0.42, scale 1.14, draw 0.27 for every match`
since 2026-11-09** (shipped, below); the `table-v1` string in this paragraph is the
2026-10-04 build's.

**This line read "FILED, not started" for six days after the code shipped.**
Corrected 2026-10-10. The error class is the one `check:docs` and the
proof-claim staleness sweep exist for — a status asserted once and never
re-checked — and it is why a reader spent a session planning work that was
already done. `guards` is green as of 2026-09-21 and no longer blocks.
**Substrate re-probed 2026-10-03 and the phases are now SWAPPED.**

**Not yet done, and the reason is the store, not the model:** the D1 write path
exists (`POST /d1/execute`, `forecast_observations` allow-listed in relay
`src/index.js:15936` on 2026-10-04) but `.github/workflows/forecast-run.yml`
passes `${{ inputs.write == true && ' ' || '--dry-run' }}`, and `inputs` is
empty on the `schedule` event — so the twice-daily cron (`41 6,18 * * *`) has
only ever dry-run. No observation has been stored unless someone dispatched it
manually with `write: true`. The workflow states the intent: "cron cannot start
writing the day the allow-list entry lands without someone deciding it should."
That decision is the owner's and is the gate on closing this document.

**On a card, 2026-11-08.** The modelled forecast is drawn on a lab EPL card: one
line under the market line, `model table-v1 — Arsenal 94% · draw 4% · Spurs 2%`
(`src/CardForecast.fs`, `src/Standings.fs`). That is the pull-only render the
Rule F ruling above clears. It is not the record and it does not close this
document. Recorded in `outbox/cc-session-2026-11-08-epl-forecast-on-cards.md`.
Since 2026-11-09 the same card reads `model table-v2 — Arsenal 62% · draw 27% · Leeds 11%`
on the pinned page (last bullets below).

- Drawn only while it is not hindsight: an EPL card, `Scheduled`, kickoff ahead.
  The served table already holds a match the moment it ends (20 of 20 clubs
  equal the archive's finished count), and `Desk.gameStateAt` reads an unscored
  row as `Scheduled` while it is in play (Man Utd v Aston Villa, 45 minutes in).
  A card that should carry a forecast and cannot says why, in a sentence.
- The ruling is structural: `lineFor` takes no market price, and
  `npm run check:forecast-pull-only` fails on a timer, a second effect, a market
  field or a word for a gap. Both lines are drawn independently, and the model
  line reads the same whether the numbers agree or not.
- NOT built, and still Phase 2's: the `Paired` type and `whyNoMarket` (Rule 99),
  the change record, any D1 write. A card with no price says nothing about why.
- NOT yet seen on a live card: none can exist before 2026-11-21 (first kickoff
  12:30Z). The wiring is proved on the page pinned to the 2026-10-10 capture at a
  fixed clock, which is hindsight by construction, and again on the DEPLOYED page
  (`outbox/forecast-deployed-wiring-2026-11-08.json`, verdict `WIRED`, commit
  d9554f3); the live proof is staged, with its unblock criteria and exact verify
  command in the session document.
- **The model is overconfident.** table-v1's constants are declared priors and
  were not fitted. Replayed over the 99 finished 2026-27 matches, at GW6 onward
  (n = 47) its Brier score is 0.752 against the market's 0.572 and a uniform
  guess's 0.667; once every club has played eight (n = 19) it is 0.591 against
  0.571. Changing the model needs a new `METHOD_TAG` and a `ModelRevised` stamp.
- **The overconfidence replicates on last season, 2026-11-08.** Last season's
  results are fetchable (openfootball 2025-26, checked against ESPN's final table
  and FPL's fixtures; the relay's archive holds 26 of the 380 matches). Replayed
  over the 330 forecasts where both clubs had played five or more, table-v1
  scores a Brier of 0.689 against a uniform guess's 0.667 (+0.022 ± 0.030), and
  the calibration slope of its home-win probability is 0.41 ± 0.09 where 1.00 is
  calibrated: it ranks matches, and its probabilities are about 2.4 times too
  steep. Measurement only, nothing changed. Recorded in
  `outbox/cc-session-2026-11-08-calibrate-prior-season.md`. The fit followed,
  next bullet.
- **The fit was run and did not pass its own rule, 2026-11-08.** The owner
  approved a fit and, if it passed an out-of-sample rule fixed first, a
  `table-v2`. The rule was committed before any candidate was fitted
  (`6363ad8`). Two candidates were fitted on last season's 330 forecasts: A (home
  edge and logistic scale) and B (A plus the draw share's base and decay). B was
  selected on cross-validated log loss (1.047 against A's 1.124 and table-v1's
  1.153). Its draw decay is unidentified (63 ± 644; the likelihood is flat above
  about 10), so rule R6, a well-posed fit, failed and the verdict is DO NOT SHIP.
  R1–R5 held: Brier 0.649 against table-v1's 0.739 on this season's 50 matches
  (z −1.96), and 0.631 against 0.689 cross-validated on last season (z −3.40). The
  larger defect is the draw share: table-v1 predicts 15% on average, 27% happened,
  and draws are as common where the model sees a wide gap (26%) as a narrow one
  (25%). Nothing in `src/` changed. Recorded in
  `outbox/cc-session-2026-11-08-fit.md`; every number the rule uses was
  recomputed independently in Python (14 of 14 agree). A constant draw share was
  not pre-registered; testing it needs the owner's go and a season no number has
  been read from (2024-25).
- **A constant draw share passed a rule fixed first, on a fresh season,
  2026-11-09, and is to ship as `table-v2`.** The owner ordered the test and the
  ship if the rule said SHIP ("Go", 06:43 ET). The rule was committed before any
  2024-25 model number (`3ff1763`, rule block sha256 `36d98f5d…`). Candidate C
  keeps table-v1's rating and replaces its probabilities with three constants
  fitted on last season's 330 forecasts: home +0.42, scale 1.14, and one draw
  share of 0.27 for every match. On 2024-25's 330 forecasts it scores a Brier of
  0.600 against table-v1's 0.652 (z −2.93) and the base-rate forecast's 0.653
  (z −4.41); its home-win slope is 1.18 ± 0.21; on the opening weeks of both
  seasons it is no worse than table-v1; all seven parts of the rule hold.
  Recomputed independently in Python (16 of 16); 35 of 35 deliberate breaks
  caught. **What it does not show:** this season's 50 matches beat table-v1
  (z −1.98) but not the base-rate forecast (0.650 against 0.638, z +0.32), and the
  2024-25 test looks backward in time (the constants were fitted on the later
  season). Recorded in `outbox/cc-session-2026-11-09-fit-c.md`. It shipped the
  same day, next bullet.
- **`table-v2` is shipped and the deployed page serves it, 2026-11-09.** `46398f2`
  puts it into `src` (the rating is unchanged; `threeWayFrom` takes d = rh − ra + 0.42,
  one draw share of 0.27 for every match, and home = 0.73 × logistic(d / 1.14);
  `METHOD` is the fit's own last line byte for byte; suite 367). `17d28eb` adds eight
  entries to the mutation table, because the model's constants had none: home 0.43 and
  scale 1.15 SURVIVED the card pins (they round to a whole percent) until a pin to nine
  decimals was added, and all eight are caught with it. The compiled F# model equals the
  model the fit declared on 21,136 inputs (max difference 1.1e-16, the draw component
  exactly 0.27 on every one, 14 deliberately wrong twins caught; its coverage line says
  2025-26 is not replayed because its raw files are not in the repository). The
  pre-registered fit script, run unedited against this build, prints 61 of 63 checks and
  `VERDICT: DO NOT SHIP. N7`: two integrity checks compare table-v1 with the compiled
  model, so they fail by design once the compiled model is table-v2. Run from a checkout of
  `9ba4c9f` (built there) its output is byte-identical to the committed record of `5430377`
  (sha256 `385f9266…`) and ends `VERDICT: SHIP`. Deployed: the verify of `17d28eb` (run
  42621717589) went red on a venue-table coverage gap that predates table-v2
  (`docs/CC-CMD-2026-11-09-venue-review-remainder.md`); verify 42631741258 on `a18e26a` was
  green, deploy run 42632774675 published it, and the live `/version.txt` reads
  `a18e26a2ad8fc53a6c200bf5509a9401d467810d`. The wiring proof on the DEPLOYED page has
  verdict `WIRED`, 11 of 11 checks (`outbox/forecast-deployed-wiring-2026-11-09.{json,png,txt}`):
  five served files byte-identical to the local build; six EPL cards, five carrying
  `model table-v2 — A n% · draw 27% · B n%` (Arsenal v Leeds 62 / 27 / 11 and Chelsea v
  Bournemouth 46 / 27 / 27, worked in plain JavaScript beforehand) and one saying why it
  carries none. The same script said NOT-WIRED against the table-v1 page before the deploy,
  and on its first run against the table-v2 page it said NOT-WIRED on a wrong needle (the
  method sentence is built from two literals); both runs are kept, the second with its
  cause. **What the proof does not show:** anything about the model (the page is pinned to a
  2026-10-10 capture and a 2026-11-08 table, so its numbers are hindsight by construction) or
  a live card. The scheduled probe for 2026-11-21 checks `^model table-v2 — …`.
- **The store cannot stamp a model change; found 2026-11-09, not fixed here.**
  `forecast_observations` on `field-archive` holds 30 rows, all written 2026-10-04 between
  15:20 and 15:25Z (10 fixtures, `epl-fixture-51` to `-60`, three runs each: `NoPrior`, then
  `Unchanged` twice), under table-v1: their draw components run from 0.052 to 0.268, and
  table-v2's is 0.27 for every match. The table has no method column and `value` holds only
  the three probabilities, so nothing stored says which model wrote a row.
  `scripts/forecast-run.mjs:188` passes `ModelNote: undefined` to the diff although the
  comment above it says the note is set when the stored method differs from the running one.
  The cron still only dry-runs (the write gate above is the owner's): the newest row in the
  store is from 2026-10-04, so none has been written under table-v2. **Before that gate opens**, a stored row has to carry its method (a column or a
  field in `value`; the schema is the owner's decision) and the writer has to read it from the
  prior row and set `ModelNote` when it differs; otherwise the first table-v2 row for a subject
  that has a table-v1 prior reads as an ordinary change, which is the failure `ModelRevised`
  exists to prevent. **Done when** a run that writes two rows for one subject under two `METHOD`
  values stores `cause = 'ModelRevised'` on the second:
  `SELECT cause FROM forecast_observations WHERE subject = '<subject>' ORDER BY id DESC LIMIT 1`.

**Phase 2 input unblocked 2026-10-10:** the fbref xG this document records as
empty and 3.5 months stale is no longer the only source. BSD serves per-event
xG today — measured on event 223324: `expected_goals` 1.39/1.69, `xg.actual`,
`expected_goals_on_target`, `big_chances`, `ball_possession` — and `has_xg` is a
flag on every event row. See `field-relay-nba` CC-CMD-2026-10-10-bsd-measure-
before-building (Task 2) for the `teams/{id}/form/` shape this still needs.

## RE-PROBE 2026-10-03 — WHY THE PHASES SWAPPED

| input | 2026-09-11 | 2026-10-03 |
|---|---|---|
| standings | 20 clubs, P4 | **holds** — 20 clubs, P5. City 15pts GF13, Arsenal 12, Brighton 10 |
| `/fpl` fixtures | full season, 380 | route unchanged and deployed |
| **EPL odds** | ~72-hour horizon | **zero — because EPL has not played since GW5** |
| fbref xG | empty | **still empty, 3.5 months stale** (`updated 2026-06-23`, `teams: 0`, still labelled 2025-2026) |

### CORRECTION — the odds zero is NOT a defect

An earlier revision of this section reported EPL rows "missing from the archive"
and treated it as substrate failure. **That was wrong.** Three independent
sources agree there have simply been no fixtures:

- `/espn-standings/soccer/eng.1/standings` — every club reads **P5**
- `/archive/date/` — last EPL rows **2026-09-20** (4 of them), zero since
- `/fpl fixtures/` — 380 total, **50 finished = exactly GW1–GW5, all complete**,
  GW6 onward zero finished. Last finished kickoff **2026-09-20T15:30:00Z**

The archive is correct to hold no rows. Odds for GW6 should appear as GW6
approaches, inside the ~72-hour horizon that was always the real measurement.

**The disconfirming evidence was in hand before the claim was made** — the
standings read P5 in the probe immediately preceding it. Five played and last
rows on 09-20 agree with each other. Absence was read as defect without checking
whether there were fixtures to be absent: `empty != broken`.

**Supply was never the cause.** Vendor `soccer_epl` present and active,
`requests_remaining 98530`. Relay budget 600 of 3800 daily,
`ceiling_reached_at: null`, `by_site_sum 600`, `unaccounted 0`.

**Unresolved, and it gates trusting any odds volume figure:** `/budget/odds`
reports `degraded_open: { events: 444, credits: 2565 }` today — credits that
reached the vendor while a guard fell open and the counter never moved. Four
times the counted spend, and it does not reconcile with the provider's
`requests_used: 1470`. Three sources, three totals.

**THE PHASE SWAP STANDS, ON DIFFERENT GROUNDS.** The original justification —
"odds went to zero" — was a misread (see CORRECTION above). The swap is still
right for the reason that survives: `MarketImplied` can only ever cover fixtures
inside the ~72-hour pricing horizon, so it leaves ~370 of 380 fixtures as
`NoForecast` by construction. A foundation whose dominant state is "no answer" is
the wrong foundation, whether or not the current zero is seasonal. Standings and
`/fpl` cover all 380 every day of the season.

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
4. **EPL fixture state — RESOLVED 2026-10-03, do not re-litigate.** GW1–GW5 are
   complete and nothing has been played since `2026-09-20T15:30:00Z`. Zero EPL
   rows in the archive is correct, not a defect. Before reading any future zero
   as substrate failure, check `/fpl fixtures/` for whether fixtures exist in the
   window at all.
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
