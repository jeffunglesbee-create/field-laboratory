# CC session — EPL forecaster Phase 1

**Date:** 2026-10-03
**CC-CMD:** `docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md`
**HEAD at start:** `140ac1e` → **HEAD now:** `e461943`
**Phase 2:** NOT built. The season projection, the six outcomes, the cascade and
the envelope were not touched.
**Outcome: TASK 0 COMPLETE AND COMMITTED. PHASE 1 NOT BUILT — reported below
rather than committed, because its done condition cannot be reached from this
repo.**

---

## What was built

`scripts/probe-epl-substrate.mjs` + `.github/workflows/probe-epl-substrate.yml`
— Task 0, run where egress works. 30 self-tests; 6 of 6 mutations caught with a
positive control on unmutated source.

Why a runner: the sandbox reaches neither `*.workers.dev` nor
`fantasy.premierleague.com`. Measured 2026-10-03, both `HTTP 000`. Task 0 says
"read from HEAD, do not trust this document", and a blocked probe cannot
substitute for the document's own numbers.

Five states per source, because `empty` is not `present` (Rule 99):
`unreachable` / `http-error` / `unparseable` / `empty` / `present`. The case this
exists for is `/soccer-fbref/epl.json`: HTTP 200, valid envelope, `teams: {}`.

## TASK 0 — probe output, verbatim

Artifact: `outbox/epl-substrate-probe-latest.json`, written by
[run 37139778097](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/37139778097)
and a second run at `2026-10-03T17:16:15Z`.

| source | state | HTTP | bytes |
|---|---|---|---|
| `/espn-standings/soccer/eng.1/standings` | **present** | 200 | 68,780 |
| `/fpl/fixtures` | **present** | 200 | 231,760 |
| `/fpl/bootstrap-static` | **present** | 200 | 1,778,810 |
| `/soccer-fbref/epl.json` | **empty** | 200 | 498 |
| `/context/date/2026-10-03` | **present** | 200 | 259,420 |

**Standings.** `name: "English Premier League"`, `season: 2026`, 20 entries. All
nine stat keys present on all 20 rows, `deductions` among them —
`deductions_present_on: 20`, so it does not have to be assumed zero. Top three:
Manchester City P5 15pts GF13 GA5 GD8; Arsenal 12pts GF8 GA4 GD4; Brighton &
Hove Albion third.

**`/fpl/fixtures`.** 380 fixtures, 38 gameweeks, 50 finished. Keys confirmed on
the first row: `event`, `kickoff_time`, `team_h`, `team_a`, plus
`team_h_difficulty` / `team_a_difficulty` and `team_h_score` / `team_a_score`.

**`unscheduled_event_null: 0` — and this REFUTES the CC-CMD.** The spec requires
`NoForecastReason` to cover "fixture unscheduled (FPL `event: null` — EPL
rearranges constantly)". Today, zero of 380 fixtures carry `event: null`. The
case is real in principle and must still be modelled, but it cannot be
*demonstrated* from today's payload, and the done condition's demand for a named
`NoForecast` case has to come from elsewhere.

**`/soccer-fbref/epl.json` confirmed still empty.** `competition: "Premier
League 2025-26"`, `updated: "2026-06-23T01:58:47Z"`, `teams: 0` — 3.5 months
stale, still labelled last season. Unchanged, and out of scope per the CC-CMD.

**Task 0.4 — EPL rows.** `/context/date/2026-10-03` served 75 rows and **zero**
EPL: CFB 54, NHL 13, MLB 4, golf 1, NBA 1, EFL Trophy 1, CFL 1. Searched for
three labels (`EPL`, `Premier League`, `English Premier League`); none present.
This confirms the observation that swapped the phases. It does **not** settle
which of the two readings is true — rows not written to the archive, versus rows
no longer on this path — and one date cannot. That remains open and, per the
CC-CMD, does not block Phase 1.

## THE TEAM JOIN — the finding, and it changed the design twice

The join of standings strength to FPL fixtures is the fact Phase 1 rests on, and
the CC-CMD's warning is "a bad team join fails silently". It was measured rather
than assumed, three times:

**1. By name: 13 of 20.** ESPN serves full names, FPL serves short forms. The
seven failures on each side:

| ESPN | FPL |
|---|---|
| Manchester City | Man City |
| Brighton & Hove Albion | Brighton |
| Leeds United | Leeds |
| Newcastle United | Newcastle |
| Manchester United | Man Utd |
| Nottingham Forest | Nott'm Forest |
| Tottenham Hotspur | Spurs |

Written from the document, seven of twenty clubs would have had no standings
data and the model would have produced numbers for them anyway.

**2. FPL cannot supply the table itself — `table_populated_on: 0 of 20.**
`played`, `win`, `draw`, `loss` and `points` are **zero for every club**;
`form` is `null`. Only `position` is populated. So the appealing idea — run the
model inside FPL's own id space and delete the join — is dead. One field read
killed it; it was one commit away from being built on.

**3. FPL's strength fields cannot substitute either.** `strength: null` on every
club, `strength_attack_*` and `strength_defence_*` all `0`, and
`strength_overall_home` takes **3 distinct values across 20 clubs** — Arsenal
and Man City both `4`, Sunderland `3`. A three-bucket ordinal cannot order a
table whose top two are separated by goal difference.

**4. By abbreviation: 18 of 20.** `ARS AVL BOU BRE BHA CHE COV CRY EVE FUL HUL
IPS LEE LIV NEW NFO TOT SUN` all agree. The two that do not are exactly the
Manchester clubs: ESPN `MNC` vs FPL `MCI`, and ESPN `MAN` vs FPL `MUN`.

**The design this dictates**, had Phase 1 proceeded: join on abbreviation, carry
a two-entry alias map with a `Source` note, and **assert 20 of 20 joined or
refuse to forecast the clubs that did not**. The assertion is the part that
matters — it turns next summer's promotion into a loud refusal instead of the
silent starvation measured above. A bare alias map with no completeness check is
the `FIELD_V2_SOURCES` failure the CC-CMD names: true when written, silently
wrong next season, still computing.

---

## WHY PHASE 1 WAS NOT BUILT

Phase 1's done condition opens with "D1 store exists, append-only, with
provenance and cause columns" and the scope section says "**D1 from the first
commit**". That store cannot be created or written from this repo.

**Measured, not inferred:**

- `field-laboratory/wrangler.toml` is an assets-only Worker — no `main`, no
  bindings. It has no D1 of its own and cannot acquire one without becoming a
  scripted Worker.
- This repo's existing D1 access is `POST /d1/execute` on field-relay-nba,
  credentialled with `RELAY_SHARED_SECRET` from a runner. Four workflows use it;
  `archive-scheme-duplicates.yml` states its own limit in a comment: "**it
  reads; it writes nothing to D1**".
- That route gates on a table allow-list. `field-relay-nba/src/index.js:15908`
  declares `ALLOWED_TABLES` with **15** entries —
  `odds_history, odds_backfill_progress, regular_season_games,
  postseason_games, change_log, analytics_output, briefs, codex, codex_history,
  jq_retry_telemetry, game_thread_notes, odds_budget, odds_budget_site,
  odds_fill_dead_pairs, odds_budget_month`. None is a forecast store.
- The gate is `sql.match(/(?:INTO|FROM|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+(\w+)/i)`
  and returns **403 `table not allowed`** for anything else — so both the
  `CREATE TABLE` and every `INSERT` fail. Precedent on record: the
  `odds_fill_dead_pairs` dry run "403'd here — the guard working — and spent
  nothing".

So Phase 1's store needs a one-line change to `ALLOWED_TABLES` in **a different
repo**, on the public relay's D1 write gate, plus a deploy. The CC-CMD's header
is `**Repo:** field-laboratory` and it does not mention the allow-list anywhere.
That is the cross-repo situation Rule 70 (ATOMIC-A) exists for: both sides
planned in one prompt. This one was not.

### What was deliberately NOT done instead

- **No JSONL or `data/*.json` store.** It would satisfy the *reason* D1 was
  chosen (the Arc Signature per-device failure) while contradicting the
  instruction. The standing rule is "no fallbacks, only fixes".
- **No writing into `analytics_output` or `change_log`.** Both are allow-listed
  and would work today. Both are relay-owned tables with existing consumers —
  `analytics_output` is read by the circadian wire on `feature`/`value`/
  `brief_text` — so borrowing one means a cross-system contract change made from
  the consumer side without updating `CONTRACTS.md`, against Rules 60 and 86.
- **No `Forecast.fs` without the store.** The type union, `NoForecastReason` and
  the `DeltaCause` diff all compile in this repo and the FS0025 proof case is
  available (`WarningsAsErrors` includes FS0025, so a consumer handling only
  `MarketImplied` genuinely fails the build). But the CC-CMD's Phase 1 opens
  "**Do not build a forecaster and bolt a record on later. Build the record; the
  forecast is its latest row**", and committing the forecast layer with no store
  is precisely that ordering. Shipping it would satisfy four of seven done
  conditions by doing the thing the spec forbids.

### Confidence

**Below 95 on Phase 1, and reported rather than committed.** Three of the seven
done conditions — the store, two observations of one subject across runs, and
the first-run "no prior" case — are not reachable without the cross-repo change
above. A score at or above the bar would have to count them as met.

**Task 0 is a separate matter and is committed**: it is a numbered task of this
CC-CMD, it is complete, its artifact is live-verified on a runner, and its
assertions are mutation-proven.

## The unblock, exactly

1. Add one entry to `ALLOWED_TABLES` at `field-relay-nba/src/index.js:15908`
   (suggested `forecast_observations`), with a comment naming this CC-CMD —
   matching how `odds_fill_dead_pairs` and `codex_history` were added.
2. Deploy field-relay-nba (`src/**` is a deploy-trigger path, so the push does
   it).
3. Create the table from a runner, append-only, one row per observation:
   `subject TEXT NOT NULL`, `value TEXT NOT NULL`, `provenance TEXT NOT NULL`
   (`MarketImplied` | `Modelled` | `NoForecast`), `cause TEXT NOT NULL`,
   `observed_at TEXT NOT NULL`. No `UPDATE` path and no unique key that invites
   one — the `codex_write` overwrite of 2026-09-08 is why.
4. Then Phase 1 proceeds in one pass: `Forecast.fs`, `docs/FORECAST-PROOF.md`,
   the abbreviation join with its 20-of-20 assertion, and two scheduled runs to
   satisfy the two-observation condition.

**This needs the owner's decision, not a session's.** It changes the write gate
on a public Worker that fronts every D1 table in the project.

## Residual

- Task 0.4 is confirmed for one date, not settled. Whether EPL rows are unwritten
  or merely off this path needs more than one probe, and the CC-CMD says it does
  not block Phase 1.
- `probe-fpl.yml`, which the CC-CMD refers to as existing, **does not exist in
  this repo**. `.github/workflows/` has no FPL probe other than the one added
  today.
