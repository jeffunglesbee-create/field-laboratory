# CC-CMD-2026-08-20-brief-data-quality

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (journalism cron) **and** jubilant-bassoon (client
archive writer) — see ask 4, this is a paired cross-repo change per Rule 70
**Status:** open — asks 1, 2, 3, 4a, 4b, 5, 6a BUILT; ask 6b needs a rescope
and §5's residual D1 mutations await authorization. See revision 6.
**Revision 3 (2026-08-21)** — see "What changed in rev 3" at the end. Rev 3
corrects two rev-2 claims that measurement falsified; the corrections make ask 5
*less* blocked, not more.
**Revision 4 (2026-08-21) — EXECUTED.** The relay/client session shipped asks 1,
2, 3, 4a, 4b, 6a and deployed four deploy-gating guards (client smoke 985/0); ask
5 is unblocked and fully specified; ask 6b needs a rescope. Execution corrected
several of this doc's own claims (ask 2 overcount, ask 5 container, ask 6
"inverted") — folded in below; see "What changed in rev 4". Session doc:
`field-relay-nba/outbox/cc-session-2026-08-21-brief-data-quality-asks-3-4-6.md`;
the per-sport event contract now lives in `CONTRACTS.md` (both repos).
**Revision 6 (2026-08-23) — ASK 5 BUILT** by relay `644d7f6`
(`buildMatchEventsContext` / `formatMatchEvents` / `selectScoringPlays`, context
source `match_events`, priority 4, budget 200). Verification is automated, not a
note: check 4 of `scripts/verify-staged-items.mjs`, on the daily
`staged-verification` schedule. Three of this doc's own ask-5 claims were
corrected by measurement — see "What changed in rev 6". One piece of ask 5's
stated scope was **not** built and is filed as its own CC-CMD rather than left as
a carry-forward (Rule 87): `CC-CMD-2026-08-23-soccer-near-miss-enrichment`.
Session doc: `field-relay-nba/outbox/cc-session-2026-08-23-match-events.md`.
**Revision 5 (2026-08-21).** A follow-up census fully mapped the residual D1
mutations §5 carried as "needs authorization" — see "What changed in rev 5". Rev
4 was the execution report; rev 5 is the residual worked out to row-level maps,
kept a separate marker rather than merged into rev 4 so "shipped on execution"
and "clarified afterward by census" stay distinguishable.

One-liner:
```
FIELD's briefs ship five measurable defects: a drama rating rendered into
user-facing prose, in-progress snapshots labelled game_recap, a wrong sport
label, un-joinable game-ids from two different writers, and a quality_score
that rewards fluency over event-accuracy.
```

---

## Probe block — run first, before writing any code (Rule 87)

Every constant, id, and route below is read from HEAD, not memory.

```bash
git log --oneline -5

# The defective slate. /archive/query reads the BRIEFS table (src/index.js
# ~11617) -- which is what we want here. Do NOT substitute /context/date:
# that reads regular_season_games and answers a different question.
curl -s "$RELAY/archive/query?date=2026-08-19&brief_type=game_recap&limit=20"
curl -s "$RELAY/archive/query?date=2026-08-19&sport=MLB&limit=5"

# Who writes what: the `source` field separates the two writers.
#   source=cron   -> handleJournalismCycle (relay)
#   source=client -> POST /archive/game from jubilant-bassoon
curl -s "$RELAY/archive/query?date=2026-08-19&limit=40" \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
    const by={}; for(const r of d.results) by[r.source]=(by[r.source]||0)+1;
    console.log(by);'

# Does the join target actually exist? (ask 5 depends on this)
curl -s "$RELAY/context/date/2026-08-19" \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
    const g=d.games.regular;
    const withId=g.filter(x=>x.espn_event_id).length;
    console.log("rows",g.length,"with espn_event_id",withId);
    console.log("by sport:", Object.entries(g.reduce((a,x)=>{
      const k=x.sport+(x.espn_event_id?" HAS":" NULL"); a[k]=(a[k]||0)+1; return a;},{})));'
```

---

## The evidence

Pulled from `/archive/query?date=2026-08-19`. All quotes verbatim from stored
`brief_text`. Re-verified 2026-08-20 against the live relay.

### 1. A drama rating rendered into user-facing prose

`game_recap_la liga_401882925`:

> "Málaga … failed to generate momentum during the ESPN Deportes broadcast
> **in a game with a 52/100 drama rating**."

`brief_text` is displayed to the user. ADR-002 **PROHIBITED #3** — *"Raw
composite drama number displayed to user … Even if computed client-side,
displaying `"75"` or `"85% 🔥"` to the user creates evidence of a system that
determines and presents interest levels"* — is explicitly untouched by the
2026-07-07 corrections (`ADR-002-CONTEXT.md` line 75).

Note what is **not** the problem, so this is not over-scoped: storing the value
and serving it on pull are both permitted (Rule E — the relay may store and
serve derived drama state "of any shape — numeric or labeled"), and postgame
content is in the amnesty zone. The single issue is the number reaching the
reader's screen.

This row also carries a factual defect worth fixing in the same pass:
*"Málaga remains scoreless with 0 goals through this season and 0 points through
the season after a 2-0 loss"* — first-matchday season stats rendered as if
meaningful, and self-contradictory beside a stated result.

### 2. "Recaps" frozen mid-game

`brief_type: game_recap`, all `created_at ~2026-08-19 10:02` — **before
kickoff** — narrating games still in progress:

| id | brief_text (excerpt) | quality_score |
| -- | -- | -- |
| `game_recap_mls_761736` | "remain scoreless at Lumen Field **through 46 minutes of play** … Apple TV broadcasts this **second-half action**" | **191** (top of slate) |
| `game_recap_mls_761738` | "remain scoreless **five minutes into** this FS1 broadcast" | 168 |
| `game_recap_mls_761729` | "Chicago **leads Orlando 2-1 … in the 73rd minute**" | — |
| `game_recap_mls_761735` | "Dallas leads Salt Lake 3-1 **at halftime**" | — |
| `game_recap_mls_761734` | "Colorado holds a 1-0 lead … **at halftime**" | — |

A recap of an undecided game is the single most credibility-damaging thing a
sports source can ship, and FIELD ships it under the word "recap."

### 3. A wrong sport label

`epl_match_2026-08-19_espn:761725`, `sport: "EPL"`, `brief_type: "epl_match"` —
text: "New England Revolution travel to face D.C. United tonight **in an MLS
matchup**." Labelled EPL, is MLS, and is a pregame preview filed as a match.

### 4. Un-joinable game-ids — measured

Brief `game_id` shapes across the whole `briefs` table:

| shape | count |
| -- | -- |
| 9-digit ESPN-like | 2,243 |
| 6-digit numeric | 586 |
| **ordinal `gNN`** | **539** (census; an earlier narrower slice read 535) |
| other (e.g. `golf_401811962_R4`) | 1 |

**The ordinal ids are not the cron's, and there are 539 of them** (census figure). They are
`source: 'client'`, `model: null` — written by jubilant-bassoon via
`POST /archive/game`, not by `handleJournalismCycle`. Rev 1 cited four
(`g16`–`g19`) and addressed them to the journalism cron; both were wrong. A
relay-only fix enforces but does not cure.

**Corrected `game_recap` join rate: 82% (1,196 / 1,452)** — both game tables
unioned, golf excluded. The misses are NOT evenly spread, and NOT where rev 2
guessed:

| sport | joined / total | |
| -- | -- | -- |
| MLS | 83 / 83 | **100%** |
| EFL Cup | 31 / 31 | 100% |
| UEFA Europa Conference League Qualifying | 24 / 24 | 100% |
| UEFA Europa League Qualifying | 12 / 12 | 100% |
| La Liga | 7 / 7 | 100% |
| EFL Trophy | 7 / 7 | 100% |
| NFL | 18 / 18 | 100% |
| MLB | 665 / 791 | 84% |
| WNBA | 132 / 155 | 85% |
| FIFA World Cup | 217 / 299 | 73% |
| **`football`** | **0 / 21** | **0%** |
| **`mlb`** | **0 / 4** | **0%** |

Two of those rows are a **label-variant** failure, not an id failure:
`sport: 'football'` (21 rows) and `sport: 'mlb'` (4 rows) — lowercase / wrong-
level strings that match no declared label and join at exactly 0%. This is the
brief-side instance of the same fragmentation the relay just closed in the games
table (`UEFA Conference League` vs `UEFA Europa Conference League`, fixed
2026-08-20). See ask 3 — it is worth 25 rows, not one.

A fourth id shape exists and is by design un-joinable: PGA rows keyed
`golf_<eventId>_R<round>` (per-round composite). Excluded from the rate above
rather than counted as a defect; if golf recaps should join to something, that is
its own decision.

Also note the id prefix embeds the sport label lowercased with spaces preserved
(`game_recap_efl trophy_…`, `game_recap_la liga_…`) — the same id-namespace
hygiene issue, in the id rather than the column.

### 5. `quality_score` rewards fluency over truth

Measured ranking on the slate:

```
191  game_recap_mls_761736      frozen, scoreless "through 46 minutes"   <-- highest
178  game_recap_mls_761731      Charlotte-Toronto 3-3, real final
175  game_recap_efl trophy_…    Man City U21 4-1, real final
168  game_recap_mls_761738      frozen, "five minutes into"
166  game_recap_mls_761732      St. Louis-KC 1-1, real final
162  game_recap_la liga_…       real final (and the drama-rating row)
```

The ordering runs roughly *inverse* to informativeness. `scoring_version` is not
recorded on these rows, so no rubric is even attributable.

---

## The asks

Ordered by severity. Ask 1 is a compliance item and should land first.

### Ask 1 — Strip composite drama values from generated prose

No `brief_text` may contain a raw composite drama/interest number. Serving and
storing the value is fine (Rule E); rendering it to the reader is not
(PROHIBITED #3). Fix at the generation step — the value should not enter the
prompt's renderable context — rather than by post-hoc string scrubbing.

**Artifact:** `/archive/query?date=<any>&limit=40` returns no row whose
`brief_text` matches `/\b\d{1,3}\s*\/\s*100\b|\bdrama (rating|score)\b/i`.
Negative-test it: the check must flag `game_recap_la liga_401882925` as it
stands today.

### Ask 2 — Gate `game_recap` on an actual final

A brief may not carry `brief_type: game_recap` unless the joined game is final
at write time. In-progress states are a different type (`game_live` /
`game_update`) or are not written.

**Primary artifact (CORRECTED rev 4 — `created_at` alone overcounts).** Measured
at execution: `briefs` has no `updated_at`, and every write site's `ON CONFLICT DO
UPDATE` refreshes `brief_text` without touching `created_at`. So a row seeded
pre-game and later refreshed with the real recap still reads `created_at` before
`start_time` — `created_at < start_time` flags **513**, of which **472 are
merely-updated rows, not defects**. The real defect set is the INTERSECTION with
in-progress *language*: **41 rows**. SHIPPED as a `game_recap` / `game_live` /
`narrative_context` classifier keyed on real finality, gated by
`check-game-recap-classification.mjs`. The text net below is not a fallback — it
is the discriminator that separates the 41 from the 472.

**Secondary artifact (text net, broadened):** no `game_recap` whose text matches
`/scoreless|at halftime|through \d+ minutes|in the \d+(st|nd|rd|th) minute|(first|second)[- ]half action/i`.

> **Why the rev-1 regex was replaced.** It read
> `/scoreless (five|ten) minutes|at halftime|in the \d+(st|nd|rd|th) minute/`.
> Against `game_recap_mls_761736` — the 191-scoring row this CC-CMD is built
> around — none of the three alternatives match: the text is "scoreless **at
> Lumen Field through 46** minutes", not "scoreless five minutes", not "at
> halftime", not "in the 46th minute". **The stated done-condition passed while
> the headline defect survived.** This is the exact Rule 90 failure mode — a
> check satisfiable without matching for the right reason — so the primary
> artifact is now structural and the regex is only a net.
>
> Both regexes run against the four real strings, rev1 / rev2 (want: defective
> `true`, real finals `false`):
>
> ```
> rev1   rev2
> false  true    761736  "scoreless at Lumen Field through 46 minutes"  (q191, headline)
> true   true    761738  "scoreless five minutes into"                  (q168)
> false  false   761731  Charlotte-Toronto 3-3, real final
> false  false   efl trophy 401906265, real final
> ```
>
> rev1 catches one of two defects and misses the one the document is about.
> rev2 catches both and holds clean on both real finals.

### Ask 3 — Fix the sport label, and extend the label contract to briefs

This is worth more than the single EPL row it was filed on. Measured: `sport`
values `football` (21 rows) and `mlb` (4 rows) exist in `briefs` and join to a
game row **0% of the time** — 25 rows silently orphaned by a label string rather
than by a bad id. A brief whose `sport` matches no declared label is
unreachable by every sport-filtered read, including `/archive/query?sport=`.

**Artifact, two parts:**

1. No brief whose `sport` is outside the declared label set. Today that must
   flag the 21 `football` and 4 `mlb` rows.
2. No brief whose `sport` is `EPL` while its `brief_text` names an MLS club, and
   vice versa — an enumerated club-list check, not a judgement call. Must flag
   `epl_match_2026-08-19_espn:761725` as it stands today.

The relay's `scripts/check-leagues-label-contract.mjs` is the working precedent
for part 1: it asserts every soccer `LEAGUES` label is a declared
`SOCCER_LEAGUE_LABELS` value, and is negative-tested to fail by name. The same
shape applied to `briefs.sport` closes this.

**EPL readiness — the first Premier League matchday is 2026-08-22 (laboratory-added
2026-08-21).** The 2026-27 Premier League opens tomorrow, and this ask must cover
its label *before* the first game, not after the first orphaned brief. Verified
against ESPN, not assumed — an earlier read of this called Arsenal v Coventry a
cup tie on the stale belief that Coventry are Championship; they were promoted, so
these are genuine league fixtures:

- **The fixtures exist and FIELD is not carrying them.** ESPN
  `soccer/eng.1/scoreboard?dates=20260822` returns league id 700, *"English
  Premier League" / "2026-27 English Premier League"*, with Arsenal v Coventry
  City (event `401879301`, Emirates) and Manchester United at Hull City
  (`401879322`), among others. FIELD's `/context/date/2026-08-22` is 15 games,
  **all MLS**, and `/archive/query?date=2026-08-22` is `count: 0`. Same
  archive-seed gap the UEFA competitions had: the `LEAGUES` table is not emitting
  EPL into the archive `/context/date` serves, even though the `epl → eng.1`
  fetch config exists.
- **The emit label is unproven and at risk — this is ask 3's whole point.** ESPN
  names it `English Premier League` (abbr `Premier League`, slug `eng.1`). The
  only existing `epl_match` brief (`epl_match_2026-08-19_espn:761725`) is
  mislabelled — its text is MLS — and the orphan class in §4 shows soccer already
  arriving as `sport: 'football'` and joining at 0%. So without the declared-label
  contract in place, real EPL can land under `football`, `EPL`, or a mislabel and
  silently orphan on day one. The contract must declare the chosen EPL label and
  assert real EPL writes under it.
- **Home/away, ESPN-verified: Arsenal is home** (`homeAway: "home"`, Emirates).
  The ESPN URL slug reads `coventry-city-arsenal` — home listed second. If the
  relay ingests from the slug order rather than the `homeAway` field, it
  transposes the sides, and soccer is home-first — the AFL-transposition failure
  the `Sport` registry exists to prevent. Verify the relay carries Arsenal home.
- **Laboratory side (not this repo's ask, recorded for sequencing):** the `Sport`
  registry models `EFL Cup` and `La Liga` but **not** EPL, so EPL renders
  `UnknownConvention` (home-first, flagged `UNMODELLED`) until observed-and-
  modelled on the confirmed label. Correct-but-flagged, same posture as UEFA. The
  clean order is: ship this label contract → relay emits EPL under a declared
  label → laboratory models that exact label.

### Ask 4 — Key briefs on a joinable id (PAIRED, two repos — Rule 70)

**4a — relay (enforce).** `POST /archive/game` rejects a `game_id` matching
`^g\d+$`. This stops the ordinal ids at the door but does not produce correct
ones.

**4b — client, jubilant-bassoon (cure).** The `source: 'client'` writer must send
the real event id, not its loop ordinal. This is where the `gNN` ids originate;
without 4b, 4a converts a bad write into a rejected write.

**4c — cron soccer: NO ACTION NEEDED. Rev 2 was wrong here.**

Rev 2 claimed "the 6-digit MLS ids mean that even after the ordinals are gone,
cron-written MLS recaps still will not join." **They join at 100%** (83/83).
Measured directly:

```
mls_recaps: 83   match_espn_event_id: 83   match_row_id: 0
```

The 6-digit values *are* `espn_event_id` — that is simply what ESPN uses for MLS.
Six digits versus nine is a format difference, not a key-space difference. Do not
"converge" them; there is nothing to converge, and renaming them would break a
join that currently works.

**4d — the real remaining misses.** MLB (126), FIFA World Cup (82), WNBA (23).
Out of scope for this CC-CMD, which is soccer-led; recorded so the 82% figure is
not mistaken for a soccer problem. Worth its own probe before anyone acts on it.

**Artifact:** no archived brief `game_id` matches `^g\d+$` (today: 539 do), AND
the `game_recap` join rate does not regress below its measured 2026-08-21
baseline of 82% overall / 100% for every soccer competition. The join must union
`regular_season_games` **and** `postseason_games` and exclude golf — joining only
the former, as the first version of this probe did, undercounts by treating
postseason MLB and per-round golf ids as failures.

### Ask 5 — Ground recaps in the per-sport scoring-event feed

Generate from the structured event feed rather than season-stat templates — this
is what makes a claim checkable, and what makes a provenance/confidence layer
possible at all.

> **BUILT 2026-08-23, relay `644d7f6`.** Context source `match_events`
> (priority 4, budget 200) emits a `[MATCH EVENTS]` block into the generation
> prompt. Guarded by `scripts/match-events-check.mjs` (25 assertions, blocking
> at the deploy gate). Verified on a schedule, not by a note: check 4
> `recap_names_a_scoring_play` in `scripts/verify-staged-items.mjs`, which runs
> daily and performs the enumerated per-row join this ask asked for.
>
> **Three of the claims below were corrected by measurement 2026-08-23.** They
> are left in place with the corrections beside them, because a reader who acts
> on the uncorrected version builds the wrong thing.
>
> 1. **The volume trap is not NBA's alone, and it is not a winter problem.**
>    WNBA measured **112** scoring items on a real finalized game — the same
>    wall as NBA's 119, and WNBA is in season. The selection rule is exercised
>    by live data today. "NBA needs selection" was wrong by one sport.
> 2. **The soccer slug is per-competition.** `_ESPN_SPORT_SLUG` maps every
>    soccer key to `fifa.world`, which is the World Cup. EPL needs
>    `sports/soccer/eng.1`, verified reachable. Other domestic slugs are NOT
>    verified and were deliberately left unmapped, so an unlisted competition
>    emits nothing rather than fetching a plausible-looking URL.
> 3. **NFL is reachable although absent from `_ESPN_SPORT_SLUG`.**
>    `sports/football/nfl` works through `/espn-summary`.
>
> **The selection rule, and what makes it possible.** `homeScore`/`awayScore`
> are present on **every** scoring item for MLB, WNBA and NFL — checked across
> the whole array, not element 0. So lead changes are computable, and above 12
> items the block is lead changes plus the closing period, capped at 8. EPL
> `keyEvents` carries no running score and needs none at three items; a missing
> or partial running score takes the chronological tail instead of ranking on
> `NaN` margins.
>
> **The block never states a scoreline.** Running scores are read for ranking
> and discarded, because a block printing them invites the generator to report
> the score as of the 8th-from-last scoring play as final — the shape of the
> 2026-08-22 EPL brief that invented "a 2-1 result".

> **NOT BUILT: soccer near-miss enrichment.** The `commentary` layer
> (off-target, woodwork, fouls) described below is real and measured, and it is
> not in `644d7f6` — that ships `keyEvents` scoring plays only. Filed as
> `CC-CMD-2026-08-23-soccer-near-miss-enrichment` rather than carried as a
> follow-up line here, per Rule 87: deferred work needs a second CC-CMD, not a
> sentence.

> **CONTAINER CORRECTED rev 4 — `keyEvents` is soccer-only.** The rev-3 scoping on
> `keyEvents` is wrong for four of five sports. Measured 2026-08-21 against real
> finalized events; the prose field is `text` everywhere, filtered to scoring:
>
> | sport | container | filter |
> | -- | -- | -- |
> | soccer | `keyEvents` | `scoringPlay === true` |
> | MLB / NBA / NHL | `plays` | `scoringPlay === true` |
> | NFL | `scoringPlays` | (all items are scoring) |
>
> The prose is exactly what this ask promised — e.g. MLB *"Walker homered to
> center (407 feet), Wetherholt scored…"*, NFL *"Woody Marks 20 Yd Run…"*. It now
> lives in `CONTRACTS.md` (both repos); the build reads it from there.
>
> **Generate from `text`, not the structured participant fields.** Soccer
> `participants[]` has no role field (positional: `[0]` scorer, `[1]` assister),
> the assister is present on only 8/14 assisted goals while `text` carried 14/14,
> and structured names disagree with the prose ("Dali" vs "Dalisson De Almeida").
> Use participant ids for joins only. Soccer near-miss enrichment (`commentary`:
> off-target / woodwork / fouls, absent from `keyEvents`) is IN at ~60%
> availability, degrading to goals-only on sparse fixtures.

> **NBA volume trap.** Scoring items per completed game: NFL 8, NHL 8, soccer 2–4,
> MLB 11, **NBA 119** (every made basket). A generator that concatenates scoring
> items is a paragraph for four sports and an unusable wall for basketball — NBA
> needs selection, not enumeration.

> **Cost was never the blocker.** Once per game at finalization is ~28 calls/day
> (14-day mean of 28 games/day), not a Rule 78 concern. Per-cron-tick would be
> 2,688 calls / 790 MB/day — *that* is the thing to avoid. Rule 78 applies only to
> the extent the fetch replicates the existing `cacheEverything` + TTL pattern.

**Artifact:** every `game_recap` names at least one athlete who appears in the
joined per-sport scoring-event payload — an enumerated pass/fail per row, not a
prose quality judgement. (The rev-3 "conditional on the premise holding" hedge is
removed; the join premise holds — MLS `game_recap` briefs join 83/83.)

**Season-context fallback — right stat per sport.** When a brief falls back to
season context rather than events, the stat must fit the sport. For European
soccer that is **table position and competition advancement** (points, rank,
European/relegation stakes), not a won-drawn-lost record — the §1 "0 points
through the season" / "0-0-0 records" lines are the wrong stat model, and vacuous
in the opening weeks when every record is 0-0-0 but the table already separates
sides on goal difference. Carried in full as defect 2 of
`CC-CMD-2026-08-22-brief-sport-contamination`; recorded here because ask 5 is
where the season-stat template is replaced.

### Ask 6 — Recalibrate `quality_score` and stamp `scoring_version`

Weight event density, freshness (a recap of an unfinished game scores low, not
high), and box-score agreement above fluency. Record the rubric that graded each
row.

Read `src/journalism-quality.js` before touching prompt structure (relay
CLAUDE.md), and note the derived `SCALE` / `REACHABLE_CEILING` work from
`CC-CMD-2026-08-15-quality-bar-scale` — recalibration must move those constants,
not add a parallel copy.

> **PREMISE CORRECTED rev 4 — the metric is not inverted, it under-penalises.**
> Rev 1–3 read a single 191-scoring frozen row as "quality_score is pointed the
> wrong way." The aggregate says otherwise: in-progress-language briefs mean
> **184.3** (n=94), reads-as-final briefs mean **190.1** (n=1381). Finals already
> score *higher* — the defect is that the 5.8-point gap is far too small, not a
> sign flip. Ask 6b is therefore a WEIGHTING change needing a before/after
> re-score to produce a real `measuredEffect` for the `SCORING_ERAS` entry —
> different work than "flip the sign," and not yet built. Ask 6a (stamp
> `scoring_version` on every INSERT) SHIPPED; coverage today: ver 1 = 716,
> ver 2 = 518, null = 241.

**Artifact:** `scoring_version` non-null on all new `game_recap` rows (6a, done),
AND on a re-scored 2026-08-19 slate the in-progress/final gap widens materially
from its measured 5.8-point baseline (6b, pending the rescope above).

---

## Scope boundary

- Do **not** change the pull/push architecture. Nothing here touches Rule A;
  every brief is pull-served and stays that way.
- Do **not** remove drama values from storage or from `/archive/query` — Rule E
  permits both. Ask 1 is about generated prose only.
- Ask 4b is client-side and must not be "fixed" by relay-side normalisation
  (Rule 64 — that would be a band-aid compensating for another layer's bug).

## What changed in rev 2

1. **New ask 1** — the `52/100 drama rating` clause in user-facing prose
   (PROHIBITED #3). Absent from rev 1; it is the highest-severity item in the
   sample.
2. **Ask 2's observable replaced.** Rev 1's regex did not match its own headline
   example (761736). Primary artifact is now structural (`created_at` vs
   `start_time`); the regex is a broadened secondary.
3. **Ask 4 split across two repos.** Rev 1 addressed the ordinal ids to "the
   journalism cron." They are `source: 'client'` — the cron did not write them.
   Also records the third key-space (6-digit MLS vs 9-digit ESPN).
4. **Artifacts added for the two asks rev 1 waved off** as "quality judgements
   without a single-field probe" (Rule 90 — a verification instruction without a
   stated artifact is a spec failure at authoring time).
5. **Ask 5's premise flagged for verification** — `espn_event_id` appears absent
   on MLS rows, which would leave the ask without a join target.
6. **Probe block and `git log` opener added** (Rules 87 / 79).

Retained from rev 1 unchanged: the evidence, the verbatim quotes, and the use of
`/archive/query` — which correctly reads the briefs table, the distinction that
matters here.

## What changed in rev 3 (2026-08-21)

Rev 2's two scoping flags were tested and **both were wrong**. Recording that
here rather than quietly editing, because the corrections change what gets built.

1. **Ask 5 unblocked.** Rev 2 warned ask 5 might have no join target for MLS.
   Measured: MLS `game_recap` briefs join **83/83, 100%**, and every soccer
   competition is at 100%. The evidence for the flag was future-dated schedule
   rows with legitimately-null ids.
2. **Ask 4c withdrawn.** Rev 2 claimed 6-digit MLS ids "will not join." They are
   `espn_event_id` values; six-vs-nine digits is a format difference, not a key
   space. Converging them would break a working join.
3. **Ask 4 sized properly.** 535 ordinal `gNN` briefs, not 4. Corrected join rate
   82% (1,196/1,452) with both game tables unioned and golf excluded — the first
   version of the probe joined only `regular_season_games` and reported a floor.
4. **Ask 3 strengthened.** `sport: 'football'` (21) and `sport: 'mlb'` (4) join
   at 0% — 25 rows orphaned by a label string. The ask was filed on one EPL row.
5. **Misses attributed.** MLB 84%, WNBA 85%, FIFA World Cup 73% — recorded as
   4d, explicitly out of scope, so the 82% headline is not read as a soccer
   problem.

**Method note, since it caused both wrong flags:** the first two readings came
from `/context/date` responses truncated by a self-probe, and from a join query
that omitted `postseason_games`. Neither is a substitute for a `GROUP BY` over
the real tables. The probe now in the relay is the reusable answer —
`workflow_dispatch` only, no `schedule:`.

## What changed in rev 4 (2026-08-21) — executed, and corrected against execution

The relay/client session built this CC-CMD and measured several of its premises
false in the process. Shipped: asks 1, 2, 3, 4a, 4b, 6a, plus four deploy-gating
guards (`check-game-recap-classification`, `check-brief-sport-label`,
`check-no-drama-number-in-prompts`, `contracts-identity-check`) and client smoke
985/0. Corrections folded into the asks above:

1. **Ask 2 was an upper bound, not a count.** `created_at < start_time` flags 513;
   472 are merely-updated rows (`ON CONFLICT DO UPDATE` refreshes `brief_text`, no
   `updated_at`). Real defects: 41, via the intersection with in-progress language.
2. **Ask 5's container was wrong for 4/5 sports.** `keyEvents` is soccer-only; MLB
   /NBA/NHL use `plays`, NFL uses `scoringPlays`; prose field `text` throughout.
   Now in `CONTRACTS.md`. Cost was never the blocker (~28 calls/day at
   finalization). Generate from `text`, not structured participant fields. NBA's
   119 scoring items/game need selection, not enumeration.
3. **Ask 6 was not inverted.** Finals score *higher* (190.1 vs 184.3); the metric
   under-penalises in-progress by 5.8 points. 6b is a weighting change needing a
   before/after re-score, not a sign flip. 6a (stamp `scoring_version`) shipped.
4. **Ask 3 shipped** via `canonicalizeWC26Sport(label)` at the pre-game writer +
   `check-brief-sport-label`; root cause was `inferSport()` emitting display
   strings (`"Baseball (MLB)"`) — fixed at call sites, not in `inferSport` (Rule
   69). The EPL-readiness clause in ask 3 rides this fix.
5. **Residual — needs Jeff's authorization (live D1 mutations), now fully mapped.**
   None executed. Census 2026-08-21 (`query_ok`):
   - **601 non-conforming `briefs.sport` across 20 variants** — all mechanical
     except one call. **Class A** (235, the ask-3 lowercasing): recover the label
     from each row's own id, which kept its casing (`pre_game_La Liga_…` →
     `La Liga`) — verifiable row by row, no hand map. **Class B** (324
     `inferSport` display strings): `Baseball (MLB)`→`MLB`, `MLS Soccer`→`MLS`,
     `Australian Football (AFL)`→`AFL`. **Class C** (10): `PGA TOUR`→`PGA Tour`.
     **Class D** (10 context strings, label is the prefix): `CFL – 2026 Season ·
     Week 7`→`CFL` (declared label confirmed at `src/index.js:8034`). **Class E**
     (22): `football`×21 + `wc`×1 → `FIFA World Cup`, determined by reading the
     rows (all World Cup group-stage), which rules out `NFL`. The single judgment
     call: `NBA Playoffs` (2) → `NBA` drops the postseason distinction, but that
     lives in `postseason_games`, so it is safe — flagged only because it is the
     one lossy map.
   - **Do NOT sweep all lowercase.** `wnba` (34) and `golf` (9) are lowercase but
     the games table carries those forms — they conform, and a
     "fix-all-lowercase" pass would break working joins.
   - **539 ordinal `gNN` ids (census; the earlier 535 was a narrower slice) —
     NOT recoverable.** From a client render-order counter (`"g"+(++_gid)`), so
     the id carries no game identity, unlike Class A. New writes already blocked
     (4a/4b); the rows are inert. Options: leave them (suggested), text-match
     re-identify (heuristic, partial), or delete (loses the prose).
   - **41 mislabelled `game_recap` = reclassify, not rewrite.** Correct *live*
     briefs wearing the wrong type; retype to `game_live`, prose intact.
6. **The 82% join rate exposes a seeding gap, not a brief defect (§5.6).** The
   unjoinable 18% is (a) well-formed 9-digit MLB ids whose game rows are simply
   not in D1 — a seeding gap, the subject of
   `CC-CMD-2026-08-21-archive-seed-coverage`, not this doc — and (b) a prefix
   format, `espn:760516`, that cannot match a bare numeric column. Neither is a
   label or id defect; recorded so 82% is not read as evidence against asks 3–4.
7. **Still unprobed (flagged, not assumed):** whether every `keyEvents` item
   appears in `commentary` beyond goals (goals confirmed, rest sampled over 6
   fixtures); a real soccer league-slug source for non-UEFA competitions.

`CONTRACTS.md` itself had silently drifted 173 lines between the repos since
2026-06-30 — the file that exists to prevent divergence had diverged — now gated
by `contracts-identity-check.yml` from both sides.

## What changed in rev 5 (2026-08-21)

A follow-up census turned the §5 residual from "roughly 601, some maps known"
into row-level maps. No content shipped; this is the authorization packet worked
out. Recorded as its own revision because it arrived after the execution report
(rev 4) and refines its figures.

1. **601 non-conforming `briefs.sport` fully classed** — A (235, recover the
   label from the row's own id), B (324 `inferSport` display strings), C (10
   `PGA TOUR`), D (10 context strings, label is the prefix), E (22 `football`/`wc`
   → World Cup by reading the rows). One lossy judgment call flagged: `NBA
   Playoffs` → `NBA`.
2. **A "do not sweep lowercase" guard added** — `wnba` (34) and `golf` (9) are
   lowercase but conforming (the games table carries those forms); a blanket fix
   would break working joins. This is the trap the census exists to prevent.
3. **Ordinal count corrected to the census figure, 539** (rev-3's 535 was a
   narrower slice), and confirmed not recoverable — render-order counter, no game
   identity.
4. **41 mislabelled `game_recap` reframed as reclassify, not rewrite** — retype
   to `game_live`, prose intact.
5. **New §5.6** — the 82% join rate's missing 18% is a seeding gap (MLB game rows
   absent from D1) plus an `espn:` prefix format, tied to
   `CC-CMD-2026-08-21-archive-seed-coverage`, not a defect of asks 3–4.
