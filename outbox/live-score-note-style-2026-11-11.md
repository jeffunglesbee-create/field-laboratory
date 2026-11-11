# The live note had a class and no CSS rule (review semantics:F8)

Date: 2026-11-11. The card's `desk-card__live` node (the feed's clock, `Full time`, or `live score unavailable`) was emitted with no
stylesheet rule. Its siblings are all styled (`.desk-card__status` is .8rem at .75 opacity; the drama, odds and forecast lines .75rem at
.55), so the node inherited the page's 15px at full opacity and would have read larger and brighter than the status line above it, on
the first real in-play card. The review measured it by reading the one `<style>` block: 0 selectors name the class.

Nothing saw it because `live-score-render-check.mjs` read `textContent` only, and `computed-chrome-check` asserts stylesheet-to-emitter
(every CSS class is emitted), not emitter-to-stylesheet.

## Change

`index.html`: `.desk-card__live { font-size: .8rem; opacity: .75; font-variant-numeric: tabular-nums; }` and `.desk-card__live:empty { display: none; }`,
so the clock is set like the status line it sits under and an empty node takes no line (the forecast node's own rule, for the same reason).

`scripts/live-score-render-check.mjs` now reads computed style: the clock's font size and opacity equal the status line's, it uses
tabular figures, and an empty node is `display: none`. Red first, against the page before the CSS: `liveFont 15px`, `liveOpacity 1`,
`liveDisplay block`, two checks red. Two table entries (`live-note-has-no-style`, `live-note-empty-takes-a-line`) break each rule and are
caught; the harness reassembles `public/` for an `index.html` mutation.

Looked at, not only measured: a pinned EPL card told `LiveNow(1, 0, 34')` renders `1–0`, `In progress`, `34'` with the minute in the status
line's own type (screenshot read on 2026-11-11, not committed; the drama bars under it are a leftover of forcing a finalised fixture into
play and never appear on a card that is live).

Checks on the built tree: `live-score-render-check` 32 of 32, `check:design-tokens` 25, `check:typography` 22, `check:computed-chrome` 25,
`check:palette` 35, `check:mutation-anchors` 0 stale.
