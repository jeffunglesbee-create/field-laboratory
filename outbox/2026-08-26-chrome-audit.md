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

---

# Follow-up: the check that found four defects was itself on the wrong rung

**Same night.** `scripts/computed-chrome-check.mjs` added; `chrome-check.mjs`
narrowed to one claim and renamed `glyph-check.mjs`.

## The argument

`chrome-check.mjs` read the stylesheet as text. To decide whether `.pk-sport--on`
restates `.pk-sport`, a source-level check has to **model the cascade** — which
classes land on the same element, in what order, at what specificity. It modelled
it from the F# and got `.pk-side--none` wrong.

This repo had already written the principle down, in `separation-check.mjs`'s
header, one day earlier:

> "I added CSS" is not evidence. A stylesheet can be present, loaded, and do
> nothing — a typo'd selector, a class renamed in F# and not in the CSS, a rule
> overridden later in the cascade. So this measures the rendered result.

So the two cascade-dependent assertions moved to a browser check, and **the
machinery that had to model the runtime was deleted, not patched** —
`baseSelectorOf`, `deadDeclarations`, `coAppliedModifiers` are gone. Co-application
is now a fact read off a rendered element.

## Four defects the rendered check found that the source check could not

```
.st-row--gap  .st-row__flag  .st-card__records  .st-card__gaps
```

No emitter in any `src/*.fs`, no render on any of the seven panels. Plus **two
dangling `.st-badge` / `.st-row__flag` references in the typography-roles
selector list**, left behind when I deleted those rules earlier tonight — a
rules-only scan never looked at them.

**A claim I made here and had to withdraw the same night.** This section first
said `.st-row--gap`'s intent was "real and not dropped" and called it a pending
`StatsView.fs` change. I took that from the CSS comment the rules carried and
never checked it against the F# — Rule 72, an inherited claim acted on as fact.

`StatsView.fs`'s own header says the opposite, and has since it was written:

> **NOTHING IS UNRESOLVED.** Production drops the PARK row entirely when the
> lookup returns null, so two of seven games showed no park line and nothing said
> which. The first version here marked such rows "unresolved", which was better
> and still wrong: a report that asserts five rows and can fill one is a report
> about the wrong subject. **Every row is now built from a field this payload
> carries, and `Row` has no unresolved case to build.**

`Row` is a four-case DU — `ParkRow`, `UmpireRow`, `PitcherRow`, `RecordsRow` —
with no unresolved case. The state is **unrepresentable**, which is a stronger
answer than marking it.

So the rules were not waiting for a feature. They **outlived a design that was
deliberately replaced**, and deleting them was more correct than I knew when I
did it.

## Three times this check was wrong before it was right

Each is in the file's comments at the point it happened.

**1. It read zero classes and passed 5/5.** `if (r.cssRules)` is the obvious
grouping-rule test and it is wrong: modern Chromium gives every `CSSStyleRule` a
`cssRules` list for nested CSS, and an empty `CSSRuleList` is truthy — so it
matched every style rule, recursed into nothing, and skipped every selector. Now
carries the assertion that would have caught it: *the stylesheet parsed into
classes*, `> 20`, plus *there are state modifiers to exercise*.

**2. It measured detachment, not styling.** The state probe held a handle to a
`.pk-sport`, clicked it, and diffed computed style. All six properties "moved" on
every run — because the click re-renders the panel and the handle's node is left
disconnected, and `getComputedStyle` on a detached element returns `''` for
everything. Measured directly: `isConnected` false after the click, every
property `''`. **The check passed for a reason unrelated to the CSS.**

Replaced with a comparison of two elements on screen **at the same moment**, one
in each state. No before/after to get wrong. Where the fixture renders only one
(no `data/` fixture carries more than one sport, so the filter row has exactly
one chip, on by default) it clones the live element, strips the modifier, and
inserts the clone as a real sibling — sound **only because co-application is
observed**: the element really does carry both classes.

**3. One assertion could not see the defect it was written for.** Restoring
`.pk-sport--on`'s dead `background` and `border-color` left the state still
*visible* — the text colour moves — so the contrast passed.

That is the honest limit of the bottom rung, and it split the check in two:

| | question | evidence |
|---|---|---|
| contrast | is the state **visible**? | two live siblings, one per state |
| claim | does it **make every change it declares**? | declared properties vs measured delta, only for modifiers **observed** co-applied |

`.pk-side--none` fails the second question and is **correctly not a failure** —
it is observed standalone, so it is reported and skipped. That is the original
false positive, resolved by observation instead of exemption.

## Why `chrome-check.mjs` became `glyph-check.mjs`

What survived is one genuinely textual claim: a pictograph in a source string,
catchable before the build. A checker called "chrome-check" that checks one glyph
is a name that disagrees with its own measurement — the defect class this session
kept finding. The name moved with the scope.

## Proof

Four mutations, each restoring a defect and each caught:

```
dead state declarations restored  FAIL  .pk-sport--on declares background-color,
                                        border-*-color — none of which moves
rail restored                     FAIL  pick-leader (left)
a rule nothing emits added        FAIL  .st-ghost — in no rendered page and no view source
the cssRules walk broken          FAIL  0 class(es) — everything below would pass vacuously
```

The fourth is this check's own first bug, reproduced faithfully and now caught.

Sixteen gates green locally, including both browser checks: glyph,
computed-chrome, import-purity, secrets, citations, palette, typography,
clean-source, sports, docs, workflows, state, unnamed, gate-rows, design-tokens,
separation.

## Unblock criteria (Rule 74)

- **Closed:** the cascade-dependent assertions are measured, not modelled.
- **Open, blocked on nothing:** the sport-filter contrast uses a cloned sibling
  because no fixture has two sports. Verify when one exists:
  `check:computed-chrome` should report `distinguishable via two rendered
  siblings` for both controls instead of one.
- **Closed, and it was never open.** `.st-row--gap`'s intent was recorded above
  as needing a prompt. It does not: `StatsView.fs` deliberately replaced marking
  with a `Row` DU that cannot represent an unresolved row. Verify:
  `grep -n 'type Row' -A 12 src/Stats.fs` shows four cases, none unresolved.
