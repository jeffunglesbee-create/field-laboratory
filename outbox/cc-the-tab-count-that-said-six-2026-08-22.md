# Outbox — the tab count that said six

**Date:** 2026-08-22
**Ships:** the tab assertion in `scripts/live-tabs-check.mjs`

## What was red

`live-check` had been failing for hours — on `status: refresh` and
`drift-sentinel` commits that never touched a tab — with:

```
FAIL  the deployed page has all six tabs
   → found: ["tab-scoreboard","tab-field-pick","tab-scout-pick","tab-pickem",
             "tab-weather","tab-stats","tab-briefs"]
      — the tab build may not have deployed
```

The deployed page has seven tabs. The Briefs tab shipped, and this live check
still asserted `tabIds.length === 6`. The failure message even guessed the wrong
cause ("the tab build may not have deployed") when the truth was the opposite —
the build deployed a tab the check had never been told about.

## The fix

Assert the expected set BY NAME instead of a magic count:

```js
const EXPECTED_TABS = [
  'tab-scoreboard', 'tab-field-pick', 'tab-scout-pick',
  'tab-pickem', 'tab-weather', 'tab-stats', 'tab-briefs',
]
check('the deployed page has all seven tabs', tabIds.length === EXPECTED_TABS.length, …)
check('every expected tab is present by name',
  EXPECTED_TABS.every(id => tabIds.includes(id)),
  `missing: ${JSON.stringify(EXPECTED_TABS.filter(id => !tabIds.includes(id)))}; …`)
```

A count of seven would go green today and rot the same way the next tab lands. The
named set fails by identity: an added or dropped tab names itself in the diff, and
a reader does not have to decode an off-by-one.

## Why this note exists at all

`history-check` requires every commit that touches source — and `scripts/` counts
as source — to carry an outbox entry in the SAME commit. The first version of this
fix shipped without one, so the governed history went red on exactly the rule this
repo built to have no suppression list. This note is that missing half, folded
back into the commit rather than papered over by moving the rule's boundary. The
check was right; the commit was incomplete.

## Verified

`node --check scripts/live-tabs-check.mjs` clean. The live assertion itself runs
against the deployed page from a GitHub runner (the sandbox cannot reach
`*.workers.dev`), and goes green on the next deploy that carries a source change —
the deployed page genuinely has these seven tabs.
