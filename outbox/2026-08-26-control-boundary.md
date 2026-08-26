# Every boundary on the page was invisible. One of them had a standard.

**2026-08-26.** `Palette.controlEdge`, applied to the three interactive controls,
gated at 3.0:1 in `palette-check`.

## The measurement

```
page  -> card                     1.03:1
card  -> card2                    1.02:1
card  -> its edge border          1.10:1

rendered edge over card:  rgb(23,20,48)   against rgb(11,9,32)
```

WCAG 1.4.11 sets **3.0:1** for "visual information required to identify user
interface components and states". Every boundary in the system — container fill,
card outline, button outline — is roughly **thirty times short of it**.

The only thing actually separating cards is the 1rem gap. The border and the
elevation are both present and neither does anything, which is the worst form of
the 70/20/10 rule: two mechanisms, zero separation, `--edge` declared 17 times to
achieve it.

## What was fixed, and what deliberately was not

`--edge` does **three** different jobs and only one has an external standard
behind it:

| job | uses | anchor | done |
|---|---|---|---|
| interactive control outline | 3 | **WCAG 1.4.11, 3.0:1** | fixed |
| separator rule between rows | 6 | none — no standard for a hairline | reported |
| container outline (a gap already separates) | 8 | none — a taste call | reported |

Raising `--edge` itself would have brightened seventeen uses to fix three, and
thirteen of them are judgement. So the token split by **role**, the way
`Semantic` already splits by meaning.

## The value is derived, not picked

`controlEdge = #646383` is the **darkest** point on the existing `dim → quiet`
line that clears 3.0 on all three surfaces — the least loud option that passes,
rather than the first that looked right:

```
#5a5878  (dim)     2.83 / 2.89 / 2.98    fails on card2
#646383            3.32 / 3.39 / 3.50    <- this
#6a6a8a  (quiet)   3.68 / 3.76 / 3.89    passes, louder than needed
```

**Not `quiet`, which also passes.** `quiet` is a semantic — "low stakes" — and
borrowing it for chrome is the role conflation this token exists to end. That is
now an assertion, not an intention.

## A third gate that measures presence and claims sufficiency

`palette-check` line 148:

```js
check('the three surfaces are distinct shades',
  new Set(surfaces.map(([, t]) => cssValue(t))).size === 3, ...)
```

It compares three hex **strings**. `#0b0920` and `#0e0c24` are distinct and
indistinguishable at the same time — 1.02:1 — so the check passes on a page whose
elevation does nothing.

That is the third instance tonight, after `separation-check` (border **present**,
not **sufficient**) and `chrome-check` (declaration read, not render measured).
The assertion is **kept** — a page whose surfaces are literally the same hex is
worse still — and now prints the real ratios beside itself so the gap between
what it checks and what it claims is on screen:

```
note: surface elevation is bg->card 1.03:1, card->card2 1.02:1 — present, not perceptible
```

No threshold was invented for the surfaces. There is no external standard for one
large dark fill against another, and making one up is how a number nobody can
defend ends up gating a build.

## Proof

`palette-check` **26/26**. Both new assertions mutation-tested:

```
controlEdge = #5a5878 (dim)     FAIL  2.98:1 on bg — cannot identify the control
controlEdge = #6a6a8a (quiet)   FAIL  a meaning token used as structure
```

Nine gates green after the change: design-tokens, computed-chrome, separation,
glyph, unused, typography, import-purity, secrets, citations.

## The decision I am NOT making alone

Eight container outlines render at 1.09:1 beside a 1rem gap and an
`aria-label`led `<section>` per card. **The gap and the landmark carry the
grouping; the border carries nothing measurable.** Deleting them is what the
skill prescribes — whitespace as the separator — and it would also require
rewriting `separation-check`'s three border assertions into a gap-or-contrast
threshold.

It is a visible design change, not slop removal, and this repo has a scar in
exactly that area: the Stats and Weather panels once shipped with no styling and
ran together as one column. That failure had no gap, no border and no background;
this would have the gap. Different, but adjacent enough to be the human's call.

## Unblock criteria (Rule 74)

- **Closed:** control boundaries. 3.32:1 minimum, gated, mutation-proven.
- **Open, needs a decision:** the eight container outlines. Verify either way
  with `npm run check:separation`, which currently asserts border presence and
  would need the threshold rewrite if they go.
- **Open, no anchor:** the six separator rules between list rows. They have no
  gap to fall back on and no standard to hold them to. Naming a number here
  without one would be inventing the threshold this document declined to invent
  for the surfaces.
