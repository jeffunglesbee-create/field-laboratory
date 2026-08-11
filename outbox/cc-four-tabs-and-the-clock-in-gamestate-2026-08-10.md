# Four tabs live, and the clock hidden inside gameState — 2026-08-10

Three bugs, resolved. The interesting one was not in Pick'em.

## 1. `gameState` read the wall clock, so nothing about it was testable

Adding the placeholder-zeroes fix put a second `DateTimeOffset.UtcNow` inside
`gameState`, next to the `fieldToday ()` the date comparison already used. Both
are ordinary-looking. Together they mean **every assertion about game state was
an assertion about when the test ran.**

That is not a new failure in this repo. It is the one that already produced
false confidence this morning:

> zone-check reported 16/16 while a deliberately broken `UTC-4` implementation
> also passed 11/11, because its one F# assertion was time-dependent.

The fix there was to make `fieldDayAt(instant)` pure. Same fix, same reason.
`gameStateAt (now: DateTimeOffset)` is now the real function and `gameState` is
a one-line wrapper supplying "now" — the only impure entry point.

It was already showing up as friction and I had not noticed. `pickem-check`'s
fixture uses a *future* date so nothing is swept up by the date-passed rule, and
its in-progress game needs a kickoff pinned to 2020. Those contortions exist
because the function reads the clock. They are the symptom.

### The check that became possible

`scripts/state-check.mjs` — seven rows of (game, instant) → expected state,
fixed forever, including:

- an unplayed **0–0 before kickoff** is `Scheduled` (playground's CFL bug)
- **the same fixture after kickoff** is `InProgress` — without this row the rule
  could just be "never live", which is not a fix
- `2026-06-16T03:00Z` is 23:00 on the 15th in New York, so a game dated the 15th
  is **still in progress**, not Final

Then four *wrong* implementations, written out and **run against the same
table**:

| wrong rule | what it is |
| --- | --- |
| `score-presence` | playground's `gameStatus`, and laboratory's own shape until today |
| `never-live` | over-correcting: anything unfinalized is unstarted |
| `finalized-only` | trusting `finalized_at` alone — the bug that rendered May AFL games as "In progress" in August |
| `utc-date` | the date comparison in UTC rather than ET |

Each must be caught by at least one row, or the row naming it is decoration.
All four are. 11/11.

This is the piece that could not exist before: a table of expectations proves
nothing unless a wrong answer would fail it, and a wrong answer cannot be
demonstrated against a function that consults the clock.

## 2. The deployed-page check asserted three tabs

`live-tabs-check.mjs` was written when there were three, and used a bare
`[role="tab"]` selector — which now also matches Pick'em's sport chips, so it
would have reported six tabs against a four-tab page. Scoped to `.tabs` and
updated to four, plus assertions that the Pick'em panel renders its identity and
its legend on the live artifact.

Worth noting this is the **third** check this week whose assumptions a new
feature invalidated: nav-check knew one relay route, tab-check used a global
role selector, live-tabs-check counted three tabs. Each was correct when
written. None was wrong about the feature it tested.

## 3. Keyboard support that worked exactly once

The sport chips got arrow keys — and the first version passed a single
ArrowRight and failed `End`. Cause: `render` rebuilds the panel, which destroys
the focused element, so the second keypress went to `body`.

That is the sharper version of the bug the chips were added to fix. They already
carried `role="tab"` and `aria-selected` and responded to clicks only — a
tablist in appearance, a row of buttons in use. Half-adding keyboard support
would have looked like a fix in a screenshot and been unusable on the second
press.

Fixed by re-focusing the selected chip after each re-render. The check now
presses ArrowRight *and* End, because one press proves nothing about the second.

## Verification

| | |
| --- | --- |
| `check:state` — fixed instants + four wrong implementations | 11/11 |
| `check:pickem` — now including chip keyboard nav | 24/24 |
| `check:tabs` | 20/20 |
| build warnings | zero |
| confidence gate | 190/190, 15 rows |

Deployed-page confirmation runs on a runner after deploy — `live-check.yml`
fires on `workflow_run` from `deploy`, and the sandbox cannot reach
`*.workers.dev`. Reported when it lands rather than assumed here.
