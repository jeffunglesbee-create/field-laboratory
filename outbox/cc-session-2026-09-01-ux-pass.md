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
