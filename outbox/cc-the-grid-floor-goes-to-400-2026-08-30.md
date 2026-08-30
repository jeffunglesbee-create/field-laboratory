# The grid floor goes to 400px, clamped

**Date:** 2026-08-30
**Scope:** `index.html` — `.sport-group__grid`

The lever the previous entry named and declined to pull, pulled on request.
`repeat(auto-fill, minmax(260px, 1fr))` → `minmax(min(400px, 100%), 1fr)`.

## Measured, three variants, eight viewports

| viewport | cols 260→400 | briefCh 260→400 | bare 400px overflow |
|---|---|---|---|
| P1 360 | 1 → 1 | 31 → 31 | **58px** |
| P2 393 | 1 → 1 | 34.2 → 34.2 | **27px** |
| P3 430 | 1 → 1 | 37.8 → 37.8 | 0 |
| L1 667 | 2 → 1 | 27.7 → **61** | 0 |
| T 834 | 2 → 1 | 36.7 → **64.9** | 0 |
| D1 1200 | 4 → 2 | 25.4 → **56.4** | 0 |
| D3 1440 | 5 → 3 | 24.4 → **44.3** | 0 |
| U1 1920 | 6 → 4 | 28 → **44.8** | 0 |

## `min(400px, 100%)`, not a bare 400px

A bare grid floor is a **minimum**, not a preference. When no 400px track fits,
`auto-fill` lays one down anyway and the document grows past the viewport.

Measured rather than reasoned: **58px of horizontal overflow at 360 and 27px at
393** — the two commonest phone widths — against a spec whose P1 line reads
*"Assert: no element overflows viewport horizontally"* (Drive
`1jvQw0uS3TR_pblNh7TCUxjsH22MN8IJt_o_yPvbuJ30`, May 24 2026, DEFINITIVE).

`min()` clamps the floor to the container. The three phone rows are
byte-identical between the two forms; only the wider viewports move. Had I
shipped the literal request I would have broken the invariant this repo added a
whole check for yesterday, on the two most common phones, in the commit that
was supposed to improve reading.

## What it costs

Every viewport above 430 loses columns. Desktop 5 → 3, as the earlier entry
predicted.

**Not predicted: 834 and 667 drop to a single column.** A tablet in portrait now
shows one card per row — `check:viewport-overflow` shows T1 820 at 1 column too.
That is a larger change to the tablet than "costs the desktop slate two of its
five columns" implied, and it is the part worth looking at before deciding this
was worth it.

## It does not finish the job at 1440 or 1920

Both land at **44.3ch and 44.8ch — just under the band's 45 floor**, because
`auto-fill` spends the extra width on a third and fourth column rather than on
measure. The wide-monitor case improves from 24.4ch to 44.3ch and still misses.

Closing that last half-character means capping the grid's own width, which is a
different decision about how much of the screen the desk should use. Not made
here.

## Spec contracts still hold

`check:viewport-overflow` measures the three phone widths against the spec's
`1col` contract. All three still report 1 column, at rest and with every card
flipped, with zero overflow at all ten canonical states.

## Verified

```
npm run check:viewport-overflow     2/2   (10 viewports, 0 overflow, cols contract holds)
npm run check:computed-chrome      20/20
node scripts/brief-flip-check.mjs  20/20
npm run check:palette              35/35
```

`build-site.mjs` re-run before every reading; `public/` confirmed carrying the
new rule at line 398 rather than trusted to be current.
