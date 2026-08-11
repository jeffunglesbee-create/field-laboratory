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

---

## The half-working class, found mechanically

Every guard here has been mutation-tested by hand, in prose, one at a time. That
found real holes — and it is exactly the practice that decays, because a
hand-run mutation is a claim in an outbox and nothing re-runs it.

The recurring failure this session always had one shape: **a check that passes in
one direction.**

| | how it was half-working |
| --- | --- |
| `outboxToday` | passed on any dated file, not on a documented commit |
| `zone-check` | 16/16 while a broken `UTC-4` build also passed 11/11 |
| `outboxAccompaniesSource` | the PASS direction was never run; it ate a character |
| `gate-inventory` standalone | tested fixtures, never the real files |
| sport chips | arrow keys worked once, then focus was destroyed |

Each was found by someone noticing. `scripts/mutation-check.mjs` asks it
mechanically: break the source on purpose, and see whether **any** check
objects. A mutation that survives is a claim nothing defends — the general form
of every row above.

Eleven mutations, each naming an invariant and the check meant to catch it.
Where the compiler refuses the mutation outright, that is reported as the
stronger result: the invariant is enforced by the type system rather than by a
test.

### It found one on its first run

`gate-unanswerable` **survived**. Rewriting Scout's Gate C to say
`DoesNotQualify "no stat anomaly"` instead of `Unanswerable` — the exact bug the
whole `GateAnswer` type exists to prevent — and every check still passed.

The reason is the same shape as the rest of the table. `tab-check` asserted:

```js
/cannot tell/i.test(scoutText)
```

against the **whole panel**. Gates B and D still said "cannot tell", so the
assertion held while Gate C lied. It tested that *some* gate reported honestly,
which is true of a panel where two out of three do.

Now each gate is asserted individually, by name, with the data it says it needs
— and the other direction too: Gates 0 and A, which this payload *can* answer,
must give a real answer and must not retreat to "cannot tell". Without that
second half, "make everything unanswerable" would satisfy every assertion.

### Killing one hole is not closing the class

After fixing Gate C, mutations for **B and D** were added — the siblings the fix
was not written against — plus `gate-goes-quiet` for the opposite direction. All
three are killed by the same fix, which is the evidence that it was a fix rather
than a patch.

11/11.

### What it does not do

It is not a mutation testing framework. The mutations are hand-written and named,
not generated, so it proves things about the invariants someone thought to list
and nothing about the ones they did not. It is a floor, not a proof.

Cost is real: one Fable build per mutation. It is `skipQuick` in the gate and a
separate step in `verify`.

---

## All four tabs are live — and the same run found an ADR-002 leak

`live-check` on the deployed artifact, run `31448713152`, commit `69f02ef`:

```
PASS  the deployed page has all four tabs
PASS  all three pick tabs are among them
PASS  exactly one panel is visible on load
PASS  the Field's Pick panel becomes visible and renders
PASS  the Scout's Pick panel becomes visible and renders
PASS  the two panels still contradict each other on national broadcasts
PASS  each panel still names the other
FAIL  no bare composite score renders in either pick panel
PASS  the Pick'em panel renders and says whose opinion it is
PASS  the Pick'em legend explains its two numbers
PASS  no page errors on the deployed artifact
```

**The four tabs are confirmed on the live page.** That was the question, and the
answer is yes.

The failure is the more important result.

### What the relay actually sent

```
Passed on tonight — top game scored 1.0 — under the 3.0 watch-bar
```

That is a raw composite score **and the threshold it was compared against**, in
free text, rendered to the user. ADR-002 PROHIBITED #3, severity CRITICAL — the
prohibition the 2026-07-07 push/pull re-analysis explicitly did *not* relax.

`SealedRank` sealed the numbers on the ranked entries. This sentence carried the
same class of value past that seal **as a string**, through a field I had typed
as plain `string` because a "reason" sounded like prose. A seal on one field is
not a seal on the value.

### Why it was caught

`docs/PICK-PROOF.md` says, under "What this does NOT prove":

> It does not prove the number never reaches the DOM by another route. The seal
> stops the F# path. … That is why `scripts/tab-check.mjs` asserts, in a real
> browser, that the string `3.5` appears nowhere in `document.body`. Two
> independent checks, because either alone is satisfiable while wrong.

Written this evening, as a caveat. It found a real leak within hours, by a route
I had not imagined — not a renderer reaching around the type, but upstream text
containing the value. The caveat was right for the wrong reason, which is the
best case for a caveat.

Worth being exact about the credit: the compiler proof was intact the whole
time and still is. It never claimed to cover this.

### The fix

`PassReason` is now a private single-case DU, and the type is shaped around the
awkward truth that free text cannot be judged safe field by field:

```fsharp
type PassReason = private PassReason of string

/// Report upstream drift. Never used to decide whether to render.
let passReasonCarriesNumber (PassReason raw) = raw |> Seq.exists Char.IsDigit

/// The only renderable form. None of the relay's sentence survives.
let passReasonText (_: PassReason) = "Passed on tonight — no game cleared the bar."
```

A caller can **ask whether the text is dangerous without being able to print
it** — detection without a rendering path, which is what a drift check needs and
a view must not have.

`passReasonText` ignores its argument entirely. That is deliberate and it is the
whole design: any function that inspected the string to decide what was safe
would be a filter, and a filter is a promise about text nobody controls.

Checked in both directions on the live string: it is detectable as carrying a
number, nothing of it is renderable, and a *harmless* reason renders identically
— so the safe path never depends on judging which free text is safe.

Mutation `pass-reason-leak` restores the old behaviour and dies to `pick-check`.
12 mutations, all killed.

### Still open, and it is not mine

The relay is emitting a prohibited value. Sealing it here stops laboratory
displaying it and does nothing about the source, or about any other client
rendering `bundle.pick.reason` verbatim today. `passReasonCarriesNumber` exists
so that can be reported rather than silently absorbed — wiring it into the drift
sentinel is the obvious next step and is not done yet.
