# The tab strip at phone width: Metrics was off-screen with no sign the row went on

Reported by the owner on 2026-10-21: "The metrics tab in laboratory is empty
and non-selectable". Asked which of three shapes it was, the owner answered
**(a): it can't be reached or tapped on a phone.**

## Probed before changing anything

- **Live site** (`70906ae`, current main at the time), from a runner (run
  39643932559), in desktop Chromium, Pixel 7 Chromium and iPhone 14 WebKit.
  The tab selects in all three. Nothing covers it (`elementFromPoint` at its
  centre is the tab itself). The panel renders, with no page or console errors.
  - A later run (39644224926) expanded each section. Second Wind, Gravity Well
    and Tactical Lock filled.
  - Its "Flow open=false, body empty" was **the probe's own artifact**. Flow
    mounts open, so clicking its summary closed it. A local measurement found
    Flow rendered: 2 subjects, 4 strips, 360 cells.
- **The strip at 390px:** the tabs total 917px in a 351px strip.
  `overflow-x: auto` with a hidden scrollbar (`.tabs` in index.html, the
  Viewport spec's prescribed treatment). Metrics starts at x=790 and Verify
  at x=870: both wholly off-screen. Nothing on screen says the row
  continues. Playwright's click and tap scroll their target into view
  themselves, which is why every automated check passed while a person
  could not find the tab.

## What changed

The scroller stays: it is the spec's treatment, and wrapping the tabs would
make a sticky bar three rows tall. Two additions:

1. **`markEdges`** (src/Program.fs) sets `data-more-left` and
   `data-more-right` on `.tabs` from its scroll position. It runs on scroll, on
   resize, on `load` (web fonts change the tab widths) and on every selection.
   The CSS fades a marked edge over 2.5rem, using `mask-image` with the
   `-webkit-` prefix for Safari.
2. **`reveal`** scrolls a selected tab clear of the fade. It is horizontal
   only, setting the strip's `scrollLeft`: `scrollIntoView` would also move
   the page vertically, which tab-check forbids. It covers `?tab=metrics`
   links, back/forward, and the arrow keys.

Screenshots at 390px: `outbox/tab-strip-390-load-2026-10-21.png` (right edge
faded over "Pic'em") and `outbox/tab-strip-390-metrics-2026-10-21.png`
(Metrics selected and in view, both edges faded).

## Checks (tab-check.mjs, 61 of 61)

- At 1280px, on its own page: every tab is in view and no edge is marked.
- At 390px: the strip overflows (a guard, so the rest are not vacuous). On
  load, the right edge is marked and the left is not. The marked edge has a
  mask.
- At 390px, `?tab=metrics` selects Metrics and its rect is inside the strip's
  rect. Both edges are then marked.
- Scrolled to the end: the right mark clears and the left stays.

**A defect in the first draft of these checks:** the desktop check ran on the
shared `page`, whose viewport tab-check shrinks earlier for its scroll test.
Written loosely, it passed vacuously. Tightened, it failed on the clean tree.
Both were caught by the mutation run below, where it failed under four
unrelated mutations. It now uses its own 1280px page.

## Mutations, all caught, all registered in mutation-check.mjs

| id | mutation | caught by |
|---|---|---|
| `tab-strip-no-reveal` | `reveal target` deleted | ?tab=metrics in view; both edges marked |
| `tab-strip-right-edge-unmarked` | the right mark forced false | right edge marked on load; faded; both marked |
| `tab-strip-edges-stale-on-scroll` | the scroll listener removed | right mark clears at the end |
| `tab-strip-fade-unstyled` | the right-edge rule emptied | the marked edge is faded |

Removing only the unprefixed `mask-image` line was **not** caught, correctly:
the `-webkit-` line still fades the strip in Chromium. The registered
mutation empties the whole rule.

## Also run

`check:viewport-overflow` 12/12 and 2/2, `check:computed-chrome` 25/25,
`check:device-chrome` 16/16 and 8/8, `check:nav` 25/25, the F# suite 314/314.
`check:live-tabs` needs the deployed site; it runs in live-check after deploy.

## Not done

The fade is a convention, not a control. If a reader still misses it, the next
step is scroll buttons beside the strip. Those need a wrapper outside the
tablist (a button inside `role=tablist` is not a tab), which is a structural
change and needs the owner's go-ahead. This is not filed as a CC-CMD: it is a
question for the owner, put to them with this change.
