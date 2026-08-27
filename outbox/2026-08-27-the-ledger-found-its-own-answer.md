# The ledger's "still a gap" assertion found a fixture that had been there all along

**2026-08-27.** `docs/not-observable.txt`, `check:computed-chrome`.

## What closed

`rows:.briefs-stat` — one of three assertions the chrome check could not
exercise. Its `needs` line, written yesterday, said:

> a capture with two or more joined briefs, so `.briefs-stat` renders at all —
> **both committed render fixtures carry `briefs: []`**

That claim was wrong when it was written. `public/data/context-briefs-fixture.json`
carries **five briefs**, and had all along. The corpus existed; the check was
pointed at the wrong one.

## How it was found

Not by looking. By the ledger's **second** assertion failing:

```
FAIL  every gap declared in docs/not-observable.txt is still a gap
      → rows:.briefs-stat is observable now — delete its line in the commit that closed it
```

A ledger that fails only on NEW gaps would have carried this entry
indefinitely while the file that closed it sat three directories away. The
symmetric assertion — *a gap that closes is also a failure* — was written
yesterday on the argument that "an entry nobody removes is how a ledger becomes
decoration." It earned that on its second day.

## What changed

`check:computed-chrome` runs against `context-briefs-fixture` now. It strictly
dominates the fixture it replaces:

| | old (`games-2026-08-09`) | new (`context-briefs-fixture`) |
| --- | --- | --- |
| classes rendered | 66 | **74** |
| state modifiers exercised | 15 | 15 |
| panels | 7 | 7 |
| unexercised assertions | 3 | **2** |

`.briefs-stat` now reports `separated — 22.4px content gap`. 13/13.

## Unblock criteria (Rule 74)

- **Closed:** `rows:.briefs-stat`.
- **Open, needs a capture:** `contrast:sport filter`. The sport-filter contrast
  is measured against a *cloned* sibling because every committed fixture is
  single-sport — `context-briefs-fixture` splits `games` by `regular` /
  `postseason`, not by sport, and all six games are MLB. Unblocked by a capture
  whose slate spans two competitions. Verify: the run prints
  `sport filter: distinguishable via two rendered siblings` rather than
  `via a cloned sibling`.
- **Open, needs a renderer change, not a capture:** `state:.pk-side--none`.
  PickemView emits that modifier on a standalone span, never co-applied with
  `.pk-side`, so no fixture can exercise it. This one is honestly blocked and
  the ledger says so.
