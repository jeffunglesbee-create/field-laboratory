# The census cost two gate rows 30 points each, and the gate said so precisely

**Date:** 2026-09-20
**Fix:** `scripts/drift-check.mjs` — the series timestamp is now one top-level
`PROBED_AT`, read once.

## What was red

`verify` step 57, `npm run check:rows`:

```
70/100  (weight 30)  decoders accept both real captures
70/100  (weight 20)  decoders still REJECT the corrupted fixture

  scripts/drift-check.mjs: reads the clock 1x (capture it once as NOW)
```

70 = teeth present, determinism absent. Both rows invoke `drift-check.mjs`, and
the odds-coverage census added

```js
const today = { date: …, source, at: new Date().toISOString(), sports: coverage }
```

inside the census block — an inline clock read, not captured into a top-level
constant.

## Why the rule exists, and why this is a real fix rather than gate appeasement

`row-confidence.mjs` scores determinism because CI run 31456294086 failed when
`outboxToday` called `fieldDay()` at row-evaluation time and the run crossed
midnight ET: the row asked about a different day than the one it started in.
The rule it settled on is shape, not vocabulary — capture the instant once into
a top-level constant, then be pure.

`drift-check` replays several captures in one CI step. Reading the clock inside
the per-payload block means two readings written in the same run can carry
timestamps either side of a boundary, and the series is a dated history the
transition alarm reads by date. Nothing here needs the instant twice.

## An error worth recording, because it is the same class twice in one hour

The first attempt at this edit failed its own assertion. The comment I was
inserting **contained the literal string being replaced** —
`` `at: new Date().toISOString()` `` — so the match count went from 1 to 2 and
the guarded `replace` refused.

That is the documentation-read-as-code shape `row-confidence.mjs`'s own comments
describe twice: its first version flagged `drift-check.mjs` as reaching the
network because a usage comment shows a `--url https://…` example, and
`workflow-check` once read the comment explaining why a step was absent as the
step itself. Mine was the authoring side of the same confusion.

## Verification

| check | before | after |
|---|---|---|
| `check:rows` | 21/23 rows ≥ 95, FAIL | **23/23, PASS** |
| `drift-check --file context-2026-05-15` | 13/13 | 13/13 |
| `drift-check --file games-2026-08-09` | 13/13 | 13/13 |
| `drift-check --file malformed-nested` | exit 1 | exit 1 |
| `--seed` round trip | — | 11 sports written, series restored |
| gate-rows, ceiling, import-purity, short-circuit, script-orphans | — | all PASS |

**The determinism scan proved its own teeth here without a harness.** It went
red on a genuine inline clock read introduced hours earlier, named the file and
the count, and went green on the capture. That is a mutation the session
performed by accident and the check caught on its first opportunity to run.
