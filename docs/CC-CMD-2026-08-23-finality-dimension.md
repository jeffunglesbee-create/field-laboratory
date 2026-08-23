# CC-CMD-2026-08-23-finality-dimension

**Filed from:** field-laboratory
**Ask to:** field-relay-nba (`src/journalism-quality.js`, `scoreProse`)
**Status:** open
**Parent:** `CC-CMD-2026-08-20-brief-data-quality` ask 6b, shipped 2026-08-23 as
relay era 4. That ask specified a *weighting* change and got one. This is the
lever it could not reach, filed as its own command rather than as a line in the
parent (Rule 87).

One-liner:
```
Nothing in scoreProse reads game state. The rubric tells a finished recap from
an in-progress one only through proxies — resolution language and whether the
final score got named — and reweighting those proxies has a measured ceiling of
41.6 points that also destroys the rest of the rubric. A dimension that reads
finalized_at is not bounded that way.
```

---

## Probe block — run first, from HEAD (Rule 87)

```bash
git log --oneline -5
node scripts/check-scoring-era-recorded.mjs      # must be green before and after
grep -n "SCORING_ERAS\|export const SCALE\|opts.game\|opts.matchupNote" src/journalism-quality.js
grep -n "runQualityChain(" src/index.js          # which call sites can supply finality
```

Then re-establish the baseline under era 4 rather than trusting the numbers
below, which were measured under era 3:

```bash
# dispatch rescore-quality-6b.yml, then read the newest manifest
node -e 'const d=require("./outbox/<newest>.json");
  console.log(d.rescored.gap_rescored, d.rescored.gap_verdict)'
```

## What is already measured (2026-08-23, n=95 per class, one rubric)

`scripts/rescore-quality-6b.mjs`, artifacts
`outbox/rescore-quality-6b-2026-08-23T144*.json`.

| dimension | separation (final − in-progress, normalised) |
|---|---|
| arcScore | **+0.146** |
| contextAnchoring | **+0.144** |
| temporalScore | **+0.111** |
| voiceScore | −0.134 |
| density | −0.120 |
| variety, freshness, specificity, statDepth, matchupDepth | ~0 |

Three dimensions carry the signal, and none of them is *about* finality:

- **arcScore** leads because a finished game produces resolution language. A
  well-written preview of a game that hasn't started can produce it too.
- **contextAnchoring** leads because a recap names the final score — but the
  dimension awards its 9 points for the score string appearing *anywhere* in the
  prose, which an in-progress brief quoting a current score also satisfies.
- **temporalScore** leads on tense and time-reference density.

**The ceiling of reweighting, measured.** Putting the entire 300 points on those
three dimensions gives a gap of **41.6** (6.5× the era-3 gap). That is the most
any weighting can ever buy, and it zeroes specificity, statDepth, variety,
density, freshness and voice — every dimension that makes the score mean
anything else. Era 4 took 11.5, about 13% of that bound, while leaving the rest
of the rubric intact.

## The ask

Add a dimension that reads whether the game was actually over, and score the
prose against that fact rather than against language correlated with it.

1. **Source the fact, don't infer it.** `regular_season_games.finalized_at` is
   the column ask 2 of the parent already made authoritative for
   `game_recap` classification (`check-game-recap-classification.mjs` guards it).
   Plumb it the way `opts.game` is plumbed — eight of the ten `runQualityChain`
   call sites in `src/index.js` already pass a game object.
2. **Score the disagreement, both ways.** A brief that reads as final on a game
   that is not final is the defect the parent ask named. A brief that hedges —
   "through 40 minutes", "at halftime" — about a game that finished hours ago is
   the same defect mirrored, and is equally wrong.
3. **Do not double-count.** `arcScore` and `contextAnchoring` already pay for
   resolution language and for naming the score. If the new dimension is funded
   by taking weight back from them, say so in the era entry, because part of any
   measured gain would then be the same signal wearing a new name.

## Scope boundary

- **`scoreProse` only.** Not the retry gate: `scoreThreshold` is a separate open
  decision (110 vs 196 vs 240) carried in
  `outbox/cc-session-2026-08-22-quality-scale-verified.md`, and it needs a cost
  estimate, not a rubric change.
- **Not the `matchupNote` starvation.** `regular_season_games.note` is populated
  on 36 of 1284 finalized games (2.8%), which is why Dim 10 scored zero on
  190 of 190 rows. Real, separate, and filed as
  `CC-CMD-2026-08-23-matchup-note-starvation`.
- **Do not change the nominal total.** 240, 196 and 110 all read against 300;
  moving it shifts every threshold at once under this change's name.

## Done condition (Rule 89 — an artifact, not "verify it works")

1. `node scripts/check-scoring-era-recorded.mjs` passes with a **new** era entry
   whose `measuredEffect` carries real numbers. The guard fails the deploy
   otherwise, so this is enforced rather than requested.
2. A `rescore-quality-6b.yml` run **after** the change reports
   `gap_rescored` materially above era 4's 11.5, with `gap_ratio_to_noise` ≥ 2
   and n ≥ 8 per class. Both the before and the after must come from that same
   script, so they are the same instrument on the same population.
3. An enumerated per-row table in the manifest showing the new dimension scoring
   **non-zero on both sides** — high on finalized rows, low on in-progress ones.
   A dimension that is zero everywhere passes every aggregate test while doing
   nothing, which is exactly how Dim 10 went unnoticed for two months.

## Why this is worth its own session

Era 4 was a weighting change and is done. This adds a dimension, which changes
`scoreProse`'s inputs, needs a new era with its own measured effect, and has to
prove it is not just re-buying arc and ctx under another name. Rule 69 — it does
not hitchhike.
