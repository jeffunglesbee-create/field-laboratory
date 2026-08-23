# Every verifier must prove it can fail — 2026-08-23

## The correction that produced this

The previous two builds each shipped with a paragraph naming what they did not
solve: *"a verifier that exists, runs, and lies."* That was treated as an
inherent limit needing human judgment.

It is not. It is mechanical, and shipping a guard that documents its own hole is
worse than not shipping it — the hole gets read as accepted rather than open.

## The property every vacuous probe shared

Four instances this month. One property, present in all four:

| instance | why it proved nothing |
|---|---|
| an `n=2` "CONFIRMED" reaching an outbox | never shown to fail |
| a 5.4-point gap on `n=16`, reversed at `n=95` | never shown to fail |
| the contamination predicate that could never observe a cessation | never shown to fail |
| a staged-claim scanner finding **zero** claims, matching an invented convention | never shown to fail |

**Every one had never been demonstrated to fail on a known-bad input.** Each was
caught by a person noticing, days apart, and each was patched alone.

That property is testable. So the gate is mechanical rather than a doctrine
about writing good tests.

## The gate

Every entry in `ASKS` and `LANDED` declares `mustFailOn` — a known-bad payload —
and the self-test asserts the predicate does **not** return `true` for it.

```js
for (const a of [...ASKS, ...LANDED]) {
  const predicate = a.landed ?? a.holds
  check(`${a.cmd}: declares a negative control`, has(a, 'mustFailOn'))
  check(`${a.cmd}: rejects its own negative control`,
    predicate(a.mustFailOn) !== true)
}
```

**A missing `mustFailOn` is itself a failure.** Optional would make it the field
nobody fills in — which is precisely how Rule 74's "exact verify commands" became
prose nobody executed.

The controls are chosen to exercise the **defect path**, not the guard. The
contamination one carries a post-baseline timestamp on purpose: a pre-baseline
brief reads `null` through the gate and would have tested the gate instead of the
predicate.

| ask | negative control |
|---|---|
| quality-coverage-route | `{ok:false, error:'route not found'}` |
| scoring_version projection | a result row without the field |
| closing-odds (surviving) | soccer served, `opening_odds: null` — the pre-fix condition |
| soccer-three-way-odds | a two-way MLS moneyline, what the relay serves today |
| brief-contamination | a post-baseline brief carrying the DRTG defect |
| quality-bar-scale | `below_240` with no denominator |

## Negative-tested, twice, because a gate is a verifier too

The same rule applies to itself. Both mutations were run and both were caught:

```
vacuous predicate  (landed: () => true)
  FAIL  quality-coverage-route: rejects its own negative control      40/42

missing control    (mustFailOn deleted)
  FAIL  quality-coverage-route (second ask): declares a negative control  38/41
```

Restored: **42/42**.

## What is now closed

The three failure kinds this month's staged items produced:

- **A — unblock is a future event, nothing re-evaluates.** Closed by registration
  in `cc-cmd-followup.mjs`, which re-runs every sentinel run.
- **B — verification written and never run.** Closed by `check:staged-verifier`:
  a staged claim must name an executor that exists and is scheduled.
- **C — verification runs and cannot discriminate.** Closed here.

No remaining "what this does not solve" paragraph. If a fourth kind appears, it
is a finding, not a limitation that was known and left standing.
