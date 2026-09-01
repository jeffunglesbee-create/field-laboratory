# UX pass: five findings, each with a check that fails without it

2026-09-01. Follows `c5ec179` (device affordances). Every item below was
measured in the source before it was filed; two candidates were retracted when
the measurement contradicted them, and those are recorded too.

## 1. A failure could not be made to look like a failure

`report` (`Program.fs`) wrote `textContent` and nothing else, so

```
FETCH FAILED: …      DECODE FAILED: …      schedule unavailable — …
```

rendered exactly like `decoding…`.

**The CSS could not have fixed it alone, and that is the interesting part.**
`.meta` carried `opacity: .65` on the CONTAINER. Opacity composites the whole
subtree, so a child styled `color: var(--red)` still paints at 65% — a red that
is not red. The container was the mechanism. The dimming moved to per-line
`color: var(--dim-text)`, which has no such ceiling, before any state class
could bite.

### Three states, and the middle one is the point

`ok`, `warn`, `failed`. `warn` exists because the fallback path folds

> " — live slate unreachable (…), showing committed capture"

into the middle of an otherwise successful sentence, at the same weight as the
game count. That is a page serving a committed capture while looking like it is
serving today's slate — the precise thing this repo exists to catch, rendered as
though it were routine.

### The state is set on EVERY write

Not only on failure. A line that recovers has to lose its marker, or the first
error of a session paints it red for the rest of the session: a stale status
wearing a live one's clothes.

## The check reads the BUILD, not the F#

`build/Program.js` is what the browser runs. Fable inlines and renames, and a
routing that reads correctly in source is not thereby present in the artifact.
This is the repo's own probe-first rule applied to its own compiler: *is this
the source, or a copy of the source?*

It paid immediately. The first version asserted routing by text proximity — the
failure literal must sit near a `reportFailed` call — and it reported the
fallback note as UNROUTED. The code was correct:

```js
(note === "" ? report : reportWarn)("decode-status")(…)
```

The note is built inside the fallback promise and consumed far from its literal.
Correct code, wrong instrument — the same shape as reading `$?` after a pipe
earlier in this session. Proximity was replaced with a use count: a reporter
defined and never called reads 1, and each call adds one. No distance defeats
it and deletion still fails it.

### Mutations

| mutation | result |
|---|---|
| `FETCH FAILED` back to plain `report` | 9/11 |
| drop the `warn` branch | 10/11 |
| set the state only on failure | 10/11 |
| restore `.meta` container opacity | 10/11 |
| `failed` rule styled by weight, not colour | 10/11 |
| drop `role="status"` | 10/11 |

11/11 restored. Wired as `check:status-state` in `verify.yml`, after the build
step it depends on.

## Two candidates retracted before filing

**`.pk-chip` colour-only state.** Six states differing only in `color`, all on
one background, with `--quiet` used for both `none` and `drawn` — this looked
like a WCAG 1.4.1 violation. `PickemView.fs` settles it: every chip carries its
state as text (`NO PICK`, `PENDING`, `LIVE`, `DRAWN`, `CORRECT`, `WRONG`).
Colour is redundant reinforcement, which is what 1.4.1 asks for.

**The back button.** I read `pushState` with no handler and called it a trap.
`Program.fs` wires `popstate`. Wrong on first read, corrected by grep.


## 2. The tab is now in the URL, and two of my own tests had no teeth

`pushState` carried only `date` and `simulate`. A surface was not linkable, was
lost on reload, and a Back press moved the slate while the tab strip stayed put.

### Route.fs, and why it is not in Program.fs

The URL grammar moved to its own module. `Program.fs` is an entry point that
calls `start ()` at module level, so anything importing it in Node runs the whole
app against a `document` that is not there — and the fsproj already says so, in a
comment above `Suite.fs`:

> Below Program.fs because nothing imports them; `node build/VerifyMain.js` is a
> second entry, and it must not pull in Program's browser side effects.

So the choice was a separate module or logic testable only through a browser.

### `replaceState`, not `pushState`

Arrow keys move selection on every press. Pushing would put seven entries in
history for one sweep of the tab strip and leave Back unable to reach the
previous **date**, which is the only navigation on this page a reader means. The
tab is view state: addressable, not a step.

### The rules, each of which the obvious implementation gets wrong

`sprintf "?date=%s&tab=%s"` is correct on the case in front of you and wrong on
four others, so every MustFail in the suite is the rebuilt-query answer:

| rule | what rebuilding does |
|---|---|
| preserve, never rebuild | drops `data=`, silently unpinning a committed capture on reload |
| never ADD `date` | stamps today into a shared link, so tomorrow it shows yesterday |
| default surface omitted | gives one destination two spellings |
| empty query returns `""`, not `"?"` | `replaceState` with `""` resolves to the CURRENT url, so the last parameter never clears |

Ten cases in `Suite.fs`. Suite went 85/85 to 95/95, and MustFail means each
carries its own counterexample by construction.

### Both browser assertions I wrote were toothless, in different ways

The F# suite cannot see the wiring — whether `select` writes the URL, whether
boot reads it back, whether Back moves both. Seven assertions went into the
existing `tab-check.mjs`. Four mutations, run against a real browser:

| mutation | first run | after fixing the test |
|---|---|---|
| no `applyTabFromUrl` on boot | 34/37 | 34/37 |
| **no re-apply on popstate** | **37/37** | 36/37 |
| `pushState` instead of `replaceState` | 36/37 | 36/37 |
| restore steals focus | 36/37 | 36/37 |

**Version one** used `page.goBack()` between two `page.goto()` urls. That is a
full reload, so the boot's own re-apply handled it and the popstate path was
never entered — a test of the wrong path, passing for the wrong reason.

**Version two** made a same-document entry, and still passed under mutation: it
went back to an entry naming the surface already on screen, so the correct
answer and the stale answer were the same string. Two states collapsed into one,
and the collapsed one never fails. This is the session's recurring defect,
committed by me, inside the test written to catch it.

**Version three** pushes an entry, moves the strip onto it, and only then goes
back — so the strip must actively disagree with the entry being returned to.
That one fails when the handler is removed.

Neither version could have been caught by reading. Both were caught by mutating
and watching the count not move.


## 3 & 4. Date-change behaviour, and four control affordances

**Scroll reset.** Stepping a day left the reader at the same pixel offset inside
a different day's cards — which reads as the page not having responded. One line
in `goTo`, and deliberately NOT on `popstate`: the browser restores scroll for
history navigation, and overriding that throws away the place someone pressed
Back to return to.

**The title.** It never changed. Every open tab read the same string, so three
days of this page side by side were indistinguishable in the tab strip — and
comparing days across tabs is what this page is for. The surface name is read
from the selected button rather than mapped from the slug, so the tab strip
stays the one place a surface is named. A pinned capture is titled
"committed capture", not today's date over an August fixture.

**`.datenav button:focus-visible`** — the one control without it, found by
counting rather than by looking. Four selectors carried the discovery outline;
the primary navigation fell through to the user-agent default. Consistency, not
rescue: that default is visible on this ground.

**`<time datetime>`** on the viewed date, and **`user-select: none`** on the five
control selectors — the other half of `touch-action: manipulation`, where the
second tap highlights a button's label instead of firing it.

### Two more toothless assertions, both caught by mutating

**The `datetime` assertion passed with the attribute never wired.** It ran on
the harness URL, which pins `?data=`, where the element correctly reports
"pinned to a committed capture" and sets no `datetime` — so the check took that
branch every time and never saw the case it was written for. Removing the
`setAttribute` left it at 45/45. Moved to the unpinned page, where the attribute
must match `^\d{4}-\d{2}-\d{2}$`, it drops to 44/45.

**My own check anchored an assertion on a tag name.** `device-chrome-check`
matched `<span id="viewed-date"`, so upgrading that span to a `<time>` was
reported as a regression. The element changed; the property did not. Matching by
id instead, plus a new assertion that it IS a `<time>`, tests the axis that
matters.

### Mutations

| mutation | result |
|---|---|
| remove the scroll reset | 44/45 |
| title never syncs on tab change | 44/45 |
| remove the `datetime` attribute | 44/45 (was 45/45 before the fix) |
| `<time>` back to `<span>` | device-chrome 7/8 |
| controls become selectable text | 42/45 |

45/45 and 8/8 restored.

## Item 5, not done, and why

The always-on `.meta` block was the fifth finding and I said the call was yours.
It is not removed. The error-state work already changed how it reads — the
dimming moved from container `opacity` to per-line `color`, so a finished status
now sits at `--dim-text` while a failure sits at `--red` — and that is the part
that was a defect. Whether "decoded 78 game(s)" should still hold the top of the
viewport once it has served its purpose is a judgement about what this page is
for, and this page is a laboratory whose output is findings. Removing them
because they look like chrome would be a guess dressed as a cleanup.


## A. The axis nobody was measuring

`viewport-overflow-check` visits ten canonical viewports and asserts two things,
both horizontal: nothing spills sideways, and the column count matches the
spec's feature matrix. It proved that while a third of the screen was going
vertically.

Measured across all ten states, the sticky stack — tab bar, date nav, sport
heading, body padding — was a flat 154–168px everywhere:

```
P1 360x780   154px   80.2%        L1  667x375   168px   55.1%   <-- worst
P2 393x852   156px   81.7%        L2  932x430   168px   60.9%
P3 430x932   158px   83.1%        T2 1180x820   168px   79.5%
```

168px of chrome above 207px of content on an iPhone SE in landscape — about one
card. My own arithmetic estimate beforehand was ~132px and ~65%; the measurement
was worse on both counts, which is the argument for measuring.

### The fix, and the reason the first attempt did nothing

Below 500px of viewport HEIGHT the sport heading stops being sticky. Its job is
keeping the sport identifiable while scrolling a long section, and a viewport
this short holds barely one card — there is no long section to lose your place
in. The tab bar and date nav stay: those are controls.

Height, not width, so a tall narrow phone keeps all three.

The first attempt changed nothing. I put the media query with the other media
queries, ninety lines ABOVE `.sport-group__title` — and a media query adds no
specificity, so the plain later rule still won. Measured, not read: the title
was still `sticky` at 667×375 and the content share had not moved off 55.1%.
Moved below the rule it overrides:

```
L1  55.1% -> 64.8%      L2  60.9% -> 69.3%      P1, T2, D1..U1 unchanged
```

### The floor, and the mutation that rewrote the measurement

`CONTENT_FLOOR = 0.60`. Set from measurement: the worst state is now L1 at
64.8%, so the floor sits about five points under it — enough headroom not to
fire on rounding, tight enough that one added sticky layer trips it. One number
rather than a per-viewport ratchet, because a ratchet blesses whatever each
state does today and a floor says what any state must clear.

Two mutations:

| mutation | result |
|---|---|
| revert the short-viewport rule | L1 back to 55.2%, **1/2** |
| make `h1` a fourth sticky layer | **2/2 — no effect** |

The second one is the finding. The measurement summed three NAMED selectors, so
a new sticky layer was invisible to it: a check that enumerates today's chrome
cannot notice tomorrow's, which is the only thing it exists to notice. Rewritten
to FIND sticky and fixed elements, skipping any nested inside one already
counted. Same baselines afterwards — 154px at P1, 132px at L1 — so the rewrite
changed what it can see, not what it measures. The fourth layer now reads 158px
and 57.9%, and fails.

12/12 self-test, 2/2 against the page.
