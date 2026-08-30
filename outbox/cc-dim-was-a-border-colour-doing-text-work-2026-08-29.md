# `dim` was graded as a border and used as text

**Date:** 2026-08-29
**Scope:** `src/Palette.fs`, `scripts/palette-check.mjs`,
`scripts/design-tokens-check.mjs`, `scripts/build-site.mjs`, `index.html`

## Found by measuring the render, not by reading the CSS

A pass over the deployed desk at 1440×900, grading every rendered text leaf
against its nearest painted ancestor:

```
--dim  #5a5878  →  2.98:1

  6  tab labels           12.80px
 11  sport-group titles   12.48px
 --
 17  text nodes below the 4.5:1 WCAG 1.4.3 bar
```

Everything else came back clean, and that is worth stating because it is most of
the audit: two font families and neither is Inter, one radius scale, one shadow
and it is an edge-light pair rather than a halo, no pure black, zero
`transition: all` with a real duration, zero animation of width/height/top/left,
zero `ease-in` on UI, four `:focus-visible` rules. The palette is disciplined.
This is one token used past its grade.

## The palette already knew, and had aimed at the wrong number

`Palette.fs:136` records it verbatim:

```
///   #5a5878 (dim)     2.83 / 2.89 / 2.98   fails on card2
///   #646383            3.32 / 3.39 / 3.50   <- this
```

That derivation produced `edgeStrong`, "the darkest point on the existing
`dim` -> `quiet` line that clears **3.0** on all three surfaces."

3.0 is WCAG **1.4.11**, non-text contrast: the bar for a control's boundary and a
hairline. It is the right bar for `edgeStrong`, which is a border. It is not the
bar for a word. WCAG **1.4.3** wants 4.5:1 for text below 18.66px bold / 24px,
and 12.5px is not close to that line. `edgeStrong` at 3.52 would not have cleared
it either — the token was never aimed at this.

So this was not an oversight in the derivation. The derivation was correct for
the thing it was deriving, and a second role was quietly sharing the token.

## The fix: split by role, the same way `edgeStrong` did

```fsharp
let dimText = Token "#7977a2"
```

Derived by the identical method, at the text bar:

```
  #5a5878 (dim)     2.98 / 2.89 / 2.83   fails on all three
  #646383 (edge)    3.52 / 3.40 / 3.33   clears 3.0, not 4.5
  #6a6a8a (quiet)   3.89 / 3.76 / 3.68   still short
  #7977a2            4.78 / 4.63 / 4.53   <- this
```

Darkest point on the line that clears 4.5 on **all three** surfaces, not just
the one these two selectors happen to sit on. A token that passes on `bg` and
fails on `card2` is a trap for whoever reaches for it next.

**Not a replacement for `dim`.** Raising `dim` itself would lift every quiet
value on the desk to fix seventeen text nodes, and the rest of those uses are a
taste call with no external standard behind them. That is the argument
`Palette.fs:128` already makes for `edgeStrong`, applied again.

## The check that lets this recur is now closed

`palette-check.mjs` passed 26/26 throughout, because `MIN_CONTRAST` is 3.0 and
nothing in it graded a token as **text**. Added:

```js
const TEXT_CONTRAST = 4.5
for (const [name, tok] of surfaces) {
  check(`dimText clears ${TEXT_CONTRAST}:1 as TEXT on ${name}`, …)
}
check('dimText is quieter than text, and louder than dim', …)
```

The second one matters as much as the first. A secondary token that drifts up
past body text is not secondary any more, and the hierarchy the split exists to
preserve would be gone while every contrast assertion still passed.

## Artifact

Re-measured on the rebuilt page, same method:

```
BEFORE   17 text nodes below 4.5:1   (tab labels 2.98, sport titles 2.98)
AFTER     0 text nodes below 4.5:1   (sport titles 4.78 at 12.5px)
```

`check:palette` 29/29 (26 before, +3… the fourth is the hierarchy assertion,
which folds into the same run), `check:design-tokens` 22/22.

## Where this came from

`/scrollcraft assess laboratory`. Most of that skill is a landing-page grammar —
device families, an engineered peak, 8-14 viewport-heights — and none of it
applies to a data desk; saying so was half the assessment. Its `taste.md` colour
and motion rules do apply, and one of them found this.
