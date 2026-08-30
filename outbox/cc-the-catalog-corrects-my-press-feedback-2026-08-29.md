# The design catalog corrects the press feedback I shipped two commits ago

**Date:** 2026-08-29
**Scope:** `index.html`, `scripts/computed-chrome-check.mjs`
**Doc:** *FIELD — Viewport + Design System Items Catalog*, Drive
`1lWX2KtRPMNN1e8YfxrCd3aBPNzxOc8k0JAHOzUxprd0`, June 12 2026.

## ITEM 4, DECISION: APPROVED

> All interactive elements: transform `scale(0.98)` + card-highlight background
> on `:active`. **Duration 100ms ease-out.**
>
> Applied to: Game cards (all tiers …), Filter pills, Buttons …
>
> NOT applied to: Score elements (data, not interactive) · Drama badges
> (informational display) · Brief text (read-only) · Labels and headers

The `scale(0.98)` I set one commit ago was right. Three other parts of the same
approved decision were not implemented, and I had a stated reason for two of
them.

### 1. The duration

The rule shipped with **no transition at all**. My comment said so explicitly:

> with no transitions anywhere it lands instantly on press and releases
> instantly, which is what press feedback should do

That is a reasonable design opinion and the spec had already made the decision:
100ms ease-out. It is now the only transition on the page, and it is there
because a decision record put it there rather than because I liked it.

### 2. The background

Only the transform existed. The item pairs it with a card-highlight ground.

### 3. Game cards — the exclusion I argued for, measured and wrong

I excluded `.desk-card--flippable` and wrote why:

> a transform on a grid item creates a containing block, and the comment above
> that rule records a rotateY that "did not survive contact with a grid"

The item lists *"Game cards (all tiers)"* first. Re-measured with
`scale(0.98)` applied to the card, across all ten canonical viewports:

```
PASS  the detector catches a planted 3000px element
PASS  no canonical viewport overflows horizontally (10 states)
```

Grid intact everywhere, zero overflow at rest and with every card open. **A
uniform scale is not a rotation**, and the old scar did not transfer. I inherited
a real historical failure and extended it to a case it did not cover — the same
shape as reading a rule past its reason, which I flagged in someone else's spec
two documents ago and then did myself.

## The check now grades all three

`computed-chrome-check` counted `:active` rules, then graded the transform after
the last doc. It still said nothing about timing:

```
PASS  every pressable control acknowledges a press
PASS  the press transform is the spec's scale(0.98)
PASS  the press transition is the spec's 100ms ease-out    <- new
```

Three assertions where there was one, because "a control acknowledges a press",
"it presses by the right amount" and "it presses at the right speed" are three
different questions and only the first was ever asked.

## Exclusions honoured

Score elements, brief text, labels and headers get no `:active` treatment, per
the item's own NOT-applied list. The desk has no drama badges — ADR-002 is why —
so that exclusion is satisfied by absence.

## Verify

```
check 17/17   check:hard 17/17   check:render-sports 17/17   check:nav 25/25
check:brief-flip 20/20   check:tabs 30/30   check:typography 11/11
check:palette 35/35   check:computed-chrome 18/18
check:viewport-overflow 2/2 across ten states
```

## From the same catalog, recorded and not built

- **ITEM 2 / ITEM 3 — card tiering and CompactGrid.** FEATURED / STANDARD /
  COMPACT driven by `semanticTier()`, with a 2-column QUIET grid. The desk has
  one tier: `desk-card--flippable` is the only card modifier in the stylesheet.
  This is a structural addition with a decision record behind it, not a CSS
  change, and it wants its own session.
- **ITEM 5 — motion token assignments.** Four tokens across score changes, badge
  appearance, card entrance and ambient pulse. The desk has one transition, the
  press above. Everything these tokens govern is a surface the desk does not
  have or a behaviour it does not do.
- **ITEM 9 — circadian layout mode.** `computeCircadianContext()`, five day
  parts, "automated, no user configuration, pure function of current hour". The
  desk is the opposite by design: `#viewed-date` with `←/→/Today` navigation to
  an arbitrary date. A surface you navigate to 2026-05-15 cannot key its layout
  to the wall clock. Not a gap.
