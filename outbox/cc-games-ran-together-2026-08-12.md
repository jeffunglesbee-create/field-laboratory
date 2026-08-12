# The games ran together — 2026-08-12

Jeff, looking at the page:

> Games need to be separated/differentiated on the page

They were not, and the cause is plain: **the Stats and Weather panels shipped
with no stylesheet rules at all.**

The scoreboard had `.desk-card` — border, radius, padding, background — from the
first session. `StatsView` and `WeatherView` emit `.st-card`, `.st-row`,
`.wx-row` and a dozen more, and `index.html` styled none of them. Every game
rendered as one column of undifferentiated text.

## What makes this worth an entry rather than a CSS commit

**Every check stayed green through it.** `tab-check` asserts the cards exist and
counts them. `nav-check` asserts no card is rendered twice. `check:live` counts
weather chips. All of those are true of a wall of text.

Two panels, six tabs, twenty-one gate rows, and the thing a person notices in one
second had nothing pointed at it. The suite was measuring structure and never
measured whether the structure was *visible*.

## The check, and why "I added CSS" is not evidence

A stylesheet can be present, loaded, and do nothing: a typo'd selector, a class
renamed in F# and not in the CSS, a rule overridden later in the cascade. So
`separation-check.mjs` measures the rendered result — `getBoundingClientRect` and
`getComputedStyle` on the real elements, with the Stats tab clicked open first,
because a hidden tabpanel reports zero-sized boxes and every assertion would then
pass or fail for the wrong reason.

It asserts two different claims, because separation is two different things:

**Visual.** Consecutive cards have a real gap between their boxes *and* a visible
border of their own *and* a background that differs from the page. The gap is
measured **between** cards rather than on one card, because that is the actual
property — a border with the boxes flush separates nothing.

**Announced.** Each card is a `section` with its own accessible name, and the
names are distinct. A screen reader reads seven games as one run of text unless
each is a named region, and no amount of CSS fixes that. It is a separate set of
assertions rather than an afterthought in the same one.

Measured: 16 px gaps, card `rgb(22, 25, 32)` against page `rgb(15, 17, 21)`.
10/10.

## Two mutations, one per claim

- `cards-run-together` — neutralises the border/padding/background rule in
  `index.html`. Killed.
- `cards-lose-their-names` — drops the `aria-label`. Killed, and it is the one
  that matters: every visual assertion stays green while it is true.

Adding the first exposed a real gap in the harness. `mutation-check` rebuilt only
for `src/`, and `build-site.mjs` **copies** `index.html` into `public/` — so a
stylesheet mutation was invisible to any browser check and would have survived
for a reason with nothing to do with the claim. `index.html` now counts as source
for rebuild purposes.

New gate row at weight 30, not 20: rows from one game reading as another game's
is telling the reader something untrue, not a cosmetic complaint. Twenty-two rows.

CONFIDENCE: 96.

Artifacts: `check:separation` 10/10 with the measured gaps and colours quoted
above; both mutations killed; `check:gate-rows` 7/7 and `check:workflows` 6/6
after the row and step were added; the gate.

Docked four: the measurement is at one viewport, on one capture, with two cards.
Production's screenshot shows seven, and a layout that separates two boxes can
still crowd seven — the gap assertion holds pairwise and says nothing about the
page as a whole. Nothing here has been seen at the deployed page's real width.
