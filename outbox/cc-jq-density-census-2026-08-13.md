# Outbox — The JQ score drop is the formula, measured at n=592

**Date:** 2026-08-13
**Commit:** this one
**Artifacts:** census run 31730191553 (green), `data/jq-mlb-game-corpus.json` (592 briefs)

## The question

Production's stored `mlb_game` quality_score fell from a ~203 mean to a ~135 mean
across `6aed3bb` (CC-CMD-2026-07-16-journalism-quality-gate-redesign, deployed
2026-07-16T01:36:49Z), and `/quality/report` has reported `failure_pct: 100` on
every alerting `brief_type` since — 13 alerts, all permanently firing.

Two explanations: the prose got worse, or the rubric moved. They are
distinguishable by rescoring old texts under the current formula, which nothing
had done.

## The answer

592 briefs, 325 before the cutoff and 267 after, every one rescored by importing
the real `scoreProse` from `field-relay-nba/src/journalism-quality.js`:

```
                          stored (production)   rescored (current rubric)
PRE  6aed3bb  n=325       mean 203.2  max 300   mean 136.4  max 179
POST 6aed3bb  n=267       mean 135.4  max 179   mean 137.3  max 181

stored   delta: -67.8
rescored delta:  +0.9
```

Under one consistent rubric the two eras differ by **0.9 points on a 300-point
scale**. The entire 68-point drop is the formula. None of it is the prose.

The pre-cutoff `max` of **300** is the full ceiling, which is its own finding:
the old Dim 4 was an unclamped `(properNouns+numbers)/nSent` multiplied directly
into `base`, so wire-copy-stacked text could saturate the scale. That is exactly
what the redesign's own source comment says it fixed.

## What the corpus says about the fix

`FIELD_PROSE_STYLE`'s rule, which Dim 1 and Dim 4 both cite in their source
comments, governs **numbers**:

> Each sentence in the brief gets AT MOST ONE **number**. If a sentence has two,
> restructure or split. If a sentence has three, you have written a box score
> with verbs.

Both dimensions measure `properNouns + numbers`. Sports prose is obligate
proper-noun-dense — "Baltimore Orioles pitcher Brandon Young faces a lineup"
carries three proper nouns and zero numbers — so the conflated unit sits far
above the numbers-only ideal the rule states:

```
                           PRE            POST
rawDensity (PN+NUM)/sent   mean 4.45      mean 4.40     (taper reaches 0 at 3.00)
numbers/sent (house rule)  mean 1.86      mean 1.64
Dim 4 as shipped   (0-16)  0.37, floored 91.4%   0.33, floored 91.0%
Dim 4 numbers-only (0-16)  9.24, floored  8.9%  10.69, floored  6.7%
Dim 1 specificity  (0-30)  7.08 / 30            7.91 / 30
```

Corpus-wide minimum `rawDensity` is **1.75**. The curve peaks at 1.00 and reaches
zero at 3.00, so no brief in 592 is anywhere near the peak — the unit is not
marginally wrong for the genre, it is out of range for every real input.

**And the prose did improve, on the axis the rule actually governs.** Numbers per
sentence fell 1.86 → 1.64 (median 2.00 → 1.50). The shipped dimension registers
that as 0.37 → 0.33, noise at the floor. The same curve on the correct unit
registers it as +1.45 points. The metric cannot see an improvement it should be
rewarding.

## The threshold, now measured rather than derived

`/quality/report` counts `below_240`/`above_240` and drives `failure_pct` off
240, while naming the calibrated p25 as its `threshold_source`. Across 592 briefs
rescored under the current rubric the maximum is **181**. Nothing comes within 59
points of 240. The 13 permanently-firing alerts are not reporting a quality
collapse; they are reporting a constant left above the maximum attainable score.

That is consistent with the file's own stated ceiling arithmetic — the relay
scores without game context, so Dims 7/10 return N/A and the ceiling is 245 — and
with Dim 4 contributing 0 for 91% of briefs, which takes the practical ceiling to
229.

## Corrections to the smaller sample that found this

A 12-brief hand sample preceded this and got two things wrong, both in the
direction of overstating:

- It reported Dim 4 at the floor for **every** brief. At full corpus it is
  **91%** — 52 of 592 get some credit.
- It reported Dim 1 as also saturated, with four of twelve at exactly zero. At
  full corpus only **6.5%/7.1%** are at the floor; Dim 1 is compressed into its
  bottom quartile, not dead. The "46 of 150 base points near-dead" claim was
  wrong; the accurate claim is 16 points dead for nine briefs in ten, plus Dim 1
  running at a quarter of its range.

Recorded because the sample's error was not random — twelve briefs drawn from two
dates over-represented the floor, and a 12-sample generalised to "every" is the
same shape as every other overclaim this repo has catalogued.

## What is NOT established

- **Dim 5 (Freshness, 36 pts) ran on its fallback.** `api.datamuse.com` is 403 at
  the agent proxy, so every rescore got the same constant. Both eras got the
  identical constant, so the 0.9-point era delta is unaffected — but the absolute
  values carry an offset. That offset is now bounded empirically rather than left
  open: post-cutoff briefs scored **135.4 in production** and **137.3 here**,
  same formula and same texts, so the fallback tracks production to within ~1.9
  points on this corpus.
- **One `brief_type`.** `mlb_game` only. `/quality/report` shows the same
  `failure_pct: 100` across 13 types, but this measured one of them.
- **No replacement curve is proposed as calibrated.** The numbers-only column
  shows the unit change restores discrimination; where the peak should sit is a
  separate question, and the redesign's own comment calls 1.9 facts/sentence
  "much closer to ideal" while shipping a curve that peaks at 1.0 — an internal
  disagreement this census does not resolve.

## Why this is in laboratory and not in the relay

The finding is about relay code, but the measurement needs egress the relay's own
sandbox does not have and a corpus too large to pass through a tool result.
`*.workers.dev` is 403 CONNECT at the agent proxy — the same constraint that
produced `probe-url.yml` and `import-production-tables.yml` — so a runner fetches
it and commits the corpus, and the rescore runs locally against the real import.

The fixes themselves belong in `field-relay-nba` and are filed there as CC-CMDs
rather than carried here.

## Honesty note on this commit

`verify` went red on the first push of this work: `history-check` flagged
`41d3ac8` for changing `scripts/` without touching `outbox/`. The rule is
strictly per-commit, so no later commit can satisfy it — this document was folded
into the commit that needed it and the branch force-pushed with lease. Content is
unchanged; only the two commits' shas moved. Recorded rather than quietly
rewritten, because a rewritten history with no note is indistinguishable from a
history that never had the problem.
