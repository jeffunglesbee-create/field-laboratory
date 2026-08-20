# CC-CMD-2026-08-20-brief-data-quality

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (the journalism cron that writes briefs to the archive)
**Status:** open

One-liner:
```
FIELD's briefs ship four measurable defects: in-progress snapshots labelled
game_recap, a wrong sport label, ordinal game-ids that don't join, and a
quality_score that rewards fluency over event-accuracy. Gate on final, fix the
label, key on espn_event_id, ground recaps in keyEvents, and recalibrate the score.
```

---

## The evidence

Pulled from `/archive/query?date=2026-08-19&limit=40`. All quotes are verbatim
from stored `brief_text`.

### 1. "Recaps" that are frozen mid-game

Several rows are `brief_type: game_recap`, all `created_at` ~`2026-08-19 10:02`
(before kickoff), narrating a game still in progress:

| id | brief_text (excerpt) | state it actually describes |
| -- | -- | -- |
| `game_recap_mls_761738` | "remain scoreless **five minutes into** this FS1 broadcast" | ~5' in |
| `game_recap_mls_761736` | "remain scoreless… **through 46 minutes**" | halftime |
| `game_recap_mls_761729` | "Chicago **leads Orlando 2-1… in the 73rd minute**" | 73' in |
| `game_recap_mls_761735` | "Dallas leads Salt Lake **3-1 at halftime**" | halftime |
| `game_recap_mls_761734` | "Colorado holds a 1-0 lead… **at halftime**" | halftime |

A recap of an undecided game is the single most credibility-damaging thing a
sports source can ship, and FIELD is shipping it under the word "recap."

### 2. A wrong sport label

`epl_match_2026-08-19_espn:761725`, `sport: "EPL"`, `brief_type: "epl_match"` —
text: "New England Revolution travel to face D.C. United tonight **in an MLS
matchup**." Labelled EPL, is MLS, and is a preview rather than a match report.

### 3. Ordinal game-ids that cannot join

The MLB briefs use `game_id` `g16` / `g17` / `g18` / `g19` — ordinals, not
`espn_event_id`. This is the seven-key-space problem
(`scripts/game-id-scheme.mjs`): a brief keyed `g16` cannot bind to the game row,
the box score, or ESPN's `keyEvents`. FIELD had no postgame recap that could be
joined to the Yankees–Orioles final at all.

### 4. `quality_score` rewards fluency over truth

The highest-scored recap on the whole slate is `game_recap_mls_761736` at
**191** — the "remain scoreless through 46 minutes" frozen snapshot above. A
fluent, event-free, mislabelled description of an unfinished game outscored every
real final. `scoring_version` is `null` on these rows, so no rubric is even
recorded. The metric is pointed the wrong way.

## The asks

1. **Gate `game_recap` on a final.** A brief may not carry `brief_type:
   game_recap` unless the game is final. In-progress states are a different type
   (`game_live` / `game_update`) or are not written. The observable consequence:
   no `game_recap` row whose text matches `/scoreless (five|ten) minutes|at
   halftime|in the \d+(st|nd|rd|th) minute/`.

2. **Fix the sport label, and extend the label contract to briefs.** The relay
   just shipped `check-leagues-label-contract.mjs` for `LEAGUES`; the same
   verbatim-label discipline must cover a brief's `sport` field against its
   content. No `sport: "EPL"` row whose teams are MLS clubs.

3. **Key briefs on `espn_event_id`, not ordinals.** So a brief joins to its game
   row, its box score, and its event feed. Ordinal `gNN` ids should not appear in
   the archive.

4. **Ground recaps in `keyEvents` / `incidents`.** The event feed FIELD already
   reaches via `espn_event_id` (ESPN summary `keyEvents`: scoring plays, athletes,
   coordinates; BSD `incidents`: goal/card/sub with minute) is the material that
   makes AP-quality recaps possible — "Rice's 447-ft homer in the 3rd," "a wild
   pitch made it 5-3." Generate from events, not season-stat templates.

5. **Recalibrate `quality_score` and stamp `scoring_version`.** Weight event
   density, freshness (an unfinished-game recap scores low), and box-score
   agreement above fluency, so a "scoreless through 46'" snapshot cannot top the
   slate. Record which rubric graded each row (`scoring_version` is currently
   `null` on cron-written recaps).

## Observable consequences, for follow-up

Registerable in `scripts/cc-cmd-followup.mjs` once shipped:

- Ask 1: `/archive/query?date=<final-slate>&limit=40` returns no `game_recap`
  whose text matches the in-progress regex above.
- Ask 3: no archived brief `game_id` matches `^g\d+$`.
- Ask 5: `scoring_version` is non-null on `game_recap` rows.

Asks 2 and 4 are quality judgements without a single-field probe; the drift-
sentinel's existing brief scan is the place to surface regressions.

## Why this is the priority, not a nicety

FIELD's differentiation rests on being the source that verifies and refuses (see
`outbox/cc-differentiating-on-trust-2026-08-20.md`). A recap of an unfinished
game, mislabelled by sport, that cannot join to its own box score, scored highest
for being fluent, is the exact opposite of that promise — shipped today. The
positioning is not credible until these close.
