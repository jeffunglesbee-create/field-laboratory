# Four device gaps counted. Two were not gaps.

2026-09-01. Answers a question asked early in this session and answered with
something else: *what is in jubilant-bassoon that should be in the laboratory?*

## The comparison, re-measured at HEAD

An earlier table in this session put the laboratory at 331 CSS lines, 1
breakpoint, 4 `aria`/`role` and zero of everything device-shaped. Re-measured
rather than inherited:

| signal | client | laboratory | earlier reading |
|---|---|---|---|
| CSS lines | 4,035 | 582 | 331 |
| width breakpoints | 99 | 1 | 1 |
| `aria-*` / `role` | 105 | 44 (+21 in F#) | 4 |
| `safe-area-inset` | 9 | 0 | 0 |
| `dvh` / `svh` | 5 | 0 | 0 |
| `prefers-reduced-motion` | 6 | 0 | 0 |
| `touch-action` | 7 | 0 | 0 |

A correction to my own count while making it: `@keyframes` read as 1 here. It is
the word inside a comment. The page has zero.

## The two that were not gaps

**`safe-area-inset`.** The client declares `env(safe-area-inset-*)` nine times.
`viewport-fit` appears **zero times in either file**. Without `viewport-fit=cover`
the browser lays the viewport out inside the display's largest inscribed
rectangle and every `env(safe-area-inset-*)` resolves to `0`. All nine are
no-ops. Copying the pattern here would have added nine more and counted it as
parity — a number from a comparison table, cargo-culted into a file.

**`dvh`.** This page contains no viewport-height unit of any kind, so there is
nothing for `dvh` to be the safer version *of*. The client's five are real
because it has full-height panels; this page has none.

Both were on my ship list. Neither survived one grep.

## The three that shipped

1. **`touch-action: manipulation` on controls.** iOS reserves ~300ms after a tap
   on anything that could be a double-tap-zoom target, and every control here is
   one. `manipulation` allows panning and pinch-zoom and drops only double-tap
   zoom.

   **Not on `.tabs` itself**, and that is asserted against by name. It is a
   scroll-snap horizontal scroller whose default `auto` is already correct — the
   browser routes a horizontal drag to the scroller and a vertical one to the
   page. `pan-x` there would block vertical page scroll for any gesture starting
   on the tab bar: a regression wearing a fix's clothes. My first framing of this
   item was that gesture routing was the problem. It was not; tap latency was.

2. **`prefers-reduced-motion: reduce`.** The 100ms `:active` scale is the page's
   only transform and only transition, added from the June 12 catalog. WCAG 2.3.3
   covers motion from interaction.

   The colour half is deliberately kept. A background change is not motion, and
   dropping it would leave those four controls with no pressed state at all for
   the reader who most needs the feedback unambiguous. The check asserts both
   halves separately.

3. **`aria-live="polite"` on `#viewed-date`.** Zero live regions existed. Pressing
   an arrow rewrites the URL and re-renders the whole slate without moving focus
   — the one place on this page where content changes and nothing announces it.
   The tablist needs none: `aria-selected` plus a real tabpanel already announce,
   and focus follows the arrow keys. The check asserts the tablist is *not* live,
   so a later session cannot "fix" it by adding one.

## The 1-vs-99 breakpoint gap is not on the list

The laboratory sizes intrinsically where the client uses breakpoints:
`minmax(min(400px, 100%), 1fr)`, `clamp(1rem, 5vw, 2rem)`,
`minmax(0, 1fr) auto 5.5rem`. `viewport-overflow-check` pins L1 at one column
and L2 at two from the Drive spec's Feature Visibility Matrix and proves zero
horizontal overflow at ten canonical viewports.

That is a position, not an excuse, and it is falsifiable in one direction: if
that check ever fails at a viewport the client handles, the technique loses.

## Verification

14/14 self-test, 7/7 against the page, and every assertion mutation-proven — the
check was run against a deliberately broken copy eight times and the count fell
each time:

| mutation | result |
|---|---|
| remove the reduce block | 5/7 |
| reduce block also kills the colour | 6/7 |
| remove `touch-action` from controls | 6/7 |
| add `touch-action: pan-x` to `.tabs` | 6/7 |
| remove `aria-live` | 6/7 |
| remove `aria-atomic` only | 6/7 |
| **`env()` with no `viewport-fit`** | 6/7 |
| **`viewport-fit=cover` with no `env()`** | 6/7 |

The last two are the finding encoded as a guard. Both directions fail; neither
and both pass. `env()` alone is inert, and `cover` alone puts content under the
notch with nothing holding it out — which is the state a future session would
reach by reading the client's nine declarations and copying half of them.

Wired as `check:device-chrome`, running in `verify.yml` beside `check:palette`.
