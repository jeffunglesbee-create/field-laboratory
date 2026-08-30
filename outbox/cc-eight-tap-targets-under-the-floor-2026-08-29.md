# Eight tap targets under the 44px floor, found by a sibling's audit

**Date:** 2026-08-29
**Scope:** `index.html`, `scripts/computed-chrome-check.mjs`
**Doc:** *Viewport v4 CSS Audit — index.html*, Drive
`1Urcv5V_SmI-Frem2hJkMQ5dmFTsT_OTK`, June 14 2026.

## An audit of the other product, used as a list of things to measure here

This document audits jubilant-bassoon's CSS against its own v4 spec — 15 items,
7 EXISTS / 5 PARTIAL / 1 MISSING / 2 BROKEN. Its findings are about that file
and its line numbers point into it. None of it transfers by citation.

Two of its findings are **failure modes rather than style opinions**, so they
were run as measurements against this desk instead of read.

## 1. A `var()` that resolves to nothing — clean here

The audit's sharpest observation:

> **`--caution` referenced but undefined.** `index.html:13343` uses
> `var(--caution)` with no fallback; the token is never declared in `:root`.
> Silently resolves to nothing, so the styled element is missing its intended
> color. **This is a live broken style.**

Nothing errors, nothing logs, the colour is simply absent. Measured here:

```
17 custom properties in use, 0 undeclared
```

Clean, and `design-tokens-check` could not have told you that — it asserts that
**declared** tokens match `Palette.fs`, which is the other direction and cannot
see a `var()` resolving to nothing. Now asserted.

## 2. Tap targets — eight of them, and the first measurement found three

Audit item #7, PARTIAL:

> Only attention chips, setup services, and one sticky banner enforce 44px.
> `.filter-btn`, `.date-nav-btn`, `.share-btn`, drama-badge tap zones do not …
> **Apple HIG floor breached for primary tap targets.**

Measured at P2 (393×852) on the scoreboard:

```
BUTTON "←"  32×35px   ×3      the only three below the floor, of 33 controls
```

Same control the audit names in the sibling. Fixed, and then the **check found
five more the measurement had missed**:

```
FAIL  every tap target meets the 44px floor
      → .pk-sport "MLB6" 30x60px | .pk-side "Brewers" 33x73px
        | .pk-side "Angels" 33x65px | .pk-side "Tigers" 33x61px
        | .pk-side "Athletics" 33x78px
```

My pass looked at **one tab**. `computed-chrome-check` walks all seven, so it
saw the pick'em chips — which are the most-tapped controls on the page after the
tabs, at 30px and 33px tall.

That is the check earning its place on the commit that added it: a
hand-measurement of the surface I happened to be looking at, corrected within a
minute by one that walks the whole page.

## The sticky seam, verified rather than assumed

`.datenav`'s own comment warns:

> a hand-tuned `top` that is 3px short of the bar's real height leaves a sliver
> of card content scrolling through the seam, which is precisely what the first
> attempt did

Growing those buttons to 44px is exactly the change that would do it again.
Measured after, at both P2 and D3:

```
.datenav  52px = --nav-h 3.25rem      .tabs  48px = --tab-h 3rem
.sport-group__title  sticky top: 100px  = 52 + 48
tap targets below 44px: 0     horizontal overflow: 0
```

The 44px buttons fit inside the existing 52px bar. Both derived offsets still
agree exactly, and nothing needed retuning.

## Teeth, both assertions

```
min-height 44 -> 32 on the date nav   FAIL  every tap target meets the 44px floor    19/20
--dim-text -> --nonexistent-token     FAIL  every custom property used is declared   19/20
```

20/20 restored.

## The audit's BROKEN item, checked for completeness

> **Item #10 — Typography: BROKEN.** Code ships the superseded fonts; **zero
> matches for `Chakra Petch` or `DM Sans` anywhere in the file.**

The June 12 decision making Chakra Petch the identity font was never implemented
in the sibling. This desk implements it, and has since before today —
`check:typography` asserts exactly two faces, four roles in Chakra Petch and two
in DM Sans, 11/11. Recorded because a reader comparing the two products should
know which one is conformant.

## Verify

```
check:computed-chrome 20/20   check 17/17           check:hard 17/17
check:nav 25/25               check:brief-flip 20/20  check:tabs 30/30
check:viewport-overflow 2/2   check:palette 35/35    check:typography 11/11
```
