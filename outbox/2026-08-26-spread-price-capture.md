# The +1.5 that means two opposite things

**2026-08-26.** CC-CMD-2026-08-25-spread-price-capture, built and landed.
Relay `c2ef28a` (capture) + `b3aae99` (a gate fix), laboratory `HEAD` (sentinel),
jubilant-bassoon `0a0686f` (contract sync).

## The measurement that decided everything

Probed through the relay's own `/odds` proxy — DraftKings, one region, one
market (`field-relay-nba scripts/odds-spread-shape-probe.mjs`, artifact
`outbox/odds-spread-shape-20260826T002201Z.json`):

```
Red Sox @ Marlins   home +1.5 at -371   home is the FAVOURITE
Brewers @ Mets      home +1.5 at  +101  home is the UNDERDOG
```

**Same handicap. Opposite meaning. Only the price separates them.**

`extractOddsForGame` read `o.point` and discarded `o.price`, so the relay stored
the half of the market that carries no answer. All 13 matched spread markets in
the probe served a finite price on both sides, so there was never anything
missing upstream.

## The correction this forces

Run 2 of the census concluded, in this outbox:

> **The pattern is one-sided, which is the signature of a feed or adapter
> artefact, not of market behaviour.**

**That inference is not supported.** A book listing the slight favourite at
`+1.5` with a favourite's price is ordinary market behaviour — the alternate
run line — and it produces exactly the shape the census flagged: home moneyline
favourite, home handicap `+1.5`. Four of eight sampled MLB games had home at
`+1.5`, at prices from `-371` to `+101`. The rubric read the sign of the point
and called the disagreement one-sided; the price says the two cases are not the
same case.

The asymmetry itself (10 of 144 home-favourite, 0 of 81 away) still stands as a
measurement. What does not stand is my reading of what causes it.

## A second inherited claim, also disproven

A Drive doc — *FIELD — "Gumbo" Odds API Savings Analysis*, 2026-05-26 — says of
MLB spreads: **"Always -1.5 in baseball ... DEAD WEIGHT for MLB."** The same
probe measured it for free: one of eight sampled MLB handicaps was `±5.5`
(Rangers @ White Sox). MLB does vary its run line. Rule 72: an inherited claim
is a hypothesis until probed, and this one was three months old and load-bearing
for a "drop the spreads market and save credits" recommendation.

## What shipped

1. `spreadFrom` in `src/odds-shape.js`, beside `drawPriceFrom` and for the same
   reason — `src/index.js` imports `@cloudflare/puppeteer`, which `deploy.yml`
   does not install, so a gate importing the worker cannot run.
2. **Additive.** `home` and `away` keep their exact meaning and position. Every
   call site was read: `src/odds-story.js`, the analytics-engine spread reads,
   `index.js:6469 / 7016 / 8358`, and the client. None changes.
3. **A price is omitted, never nulled**, when the book serves none. Absent and
   captured must stay distinguishable in the archive; `null` would read as "no
   price served" and "we did not look" at once.
4. A deploy gate that mutation-proves itself — reverting the call site to the
   inline construction turns it red on two checks.
5. `CONTRACTS.md` in both repos carries the shape **and** the warning that the
   sign of `spread.home` is not a favourite signal.

## Two of my own defects, found by pushing

**Deploy 877 went red on an unrelated gate.** `three-way-odds-check.mjs`
asserted `import { drawPriceFrom } from './odds-shape.js'` **literally**, so
adding `spreadFrom` to the same statement failed it while `drawPriceFrom` was
imported and used correctly. Its name said "imports the rule"; it measured
"imports exactly one name". Widened and mutation-tested against seven cases.
Eleventh instance this session of a value whose name and measurement disagree.

**Then deploy 878 never ran.** `b3aae99` fixed only `scripts/`, which is not a
`deploy.yml` trigger path — so the source from `c2ef28a` sat on `main`,
undeployed, behind a git history that looked green. A red gate followed by a
gate-only fix leaves the change unshipped and silent. Resolved by dispatching
`deploy.yml` directly. Same class as the `guards.yml` gap found an hour earlier:
**a workflow's trigger paths and the files it actually governs are two different
sets, and nothing checks that they agree.**

## The follow-up, automated

`scripts/cc-cmd-followup.mjs` now carries the ask, gated on `captured_at`
against the deploy instant (`2026-08-26T00:26:39Z`). Every row captured before
it can never gain the keys, so an ungated predicate would print "not landed"
forever and read as a regression that never happened.

Four states exercised directly rather than inferred from a pass count:

```
post-deploy WITH prices      -> true    (landed)
post-deploy WITHOUT prices   -> false   (pre-fix condition survived the deploy)
a pre-deploy row             -> null    (not observable)
no odds at all               -> null    (not observable)
```

## Unblock criteria (Rule 74)

- **Landed, pending one capture cycle:** the sentinel reads NOT OBSERVABLE
  until the first post-deploy opening-odds capture (~10:01 UTC on 2026-08-26),
  then answers. No human step.
- **Open, unblocked by that:** re-run `favourite-band-census`. The ten
  home-favourite disagreements become either a favourite's normal alternate
  line or a real defect, and the CC-CMD closes by naming which.
- **Closed:** "the point is enough". It is not, and the two Marlins/Mets rows
  are the artifact.
