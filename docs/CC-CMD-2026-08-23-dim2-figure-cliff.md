# CC-CMD-2026-08-23-dim2-figure-cliff

**Filed from:** field-relay-nba session 2026-08-23, off the corpus probe run for
`CC-CMD-2026-08-22-brief-sport-contamination`.
**Ask to:** field-relay-nba (`src/journalism-quality.js`, `scoreProse`)
**Status:** WITHDRAWN 2026-08-23, same day, by the probe block this document
demanded. The premise does not survive a control.

## Why it was withdrawn

The ask said the scale "pays ~58 points for a brief carrying ANY figure at all"
and "never asks whether the figure is real", and inferred a 58-point incentive
to invent one. The first half is measured and stands. The inference does not.

It rested on a single pair: the Everton brief scored **165** with its invented
"107.7 DRTG, best in the NBA" and **128** with a true stat in its place. But the
true version read "a third clean sheet in four" — worded, no digit. That pair
varied **two** things at once, fabrication and surface form, and the gap was
attributed to the wrong one.

Holding form constant, three fabricated/real pairs against `scoreProse`,
sport EPL:

| pair | fabricated | real numeral | gap |
|---|---|---|---|
| Everton — "107.7 DRTG" vs "conceded 3 goals in 4 matches" | 165 | 161 | **+4** |
| Brentford — "37 goals this season" vs "11 shots this match" | 153 | 140 | +13 |
| Napoli — "107.7 DRTG" vs "won 4 of 5 away matches" | 154 | 152 | **+2** |

Mean near 6 on a 300-point scale, and pair 2's +13 is token count, not truth.

Against that, the two gaps that are real:

- **the same fact as a digit rather than a word: 161 vs 128** (+33)
- **any figure versus none: 102 → 128–161** (+26 to +59)

`scoreProse` rewards **numerals over words**. It barely notices whether the
numeral is true. There is no fabrication incentive to remove, so there is
nothing here to fix and no `SCORING_ERAS` entry to add — the ask's own done
condition #1, "the truthful variant must score >= the fabricated one", is
already satisfied to within noise once the comparison is fair.

## What the probe block would have caught, and did

This document's own probe block said: "Which dimension pays the 58? Score the
same sentence with and without one figure and diff the dims, **rather than
assuming it is all Dim 2**." Running it is what exposed the confound. The ask
was filed from a two-variable comparison; the probe block it carried was written
to catch exactly that, and it did, before any code changed.

Third ask this arc withdrawn by its own probe, after `closing-odds-capture` and
`archive-seed-coverage`. The pattern is consistent enough to name: an ask filed
from a rendered symptom needs a controlled comparison before it becomes work,
not just a measurement.

## What survives, and is not a defect

That numerals outscore words is real and measured. Whether it is WRONG is a
separate question this document does not answer and should not have folded in.
FIELD's own style block asks for "numbers over adjectives" and "specificity over
metaphor", so paying more for "3 goals in 4 matches" than for "a third clean
sheet in four" may be the intended behavior. Deciding that is a judgement about
the house voice, not a bug report, and it belongs to whoever owns the voice.

---

## ORIGINAL ASK, kept for the record


One-liner:
```
The quality scale pays ~58 points for a brief carrying ANY figure at all, and
pays nothing further for carrying more. It never asks whether the figure is
real. A brief with thin context is therefore under a 58-point incentive to
invent exactly one number -- which is what the Everton brief did.
```

## The measurement

`outbox/2f-score-bias-2026-08-23T02-32-15-295Z.json`, 386 scored briefs over
7 days, live corpus, `scripts/verify-2f-score-bias.mjs`:

| numerals in brief | n | mean quality_score |
|---|---|---|
| 0 | 3 | **107.7** |
| 1–3 | 26 | 166.0 |
| 4–7 | 156 | 176.3 |
| 8–11 | 174 | 177.3 |
| 12+ | 27 | 165.6 |

Two readings, and the second is the one that matters:

1. **This is not a density reward.** 12+ scores below 4–7. The
   ONE-NUMBER-PER-SENTENCE ratio is doing its job at the top end. A session
   hunting "the scale rewards stat-stuffing" would find nothing.
2. **It is a cliff at zero.** +58.3 points between "no figure" and "one to three
   figures", then flat, then a penalty. The whole incentive sits at the first
   number.

Corroborating single case, measured directly against `scoreProse` with
`sport: 'EPL'`:

- "Everton maintains a **107.7 DRTG, best in the NBA**, despite playing soccer
  tonight." → **165**
- the same brief with a true stat in place of the invented one → **128**

EPL briefs average 141.4. The contaminated version scored above that average;
the truthful one below it.

**Caveat, stated because the artifact states it:** the corpus split for
*contaminated* briefs is n=2 and sits below the probe's MIN_N floor of 8, so it
reports PENDING and is directional only. The cliff table above needs no
contamination judgement at all — it is the standing evidence, and it is what
this ask is about.

## Why the cliff is the mechanism, not a curiosity

Layer 2d already pushes in the same direction, in words:

> STAT VERIFICATION FAILURE: Your previous draft omitted these specific figures
> that were in the context data: … These exact figures MUST appear verbatim in
> your rewrite. **A brief without its own data is just filler.**

So a thin-context brief faces a 58-point scoring cliff and an explicit
instruction that a figure-less brief is filler, and the model has a prompt full
of illustrative figures within reach (`PROMPT_EXAMPLE_LITERALS`, 16 tracked, and
`CC-CMD-2026-08-23-prompt-numeral-mining` for the untracked rest). The three
commits deployed 2026-08-23 (`2ed34c7`, `9bf12b0`, `812bb5c`) removed the
easiest *source* of a borrowable figure. They did not touch the incentive.

## Probe block — run first, from HEAD (Rule 87)

```bash
cd field-relay-nba && git log --oneline -5

# Reproduce the cliff from the committed artifact, not from this doc.
node -e 'const d=require("./outbox/2f-score-bias-2026-08-23T02-32-15-295Z.json");
  console.log(d.mechanism_reading); console.table(d.mechanism);'

# Which dimension pays the 58? Score the same sentence with and without one
# figure and diff the dims, rather than assuming it is all Dim 2.
node --input-type=module -e '
import {scoreProse} from "./src/journalism-quality.js";
const a="Everton kept a third clean sheet in four, which is the story of their season.";
const b="Everton kept a clean sheet, which is the story of their season.";
for (const t of [a,b]) console.log(await scoreProse(t,{sport:"EPL"}), JSON.stringify(t));'

# Confirm the weights before changing any of them.
grep -n "Dim 1\|Dim 2\|const W = \|specificity\|statDepth" src/journalism-quality.js | head -20
```

## The ask

Not "remove the reward for figures" — a brief that cites real data IS better,
and the scale should say so. The defect is that the reward is **unconditional**
and **front-loaded**, so inventing one number is the single highest-yield edit
available to a model with thin context.

Two candidate shapes; the probe block decides between them, and the CC-CMD that
executes this must pick ONE and say why:

1. **Condition the figure credit on the figure being present in the prompt
   context.** `missingStats` (layer 2d) already extracts context figures, so the
   machinery exists. A figure the context cannot support earns nothing. This
   makes the scale agree with `promptExampleLeaks` instead of pulling against it.
2. **Flatten the cliff.** Spread the 58 points across the 0→1→2 figure range so
   the first invented number is worth a few points rather than most of the gap.
   Cheaper, weaker, and does not make the scale truth-aware.

Preference is (1), stated up front per Rule 88: it is the correct route rather
than the quick one, and (2) leaves a scale that still cannot tell an invented
figure from a real one.

## Done condition

A probe output, not a judgement:

1. Re-score the two Everton variants. The truthful one must score **>=** the
   fabricated one. Today it is 128 vs 165.
2. Re-run `scripts/verify-2f-score-bias.mjs`. The 0→1-3 gap must be materially
   smaller than 58.3, and the 4-7 / 8-11 / 12+ shape must be unchanged — this
   ask must not become a stealth rewrite of the density behavior that is
   already correct.
3. `scripts/prose-style-scope-check.mjs`, `voice-register-scope-check.mjs` and
   `cross-window-check.mjs` still pass 23/34/24. Scoring changes must not
   disturb the three gates shipped 2026-08-23.
4. A `SCORE_ERAS` entry (`src/journalism-quality.js:21` — "Every entry here marks
   a change to `scoreProse` that makes scores on either side incomparable")
   before deploy. Cross-era comparison of quality_score is already a documented
   hazard in this file; changing Dim weights without an era entry silently
   corrupts every trend built on the column.

## Scope boundary

- Do NOT change the 240 bar, the 196 four-fifths line, or `reachable_ceiling`.
  `outbox/cc-session-2026-08-22-quality-scale-verified.md` settled those six days
  ago; this is about how a brief EARNS points, not where the bar sits.
- Do NOT wire `getQualityTarget` (still unwired since 2026-06-17) as part of
  this. Separate ask, separate risk.
- Do NOT touch the client-side 7-gate fallback chain in jubilant-bassoon. Per
  `CC-CMD-2026-08-02-retry-chain-telemetry`, it is a different chain with its own
  gates; changing both in one session is a Rule 70 violation waiting to happen.
