# Outbox — the quality bar is 98% of what the scorer can reach

**Date:** 2026-08-15
**Ships:** `src/Ceiling.fs`, `docs/CEILING-PROOF.md`, `scripts/ceiling-check.mjs`,
one mutation, one verify step

## The hypothesis, and what it turned out to be

Stated earlier this session: *if JQ's alerting threshold was calibrated against
300 while the relay's achievable ceiling is 245, that's the density bug's shape
again.* Tested. Confirmed, with one correction and one piece of credit.

`journalism-quality.js` documents its own reachable total in its header:

```
// Worker runtime: game object not available (relay scores without game
// context — Dims 7/10 return N/A, ceiling reduces to 245)
// Ceiling breakdown: 150(base) + 45(arc) + 25(ctx=N/A→0) + 20(temporal) +
//                    30(voice) + 30(matchup=N/A→0) = 245
```

**55 of 300 points are unreachable by construction** — not by writing badly.

`/quality/report` carries a flat bar of **240**. So:

| | |
|---|---|
| 240 as a fraction of the 300-point rubric | **80.00%** |
| 240 as a fraction of what the relay can score | **97.96%** |
| headroom on the reachable scale | **5 points**, across eight dimensions |
| four fifths of the *reachable* scale | **196**, not 240 |

A bar chosen as "four fifths of the scale" became "lose at most five points"
the moment the scorer stopped seeing game context. The five points have to
absorb, among others, a 36-point freshness term driven by a third-party
word-frequency API.

## Measured, not argued

From `/quality/report`, 2026-08-15, seven-day window:

- `above_240` = **0** on **all 25** brief_type/sport rows
- `below_flat_240_pct` = **100** on **all 10** alerts
- best brief in the entire window: **230**

From the committed 592-brief corpus, offline:

- post-cutoff: **0 of 267** clear 240; best is **179**, sixty-one short
- pre-cutoff: **31 of 325** exceed even the documented 245 ceiling, max **300**

That last line is the control, and it is why this is a threshold finding rather
than a "briefs got worse" finding. Under the old **unclamped** Dim 4 some briefs
blew past the documented ceiling entirely — an unbounded term, not better
writing. The bar was survivable then for an arithmetic reason.

## The correction, and the credit

My framing was that the *alerting* threshold was miscalibrated. It is not, any
more. The live alert predicate uses per-brief_type calibrated percentiles —
`threshold_source: brief_type_p25(n=57,era3)`, values **123 to 169** — and
`alert_count` is 10 against `alert_count_legacy_predicate` 13.

So the relay already moved its alerts off the flat bar. What remains is that 240
is still **reported**: `below_240`, `above_240`, `below_flat_240_pct`. A constant
100 reads as a quality catastrophe when it is an arithmetic certainty, and
anything downstream consuming those fields inherits the confusion.

That is a smaller finding than I expected to write, and it is the honest one.

## What the types do

`src/Ceiling.fs` gives `Score<'tag>` and `Threshold<'tag>` a phantom scale tag,
so `passes` requires both to come from the same scale. `docs/CEILING-PROOF.md`
compiles five cases, all confirmed rejected:

| case | error |
|---|---|
| a relay-scale score judged by a nominal-scale bar | FS0001 |
| assigning `flatBarAsApplied` where `flatBarAsDecided` is expected | FS0001 |
| a 0.8 bar taken from one scale and applied to another | FS0001 |
| reading `relayReachable.Max` to restate the ceiling | FS1093 |
| a bare `int<point>` used as a score | FS0001 |

The second is the one that matters most: **both are literally 240**, and F# still
refuses, which is what makes "we have always used 240" an insufficient defence.

Teeth: restating the relay ceiling as 300 — the exact mistake — gives **5 failing
assertions, exit 1**; restored, **13/13, exit 0**. Registered as mutation
`ceiling-restated-as-nominal`.

## A defect of mine, and one the repo caught

I first asserted "four fifths of reachable is 196" with
`Number(String(threshold).match(/\d+/))` and an `||` fallback that would have
passed whichever branch held — a check that cannot fail. Replaced with the
module's own `thresholdValue`.

And `unused-check` failed the first build: `nameOf` and `scoreValue` were
exported and read by nothing. Rather than delete them I made the check read them
— the scale's *name* carries why it is 245, and a ceiling with no stated cause is
a magic number. There is now an assertion that each scale says why it is the size
it is.

## What is NOT claimed

- **What the bar should be.** Whether 80% of reachable — 196 — is the right
  editorial standard is a judgement about journalism. This module makes the scale
  explicit; it does not pick one.
- **That 240 is unreachable in principle.** It is five points under a 245
  ceiling, so it is arithmetically reachable. The measurement is that nothing came
  within ten points of it in seven days across 25 brief_type/sport combinations.
- **That any of this is live-alerting today.** It is not. See the credit above.
