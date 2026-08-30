# My contrast pass read `color` and never looked at `opacity`

**Date:** 2026-08-29
**Scope:** `scripts/computed-chrome-check.mjs`
**Doc:** *Viewport v4 Build Brief ADDENDUM: Journalism Surfacing*, Drive
`1ibAZ1n52akTtBEvmzgQHSkUPDEEllKwug44Gx6zggYE`, June 12 2026.

## The correction that matters most

Earlier today I reported, and committed:

> ```
> BEFORE   17 text nodes below 4.5:1
> AFTER     0
> ```

That number came from reading `getComputedStyle(el).color` against the nearest
painted ancestor. **It never looked at `opacity`.** Fourteen rules in this page
dim their text that way — `.desk-card__header`, `.desk-card__brief-kind`,
`.desk-card__flip-hint`, `.pk-legend` and ten more — and opacity composites the
colour toward the ground before a reader sees anything. A token can clear 4.5:1
and render at 2.8:1.

Re-measured with effective opacity (the **product** of every ancestor's, which
is how it composites), exactly one class falls below its bar:

```
BUTTON   opacity 0.35   12.8px   naive 16.26:1   real 2.81:1   (×3)
```

`.datenav button[disabled]`. **It is conformant**: WCAG 1.4.3 excludes "text or
images of text that are part of an inactive user interface component," and the
rule's own comment says the dimming is deliberate — *"Pinning to a committed
capture disables navigation … Disabled controls say so visually."*

So the conclusion survived and the method was wrong. A method that cannot see a
whole CSS property will be wrong again on a page that uses it fourteen times.

## The assertion

Added to `computed-chrome-check.mjs`, and it only grades what token-level checks
structurally cannot: elements with effective opacity below 1. `palette-check`
compares hex to hex and is right to — it has no way to know a rule dims its own
output.

The disabled exemption is written to the standard rather than to convenience:
narrow, `[disabled]` / `:disabled` / `aria-disabled` only, so dimming a **live**
control cannot hide behind it.

Teeth, by dimming a live control to where the disabled one sits
(`.pk-legend` opacity `.5` → `.18`):

```
FAIL  no LIVE control or text renders below its contrast bar once opacity composites
16/17 checks passed
```

17/17 restored.

## What the addendum itself said, and the lever I had denied existed

Section 1:

> **PER-GAME BRIEF INLINE ON CARD** … The viewport controls HOW MUCH journalism
> shows: P1-P2: 1 line (TIGHT) · P3-L2: 2 lines (MID) · T1-D4: full brief (FULL)
> … The card TIER controls WHETHER journalism shows: Featured: full inline brief
> · Standard: one-line matchupNote · Compact: none

Earlier today, on finding the brief prose at 31.1ch on a phone, I wrote: *"the
only remaining lever is font size … no layout change fixes that."*

**That was false.** There is a third lever and this document names it: show less
journalism. I had reasoned entirely in layout terms — widen the column, shrink
the type — and never considered changing how much text is there.

## …and why the desk still should not pull it

The ramp governs journalism shown **inline and unrequested**: "visible inline
below drama bar". The laboratory's brief is behind an explicit flip — the reader
tapped the card to get it. Truncating prose someone asked to read is worse than
showing it narrow.

The tier axis needs tiers, and the desk has one: `desk-card--flippable` is the
only card modifier in the stylesheet. Featured/standard/compact is a real
structural addition, not a CSS change, and it belongs to a session with a
decision record rather than to this one.

So: no change, but the reason is now "requested prose is not truncated" rather
than "there is no lever," which is what I wrongly recorded.

## Already conformant, checked not assumed

Section 3 specifies the brief's typography: *"Font: DM Sans 300 (context role),
color: dim. Prefix … in Chakra Petch label."* Measured on the rendered page:

```
.desk-card__brief-kind   Chakra Petch   11.2px      <- identity label
.desk-card__brief-text   DM Sans        13.6px      <- context body
```

Both correct. No change.

## Verify

```
npm run check:computed-chrome   # 17/17
```
