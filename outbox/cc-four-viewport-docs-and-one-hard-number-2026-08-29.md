# Four viewport docs on Drive; one hard number, and the rest is another product

**Date:** 2026-08-29
**Scope:** `index.html` — one value.

## Read

| doc | date | status |
|---|---|---|
| Viewport Consistency Specification | May 24 2026 | **DEFINITIVE** |
| Viewport Style Guide v1.0 | May 22 2026 | v1.0, with an unimplemented backlog |
| Complete Feature × Viewport Audit | May 24 2026 | **DEFINITIVE** |
| Card Tap × Viewport Spec | May 27 2026 | **DEFINITIVE** |

All four are jubilant-bassoon's. Their selectors — `.game-card`,
`.drama-badge`, `.sport-section-games`, the ambient panel, the OTW banner, the
LEFT/CENTRE/RIGHT columns — do not exist in this repo, and their feature
matrices describe a product this desk is not. Most of the content does not
transfer, and pretending otherwise would be borrowing a spec rather than
reading one.

Four things do.

## 1. The no-overflow invariant — already acted on

Consistency Spec, under P1: *"Assert: no element overflows viewport
horizontally."* The desk was failing it on every portrait phone. Fixed and now
asserted in CI at ten canonical states.

## 2. The 65ch reading lock — acted on here

Feature × Viewport Audit, Section 3, Desktop (D3-D4):

> **P4 lock: CENTRE reading width max 65ch**

The brief-text cap shipped earlier today at **68ch**, reasoned from `taste.md`'s
45-75 band: *"68ch rather than 75: the ceiling is where it stops being
comfortable, not a target to sit on."* That reasoning was sound and the number
was still wrong — **FIELD already has a locked reading width**, and 68 quietly
overran it by three characters.

A project with its own lock does not need one derived from a third-party rule of
thumb. Now 65ch, cited to the lock:

```
P1   360px    31.1ch   within the 65ch lock
P3   430px    37.8ch   within the 65ch lock
T1   820px      65ch   within the 65ch lock   <- was 68
D3  1440px    54.4ch   within the 65ch lock
U1  1920px    61.6ch   within the 65ch lock
```

Only iPad portrait was actually at the cap, so this moves one viewport by three
characters. The value of the change is that the number now has a provenance
inside this project.

## 3. The inline-expansion pattern says the desk is right, and names its limit

Card Tap Spec, D1/D3 (laptop and desktop ESSENTIALS):

> Clicked card expands inline within the LEFT column. Cards above and below
> remain visible and scrollable. Expansion height: auto (content-driven, max
> ~320px)

That is what `.desk-card.is-flipped` does. The desk's flip is the spec's own
desktop-ESSENTIALS destination surface, arrived at independently.

And the spec names the exact constraint I found by measuring, one paragraph
later:

> NO headline/deck in inline expansion — card is too narrow for Playfair serif
> at card width (~280-350px). Save headline/deck for WHOLE FIELD CENTRE column.

Same finding, opposite remedy. I widened the card to fit the prose; the spec
removes the prose from the card. **Its remedy is not available here** — the desk
has no CENTRE column to move a brief into, and a brief with nowhere to go is not
a brief. Recorded as a real difference in the products, not as a violation.

## 4. Two-target tap, and why it does NOT apply

Card Tap Spec, stated as a must:

> TWO DISTINCT TAP TARGETS on every game card, at every viewport … Do NOT make
> card body open the story sheet … The split MUST be preserved at all viewports.

`.desk-card--flippable` makes the **whole card body** the flip control, which is
the opposite. Reading that as a violation would be a mistake, and the spec says
why itself: the split exists to reserve the card body for **F16**, a future
inline-expand feature on jubilant-bassoon. The laboratory has no drama badge and
no F16. The rule's entire reason is absent, so the rule does not reach here.

The same spec also permits exactly this at iPad and desktop-WHOLE-FIELD: *"At
iPad, both tap targets open the game detail view … no F16 ambiguity because F16
is mobile-only."*

## Not acted on: the viewport type ramp

Style Guide v1.0 carries a principle that does transfer and is testable:

> viewing distance scales INVERSELY with viewport size … section identifier
> sizes should be LARGER relative to body text at 360px than at 1200px. FIELD
> currently does the opposite: everything uniformly miniaturized at .52-.68rem
> across all viewports.

The desk does the same thing: `.sport-group__title` at `.78rem` and tab labels
at `.8rem`, at **every** viewport, no ramp. A phone at 25-30cm gets the same
12.5px heading as a 1440px monitor at 60-70cm.

That doc is v1.0 with an explicit unbuilt backlog ("WHAT 360px CURRENTLY LACKS",
"IMPLEMENTATION PRIORITY / TIER 1"), and its rem values are keyed to Barlow at
that product's sizes. Copying `.88rem` into a Chakra Petch / DM Sans desk would
be taking a number instead of deriving one. It needs its own measurement pass
against this repo's type ramp, which is a separate piece of work.

## Verify

```
npm run check:viewport-overflow   # 2/2 across ten canonical states, unchanged
```
