# CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards

**Repo:** field-laboratory (LAB-FIRST-A: new computation and proofs land here). The archive rows it needs come from field-relay-nba (`archive-league-history-backfill.yml`, read-only measured below).
**Branch:** main — commit directly, no feature branch, no PR.
**Status:** DONE 2026-11-27 with the verdict **DO NOT BUILD**. Task 0 and Task 1 done; **Task 2 done: the pre-registered fit said DO NOT BUILD (U4 failed: on the frozen 2026-27 bundle U is worse than the base rate, +0.0159 Brier, z +0.48, n 90; U1, U2, U3, U5 and U6 passed)**. **Tasks 3 and 4 are CLOSED, NOT BUILT, by the rule's own NO FURTHER LOOK clause.** Nothing in the UEFA forecast is built or written; the data, the rule, the tooling and the result are committed. Any revision is a new decision with new matches to read ("After the verdict", below).
**Filed by:** CC, on the owner's "Yes" (2026-11-27) to "whether you want a UEFA forecast on tonight's cards", given after the owner named the surfaces ("Laboratory and tonight"). The owner had said "Seems like full season UEFA history would be extremely valuable", which was a discussion point and not a build directive; no write was made on it.

One-liner:
```
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull. Read docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md. Execute the unblocked tasks only.
Do not commit unless confidence >= 95. If score < 95, report verbatim and stop.
```

---

## BUILD-ON-A (read 2026-11-27)

The lineage is `docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md` (Status PARTIAL: `table-v2`, shipped 2026-11-09 and seen on 7 of 7 live EPL cards 2026-11-21) and `docs/FORECAST-PROOF.md`. Rulings and holds read there, and which of them bind this work:
- **Rule F** was cleared by Jeff on 2026-09-11 for a modelled EPL forecast, not only a market-implied one. **Rule A (autonomous push) is NOT cleared.** The owner's "Yes" above is recorded as asking for a UEFA forecast on cards; it is read as the same shape (modelled, pull-only, drawn on request). If the owner meant more than that, Task 2 stops and asks. **Confirmed 2026-11-27, as read: modelled, pull-only, drawn on request; Rule A (autonomous push) NOT cleared.** The owner did not mean more, so Task 2 does not stop. The confirmation clears nothing else: the D1 `forecast_observations` gate and every item under "Not in scope" are unchanged.
- **The pull-only ruling is structural** (`lineFor` takes no market price; `npm run check:forecast-pull-only` fails on a timer, a second effect, a market field or a word for a gap). It binds the UEFA line the same way.
- **A forecast is drawn only while it is not hindsight:** a card in state `Scheduled` with kickoff ahead. A card that should carry one and cannot says why, in a sentence.
- **The fit is pre-registered:** the EPL `table-v2` was fitted on last season under a rule fixed first, and out-of-sample on the current season. The D1 `forecast_observations` write path is gated on the owner and is not touched here.
- No hold or VOID window applies to UEFA. Nothing in this CC-CMD undoes or works around the above.

The relay side: `field-relay-nba docs/CC-CMD-2026-10-27-bsd-event-id-on-game-rows.md`, "Addendum 2026-11-27" and "part 2" (the 4 unreached UEFA matches; the May rows). This CC-CMD does not depend on the BSD join: a table forecast needs final results, not incidents.

## Task 0 — the data, measured (DONE 2026-11-27, read-only, nothing written)

`archive-league-history-backfill.yml` with `dry_run` true reads ESPN's scoreboard per day (completed events only), compares with the archive and writes nothing. Counts, field-relay-nba artifacts `outbox/archive-league-history-backfill-uefa-*-2026-11-27T*.json`:

| competition (ESPN slug) | window | ESPN completed | archive holds |
|---|---|---|---|
| Champions League (`uefa.champions`) | 2025-09-01 to 2026-04-30 | **186** | **0** |
| Europa League (`uefa.europa`) | 2025-09-01 to 2026-04-30 | **186** | **0** |
| Conference League (`uefa.europa.conf`) | 2025-09-01 to 2026-04-30 | **150** | **0** |
| Champions League | 2026-05-01 to 2026-11-25 | 90 + 3 | complete (the May rows were written 2026-11-27 on the owner's word) |
| Europa League | 2026-05-01 to 2026-11-25 | 72 + 3 | complete (same) |
| Conference League | 2026-05-01 to 2026-11-25 | **57** | **55** (2 missing; dates not read) |

**Last season is 522 matches ESPN lists and the archive does not hold; the archive's earliest UEFA row is 2026-05-05.** Cross-check, arithmetic and not an independent source: a 36-team league phase of 8 matches each is 144, plus 16 playoff, 16 round-of-16, 8 quarter-final and 2 semi-final first-leg matches is 186 (the Champions League and the Europa League); a league phase of 6 matches each is 108, and 108 + 16 + 16 + 8 + 2 is 150 (the Conference League). All three counts equal that, so ESPN's list is complete for the window as far as the format says. The Conference League's 2 missing current-season matches are, by the pattern of the other two competitions, the May semi-final second legs; that is an inference, the log was not read.

The qualifying rounds (345 ESPN events 2026-06-20 to 08-18, none archived; field-relay-nba Addendum 2026-11-27 part 2) are **not needed for a league-phase table**: qualifying matches are not in it. They stay out of this CC-CMD.

## What a UEFA forecast is, and is not (design constraints read from the EPL build, not invented)

- A **table-based** model (the EPL's `table-v2` is points, goal difference and goals-for per game, a home term, a scale and a constant draw share). It applies to **league-phase matches** only: one 36-team table per competition. Knockout ties are two legs with an aggregate; a table model has no honest line for them, so those cards say why in a sentence and carry none (the same rule as an EPL card that cannot carry one).
- The schedule is unbalanced and the clubs come from many different leagues, so the EPL parameters (home +0.42, scale 1.14, draw 0.27) are **not assumed to transfer**. They are fitted, under a rule fixed first, on last season's league phase: 144 + 144 + 108 = **396 league-phase matches**, against the EPL's 330 forecasts. The current season's league phase so far is the out-of-sample set.
- Early matchdays have little table behind them; the EPL build named its no-forecast reasons (`NoForecastReason`). The UEFA build does the same for a club with too few matches.

## Task 1 — Last season's rows into the archive (DONE 2026-11-27, by another session; verified here)

**Result, verified independently on 2026-11-27 (Rule 100: the notice that the write had landed came from another session and was tested, not trusted).**
- **Who and what:** the relay's "3rd session" wrote 186 + 186 + 150 + 2 = **524 rows, 0 failed**, through `archive-league-history-backfill.yml` (`dry_run` false, one competition at a time; runs `46060604957`, `46061081424`, `46061545774`, `46062013710`), recorded in field-relay-nba `outbox/cc-session-2026-11-27-uefa-history-write.md` and `docs/CC-CMD-2026-10-27-bsd-event-id-on-game-rows.md` (Addendum 2026-11-27 part 3, marked DONE). The owner's instruction there was "UEFA history write approved".
- **My own reads, not the other session's:** at 19:24Z the archive still read 93 / 93 / 73 rows (nothing written yet); at **20:43Z** `read-archive-label-dates.yml` (`like` `UEFA%`, `outbox/archive-label-dates-2026-11-27T20-43-16-543Z.json` in field-relay-nba) reads **`UEFA Champions League` 279 rows (44 dates, 2025-09-16 to 2026-11-25), `UEFA Europa League` 279 (27 dates, from 2025-09-24), `UEFA Europa Conference League` 225 (20 dates, from 2025-10-02)**, exactly the counts this task predicted, and **186, 186 and 150 of them are dated before 2026-05-01**, equal to the ESPN counts my dry runs read at 16:08 to 16:13Z.
- **Content, one served day:** `GET /context/date/2025-12-10` (the relay route, through `probe_relay_route`) returns 9 `UEFA Champions League` rows, a full league-phase matchday, each with `home_score` and `away_score` (not null), `start_time`, `espn_event_id` and `bsd_event_id` null. Nothing else was sampled.
- **Not joined, as stated before the write:** the 524 rows carry no `bsd_event_id` (the label totals read joined 93 / 93 / 73, the rows that were there); `bsd-game-join-backfill.yml` joins the February to April rows on its schedule and spends BSD pages. A results-only forecast does not need the join. **CORRECTION 2026-11-27 (21:38Z read): the claim that the scheduled join backfill would join the February to April rows was WRONG.** `outbox/bsd-join-backfill-complete.json` exists in field-relay-nba, so every scheduled run skips at its gate (run `46070490625`, 21:28Z, `backfill`, `commit` and `verify` all skipped); the 126 rows dated 2026-02-01 to 04-30 read 0 joined, and all 524 stay unjoined until someone DISPATCHES the join (it spends BSD pages). Nothing in this CC-CMD needed them: the fit used results only, and the verdict (below) is DO NOT BUILD. The relay's `docs/CC-CMD-2026-10-27-bsd-event-id-on-game-rows.md`, "Addendum 2026-11-27, part 4", has the decision.

What was specified (kept as the record): the 522 matches above, through `archive-league-history-backfill.yml` (`dry_run` false, one run per competition, `from` 2025-09-01, `to` 2026-04-30), with the `league` and `label` as the cron writes them (`uefa.champions` / `UEFA Champions League`, `uefa.europa` / `UEFA Europa League`, `uefa.europa.conf` / `UEFA Europa Conference League`), plus the 2 Conference League semi-finals of May 2026. Blocked by: a production archive write of 524 rows, 131 times the one approved on 2026-11-27. Unblocked when: the owner says to write them. Side effect to say before approval: the scheduled join backfill (`bsd-game-join-backfill.yml`, range from 2026-02-01) will pick up the Feb to April rows (NULL `bsd_event_id`) and spend BSD pages on them; rows dated before 2026-02-01 are outside its range and stay unjoined, which a results-only forecast does not need. **Alternative, if the owner does not want the write:** the EPL precedent, an external results source (the EPL fit used openfootball); it needs its own check against ESPN's final tables.
Verify (after the write): `read-archive-label-dates.yml` with `like` = `UEFA%` reads `UEFA Champions League` 93 + 186 = 279 rows, `UEFA Europa League` 279, `UEFA Europa Conference League` 73 + 150 + 2 = 225; and the dry run over the same window prints `alreadyArchived` equal to `completed`.

## Task 2 — Pre-register the fit and the out-of-sample rule (DONE 2026-11-27: the rule said DO NOT BUILD)

**The order, as committed** (all in this repository; the EPL fit's order, mirrored): the rule alone `dc9fdce5` (2026-11-27T20:49:09Z; RULE block sha256 `6cf976ba8b895439894346c066c22ff752d2789b208cdccdb563ddae41118cf1`, 10,608 characters), the two data bundles `584b517e` (20:55:23Z), the tooling `67223115` (21:24:46Z; its checks and the harness' result `d90d96bb`, 21:33:24Z), then the run on a runner: **run `46071082308`, checkout `d90d96bb`, started 2026-11-27T21:33:49Z**, later than all of them. Output: `outbox/forecast-fit-uefa-2026-11-27.txt` and `.json`, `outbox/forecast-fit-uefa-provenance-2026-11-27.txt`. The tooling was tested on synthetic seasons only (`scripts/check-uefa-fit.mjs`, 71 assertions; `scripts/mutate-uefa-fit.mjs`, 33 mutants, the first run 26 of 29 caught and three holes in the checks closed, the third full run 32 of 33 and its one survivor closed and re-run); no real model number existed before the run. One DATA-ONLY pass (names, dates and counts) found the archive writes some clubs under two spellings and led to an outcome-blind alias map and a 36-clubs integrity check, recorded in `outbox/cc-session-2026-11-27-uefa-forecast-fit.md`.

**Result (the run's own numbers; K = 3; 234 eligible 2025-26 forecasts, 90 frozen):**

| part | requirement | measured | |
|---|---|---|---|
| U1 | CV set (leave one competition out): Brier below the base rate's, paired z <= -1.645 | 0.5858 against 0.6174, **z -2.29** | pass |
| U2 | each fold: paired z against the base rate <= +1.0 | UCL -0.95, UEL -3.39, UECL -0.06 | pass |
| U3 | CV set: home-win slope within 1.96 SE of 1 | **1.083 +/- 0.264** | pass |
| U4 | frozen 2026-27 bundle: Brier not above the base rate's | **0.6444 against 0.6285, difference +0.0159, z +0.48** | **FAIL** |
| U5 | the full fit is well posed | solver gap 2.3e-15, max gradient 2.2e-10, Hessian positive definite, no bound | pass |
| U6 | every integrity check | 17 of 17 | pass |

The constants Task 3 WOULD have shipped, printed and never used: home 1.34, scale 1.97, share 0.18 (the EPL's are 0.42, 1.14, 0.27). Reported, not gating: the CV set against the EPL constants z -1.06, uniform 0.6667; K = 4 sensitivity: CV z -1.84, slope 0.852 +/- 0.247, frozen difference +0.0225.

**Verified a second way.** `outbox/forecast-fit-uefa-recompute-2026-11-27.mjs` recomputes the same pre-registered quantities from the same bundles by a different route (club histories as lists, a grid-and-zoom fit, a gradient-ascent slope with a numerical Hessian, nothing imported from the tooling): **26 of 26 quantities agree** (the rounded constants exactly, every z, the Brier scores, the slope and its SE, the frozen difference to 1e-9; `outbox/forecast-fit-uefa-recompute-2026-11-27.txt`). The verdict is not a tooling artifact.

**What the data say, and do not** (the limits were written before any number, in the rule's DISCLOSED block, and bind the reading): the table shows skill over a table-free forecast on 2025-26 when a competition is held out (strongest in the Europa League, none in the Conference League), but this is within the fit season, and the one forward test, 90 early-season 2026-27 forecasts, shows none: its difference is +0.0159 with z +0.48, which is not distinguishable from zero and not evidence of skill either. U4 was a tripwire in the direction only, its outcome unknown when written, and its own text accepted that a small n makes it weak. The rule says a failure is DO NOT BUILD; it is.

## Task 3 — The UEFA line on a card, pull-only (CLOSED, NOT BUILT: Task 2's verdict was DO NOT BUILD)

The task text below is kept as the record. The rule's NO FURTHER LOOK clause: no UEFA forecast is built on these data.

What: `src/Forecast.fs` and the card path (`src/CardForecast.fs`, `src/Standings.fs`) extended to the three UEFA competitions' league-phase `Scheduled` cards with kickoff ahead; knockout ties and clubs with too few matches carry a `NoForecastReason` sentence. A league-phase table per competition computed from the archive rows. `npm run check:forecast-pull-only` still passes, with its mutation harness. Done when it is shown red on each deliberate break first (Rule 90) and green after.

## Task 4 — Seen on a live card (CLOSED, NOT BUILT: depends on Task 3)

The same CI-as-proxy pattern the EPL used (`forecast-live-probe`, run 44897584850): a real browser on the deployed page, a committed manifest of booleans and the screenshot. Done condition (Rule 89): `verdict: "PASS"`, every UEFA league-phase card that is `Scheduled` with kickoff ahead draws `model <method> — …`, every other UEFA card says why it does not, `errors: []`. Blocked until a UEFA matchday has such a card; I have not checked the calendar, and the date is not asserted here.

## After the verdict: a new decision, with new matches to read (the owner's, recommendation first)

The rule: "Any revision after that is a new decision with new matches to read." Two options:
1. **Leave the UEFA forecast unbuilt.** Costs nothing. The EPL forecast is unaffected. Choose this if a UEFA line on tonight's cards is not worth another cycle.
2. **A new pre-registered forward test, no refit.** Fix the three constants as printed (home 1.34, scale 1.97, share 0.18), write a new rule file before reading any new match, and score ONLY league-phase matches played after the 2026-11-27 freeze (a new frozen bundle: the remaining matchdays of the 2026-27 league phase), against the base rate of all 2025-26 eligible forecasts, with a pass line fixed in advance for the larger n. Unblock criteria: the archive holds the remaining league-phase matches (the reader shows 144 / 144 / 108 league-phase matches per competition for 2026-27, so the new bundle has roughly 150 forecasts or more); verify with `scripts/uefa-fit-data.mjs` for the new window and `node outbox/forecast-fit-uefa-2026-11-27.mjs --integrity-only` style checks. It would cost one pre-registration and one run, no change to anything shipped, and it is a real second test where the first had n 90. **Recommended only if the owner wants the UEFA forecast;** otherwise option 1.
Rule F (modelled, pull-only; Rule A not cleared) is unchanged and would bind option 2's eventual build.

## Exploration 2026-11-28: idea 3, a prior (the owner's "Explore #3 first. We want the full forecaster.")

Outcome-blind, nothing built, nothing pre-registered; the record is `outbox/cc-session-2026-11-28-uefa-prior-exploration.md` (BUILD-ON-A: this addendum extends "After the verdict", it does not file a second CC-CMD). The 2025-26 league phase and the frozen 2026-27 bundle stay burned for scoring any alternative candidate; they are inputs only.

- **External evidence favours a prior** (30 claims re-read by skeptics, 26 confirmed): a Champions and Europa League rating frozen on 1 September beat an outcome-frequency benchmark at RPS x100 19.729 against 23.068 on 600 matches, 0.072 in this CC-CMD's Brier scale against the table model's 0.032 (preprint, ClubElo's rating; `outbox/uefa-forecaster-prior-literature-2026-11-28.json`). In an 8-match phase the table carries about a third of the weight against even a league-mean prior (Bundesliga: 0.36 at 8 matches).
- **The archive alone cannot supply it**: of 108 club-slots in the 2026-27 league phases, 59% have any 2025-26 UEFA row and 26% the same competition; 44 clubs (41%) have none (`outbox/uefa-prior-coverage-2026-11-28.txt`). The archive's domestic leagues start between May and August 2026.
- **ESPN holds the clean data** (read-only dry runs, counts equal each format's size): 2024-25 league phase 189 + 189 + 153 completed events; 2023-24 Champions League 125, Conference League 141. 2024-25 is clean to the lab but not blind to the idea.
- **The candidate** (draft, section 5 of the record) is a rating with memory in place of the table: carry-over 0.8 to 0.9, a small in-season weight, a tier prior for debutants, then knockouts and stakes as arithmetic on the same ratings.
- **Decisions the owner holds:** authorise a read-only, names-only collector to measure multi-season coverage (recommended: yes); the prior source (an in-house rating, or ClubElo, whose terms are unread and need a human, Rule 45); keep NO FURTHER LOOK; confirm "full" means every league-phase match first.

## Replication 2026-11-28: ideas 1 and 2 (the owner's "Now 1 and 2", clarified as "Meant ideas 1 and 2")

**Status: IN PROGRESS (2026-11-28).** BUILD-ON-A: this section extends "After the verdict" option 2 above, it is not a second CC-CMD. The rule is `outbox/forecast-replicate-uefa-2026-11-28.mjs` (RULE block sha256 in the commit message of its commit; the VERSION paragraph lists v1, v2 and v3 and why each changed, all before any 2024-25 row was written to disk). **Tasks 3 and 4 above stay CLOSED, NOT BUILT. They are reopenable only on this rule's BUILD verdict, which permits Task 3 with the three constants exactly as printed (home 1.34, scale 1.97, share 0.18) and nothing else; Task 2's NO FURTHER LOOK clause is not undone, this is the new decision it reserves, and Rule F (modelled, pull-only, Rule A not cleared) binds any build.**

- **What it tests:** the same candidate U with its constants frozen, on matches no model has been scored on, with a two-look sequential test (one-sided total alpha 0.05: Look 1 on the 2024-25 league phase at 0.0125, Look 2 on the 144 remaining 2026-27 league-phase matches at 0.0375, only if Look 1 did not cross). Guards: G1 no competition clearly worse than the base rate, G2 the home-win slope within 1.96 SE of 1, G3 integrity checks (a) to (n) evaluated first at every look, outcome-blind on failure (a stop at G3 is no verdict; the third stop is NO VERDICT).
- **Order, as committed:** the rule alone, fixed after five review rounds and an independent implementation written from its text; then the collector (the ESPN scoreboard, one day per read, a club is its ESPN team id), the scoring tooling (the scoring module holds the rule loader, the scoring, the sets and the pooling, and is pinned by sha256; the run module holds the G3 checks, the I/O and the reporting), its checks (known answers: the 2026-11-27 fit's frozen-bundle numbers and the 2025-26 outcome counts; synthetic seasons through the real collector; a command-line run in a temporary git repository) and its mutation harness, the synthetic fixtures, the independent implementation and its test, the workflows (run, and a scheduled gate inert unless the committed Look 1 verdict is CONTINUE TO LOOK 2 and its recomputation record agrees); then the 2024-25 bundle by workflow, G3 only, then Look 1 once (its result committed before the independent recomputation runs).
- **What it spends:** the 2024-25 league phase is scored on U at Look 1 (not blind for any later candidate once it is) and, only if Look 1 does not cross, the 144 forward matches at Look 2. If Look 1 crosses, the forward matches stay unspent. The prior candidate of the 2026-11-28 exploration is therefore a new decision with that cost stated, not something this run forecloses silently.
- **Done condition (Rule 89):** `outbox/forecast-replicate-uefa-look1-result-2026-11-28.json` committed with a `verdict` key of one of BUILD, DO NOT BUILD, CONTINUE TO LOOK 2 or NO VERDICT, produced by the committed run workflow after G3 passed; its `ruleSha256` equal to the RULE block hash in the rule's commit message; the independent implementation's verdict equal to it (and its z to 1e-9, or recorded as `zAgrees` false); and, if CONTINUE TO LOOK 2, `outbox/forecast-replicate-uefa-look2-result-2026-11-28.json` committed by a gate run that started on or before 2027-02-15 (with its own agreeing recomputation record), or NO VERDICT. The verdict of a look stands only when its recomputation record (`outbox/forecast-replicate-uefa-look<L>-recompute-2026-11-28.json`, key `agrees`) says true. The session record is `outbox/cc-session-2026-11-28-uefa-replication.md`.
- **Not asserted:** that the ESPN data's licence allows this use (Rule 45: flagged for a human); that U is a good forecast (a pass says the table beats a table-free forecast on eligible matches).

## Not in scope

BSD incidents for last season (the live capture saw only the matches it saw; whether BSD serves historical incidents is a separate probe), a market line for UEFA cards, any push or badge-on-change (Rule A), the D1 `forecast_observations` store (the owner's gate, unchanged), and knockout-tie forecasts.
