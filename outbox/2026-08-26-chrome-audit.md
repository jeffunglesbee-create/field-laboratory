# Five chrome defects, four of them shipped for weeks

**2026-08-26.** Ran the `unslop-ui` skill against this repo's `index.html` and
its F# views. Fixes plus `scripts/chrome-check.mjs`, wired into `verify`.

## What the checklist actually caught

Twelve items. Eight were already clean and worth stating, because "we pass" is
only meaningful if the checks could have failed:

- **No icon-in-rounded-square** — there are no icons at all.
- **No serif hero** — Chakra Petch (identity) and DM Sans (body), both sans.
- **No glassmorphism** — no `backdrop-filter` anywhere.
- **No gradients**, and no colour on any shadow. The only `box-shadow` in the
  file is `0 -1px 0 var(--bg), 0 1px 0 var(--edge)` on the sticky sport
  heading — two hairlines that stop card text rendering through it, load-bearing
  and documented as such.
- **No entrance or hover animations.** Not one `transition`, not one
  `@keyframes`.
- **No floating chat bubble.**
- **Dark-theme elevation over coloured borders** — `--bg #060514`, `--card
  #0b0920`, `--card2 #0e0c24`, which is exactly the shade-shift the rule asks
  for.

Four found, and a fifth the guard found on its own first run.

## 1. A coloured rail on a rounded box

```css
.pick-leader {
  border: 1px solid var(--edge); border-left: 3px solid var(--discovery); border-radius: 10px;
}
```

The checklist names this shape by hand. The rail's ends are cut by the 10px
radius, so it reads as a rendering accident rather than an accent — and it was
decoration: `.pick-leader` is the only boxed item in that panel (the chasers
below it are bare rows with a bottom rule), so the card boundary already says
which one is the leader, and `.pick-leader__matchup` is `1.05rem` against their
`.86rem`. Rail removed; it now carries the same boundary as every other card in
the file.

## 2. A state that declared three changes and made one

```css
.pk-sport    { color: var(--dim);  background: var(--card2); border: 1px solid var(--edge) }
.pk-sport--on{ color: var(--text); background: var(--card2); border-color: var(--edge) }
```

`background` and `border-color` are **the values the base rule already sets**. A
sport filter that was ON differed by nothing but `dim → text`, while the CSS
read as though the whole chip changed.

**This is the defect class this project keeps finding, in a new medium.** It is
the CSS form of the import assertion whose name said "imports the rule" and
whose match measured "imports exactly one name", and of `opening_odds` holding
odds that are not opening. Twelfth instance this session.

Also `.pk-side--chosen` (dead `background`) and `.pk-side:hover` (dead
`border-color`). `--on` now uses the accent border `.pk-side--chosen` already
uses for the same idea, so the state is visible and the CSS is honest about it.

## 3. A pictograph as a visual asset

`PickView.fs:78` prefixed the tie note with `⚖`. The note already says there is
a tie. Removed.

**Arrows are deliberately not touched.** `←` and `→` label the date-nav buttons
and ARE those controls' content, not decoration on top of it. The check allows
U+2190–21FF and forbids Miscellaneous Symbols, Dingbats and the emoji planes.

## 4. Two rules nothing has ever rendered

`.st-badge` and `.st-badge--watch`. Grepped `src/`, `build/`, `scripts/`,
`test/` and every JSON: `st-badge` appears **only** in the stylesheet. Deleted
(Rule 63 — every rule needs a consumer).

## 5. The guard's own false positive, and the fix

Its first live run flagged `.pk-side--none` for restating `.pk-side`'s `color`
and `white-space`. **Wrong.** `PickemView.fs:88` emits
`el "span" "pk-side--none"` — a **standalone** span that never carries
`pk-side`. Those declarations are the element's only styling; deleting them
would have broken the one case the rule exists for (an event with no sides to
pick between).

So the check now harvests which modifiers are actually **co-applied** — added
via `classList.add`, or listed beside another class in one class string — and
compares only those. A pseudo-class is always co-applied; `:hover` cannot exist
without its element. Standalone modifiers are **reported, not silently
excused**:

```
note: 1 standalone modifier(s) not compared — .pk-side--none (never co-applied with .pk-side in any view)
```

Had I loosened the assertion instead, the check would have stopped seeing the
`.pk-sport--on` case that justified writing it.

## Proof

Self-test **24/24**, including that a rail on a *square* box is fine, that a
longhand restating the colour inside its base's shorthand is dead (the case
that hides), and that arrows pass.

Mutation-tested by putting each defect back, one at a time:

```
rail restored     FAIL  .pick-leader has border-left + border-radius
state restored    FAIL  .pk-sport--on restates .pk-sport's background; ...'s border-color
glyph restored    FAIL  src/PickView.fs: ⚖
```

`dotnet fable` compiles the `PickView.fs` change clean (38 files, 9.3s). Ten
offline gates re-run green: palette, typography, clean-source, sports,
citations, docs, workflows, state, unnamed, gate-rows.

## Not done, and why

- **`check:design-tokens` and the browser gates were not run here** — this
  sandbox has no `node_modules` (`build-site` stops at `solid-js not found`) and
  no browser. `verify` runs both in CI on this push. Not a finding, a sandbox
  limit.
- **Cards carry both an elevated background and a `--edge` border.** The rule
  says not to add borders when background differences already separate
  elements. Here the shift is `#060514 → #0b0920`, which is slight, and
  `separation-check.mjs` already measures separation against the rendered page.
  Changing it is a design decision, not slop removal, so it is reported rather
  than done.
- **Six `.pk-chip--*` variants each declare `background: var(--card2)`**
  separately. Not dead (the base `.pk-chip` sets no background), just repeated.
  Hoisting is a refactor and gets its own commit.

## Unblock criteria (Rule 74)

- **Closed:** the chrome was unchecked. Five defects fixed, three assertions
  mutation-proven, wired into `verify` before the browser gates.
- **Open, blocked on nothing:** unused CSS generally. `.st-badge` was found by
  hand, not by a check — nothing asserts that every class in the stylesheet has
  an emitter. Verify by grepping a class name across `src/` and `build/`; a
  real check needs the built bundle and belongs with `check:unused`.
