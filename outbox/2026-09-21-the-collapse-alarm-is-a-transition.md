# The MLS collapse alarm fires once, not every day

**Date:** 2026-09-21
**Decision:** the coverage alarm is fatal on the **transition** and silent-but-
printed while the condition persists.

## The problem this closes

The collapse rule shipped an hour earlier fires whenever a covered sport is
currently below a third of its rate. MLS at 2/11 (18%) against 18/21 (86%) is
genuinely collapsed, and would have stayed genuinely collapsed tomorrow, and the
day after. 09-20's own reading is itself below the covered floor, so it never
becomes the new baseline — every subsequent run falls back to 09-05 and fires
again.

The sentinel's `Fail if the sentinel failed` step would then fail **every run,
indefinitely**, over a condition nobody in this repo can clear.

That is the exact failure this repo measured yesterday, one workflow over:
`verify` step 25 was red for seven consecutive runs and 43 checks behind it went
unexamined — two of them real, already-shipped defects. A permanently red
sentinel is not a louder alarm. It is a quieter one, because the next genuine
red arrives inside a job that was already failing.

## The rule

A collapse is **new** when the reading immediately before it, by date, still
showed the sport covered. It is **continuing** when that reading was already
below coverage — the fall happened earlier and was reported then.

| state | drift-check | printed |
|---|---|---|
| new | **FAIL** | `ODDS COLLAPSED  MLS: 18/21 (86%) on 2026-09-05, now 2/11 (18%)` |
| continuing | pass | `STILL COLLAPSED  MLS: 18/21 (86%) on 2026-09-05, now 3/12 (25%)` |
| recovered | pass | nothing |

**Recovery re-arms it.** A sport that climbs back above the covered floor and
falls again reports a second, genuinely new collapse. Without that, one collapse
would silence a sport forever — which is the opposite failure and is `O12`.

The condition does not disappear when the alarm goes quiet: the `coverage:` line
prints every run and the drift log carries `cov=` on every row, so MLS at 18%
stays readable as data for as long as it lasts.

This is the same shape as the red-main sentinel (open an issue once, comment
while it persists, close on recovery) and `relay-brief-watch` (self-closing).
The alarm was already described as a transition alarm in its own comments; it
was behaving like a level alarm.

## Replayed against the real numbers

```
=== the day it fell (fatal) ===
NEW — MLS: 18/21 (86%) on 2026-09-05, now 2/11 (18%)

=== the next day at the same level (not fatal) ===
CONTINUING — MLS: 18/21 (86%) on 2026-09-05, now 3/12 (25%)
```

## The harness refused a verdict, correctly

Adding a second loop over `series` gave `O4`'s one-line anchor a second match:

```
FAIL       O4 history stops being ordered by date
            anchor matched 2 times, expected 1 — NOTHING MUTATED.
```

It reported FAIL rather than NOT CAUGHT. That distinction is Rule 90's
corollary working: a mutation that did not mutate must not be allowed to read as
evidence about the code. `O4` is re-anchored across three lines, and `O13` now
covers the loop it was colliding with.

`O13` was then genuinely NOT CAUGHT — no test had a series entry dated **after**
the probe. Re-probing 2026-09-20 once 2026-09-25 is recorded is an ordinary
thing to do, and consulting the later reading would file the collapse as
already-reported on the run that first saw it. Test added; caught.

## Verification

| check | result |
|---|---|
| `odds-coverage.mjs --self-test` | **24/24** (was 19) |
| `mutate-odds-coverage.mjs` | **13 of 13 caught** (was 9) |
| `drift-check --file context-2026-05-15` | 13/13, exit 0 |
| `drift-check --file games-2026-08-09` | 13/13, exit 0 |
| `drift-check --file context-2026-09-05` | 12/13, exit 1 — both still `ODDS COLLAPSED`, correctly: 08-29 had them covered |
| `drift-check --file malformed-nested` | exit 1 |
| workflows, script-orphans, import-purity, short-circuit, rows, staged-outbox | all PASS |

Three mutations added for this change: `O10` (everything reads new — the
sentinel goes red forever), `O11` (everything reads continuing — nothing is ever
fatal), `O12` (a recovery does not re-arm).

## What is still open about MLS itself

The alarm has done its job; the question it raises has not been answered.

**The lead:** 10 of the 11 MLS rows on 2026-09-20 carry `no-start-time`.
Unconfirmed fixtures plausibly go unpriced. **Against it:** on 2026-08-29 MLS
had 7 `no-start-time` rows among 28 and still carried 26 prices, so the shape
alone does not explain the drop.

Settling it needs the relay's own odds-capture records, not this repo's census.
It is a finding about the supply, filed here rather than guessed at.
