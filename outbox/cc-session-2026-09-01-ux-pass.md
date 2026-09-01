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
