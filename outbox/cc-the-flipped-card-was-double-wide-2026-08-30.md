# The flipped card was double wide

**Date:** 2026-08-30
**Scope:** `index.html` — `.desk-card.is-flipped`

Reported: *"The briefs shouldn't be double wide, renders weird."*

Removed `@media (min-width: 34rem) { .desk-card.is-flipped { grid-column: span 2 } }`,
added the same morning.

## A/B, measured before removing

| viewport | cols | brief ch | card px | cards moved |
|---|---|---|---|---|
| P1 phone 360 | 1 | 31 → 31 | 324 → 324 | 62 → 62 |
| T tablet 834 | 2 | 64.9 → **36.7** | 770 → **377** | 63 → 62 |
| D3 desktop 1440 | 5 | 54.3 → **24.4** | 541 → **262** | **2 → 58** |

## The defect is the tablet row

At two columns, spanning two is the **whole grid**. A 770px card among 377px
siblings is not a wider card, it is a full-bleed panel, and it stops reading as
a member of the grid it sits in. Desktop's 541px among 262px siblings is the
milder version of the same thing: one card visibly unlike every other, which is
what "double wide" names.

The 34rem gate was added yesterday for the phone, and it worked — the phone row
is identical either way. The gate protected the viewport that was never the
problem.

## My first reason for removing it was wrong

I wrote, in the replacement comment, that widening a card mid-grid reflows every
card after it. Then I measured, and the last column says the opposite: **2 cards
moved with the rule, 58 without.** A card wide enough to absorb the brief's
height keeps it inside one row.

Flipping reflows either way — the front face swaps for the brief and the height
changes — so reflow never discriminated between the two versions at all. The
argument was reasoning presented as a finding, in a comment I was about to
commit, in a repo whose standing rule is that reading is a simulation of
execution.

The A/B took one run. It cost less than the paragraph did.

## The removal has a real cost, and it is not being hidden

The brief loses 28ch on tablet and 30ch on desktop, landing at **24.4ch**
against taste.md's 45–75ch band. Desktop is the worst case because
`repeat(auto-fill, minmax(260px, 1fr))` packs more columns as the viewport
grows — the desk reads worst on the machine built to read it.
`.desk-card__brief-text`'s 65ch cap is a ceiling, and a 262px column never
approaches it.

Desktop reflow also regresses from 2 cards to 58.

Both are worse numbers than the version being deleted. They are being accepted
because a full-bleed card is visible at a glance and a narrow measure is visible
in a measurement, and the person reading the desk saw the first one immediately.

## What is left, and why it is not being done here

One lever remains: raising the grid floor to `minmax(400px, 1fr)`. It fixes
measure at every viewport and costs the desktop slate two of its five columns.

That is a trade about what the desk is FOR — seeing the whole slate at once
versus reading one brief comfortably — not a bug fix, and it is not being made
by implication while fixing a rendering complaint.

## Verified

```
npm run check:viewport-overflow    2/2   (10 canonical viewports, 0 overflow)
npm run check:computed-chrome     20/20
node scripts/brief-flip-check.mjs 20/20
```

`public/` was stale when the measurement started — it still carried the rule
after the edit. `build-site.mjs` was re-run before every reading. The Fable half
was not, and did not need to be: this change is CSS, which lives outside the
`<script>` block the F# build produces.
