# Decision — field-laboratory does not get uPlot

**Date:** 2026-09-04
**Repo:** field-laboratory
**CC-CMD:** `docs/CC-CMD-2026-09-04-laboratory-chart-decision.md`
**Outcome:** **WONTDO.** Tasks #21 and #22 closed. No dependency added.

The CC-CMD stated that this outcome, reached with evidence, is a successful
completion and not a failure of it. This is that outcome.

---

## TASK 1 — the probe

The question was narrow: **is there a series in this repo that the existing
sparkline cannot serve?** A candidate had to be commodity rather than a sealed
composite, inadequately served by the bar sparkline for a stated reason, and
have a real render target today.

`grep -rnE "float list|int list|: float\[\]|List<float>|seq<float>" src/*.fs`
returns **two** multi-point numeric series in the whole repo.

| series | where | length | kind | render target | existing sparkline serves it? |
|---|---|---|---|---|---|
| `SealedArc` | `Desk.fs:724` | 504 samples (committed arc) | **sealed composite** — private union case | `Scoreboard.fs:104` `renderSparkline`, post-game only | **Yes — it is what renders it today** |
| `Tokens.PerSentence` | `Prose.fs:87` | one int per sentence | internal quantity | **none** — `perSentenceOf` has exactly one caller, `scripts/prose-check.mjs:75`, a test | N/A — never rendered |

Everything else numeric in `src/` is a **scalar field**, not a series:
Market 7, Pickem 6, Ceiling 6, Corpus 5, Journalism 6, Scoreline 4. Single
values. A line chart of one point is a number.

**Zero series qualify.** Not one is commodity, multi-point, currently rendered,
and poorly served.

## TASK 2 — the decision, and why the plan was wrong

Tasks #21 and #22 were approved on my recommendation. Reading the repo first
contradicted it, and the contradiction is worth stating plainly rather than
building anyway.

**1. The repo already has this chart, built better than uPlot's defaults.**
`scripts/spark-check.mjs` gates two properties that uPlot does not provide:

> **FIXED DOMAIN.** A bar's height in percent IS the drama value. The failure
> it replaces is normalising to the series maximum, which renders every game as
> a wall topping out at 100% — the committed arc spans 51-81 and would draw as
> 63-100%.
> **BUCKETED MAX.** The maximum of the output equals the maximum of the input.
> That is FALSE for every-Nth sampling, which is what shipped.

Both failures actually shipped once. uPlot auto-scales by default and does no
max-preserving downsampling.

**2. Adding it would weaken a type-level compliance guarantee.** From
`Scoreboard.fs:104`:

> `barHeightStyle` needs an `AmnestyZone`, so this cannot be called for a live
> game. Deleting the guard in `dramaText` would not leak a chart of a live
> composite; **it would stop compiling.**

`SealedArc` and `SealedDrama` are private union cases precisely so the values
can be passed and never read. uPlot takes raw numeric arrays. The only way to
chart a `SealedArc` with it is to break the seal — and the seal is the feature.

**3. The one series it could legally chart has no render target.**
`PerSentence` is `private` inside `Tokens`, reachable only through
`perSentenceOf`, whose sole caller is a test.

So uPlot here would duplicate a working chart, weaken a guarantee, and serve no
unmet need. That is three reasons and none of them is "later."

## TASK 4 — verification

```
$ npm run check:spark
18/18 checks passed
```

`src/Scoreboard.fs` `renderSparkline`: **0 lines changed.** No file in this
repo was modified by this CC-CMD. `package.json` gains no dependency.

## What this does NOT say

It does not say uPlot was the wrong call in jubilant-bassoon. There it replaced
seven inconsistent renderings of seven series, two of which were being fetched
and discarded, and it is verified daily against the deployed bundle
(`chart-renderer-probe.yml`). Different repo, different evidence, different
answer.

It also does not say field-laboratory will never need a chart library. It says
that **today, no series exists that would use one**, and the criteria for
revisiting are written above: a commodity multi-point series, with a render
target, that the bar sparkline cannot serve for a stated reason.

## Follow-up

None. Tasks #21 and #22 are closed here. Task #23 (field-playground) is a
separate question with its own probe.
