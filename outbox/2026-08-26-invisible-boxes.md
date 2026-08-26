# Four invisible boxes, three of which I did not predict

**2026-08-26.** `computed-chrome-check` gains one assertion; `controlEdge`
becomes `edgeStrong` and reaches four more elements.

## The rule

> An element that paints a background **the same colour as what it sits on** is
> not separated by its fill. Something else must separate it, at 3.0:1.

3.0 is not invented. WCAG 1.4.11 covers "graphical objects required to
understand content", and a box's edge is what tells a reader where it ends —
the same figure `palette-check` already holds the boundary token to.

## What it found

I went in expecting one case, `.pick-reason`. There were four:

```
.tabs                on body        same fill rgb(6,5,20)    boundary 1.08:1
.datenav             on body        same fill rgb(6,5,20)    boundary 1.08:1
.sport-group__title  on body        same fill rgb(6,5,20)    boundary 1.08:1
.pick-reason  (x3)   on pick-leader same fill rgb(14,12,36)  boundary 1.10:1
```

The three I missed matter more than the one I predicted. **All three are
`position: sticky` and painted with the page fill on purpose** — an opaque
backdrop so card text does not render through them. Which means as content
scrolls underneath, the only thing marking where the bar ends and the content
begins is a hairline at 1.08:1. The bar and the page are the same colour and the
seam is invisible.

That is a usability defect, not a nit, and no amount of reading the stylesheet
would have surfaced it: each rule is individually reasonable, and the defect is
in the *relationship* between an element and what happens to be behind it —
which only exists at render time.

## Three bugs in the assertion, each caught by not trusting its result

**1. It compared against `el.parentElement`.** `.pick-reason`'s parent is
`.pick-reasons`, a flex wrapper painting nothing, so the comparison ran against
`rgba(0, 0, 0, 0)` and the pill the check was written for never appeared. What
matters is the nearest ancestor that actually paints — the backdrop a reader
sees. Now walks up to it.

**2. It took `Math.max` of four border widths and read `borderTopColor`.** On
`.tabs`, whose only boundary is a `border-bottom`, that found the 1px from the
bottom and scored the colour of a **zero-width top border** — which resolves to
the text colour and passes at ~16:1. It reported a real boundary where there was
none. Each side is measured on its own now.

**3. It ignored alpha.** `--edge` computes to `rgba(180, 160, 255, 0.07)`.
Scoring its raw channels against a near-black fill gives a very high ratio, so
every hairline in the page passed. What a reader sees is that lavender at 7%
**composited over the fill** — 1.09:1. Ignoring alpha did not approximate the
answer; **it inverted it.**

Between them, those three made the check report `10/10` on a page with four
invisible boxes. The first version passed. So did the second and the third.

## And one false positive, which was the check's fault

`.sport-group__title` was flagged with "boundary none" while carrying
`box-shadow: 0 -1px 0 var(--bg), 0 1px 0 var(--edge)` — a hairline drawn as a
shadow **precisely so it does not affect layout**, and documented as such in the
stylesheet. Reporting a deliberate choice as an absence is the same class of
error as the three above, pointing the other way. Shadow colours are now pulled
out and scored exactly like a border's, and any one edge clearing the bar is
enough: a sticky bar separated by a single `border-bottom` is properly
separated, and demanding four sides would be a stricter rule than the one being
tested.

## The token was renamed with its role

`controlEdge` was introduced for three buttons under WCAG 1.4.11's
"user interface components". It now also carries a sticky heading, two sticky
bars and a reason pill — **none of them controls**. A token called `controlEdge`
on a heading is a name that disagrees with its own measurement, which is the
defect class this session kept finding.

It is `edgeStrong` / `--edge-strong` now, and the pair reads honestly:

| token | value | measured | role |
|---|---|---|---|
| `edge` | `rgba(180,160,255,0.07)` | **1.08:1** | a decorative hairline |
| `edgeStrong` | `#646383` | **3.32:1** | an edge that must be seen |

## Proof

`palette-check` 26/26 after the rename. `computed-chrome-check` 10/10, and the
new assertion mutation-proven on **both** boundary mechanisms:

```
faint edge back on the pill   FAIL  .pick-reason: best boundary 1.10:1
heading's shadow removed      FAIL  .sport-group__title: best boundary none
```

Eleven gates green: palette, design-tokens, computed-chrome, separation, glyph,
typography, unused, import-purity, secrets, citations, docs.

## What is left, and it is now one thing

`--edge` survives only on **separator rules between list rows** — `.pk-row`,
`.pick-chaser`, `.gate`, `.briefs-stat`. Those rows have no gap and no fill of
their own, so the hairline is all there is, and it renders at 1.08:1.

I am not raising them here. Unlike every case above, a row separator has no
external standard: it delimits nothing that WCAG 1.4.11 names, and picking a
number for it would be inventing the threshold the surfaces question already
declined to invent. It is a taste call, and it is the human's.

## Unblock criteria (Rule 74)

- **Closed:** boxes sharing their backdrop's fill. Four fixed, gated, both
  mechanisms mutation-proven.
- **Closed:** the token's name. `edgeStrong` describes what it is measured
  against.
- **Open, a taste call:** four row-separator rules at 1.08:1. Verify any change
  with `npm run check:computed-chrome`, which prints every edge it scores.
