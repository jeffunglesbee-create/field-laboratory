# CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards

**Repo:** field-laboratory (LAB-FIRST-A: new computation and proofs land here). The archive rows it needs come from field-relay-nba (`archive-league-history-backfill.yml`, read-only measured below).
**Branch:** main — commit directly, no feature branch, no PR.
**Status:** PARTIAL 2026-11-27. **Task 0 DONE** (the data, measured). **Task 1 DONE 2026-11-27 by another session** (field-relay-nba session "3rd session", on the owner's "UEFA history write approved"; verified here, below). **The Rule F scope was CONFIRMED by the owner 2026-11-27** ("Confirm the Rule F scope as recommended", decision 2; recorded here by a field-relay-nba session at the owner's instruction), so **Task 2 is UNBLOCKED**. Tasks 3 and 4 follow it. Nothing is built.
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
- **Not joined, as stated before the write:** the 524 rows carry no `bsd_event_id` (the label totals read joined 93 / 93 / 73, the rows that were there); `bsd-game-join-backfill.yml` joins the February to April rows on its schedule and spends BSD pages. A results-only forecast does not need the join.

What was specified (kept as the record): the 522 matches above, through `archive-league-history-backfill.yml` (`dry_run` false, one run per competition, `from` 2025-09-01, `to` 2026-04-30), with the `league` and `label` as the cron writes them (`uefa.champions` / `UEFA Champions League`, `uefa.europa` / `UEFA Europa League`, `uefa.europa.conf` / `UEFA Europa Conference League`), plus the 2 Conference League semi-finals of May 2026. Blocked by: a production archive write of 524 rows, 131 times the one approved on 2026-11-27. Unblocked when: the owner says to write them. Side effect to say before approval: the scheduled join backfill (`bsd-game-join-backfill.yml`, range from 2026-02-01) will pick up the Feb to April rows (NULL `bsd_event_id`) and spend BSD pages on them; rows dated before 2026-02-01 are outside its range and stay unjoined, which a results-only forecast does not need. **Alternative, if the owner does not want the write:** the EPL precedent, an external results source (the EPL fit used openfootball); it needs its own check against ESPN's final tables.
Verify (after the write): `read-archive-label-dates.yml` with `like` = `UEFA%` reads `UEFA Champions League` 93 + 186 = 279 rows, `UEFA Europa League` 279, `UEFA Europa Conference League` 73 + 150 + 2 = 225; and the dry run over the same window prints `alreadyArchived` equal to `completed`.

## Task 2 — Pre-register the fit and the out-of-sample rule (Task 1 is done; the Rule F scope was confirmed 2026-11-27, so this is UNBLOCKED)

What: a committed file fixing, before any fit is run: the model family, the burn-in (how many matchdays before a table is trusted), the baseline it must beat (the EPL's own comparison: Brier against a constant home/draw/away split and against the previous table-v1 form), and the pass rule on the held-out current season, in the shape of the EPL's seven-part rule (`outbox/cc-session-2026-11-09-fit-c.md`). Then the fit script, run unedited. Done when the pre-registration is committed with its commit time before the fit's first run, and the run's output is committed beside it. A fit that fails its rule is not shipped (the EPL's `table-v1` was refitted once under a rule fixed first and the rule said do not ship).

## Task 3 — The UEFA line on a card, pull-only (BLOCKED on Task 2 passing)

What: `src/Forecast.fs` and the card path (`src/CardForecast.fs`, `src/Standings.fs`) extended to the three UEFA competitions' league-phase `Scheduled` cards with kickoff ahead; knockout ties and clubs with too few matches carry a `NoForecastReason` sentence. A league-phase table per competition computed from the archive rows. `npm run check:forecast-pull-only` still passes, with its mutation harness. Done when it is shown red on each deliberate break first (Rule 90) and green after.

## Task 4 — Seen on a live card (BLOCKED on Task 3 and on a UEFA matchday with a league-phase card ahead)

The same CI-as-proxy pattern the EPL used (`forecast-live-probe`, run 44897584850): a real browser on the deployed page, a committed manifest of booleans and the screenshot. Done condition (Rule 89): `verdict: "PASS"`, every UEFA league-phase card that is `Scheduled` with kickoff ahead draws `model <method> — …`, every other UEFA card says why it does not, `errors: []`. Blocked until a UEFA matchday has such a card; I have not checked the calendar, and the date is not asserted here.

## Decisions for the owner (recommendations first)

1. **Write last season's 524 rows (Task 1).** Recommended: yes. It is the fit data and the out-of-sample comparison's other half, it removes the outside source the EPL needed, and it is the "full season UEFA history" the owner called valuable. Alternative: an external results source.
2. **Confirm the Rule F scope:** modelled, pull-only, drawn on request; Rule A (autonomous push) not cleared. Recommended: as read above. **DECIDED 2026-11-27: confirmed as recommended** (the owner's words: "Confirm the Rule F scope as recommended").
3. **The 345 qualifying rows: not needed for this.** Recommended: no, unless a use for qualifying history is named.

## Not in scope

BSD incidents for last season (the live capture saw only the matches it saw; whether BSD serves historical incidents is a separate probe), a market line for UEFA cards, any push or badge-on-change (Rule A), the D1 `forecast_observations` store (the owner's gate, unchanged), and knockout-tie forecasts.
