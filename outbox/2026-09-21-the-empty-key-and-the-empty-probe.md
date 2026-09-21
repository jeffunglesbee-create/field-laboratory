# The empty key and the empty probe

2026-09-21. Two absences that were being recorded as zeros, one in the odds
model and one in the sentinel's own history. Same shape, one layer apart.

## 1. `spread: {"home":null,"away":null}` read as "no spread"

`Odds` decodes `SpreadHome: float option` / `SpreadAway: float option` from
`spread.home` / `spread.away`. By the time `spreadOf` ran, whether the `spread`
KEY existed was gone — both shapes arrived as `None, None`:

- the payload carries no `spread` object at all
- the payload carries `spread: {"home": null, "away": null}`

Both returned `Some`-nothing, i.e. `None`. A census of "how many games have no
handicap" could not tell a relay that served nothing from one that served an
empty object.

**Measured, not anticipated.** One row across all four committed captures:

```
context-2026-08-29.json | EPL_2026-08-29_bournemouth_everton | closing_odds | spread | {"home":null,"away":null}
context-2026-08-29.json | EPL_2026-08-29_bournemouth_everton | closing_odds | total  | {"over":null,"under":null}
```

The same game, the same payload, both fields.

### The fix

`Odds` gained two presence flags decoded from the key rather than its contents:

```fsharp
SpreadKeyPresent = (get.Optional.Field "spread" (Decode.succeed true)) |> Option.isSome
TotalKeyPresent  = (get.Optional.Field "total"  (Decode.succeed true)) |> Option.isSome
```

`Spread` gained `EmptySpread`, `TotalLine` gained `EmptyTotal`, and the two
`None, None` branches consult the flag. Both cases were APPENDED — the ordinals
`drift-check.mjs` transcribes are unchanged for every case that already existed.

### The gap found while fixing it

`totalOf` reached its empty case through a `| _ ->` catch-all. With `EmptyTotal`
added, that catch-all would have answered THREE distinct shapes with the last
one: a payload holding `over` and not `under` would have been reported as
carrying neither number — the same collapse, in the opposite direction, created
by the fix for it.

`TotalLine` gained `OneSidedTotal of over * under`, the exact mirror of the
`OneSidedSpread` that already existed, and `totalOf` now has no catch-all. Not
observed in any committed capture: **0 of 106 odds payloads, 2026-09-21.** That
is the argument for modelling it, not against — the same argument
`OneSidedSpread` was written under.

### And the same collapse one field over

With `EmptySpread` counted, `lineShape.spreads` on 2026-08-29 goes 17 → 18, and
the empty row landed in `spreadPricingOf`'s `NeitherPriced` bucket beside five
rows that carry a real handicap and no price. An empty key is not an unpriced
market. `drift-check.mjs` now counts pricing over PRICEABLE spreads and prints
the exclusion beside the number:

```
lines:    spreads=18 unbalanced=0 pickem=0 one-sided=0 empty-key=1 totals=18 split=0 total-one-sided=0 total-empty-key=1 favourite-compared=17 mismatched=2
pricing:  priced=16 unpriced=1 half-priced=0  (of 17 priceable spread(s); 1 empty key(s) excluded)
```

**A published number is corrected by this.** `Desk.fs`'s `SpreadPricing` comment
recorded "6 carrying neither" across four captures. Five. The sixth was this
empty object, counted as an unpriced market because the shape census grouped by
KEY SET and `{"home":null,"away":null}` has the same key set as a real unpriced
handicap. The comment now carries the correction and the reason.

### The refusal that proved the change landed

`npm run build` after the union edits:

```
./src/Scoreboard.fs(165,15): warning FSHARP: Incomplete pattern matches ... 'Some (EmptySpread)' (code 25)
./src/Scoreboard.fs(182,15): warning FSHARP: Incomplete pattern matches ... 'Some (EmptyTotal)' (code 25)
```

`verify` treats an F# warning as an error, so the card could not ship without a
branch for each. Five branches were added — `SPREAD KEY EMPTY`, `TOTAL KEY
EMPTY`, and the three `OneSidedTotal` forms — plus `| Some EmptySpread, _ -> ""`
in the pricing binding, which makes that silence a decision rather than an
accident of today's data.

## 2. The sentinel recorded a probe that saw nothing

`git log outbox/odds-coverage-series.json` — commit `9cb4c34`,
`drift-sentinel: ok on 2026-09-21`:

```json
{"date":"2026-09-21","source":".../context/date/2026-09-21","at":"2026-09-21T06:37:55.511Z","sports":{}}
```

The 06:37 UTC run probed the same day's slate before the relay had built it. It
found no sport, printed `ok`, and committed the reading. `transitions()` cannot
fire on an empty reading — correctly, there is nothing to have lost — so the
history grew a row that looks like a measurement of zero coverage and is a
measurement of nothing.

This was caught by `vacuousReadings()`, written last week from the same defect
in the hand-written seed. That check names such a reading once committed. This
is the other half, which stops one being committed:

```js
export function mergeSeries(series, current, keep = 60) {
  if (!current || Object.keys(current.sports ?? {}).length === 0) return series ?? []
  ...
}
```

Returning the series UNCHANGED is the point. Nothing was learned, so nothing is
recorded, and a real reading already held for that date is not overwritten by
the absence of one. An unread probe is UNCHECKABLE — the third state, which is
not zero. The run now says so out loud:

```
coverage: NOT RECORDED — the probe saw no sport on <date>; unread, not zero
```

The committed 2026-09-21 row was removed — and then, while this change was
being written, the sentinel's 18:07 UTC run probed the same date again and
found five sports, so `mergeSeries` replaced the row on its own. The series
holds four readings:

```
2026-08-29 sports: 11   at 2026-09-20T20:08:46Z
2026-09-05 sports:  8   at 2026-09-20T20:08:46Z
2026-09-20 sports: 11   at 2026-09-21T01:58:50Z
2026-09-21 sports:  5   at 2026-09-21T18:07:53Z
```

That the later run repaired the same date is luck, not design: it depended on a
second probe landing after the slate existed. The guard is what makes it not
luck — an empty probe cannot overwrite the reading that run produced.

**What this does NOT fix:** the sentinel still probes the current date at 06:37
UTC, which is before the relay builds that day's slate. That run spent a probe
and learned nothing. It is now honest about that rather than filing it as data;
making the FIRST probe of a date land on a slate that exists is a separate
change.

## Rule 90

Both new `mergeSeries` checks were mutated before being trusted:

```
CAUGHT     O14 AN EMPTY PROBE IS RECORDED AS A READING
CAUGHT     O15 an empty probe OVERWRITES the real reading held for that date

15 of 15 mutations caught.
COVERAGE: the census and the transition rule via --self-test. It does NOT
cover the series file I/O, the payload decode, or drift-check's wiring.
```

`scripts/odds-coverage.mjs --self-test`: **26/26**.

## Gates

| gate | result |
|---|---|
| `npm run build` | clean — zero F# warnings |
| `npm run check` (context-2026-05-15) | 18/18 |
| `npm run check:hard` (games-2026-08-09) | 18/18 |
| `npm run check:rows` | 23/23 rows at or above 95 |
| `npm run check:proof` | 77/77 |
| `npm run check:script-orphans` | 3/3 |
| `npm run check:import-purity` | 2/2 |
| `odds-coverage.mjs --self-test` | 26/26 |
| `mutate-odds-coverage.mjs` | 15/15 caught |
| `odds-shape-census.mjs --self-test` | 19/19 |
| `mutate-odds-shape-census.mjs` | 8/8 caught |
| `run-steps.mjs --self-test` | 14/14 |
| `check:mutation` (isolated) | 84/84, 0 of 39 baseline expectations failing |
| `docs-check` / `sport-registry-check` / `brief-flip-check` | 3/3, 14/14, 20/20 |

`drift-check.mjs --file data/context-2026-08-29.json`: 12/13, the one FAIL being
`moneyline and handicap agree on the favourite` — **pre-existing**, not from this
change. Two MLB runlines (`ML -108/101 H 1.5/-1.5`) where the home side is the
moneyline favourite and is also getting a run. The sentinel has been reporting
it as its verdict since at least 2026-09-20 (`487e97a`, `e12b7a1`), and the
`when h <> 0.0` guard removed earlier never applied to a 1.5 handicap.

## What is still not closed

1. **The sentinel's probe window.** 06:37 UTC against the current date is before
   the slate exists. Today it cost a probe.
2. **MLS's collapse cause.** 26/28 on 08-29, 2/11 on 09-20. The alarm now fires
   on the transition; nothing has diagnosed WHY.
3. **`run-steps.mjs` does not see drift-sentinel reds** — it hangs off
   `red-main-issue.mjs`, which fires from `status.yml` on a red `verify`.

## 3. Two defects in the verification, not the code

Both were mine, both were caught by the harness rather than by reading, and
both would have shipped a wrong claim.

### The tree was not clean when I read it as clean

`check:mutation` mutates `src/*.fs` in place and restores afterwards. I ran it
twice concurrently. One run's restore raced the other's mutation and left a
`| NHL` case injected in `src/Desk.fs` — my own uncommitted work sitting in the
same file, so `git status` showing `M src/Desk.fs` looked exactly like the edit
I had made deliberately.

The consequence read as five unrelated failures:

```
baseline: ran 39 of 39 distinct expectation(s), 9 failing   ← contaminated (two runs overlapping)
baseline: ran 39 of 39 distinct expectation(s), 5 failing   ← one run, still a dirty tree
      $ node scripts/docs-check.mjs
      $ node scripts/sport-registry-check.mjs
      $ node scripts/brief-flip-check.mjs
      $ node scripts/run-row.mjs "build is clean, zero F#/NuGet warnings"
      $ node scripts/run-row.mjs "doc claims are compiler-verified, not prose"
```

Two of them died with `Match failure: Desk.Sport` — a RUNTIME error out of
`build/`, which is a copy of `src/`, which is the question this repo's CLAUDE.md
tells you to ask. Removing the injected line and rebuilding took all five to
green and the baseline to **0 of 39 failing**.

Recovery note: `git checkout src/Desk.fs` would have discarded the day's work
along with the mutation. The injected line was removed by hand, and the
compiler confirmed it — a duplicate union case is `error FSHARP: Duplicate
definition of union case 'NHL' (code 37)`, which is why the tree could not
build while it was there.

**The process rule this earns:** `mutation-check.mjs` writes to the working
tree. Never run two at once, and never commit while one is in flight — the
tree is not yours for the duration. `git status` mid-run legitimately shows
files you did not touch (`src/StatsView.fs` appeared partway through this
session's final run and was gone when it ended).

### The exit code I read three times was never the suite's

```
npm run -s check:mutation 2>&1 | tail -6     # exit code: tail's
npm run -s check:mutation 2>&1 | grep -E ... # exit code: grep's
```

Both reported 0. The suite's own code was **1**. Three readings of "green" in a
row came from the last process in a pipe, and the one number that mattered was
never in the output I was looking at. Redirect to a file and echo `$?`, or the
pipeline answers a different question than the one asked.

### A third, found by the first two

```
FAIL  [ceiling-restated-as-nominal] the mutation anchor still exists
```

The row anchors on `{ Max = 245<point>; Name = "relay`. `4d3f203` — earlier in
this same session — corrected the ceilings to 294 nominal / 252 relay. The
anchor matched nothing, so nothing was mutated, and the harness refused to
report a verdict it had not produced. That is Rule 90's corollary working
exactly as written; the anchor was stale from a commit that did not re-anchor
it. Re-anchored to 252 → 294, and it now reports CAUGHT.

### The isolated run

```
baseline: ran 39 of 39 distinct expectation(s) from 83 mutation(s), 0 failing
PASS  [ceiling-restated-as-nominal] the quality bar is measured against what
      the scorer can reach, not the rubric total
84/84 checks passed
EXIT=0
```
