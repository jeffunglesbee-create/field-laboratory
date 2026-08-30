# The no-overflow invariant is asserted, at ten canonical viewports

**Date:** 2026-08-29
**Scope:** `scripts/viewport-overflow-check.mjs` (new), `package.json`,
`.github/workflows/verify.yml`

## Why a geometric check, when every render check was green

The tab-bar overflow that broke every portrait phone was found **by hand**, by
measuring. `check`, `check:hard`, `check:render-sports`, `check:nav`,
`check:brief-flip`, `check:computed-chrome`, `check:tabs` and `check:typography`
all passed throughout — 149 assertions between them — because they assert on
**content**, and content renders perfectly well inside a page that is too wide.

The failure was geometric, so the assertion has to be geometric. Nothing in this
repo looked at page width against viewport width at any size.

## The invariant, and where it comes from

*FIELD — Viewport Consistency Specification*, Drive
`1jvQw0uS3TR_pblNh7TCUxjsH22MN8IJt_o_yPvbuJ30`, May 24 2026, status
**DEFINITIVE**, under P1:

> Assert: no element overflows viewport horizontally

Ten of its eleven canonical states are transcribed into the check with the
spec's own device examples. D2 and D4 are omitted: they are the WHOLE FIELD
toggle of D1 and D3, a jubilant-bassoon mode this repo has no equivalent of, so
D1 and D3 stand for those widths.

## Measured twice at every state, and the second pass is the point

At rest, and again with every flippable card open.

That is not thoroughness for its own sake. A `grid-column: span 2` added earlier
the same day was sound at rest and **manufactured a second grid track** on a
single-column phone the moment a card opened — and its code comment claimed the
spec clamped it. A check that only measured the resting page would have passed
that, and its author had already written down that it was fine.

## Column count is asserted only where the spec pins it

P1, P2 and P3 read `1col` in the spec's feature-visibility matrix, so the check
asserts one column there. Every other state's column count is a consequence of
the grid's own `auto-fill`, and pinning it would be inventing a contract the
spec does not make. One of the self-tests asserts exactly that:

```
PASS  column count is NOT asserted where the spec does not pin it
```

## Teeth, both halves

The pure classifier is asserted without a browser — 6/6, including the shape of
the bug that prompted it:

```
PASS  overflow AT REST is a fault
PASS  THE SPAN-2 SHAPE: sound at rest, overflowing once a card opens
PASS  a phone rendering two columns contradicts the spec matrix
PASS  faults accumulate rather than short-circuiting
```

And the live measurement proves itself before reading a single real row: it
injects a 3000px element into the real page at the narrowest viewport, confirms
the measurement reports it, and removes it.

```
PASS  the detector catches a planted 3000px element
```

Ten green rows prove nothing if the instrument cannot go red. This repo has
shipped a check that reported "0 class(es) defined" and passed everything below
it; the planted probe is the guard against that shape.

## Current state

```
  state  name                  w×h        rest  open   cols
  P1     phone-compact          360×780      0     0    1
  P2     phone-standard         393×852      0     0    1
  P3     phone-large            430×932      0     0    1
  L1     phone-landscape        667×375      0     0    2
  L2     phone-landscape-wide   932×430      0     0    3
  T1     iPad portrait          820×1180     0     0    2
  T2     iPad landscape        1180×820      0     0    4
  D1     laptop                1200×800      0     0    4
  D3     desktop               1440×900      0     0    5
  U1     ultra-wide            1920×1080     0     0    6
```

A failure names the widest offending element and the pixel it reaches, so the
message is the repair rather than a number to go hunting with.

## A second Drive doc, and a finding it produces

*FIELD — Viewport Style Guide v1.0* (Drive
`1X_u98rkvqB4l6H5fYr1IiOZlLcZzap6cUDojgE85C2A`, May 22 2026) is a style guide
for jubilant-bassoon with an unimplemented backlog — its class names do not
exist here, and its rem values are that product's. One principle in it does
transfer, and it is testable:

> The counterintuitive insight: viewing distance scales INVERSELY with viewport
> size. … section identifier sizes should be LARGER relative to body text at
> 360px than at 1200px. FIELD currently does the opposite: everything uniformly
> miniaturized at .52-.68rem across all viewports.

The laboratory does the same thing. `.sport-group__title` is `.78rem` and the
tab labels `.8rem` at **every** viewport — no ramp at all. A reader holding a
phone at 25-30cm gets the same 12.5px section heading as a reader at a 1440px
monitor 60-70cm away.

Recorded, not acted on: applying that doc's exact figures to a different
product's markup would be borrowing a number rather than deriving one. It needs
its own measurement pass.

## Verify

```
npm run check:viewport-overflow    # 6/6 self-test, then 2/2 across ten states
npm run check:workflows            # 6/6
npm run check:script-orphans       # 3/3
npm run check:import-purity        # 2/2
```
