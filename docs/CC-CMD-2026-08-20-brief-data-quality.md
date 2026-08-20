# CC-CMD-2026-08-20-brief-data-quality

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (journalism cron) **and** jubilant-bassoon (client
archive writer) — see ask 4, this is a paired cross-repo change per Rule 70
**Status:** open
**Revision 2 (2026-08-20)** — see "What changed in rev 2" at the end.

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

### 4. Un-joinable game-ids — from TWO different writers, not one

This is three key-spaces, not "ordinals vs `espn_event_id`":

| rows | `game_id` form | `source` | `model` | writer |
| -- | -- | -- | -- | -- |
| `mlb_game_…_g16` / `g18` / `g19` | ordinal `gNN` | **`client`** | `null` | jubilant-bassoon → `POST /archive/game` |
| `game_recap_mls_761736` etc. | 6-digit `761736` | `cron` | haiku | journalism cycle |
| `game_recap_efl trophy_401906265`, `game_recap_la liga_401882925` | 9-digit ESPN event id | `cron` | haiku | journalism cycle |

**The ordinal ids are not the cron's.** They are `source: 'client'`. A relay-only
fix enforces but does not cure. And the 6-digit MLS ids mean that even after the
ordinals are gone, cron-written MLS recaps still will not join.

Also note the id prefix embeds the sport label lowercased with spaces preserved
(`game_recap_efl trophy_…`, `game_recap_la liga_…`) — the same id-namespace
hygiene the relay just closed for UEFA in `check-leagues-label-contract.mjs`.

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

**Primary artifact (structural, sport-agnostic, cannot be evaded by rephrasing):**
no `game_recap` row whose `created_at` precedes its game's `start_time`. All five
rows in §2 are `created_at 10:02` against evening kickoffs, so this catches every
one of them today.

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

The relay just shipped `scripts/check-leagues-label-contract.mjs` for the
`LEAGUES` / `SOCCER_LEAGUE_LABELS` / `V2_LEAGUES` triangle. The same
verbatim-label discipline must cover a brief's `sport` field against its content.

**Artifact:** no brief whose `sport` is `EPL` while its `brief_text` names an MLS
club, and vice versa — an enumerated club-list check, not a judgement call.
Must flag `epl_match_2026-08-19_espn:761725` as it stands today.

### Ask 4 — Key briefs on a joinable id (PAIRED, two repos — Rule 70)

**4a — relay (enforce).** `POST /archive/game` rejects a `game_id` matching
`^g\d+$`. This stops the ordinal ids at the door but does not produce correct
ones.

**4b — client, jubilant-bassoon (cure).** The `source: 'client'` writer must send
the real event id, not its loop ordinal. This is where the `gNN` ids originate;
without 4b, 4a converts a bad write into a rejected write.

**4c — cron soccer.** MLS recaps key on 6-digit ids while EFL Trophy / La Liga
key on 9-digit ESPN event ids. Converge on one space, or state explicitly which
id each sport is keyed by and why.

**Artifact:** no archived brief `game_id` matches `^g\d+$`, AND every
`game_recap` row's `game_id` resolves to a row in `regular_season_games`.

### Ask 5 — Ground recaps in `keyEvents` / `incidents`

Generate from the structured event feed (ESPN summary `keyEvents`: scoring
plays, athletes, coordinates; BSD `incidents`: goal/card/sub with minute) rather
than season-stat templates. This is what makes a claim checkable, and therefore
what makes a provenance/confidence layer possible at all.

> **VERIFY THE PREMISE BEFORE SCOPING THIS (Rule 72).** The companion
> positioning note asserts *"Every row carries `espn_event_id`."* That is
> **unverified and looks false for MLS**: the MLS rows in
> `/context/date/2026-08-20` carried `"espn_event_id": null`. If MLS genuinely
> lacks the id, this ask has no join target for the sport that produced most of
> the defective recaps, and the real first step is populating the id — a
> different, larger piece of work. Run the last probe in the block above and
> resolve this before costing ask 5.

**Artifact (conditional on the premise holding):** every `game_recap` names at
least one athlete who appears in the joined `keyEvents` / `incidents` payload.
An enumerated pass/fail per row, not a prose quality judgement.

### Ask 6 — Recalibrate `quality_score` and stamp `scoring_version`

Weight event density, freshness (a recap of an unfinished game scores low, not
high), and box-score agreement above fluency. Record the rubric that graded each
row.

Read `src/journalism-quality.js` before touching prompt structure (relay
CLAUDE.md), and note the derived `SCALE` / `REACHABLE_CEILING` work from
`CC-CMD-2026-08-15-quality-bar-scale` — recalibration must move those constants,
not add a parallel copy.

**Artifact:** `scoring_version` non-null on all `game_recap` rows, AND on a
re-scored 2026-08-19 slate no frozen-snapshot row outranks any real final.

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
