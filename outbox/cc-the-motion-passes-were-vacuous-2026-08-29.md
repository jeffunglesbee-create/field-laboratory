# The motion checks passed because there is no motion

**Date:** 2026-08-29
**Scope:** `index.html`, `scripts/computed-chrome-check.mjs`

## A correction to yesterday's assessment, made a few hours later

The `/scrollcraft assess laboratory` pass reported these as passes:

```
transition: all with real duration      0
animating width/height/top/left         0
ease-in on UI                           0
```

All three are true. None of them is a pass. `index.html` contains **zero
`transition:` declarations, zero `@keyframes`, and zero `animation:`** — the
desk has no motion at all, so every motion rule was graded against an empty set.

That is the vacuity this session has now found in four separate checks: a
detector reporting clean on bytes it never looked at. The tell is always the
same shape — a count of violations that is zero because the population is zero.
`Finite` and `agrees` are both true of all-zeros; so is `no bad easing`.

The correct report was: **not applicable, no motion to grade.**

## What the sweep did find

Four `taste.md` dimensions were left ungraded by that assessment. Measuring
them:

| | |
|---|---|
| `:active` rules | **0**, against 102 interactive elements |
| `:hover` outside a `(hover: hover)` gate | **3** |
| `prefers-reduced-motion` blocks | 0 — and correctly so, see above |
| headings with more space below than above | 12 of 12 — **not a defect**, see below |

### The heading result is not a finding, and saying so is the work

`taste.md` calls "more space above a heading than below it" the single most
common spacing error, because getting it backwards "makes a page read as a
list." Every heading on the desk has more below than above.

The desk **is** a list. `.sport-group__title` is `position: sticky` with a solid
background: its "space above" is a scroll offset, not visual air, and it labels
the rows beneath it. The rule's own rationale inverts here. Reporting 12/12 as a
violation would have been reading a rule past its reason.

## Fix

`:hover` gated to `(hover: hover) and (pointer: fine)` on all three rules. A
touch tap fires `:hover` and leaves it applied until the next tap elsewhere, so
a phone shows a hovered look on a control nobody is hovering. All three rules
are colour-only, so the symptom is mild — and this desk is read on a phone, and
the gate costs nothing.

`:active` added to the four pressable families: `.tabs button`, `.pk-sport`,
`.pk-side`, `.datenav button:not([disabled])`. `translateY(1px)`, which with no
transitions anywhere lands instantly on press and releases instantly — which is
what press feedback should do.

**No transform on `.desk-card--flippable`.** A transform on a grid item creates
a containing block, and the comment directly above that rule records a `rotateY`
that "did not survive contact with a grid." The flip itself is that card's
feedback.

## The check, and its teeth

Added to `computed-chrome-check.mjs`, read off the **rendered page's own
stylesheet** rather than `index.html` — the source is not what ships, and a rule
that survives the source and not the build is precisely this repo's stale-build
incident.

Proven by reverting the CSS and rebuilding:

```
WITHOUT the fix   13/15
  FAIL  every pressable control acknowledges a press
  FAIL  no :hover sits outside a (hover: hover) gate
        → .tabs button:hover, .pk-side:hover, .datenav button:hover:not([disabled])

WITH the fix      15/15
```

The failing message names the offending selectors, so the repair is the message.

## Residual

Body measure (45-75ch) is still **unmeasured**, not passed. The only long prose
on the desk is `.desk-card__brief-text`, which lives on a card's back face and
is `display: none` until flipped, so nothing over 80 characters was in the DOM
to measure. It needs a flipped card in the sample.
