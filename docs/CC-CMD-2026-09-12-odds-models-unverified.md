# CC-CMD-2026-09-12 — the odds models are the laboratory's best work and the Verify tab does not show them

Raised while answering "is the full odds package available in laboratory?" The
answer turned out to be that laboratory is **ahead** of the client on odds — and
that none of the work proving it is in the tab built to prove things.

**Status:** FILED, not started. No `outbox/` record exists. Task 0's own probe
re-run at HEAD 2026-09-20 still holds: `grep -cE
"twoWay|threeWay|awayComplement|devig" src/Suite.fs` returns 4 (both are the
`Units.devig` checks) and `grep -c winProbabilityKindFor src/Suite.fs` returns 0.

## What exists, and what the suite covers

| model | where | Verify checks |
|---|---|---|
| `Units.devig` | `Units.fs:85` | **2** (`Suite.fs:162,170`) |
| `Market.twoWay` / `threeWay` smart constructors | `Market.fs:56,59` | **0** |
| `Market.awayComplement` — TwoWay-only | `Market.fs:72` | **0** |
| `Market.devigThreeWay` | `Market.fs:79` | **0** |
| `Desk.WinProbability` — 4 cases incl. `ThreeWayDrawMissing` | `Desk.fs:1384` | **0** |
| `Desk.OddsStory` — 5 branches | `Desk.fs:1324` | **0** |

Counted 2026-09-12: `grep -cE "twoWay\|threeWay\|awayComplement\|devig" src/Suite.fs`
returns 4, and all four are the two `Units.devig` checks.

## The sharpest instance

`Desk.fs` declares:

```fsharp
/// Test-facing derivation: 0 stands for an absent price (0 is not a valid
/// moneyline, so it cannot collide with a real one).
let winProbabilityKindFor (isSoccer: bool) (homeML: int) (drawML: int) (awayML: int) : string =
```

`winProbabilityKindFor` exists **solely** so a test can name the four
`WinProbability` shapes without knowing the DU layout. `grep -c
winProbabilityKindFor src/Suite.fs` returns **0**. A function built for tests,
with no test.

## Why this matters more here than it would elsewhere

These are not incidental helpers. `Market.fs` carries the laboratory's central
claim, stated in its own comment at `Desk.fs`:

> *"The FIELD app computes a win-probability away side as `1 - homeWP` — the
> two-way complement — which on a three-way (soccer) market folds the draw into
> away. Here that mistake is unrepresentable."*

And `OddsStory` found a live defect in jubilant-bassoon on 2026-09-12: the
client's movement line fires its sequence guard only on EQUAL timestamps, so an
absent timestamp or a closing captured before the opening one still produces
"unchanged from open" — the 2026-08-09 `ODDS-PROOF.md` defect. Filed as
`jubilant-bassoon docs/CC-CMD-2026-09-12-odds-movement-sequence-discipline.md`.

The type system genuinely carries these guarantees — a wrong `awayComplement`
does not compile. That is stronger than a test. But the Verify tab is how this
repo *demonstrates* its claims to a reader, and right now the models with the
best claims are the ones with nothing to show.

## Tasks

0. **Probe.** Re-count at HEAD rather than trusting this table; `Suite.fs` moves.
   Print the count with its denominator (Rule 91).
1. **`OddsStory` — all five branches.** `NoPrices`, `SingleSnapshot`,
   `NotASequence`, `Unmoved`, `Moved`. `NotASequence` needs three fixtures, not
   one: equal timestamps, absent timestamps, and closing-before-opening. The
   third is the case that actually occurred in production.
2. **`WinProbability` — all four cases**, via `winProbabilityKindFor`, which was
   written for exactly this and never used. `ThreeWayDrawMissing` is the one
   worth a comment: it is the client's bug, named.
3. **`Market` — the refusals, not just the successes.** A `twoWay` that does not
   sum to 1 must return `None`. The absence of a `ThreeWay` `awayComplement` is
   the point of the module and cannot be tested at runtime — state that in a
   comment beside the checks rather than leaving a reader to wonder why it is
   missing.
4. **Mutation (Rule 90).** Each new check must be shown to fail: widen `SUM_EPS`
   until an un-normalised set passes, invert the `ct > ot` comparison, and make
   `ThreeWayDrawMissing` fall back to two-way. A check that has only ever passed
   has proven nothing.
5. **Done condition.** The Verify tab renders the new rows, and the suite count
   in `HANDOFF.md` moves by exactly the number added.

## Out of scope

Building a movement RENDER on the laboratory's own cards. `oddsStory` is already
computed; whether the laboratory should also display it is a separate question
and not a prerequisite for testing it.
