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

## The container question, now measured instead of argued

I was about to leave "delete the container outlines" as a taste call. It is not —
if a border renders as nothing, deleting it is a no-op, and that is testable.

**First attempt measured the wrong thing.** Removing `border: 1px solid` and
screenshotting gave 3.257% of pixels changed at a **max channel delta of 225**.
That is not a hairline vanishing. `.desk-card` and `.st-card` are **content-box**
— only `.tabs` and `.datenav` set `box-sizing: border-box` — so dropping a 1px
border shrinks every card by 2px and reflows the grid. The diff was text moving.
Third time tonight a measurement measured something other than its claim.

**Held constant** — `var(--edge)` → `transparent`, same box, no reflow — the
border's actual visual contribution is:

```
1280x900
pixels changed:    5766 of 1152000   (0.501%)
max channel delta:   15 of 255       (5.9%)
```

Half a percent of the page, at under 6% of one channel. That is the whole of what
17 declarations of `--edge` buy on a container.

**Three facts for the decision, none of them available this morning:**

1. The outline contributes **≤15/255 on 0.5% of pixels**. Decoration, measured.
2. Removing it **reflows the layout**, because cards are content-box. It is not a
   pure colour change; it needs `box-sizing: border-box` first.
3. The grouping is already carried twice over — a 16px gap and an
   `aria-label`led `<section>` per card, both asserted by `separation-check`.

So it is deletable and it is not free. Point 2 turns a one-line removal into a
box-model change across every card, and that is a redesign, not slop removal —
below the confidence bar this repo commits at. The numbers are here; the call is
the human's.

## Unblock criteria (Rule 74)

- **Closed:** control boundaries. 3.32:1 minimum, gated, mutation-proven.
- **Open, needs a decision, now with numbers:** the eight container outlines
  contribute ≤15/255 on 0.501% of pixels, and removing them reflows the grid
  because cards are content-box. Deleting needs `box-sizing: border-box` on the
  cards first, and a rewrite of `separation-check`'s three border assertions into
  a gap-or-contrast threshold. Verify the contribution again with the
  `var(--edge)` → `transparent` screenshot diff, which holds layout constant.
- **Open, no anchor:** the six separator rules between list rows. They have no
  gap to fall back on and no standard to hold them to. Naming a number here
  without one would be inventing the threshold this document declined to invent
  for the surfaces.

---

# Follow-up: the container outlines are gone, and the check now measures

**Same night.** `.desk-card`, `.st-card`, `.wx-row` lose `border` and
`border-radius`; `separation-check`'s two border assertions are replaced by a
measured disjunction.

## The reflow objection was mine and it was wrong

I held this back saying removal "reflows the layout, because cards are
content-box — a box-model change across every card." Two things were wrong with
that.

`box-sizing` does not enter into it. A card's height is content-driven either
way, so removing 2px of border removes 2px of height under **either** box model.
There is no version of this change that leaves every pixel where it was, short of
compensating with `padding: calc(1rem + 1px)` — a magic number to preserve an
invisible line, which is worse than the line.

And a 2px shift per card is not a redesign. It looked like one only because the
pixel diff that measured it was dominated by text moving: **3.257% of pixels at a
max delta of 225**. Held constant, the outline itself was **0.501% at a max delta
of 15**. I let the confounded number set the confidence.

## What carries the grouping now

```
2 cards, gaps: 16.0
page background rgb(6, 5, 20); card background rgb(11, 9, 32)
boundary contrast: 1.00, 1.00 (bar 3)
carried by: gap 2/2, boundary 0/2
```

A 16px gap and an `aria-label`led `<section>` per card — both asserted, and both
were already doing the whole job. The radius went with the border: no border, no
`overflow` clip and a 1.03:1 fill leave a 10px corner nothing to round.

## Two assertions that measured presence and claimed visibility

```js
check('every card has a visible border of its own', b.borderWidth > 0)
check('...and the border is not transparent',       !/rgba\(.*,\s*0\)$/)
```

The first passed on a border rendering at 1.09:1 — present, opaque, and thirty
times below the threshold at which anyone could see it.

**The second passed with the border removed entirely.** `borderTopColor` on a
zero-width border is a normal colour string, so the rgba-zero regex never
matched. An assertion about a border that holds when there is no border.

The replacement states the real property as a disjunction, because separation
genuinely has two mechanisms and either suffices:

> a real gap between consecutive cards **OR** a boundary at 3.0:1

3.0 is not invented here — it is the same WCAG 1.4.11 figure `palette-check`
holds `controlEdge` to. The log names which arm is carrying it, so a page that
quietly loses its gap and falls back on an invisible border shows up instead of
passing in silence.

## Both arms proven, not just the one in use

```
gap 0, boundary 1.00   FAIL   every card is separated by a gap OR a boundary at 3:1
gap 0, boundary 3.40   PASS   carried by: gap 0/2, boundary 2/2
gap 16, boundary 1.00  PASS   carried by: gap 2/2, boundary 0/2   <- shipped
```

The middle case matters most: without it the disjunction would be a gap check
wearing a longer name. And the measured 3.40 matches the 3.39 computed from
`Palette.fs` — the token and the render agree.

Seven gates green: separation, computed-chrome, design-tokens, palette, glyph,
unused, typography.

## Still invisible, and NOT fixed here

Three boundaries have no gap to fall back on and still render at ~1.09:1:

- **`.pick-leader`** and **`.pk-banner`** — single blocks, not siblings in a
  grid. Removing their outline would erase the box entirely; leaving it keeps an
  outline nobody can see. Neither is right, and the fix is a hierarchy decision
  (does the leader need a box, or is 1.05rem against .86rem enough?), not a
  contrast one.
- **`.pick-reason`** — a pill with `background: var(--card2)` sitting **inside**
  `.pick-leader`, which is also `card2`. Its background delimits nothing, so the
  chip is defined **only** by a 1.09:1 border. An invisible chip.

All three route back to the same root: **the three surfaces are within 1.03:1 of
each other**, so no combination of them can delimit anything. That is a palette
decision, not a rule cleanup.

## Unblock criteria (Rule 74)

- **Closed:** container outlines, and the two assertions that could not see them.
- **Open, one decision:** `.pick-leader` / `.pk-banner` / `.pick-reason`. Verify
  any fix with `npm run check:separation`'s boundary-contrast line, which now
  prints the real ratio per card.
