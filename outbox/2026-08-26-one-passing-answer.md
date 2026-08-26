# The boundary assertion had one passing answer, and it was the wrong one

**2026-08-26.** `computed-chrome-check.mjs`, assertion 2b.

## The mechanism

The assertion asked: *is there a boundary at 3:1?*

A question in that form has exactly one remedy — add a boundary. The
`unslop-ui` checklist's remedy for most of these is the opposite one. Item 7:
"Every container/box/card boundary should answer: *what does this boundary help
the user understand?*"

The additive fix got applied nine times on 2026-08-26 because it was the one the
metric could score. Three of the nine were wrong — `.pick-reason`,
`.pick-leader`, `.pk-banner` were given a stronger edge when what they needed
was no edge. Those three were later removed outright.

This is the same defect class this session has now named fourteen times: **a
value whose name and its measurement disagree.** The assertion was named for
visible separation and measured only one of the two ways to get it.

## What changed

The subtractive remedy was already *accepted* — an element that stops painting a
background drops out of the candidate list and the check passes. It was accepted
silently, and a silent remedy stops being considered.

Both remedies are now named in the failure text, cheaper one first:

```
.pick-reason on .pick-leader: same fill rgb(...), best boundary 1.09:1
  — delete its background (no padding, no radius — the box shapes nothing)
```

and the passing log gained the `carried by:` form `separation-check` already
uses, so the split between the two answers is visible on a green run.

## The false claim this fix nearly shipped

The first version said, in the comment and in the log line, that removing the
fill is **pixel-identical** for every candidate. Every element in the list
paints a fill identical to the fill behind it, so that reads as provable.

Mutation-testing the new message — forcing the threshold to 20:1 so all three
candidates print — showed it beside `.tabs` and `.datenav`. **Both are sticky.**

A sticky element's fill is what stops scrolled content showing through once it
detaches. Identical to its backdrop at rest; not identical while scrolling. The
blanket claim was false for exactly the elements the check would have printed it
beside.

`position` is now read. Sticky and fixed elements are told to raise the
boundary; static ones get the subtractive answer.

On this page all three candidates are sticky, so the subtractive remedy applies
to **0 of 3** — the reverse of what the blanket claim asserted.

## Evidence

```
      3 element(s) share their backdrop's fill; carried by: boundary 3/3
      removing the fill is pixel-identical for 0/3 — the other passing answer.
      The remaining 3 are sticky or fixed and need the boundary.

11/11 checks passed
```

Both failure branches mutation-tested at a 20:1 threshold: the `sticky` branch
printed for `.tabs`/`.datenav`/`.sport-group__title`, and the `shapes nothing`
branch printed for the same three before `position` was read.

## Not resolved here

`.briefs-stat` (0 rendered on the default fixture), `.pk-side--none` (never seen
applied), and the sport-filter contrast (measured against a *cloned* sibling
rather than a real second one) are all still reported as `not observable`. That
is the next commit: a ledger that makes the unexercised set countable instead of
a line of prose on a green run.
