# Task 0.2 answered — from committed captures, and the blocker was never real

**Date:** 2026-09-21
**CC-CMD:** `docs/CC-CMD-2026-09-11-spread-total-model.md`, Task 0.2 and 0.3
**New:** `scripts/odds-shape-census.mjs`, `scripts/mutate-odds-shape-census.mjs`,
`.github/workflows/odds-shape-census.yml`

## The premise that was false, and who repeated it

The CC-CMD's status block says:

> Tasks 0.2 and 0.3 need live data: **no committed capture holds a single
> `spread` or `total` key**, and the sandbox cannot reach the worker, so both
> need a runner.

Three of the four committed captures hold both keys.

| capture | `spread` | `total` |
|---|---|---|
| `data/context-2026-05-15.json` | 0 | 0 (no odds snapshots at all) |
| `data/games-2026-08-09.json` | **4** | **4** |
| `data/context-2026-08-29.json` | **18** | **18** |
| `data/context-2026-09-05.json` | **14** | **14** |

One command against `data/` refutes it. I did not run that command. I repeated
the claim in `outbox/cc-session-2026-09-20-odds-coverage-census.md`, in
`outbox/2026-09-21-first-live-coverage-reading.md`, and in two commit messages —
each time as a settled fact about why a task was blocked. Both outbox files and
the CC-CMD now carry the correction.

This is Rule 100's corollary exactly: believing an untested premise costs
nothing; **publishing it** converts a private guess into something a reader has
to un-learn. And Rule 72 — an inherited claim that influences a build decision
must be verified before acting on it. The decision it influenced was "this needs
a runner", four times.

## The shapes, verbatim

Read from the raw payload, not through the compiled decoders. A decoder is a
model, and anything it cannot express is gone before you look.

### `spread` — two shapes, MLB only in every capture

```
30×  {away,awayPrice,home,homePrice}
     {"home":-1.5,"away":1.5,"homePrice":169,"awayPrice":-207}   2026-08-29
     {"home":1.5,"away":-1.5,"homePrice":-157,"awayPrice":130}   2026-09-05

 6×  {away,home}
     {"home":-1.5,"away":1.5}                                    2026-08-09, 2026-08-29
```

The priced and unpriced forms coexist **in the same capture** — 2026-08-29 has
16 of the first and 2 of the second. A model handling only the priced shape
would render the other silently wrong.

Every observed `home`/`away` pair is a balanced handicap (`-1.5` / `1.5`). No
unbalanced pair has been observed; that does not mean one cannot arrive, which
is the whole argument for modelling it.

### `total` — one shape, and `over` always equals `under`

```
36×  {over,under}
     {"over":8,"under":8}       2026-09-05
     {"over":8.5,"under":8.5}   2026-08-09
     {"over":7.5,"under":7.5}   2026-08-29
```

**`over === under` in every sample across all three captures.** The wire carries
one line as a redundant pair. `TwoNumbers` — a genuine over/under split — has
never been observed in a committed capture. The existing `OneLine` /
`TwoNumbers` union is therefore modelling a case nobody has seen, which is the
correct decision for exactly the reason `docs/ODDS-PROOF.md` already gives: the
alternative is a card rendering something quietly wrong the first time it
arrives.

### `moneyline` — the control, and it confirms the three-way finding

```
76×  {away,draw,home}   EPL, La Liga, Ligue 1, MLS, Serie A
34×  {away,home}        MLB
```

### Every key any odds snapshot carries

```
source  captured_at  _oddsProof  moneyline  spread  total
```

`moneyline` is on 100% of snapshots; `spread` and `total` on 29% (2026-09-05),
31% (2026-08-29), 100% (2026-08-09, an MLB-only capture). Stated with the
denominator because a bare percentage is not a finding.

## Coverage, per the tool's own output

```
2026-08-09   4 of  4 snapshots on   2 rows
2026-08-29  18 of 58 snapshots on  78 rows
2026-09-05  14 of 48 snapshots on 126 rows
2026-05-15   0 of  0 snapshots on   2 rows
```

Rule 91: every count is printed beside its denominator, in the tool's own
output, not reconstructed here.

## Teeth

`mutate-odds-shape-census.mjs`, **7 of 7 caught**:

| mutation | what it breaks |
|---|---|
| C1 | an unparseable payload reads as absent |
| C2 | distinct shapes merge into one group |
| C3 | the key set stops being sorted |
| C4 | rows with no odds leave the denominator |
| C5 | an unreadable snapshot counts as one that was read |
| C6 | a field absent from the slate reports nothing at all |
| C7 | `null` and `{}` become the same shape |

`C1` is the one to keep: without it, "no `spread` on this slate" and "the
payload did not parse" become the same sentence — which is the same substitution
as the premise this document corrects.

## Verification

| check | result |
|---|---|
| `odds-shape-census.mjs --self-test` | **17/17** |
| `mutate-odds-shape-census.mjs` | **7/7 caught** |
| run against all four committed captures | shapes above, no errors |
| `check:workflows` | 9/9 |
| `check:script-orphans` | 3/3 |
| `check:citations` | PASS |

## Still open

- **Task 0.3, second fresh date.** One live date is recorded (2026-09-20, via
  drift-sentinel run 35552589334). `odds-shape-census.yml` is dispatch-only and
  takes a `dates` input, so a second is one dispatch away. It is NOT on a cron:
  this answers a question rather than watching for a regression, and the
  per-sport coverage census already runs daily in the sentinel.
- **Task 1** — modelling `spread` and `total` as F# unions from these shapes.
  Not started. The shapes above are its input; the degenerate cases it must also
  cover (absent side, unbalanced pair, zero line, missing price) are named in
  the CC-CMD and none of them appear in any capture, which is the argument for
  modelling them rather than against it.
