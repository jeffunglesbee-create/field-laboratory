# Every portrait phone scrolled sideways, and the tab bar was doing it

**Date:** 2026-08-29
**Scope:** `index.html`
**Spec consulted:** *FIELD — Viewport Consistency Specification (all devices ×
all orientations)*, Drive `1jvQw0uS3TR_pblNh7TCUxjsH22MN8IJt_o_yPvbuJ30`,
May 24 2026, status **DEFINITIVE**.

## The spec is jubilant-bassoon's, and one of its assertions is repo-neutral

That document specifies eleven canonical viewport states for the PWA — its
selectors (`.game-card`, `.sport-section-games`, the ambient panel, the OTW
banner) do not exist in this repo, and its feature-visibility matrix is about a
product the laboratory is not. Most of it does not transfer.

Three things do. Its stated purpose — "FIELD must render a consistent,
intentional product at every viewport" — its canonical widths, and this
geometric assertion, listed under P1:

> Assert: no element overflows viewport horizontally

The laboratory was failing it on every portrait phone.

## Measured at the spec's own widths, not invented ones

Earlier passes this session used 1440 / 834 / 390, which are not canonical. Re-run
across all ten states, before the fix:

```
state              w×h        overflow     brief ch   band
P1 phone-compact   360×780    216px         41        below 45
P2 phone-standard  393×852    185px         41        below 45
P3 phone-large     430×932    150px         41        below 45
L1 phone-landscape 667×375    none          61.1      IN BAND
L2 phone-lscape-wd 932×430    none          57.9      IN BAND
T1 iPad portrait   820×1180   none          68        IN BAND
T2 iPad landscape 1180×820    none          55.4      IN BAND
D1 laptop         1200×800    none          56.4      IN BAND
D3 desktop        1440×900    none          54.4      IN BAND
U1 ultra-wide     1920×1080   none          61.6      IN BAND
```

The overflow shrinks as the viewport grows — 216, 185, 150 — which is the
signature of a **fixed-width element**, not a responsive one. 360+216, 393+185
and 430+150 all land within 4px of 578.

## The cause

```
viewport         360
scrollWidth      576
.tabs width      324      ← the container
.tabs scrollWidth 558     ← its content
tab buttons total 534
.tabs overflow-x  visible
.tabs flex-wrap   nowrap
```

Seven tab buttons, no wrap, and `overflow-x: visible`, so the row did not
scroll — it pushed the **document** to 576px. The tabs were fine; the page was
broken.

Fixed with the treatment the spec itself prescribes for the analogous filter bar
at P1 — "horizontal scroll-snap, hidden scrollbar":

```css
.tabs { overflow-x: auto; scroll-snap-type: x proximity;
        scrollbar-width: none; -ms-overflow-style: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs button { scroll-snap-align: start; flex: 0 0 auto; }
```

## A correction: my own `span 2` was manufacturing a grid column

The measure fix earlier in this session added `.desk-card.is-flipped
{ grid-column: span 2 }`, with a comment reading:

> `span 2` on a single-column grid is clamped by the spec, so the phone is
> unaffected — measured below, not assumed.

It was asserted, not measured. I measured the resulting `ch` and never checked
the column count or the overflow. At 360px the grid computes to a single 324px
track unflipped, and flipping **manufactured a second track**. Now gated to
`@media (min-width: 34rem)` — 544px, just above two 260px columns — because
below that there is no second column to span into.

The comment claiming a measurement I had not taken is the worse half of this.

## After

```
state    w×h        overflow(pre/post)  cols   brief ch   band
P1        360×780        0/0             1      31.1     below 45
P2        393×852        0/0             1      34.3     below 45
P3        430×932        0/0             1      37.8     below 45
L1        667×375        0/0             2      61.1     IN BAND
L2        932×430        0/0             3      57.9     IN BAND
T1        820×1180       0/0             2      68       IN BAND
T2       1180×820        0/0             4      55.4     IN BAND
D1       1200×800        0/0             4      56.4     IN BAND
D3       1440×900        0/0             5      54.4     IN BAND
U1       1920×1080       0/0             6      61.6     IN BAND
```

**Zero overflow at all ten states**, before and after flipping, and every
portrait phone is now the single column the spec's feature matrix calls for.

## Phones are below the measure band and no layout change fixes that

31.1ch at 360px is not a regression from the 41ch measured before — the 41 was
inflated by the overflow. A card in a 576px runaway grid was wider than the
phone showing it, so the prose looked wider than the reader's screen actually
allowed. **31.1ch is the honest number**, and it is what 360px of screen at
13.6px type gives you.

The only remaining lever is font size, and shrinking body text to hit a measure
metric trades real legibility for a ratio. `taste.md`'s 45-75ch band assumes a
prose column with room to be one. Recorded as a known state, not chased.

## Also landed here

- `.desk-card__brief-text { max-width: 68ch }` — `span 2` overshot T1 to 79ch,
  past the ceiling. The rule is about the text, so the cap is on the text.
- `body { padding: clamp(1rem, 5vw, 2rem) }` — a flat `2rem` put 64px on a 390px
  screen, 16.4% of it. Desktop is unchanged from 640px up.

## Verify

```
check 17/17   check:hard 17/17   check:render-sports 17/17   check:nav 25/25
check:brief-flip 20/20   check:computed-chrome 15/15   check:tabs 30/30
check:palette 29/29   check:typography 11/11
```
