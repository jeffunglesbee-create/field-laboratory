# Outbox — the flip that did not flip

**Date:** 2026-08-20
**Ships:** the flip CSS in `index.html` rewritten as a display disclosure, and
`scripts/brief-flip-check.mjs` corrected to assert rendered visibility

## What was broken

On the deployed site, tapping a card did nothing visible and every flippable
card rendered its brief — plus the stage-2 verdict, the stage-3 provenance and
anchoring footnotes — stacked onto the front face at once. The user saw "the
card doesn't flip and there is a bunch of technical/diagnostic items displaying
in the UI." Both symptoms are the same bug.

## The bug: grid flattens preserve-3d

The flip was built as a 3D rotation of two faces sharing one grid cell:

```css
.desk-card__flip { display: grid; transform-style: preserve-3d; }
.desk-card__brief { transform: rotateY(180deg); backface-visibility: hidden; }
```

`transform-style: preserve-3d` asks the browser to keep children in a shared 3D
space so a back face can rotate away and hide. A grid (or flex) container does
not honour it — the spec makes a grid container establish a flat formatting
context, so the browser resets `transform-style` to `flat`. With the space
flattened, `backface-visibility: hidden` never engages, both faces paint, and
the `rotateY(180deg)` back face lands mirrored on top of the front. No animation
runs because nothing is in 3D to animate.

The stage-1 outbox stated the opposite — "the grid-stack sizes to content and
still flips in 3D." That was written from the CSS as intended, not from a
browser. It was wrong. The two faces cannot both share one grid cell for height
AND rotate in 3D; those requirements are mutually exclusive in the same element.

## The fix: a disclosure that shows and hides

Dropped the 3D entirely. The back face is `display: none` until the card opens;
opening hides the front and shows the brief:

```css
.desk-card__brief { display: none; }
.desk-card.is-flipped .desk-card__front { display: none; }
.desk-card.is-flipped .desk-card__brief { display: block; }
```

This is what the ARIA already said the control was — a disclosure with
`aria-expanded`, not a visual effect. The markup, the `is-flipped` toggle, the
keyboard handling, the join, the fixture: all unchanged. Only the CSS that was
claiming a 3D flip it never performed is gone. Height still sizes to whichever
face is shown, because only one is ever in flow.

The user's "technical/diagnostic items" are the verdict badge and the
provenance/anchoring lines — correct content that belongs on the back face, not
the front. Hiding the back face until tap resolves the clutter without removing
anything: the footnotes are there when you ask for the brief, gone when you
don't.

## The check was passing on a property that was set, not rendered

`brief-flip-check.mjs` asserted `getComputedStyle(el).transformStyle ===
'preserve-3d'`. That property WAS set — the browser accepted the declaration and
then ignored it because the element is a grid. So the check went green while the
flip was flat. A test that reads back the CSS you wrote proves you wrote it, not
that it does anything.

Replaced with the rendered fact that was broken:

```js
const collapsedBriefHidden = await page.$eval('.desk-card--flippable .desk-card__brief',
  n => n.offsetParent === null && getComputedStyle(n).display === 'none')
```

`offsetParent === null` is true for a `display:none` element and false for the
flattened stack the user saw. On click it now asserts `briefShown`
(`offsetParent !== null`) and `frontHidden` (front `display === 'none'`) — the
swap the disclosure exists to perform, read from the rendered tree.

## Verified

`brief-flip-check` 20/20 in a real browser, including "a collapsed card hides
its brief face (not dumped onto the front)" and "a click opens the card — brief
revealed, front hidden." `check`, `check:hard`, `check:tabs`, `check:nav` still
pass. Four flip mutations — `brief-flip-not-a-button`,
`brief-flip-ignores-empty-text`, `card-claims-provenance-it-lacks`,
`briefs-tab-counts-empty` — all caught. Build clean.

## Why this shipped broken in the first place

The stage-1 flip CSS landed in `public/index.html`, which is gitignored build
output the next build overwrites — so it was never really deployed, and the
"what happened to the flip?" question surfaced that. Stage 2 moved the CSS to
source `index.html` and, moving it, kept the grid + preserve-3d shape. The guard
that should have caught it checked the property was declared, not that the flip
rendered. Two failures compounded: the CSS was in the wrong file, then in the
right file but wrong, behind a check that could not tell. The corrected check
reads the browser, not the stylesheet.
