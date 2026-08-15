# Outbox — a broadcast channel number read as a leaked pick score

**Date:** 2026-08-15
**Ships:** `pick-outlets` class in `src/PickView.fs`, narrowed scan in
`scripts/live-tabs-check.mjs`, `scripts/outlet-scan-check.mjs`, one mutation,
one verify step

## What went red

`live-check` failed 12/13 on `b47602c`:

```
FAIL  no bare composite score renders in either pick panel
  → possible score in the DOM: "8.1" near: Nationals.TV, Rays.TV, Reds.TV,
    Marlins.TV, Padres.TV, KFMB 8.1 (CBS), TV Azteca, Twins.TV, ...
```

Not the weather burst — that bound held. `KFMB 8.1 (CBS)` is a real ATSC virtual
channel number, rendered by `PickView` in its "broadcast outlets not in the
registry" paragraph. ADR-002's scan for a leaked composite pick score matched it.

A false positive, but not a trivial one: the guard exists because the relay's
pass reason once carried a composite score *and its threshold* and was rendered
verbatim. Weakening it is how that leak comes back.

## The fix, and the one it deliberately is not

The scan is now narrowed by **provenance**, not by pattern. `PickView` marks the
one paragraph whose text is verbatim third-party data with `pick-outlets`, and
`live-tabs-check` subtracts that element's text before scanning.

The tempting fix — loosen the regex so `8.1` next to letters does not count —
would have made main green and let a genuine `8.1` through everywhere else. The
pattern is unchanged and still strict over every byte laboratory computed.

Subtraction is by exact string, not by building a regex from the outlet name: an
outlet name is arbitrary third-party text and must never be compiled.

## The part worth keeping: the fix's first test was vacuous

`live-tabs-check` went 15/15 locally against `games-2026-08-09.json` — including
the new outlet assertions. That proved nothing. Checked directly:

```
pick-outlets elements: 0
```

The committed capture has **no** unmodelled outlets, so the exclusion path never
ran. A fix whose only evidence is a green run on a page that cannot reach it is
not evidence, and this is the exact shape — "for all X" over an empty set — that
`prose-check` opens by guarding against and that eight drift-check assertions
once passed over a zero-game payload.

So `scripts/outlet-scan-check.mjs` serves a synthetic slate at the network layer
carrying `KFMB 8.1 (CBS)` and asserts the chain on a real DOM:

| # | assertion | why |
|---|---|---|
| 1 | the paragraph renders and carries `pick-outlets` | non-vacuity; the class landed on the right element |
| 2 | **the OLD whole-panel scan really did flag `8.1`** | the bug is reproduced, not assumed |
| 3 | the narrowed scan no longer flags it | the fix works |
| 4 | a score planted outside the outlets is still caught | "exclude everything" would otherwise pass |
| 5 | the pattern and selector match `live-tabs-check`'s | two files testing different things is how a fix passes its own test and fails in production |

Assertion 2 is the one I would have skipped a day ago. Without it the fixture
could fail to reproduce the defect and every later assertion would still pass.

`live-tabs-check` also gained an in-process control — outlet text alone must
match `8.1`, the same text after exclusion must expose a planted `8.7` — so the
exclusion cannot silently neuter the scan on a slate with no outlets.

Teeth measured: with `pick-outlets` removed from `PickView`, `outlet-scan-check`
reports **3/6, exit 1**; restored, **6/6, exit 0**. Registered as mutation
`outlet-class-dropped`.

## What this does not fix

The scan is a heuristic over rendered text and always will be. It cannot tell a
composite score from any other bare decimal that laboratory itself computes and
renders — it can only tell laboratory's text from third-party text. If a future
panel renders a legitimate computed decimal, this fires again, and the answer
will again be to mark that element's provenance rather than to widen the
exemption.
