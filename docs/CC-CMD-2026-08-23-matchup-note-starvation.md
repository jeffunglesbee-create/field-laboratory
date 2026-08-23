# CC-CMD-2026-08-23-matchup-note-starvation

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (whatever writes `regular_season_games.note`)
**Status:** open
**Parent:** `CC-CMD-2026-08-20-brief-data-quality` ask 6b. Found while measuring
that ask's baseline; separate from it, so it is a separate command (Rule 87).

One-liner:
```
Dim 10 (matchup depth) is 30 of the rubric's 300 points and scored exactly zero
on 190 of 190 real briefs. Not because it cannot run — because
regular_season_games.note, the column every matchupNote consumer reads, is
populated on 36 of 1284 finalized games. A tenth of the quality scale has been
dark, and the rubric's own comment called it unreachable, which stopped anyone
looking.
```

---

## Probe block — run first, from HEAD (Rule 87)

```bash
git log --oneline -5
grep -n "matchupNote" src/index.js src/journalism-quality.js
grep -n "note" src/index.js | grep -i "regular_season_games\|INSERT INTO"
```

```bash
# The gap, re-measured rather than trusted (Rule 72 — the 2.8% below is from
# 2026-08-23 and this doc's own claims expire like any other).
curl -s -X POST "$RELAY/d1/execute" -H "X-FIELD-Relay: $RELAY_SHARED_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT sport, COUNT(*) AS total, SUM(CASE WHEN note IS NOT NULL AND LENGTH(TRIM(note))>10 THEN 1 ELSE 0 END) AS with_note FROM regular_season_games WHERE finalized_at IS NOT NULL GROUP BY sport ORDER BY total DESC"}' \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
    for (const r of d.results||[]) console.log(r.sport, r.with_note+"/"+r.total)'
```

The per-sport split is the thing to read first. A gap concentrated in one sport
is a broken adapter; a gap spread evenly is a missing producer. They are
different builds and the probe distinguishes them before either is written.

## What is measured (2026-08-23)

- `Dim 10` scored **zero on 190 of 190** re-scored `game_recap` rows
  (`scripts/rescore-quality-6b.mjs`).
- **0 of those rows carried a matchupNote.**
- `regular_season_games.note` is non-empty on **36 of 1284** finalized games
  (**2.8%**).
- Its separation between in-progress and finished prose is **exactly 0.000** —
  the only dimension of the ten with no signal whatsoever, because it has no
  input on either side.

**There is a producer, and it writes somewhere else.** `src/index.js` writes
matchup notes to KV under `wc:matchup:{home}_{away}` with a 24-hour TTL — World
Cup scoped. Every `matchupNote` consumer reads `game.note` out of D1. So the one
thing that generates this content and the thing that consumes it have never been
connected.

**The rubric's own comment is why this went unnoticed.** `UNREACHABLE_DIMS`
listed `matchup` as having "no input in the Worker runtime", which reads as a
structural fact and closes the question. It is a data gap. Relay `74dc759`
corrected the comment and split the two cases apart; this is the build behind
the correction.

## The ask

Populate `regular_season_games.note` for finalized games, or move Dim 10's
weight if the content genuinely does not exist.

1. **Read the per-sport split first** and say which case this is.
2. **If a producer exists per sport** — ESPN `header.competitions[0].notes[]`,
   the WC KV writer above, series records — wire it into the same D1 column the
   consumers already read. Rule 60: the relay owns the contract, and the fix
   belongs where the consumers already look, not in a second column.
3. **If the content does not exist for most sports**, say so with the number and
   move Dim 10's 24 points onto dimensions that measurably do work — which
   requires a `SCORING_ERAS` entry with a measured effect, now enforced by
   `scripts/check-scoring-era-recorded.mjs` at the deploy gate.

Either outcome is acceptable. A tenth of the scale silently scoring zero is not.

## Scope boundary

- **Not `scoreProse`.** Dim 10's logic is fine; it has nothing to read.
- **Not the WC KV path.** It works for what it does. Do not delete it; connect
  it or leave it.
- **Not ask 5's `[MATCH EVENTS]` block.** Different source, different consumer,
  already shipped. A matchup note is editorial context *before* the game;
  scoring plays are what happened *in* it.

## Done condition (Rule 89 — an artifact, not "verify it works")

Whichever branch is taken, the proof is the same shape: a re-score showing
Dim 10 non-zero on real rows, or an era entry showing its weight moved.

1. A `rescore-quality-6b.yml` run reports `nonzero_rows_per_dim.matchupDepth`
   **greater than zero** — with the count, not a claim — or
2. `check-scoring-era-recorded.mjs` passes against a new era whose
   `measuredEffect` states the before/after gap from moving Dim 10's weight.

"The column is populated now" is not a done condition: the column can be
populated with strings no brief ever echoes, and Dim 10 would still score zero.
