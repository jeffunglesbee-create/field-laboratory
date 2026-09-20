# `verify` step 25 was one ungated `:hover`, red for seven runs

**Date:** 2026-09-20
**Fix:** `index.html` — `.sv-run__button:hover` moved inside
`@media (hover: hover) and (pointer: fine)`.

## What was red

```
FAIL  no :hover sits outside a (hover: hover) gate
      → .sv-run__button:hover — a touch tap leaves these applied
24/25 checks passed
```

One check, out of twenty-five, in step 25 of a sixty-nine-step job. **Forty-four
steps were skipped behind it**, every run, since the Verify panel shipped.

`.sv-run__button` is the Verify tab's run button, added when that panel was
built. The rule beside it in the same block — `:focus-visible` — was written
correctly. The hover rule was not, and the comment forty lines above it
(`HOVER IS GATED, PRESS IS NOT`) states the convention it broke.

## What the skipped steps were hiding: nothing

Re-run locally after the fix, on a full rebuild from `src/*.fs` rather than the
existing `build/`:

| step | result |
|---|---|
| The chrome, measured on the rendered page | **25/25** (was 24/25) |
| Tabs, both pick panels, ADR-002 display | 52/52 |
| The Draw panel | 14/14 |
| The Verify panel | 18/18 |
| Team tints | 9/9 |
| A card with a brief flips to reveal it | 20/20 |
| Pick'em | 24/24 |

That is the finding worth recording. A single colour-only CSS rule on one button
withheld 137 passing assertions across six checks for seven consecutive runs, and
nothing in the run summary said so — the job simply reported failure, and each
later session read "verify is red" as a standing condition rather than as one
line of CSS.

## The shape of it

The check was **not** broken and needed no change. It named the offending
selector and the reason in its own failure line, and it had been printing that
exact line every run. Nothing read it. The cost was not in diagnosis, which took
one log fetch — it was in the seven runs where nobody spent that fetch, because
"red at step 25" had become the expected state.

A red that persists stops being information. This repo's own rule about that is
written for STALE findings in the claim sweep; it applies here to a genuine
failure just as hard, from the other direction.

## Verification

- Full `npm run build` first — `public/` and `build/` are copies, and the
  rendered page is assembled from `build/`. A `check:computed-chrome` run
  against a stale `public/` would have measured CSS from before the edit.
- `index.html 51964 bytes, commit f114a9f` — the build line names what it
  assembled from.
- The check's teeth were already proven by the failure itself: it went red on
  the real selector, named it, and goes green on the gated rule.
