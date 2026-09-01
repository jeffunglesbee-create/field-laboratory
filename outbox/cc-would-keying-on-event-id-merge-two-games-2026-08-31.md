# Would keying on `espn_event_id` ever merge two different games?

**Date:** 2026-08-31
**Scope:** `scripts/probe-espn-id-collisions.mjs`,
`.github/workflows/espn-id-collision-probe.yml`
**For:** field-relay-nba#1 — Rule 39 step 2

## The question is not the obvious one

field-relay-nba#1 proposes composing the archive id from `espn_event_id`. Their
Rule 39 wants the equivalent of the check run for the series fix — *"verified
live, zero `(series_key, round, date)` duplicates across all 501 real
postseason_games rows"*.

The naive translation is "does any event id appear twice". **That is the wrong
question.** It appears twice on purpose — that is the bug being fixed. The
question is what the two rows *are*:

| collision | meaning | consequence of keying on it |
|---|---|---|
| same fixture, two spellings | the duplicate bug | merging them **is** the fix |
| **two different games** | one id, two real fixtures | keying **collapses** them, destroying a row |

**One instance of the second makes the proposal unsafe.** A sweep reporting only
a count answers neither.

## An existing endpoint answers it, and it is not the credentialled one

`/d1/execute` can run the query — `regular_season_games` is in its
`ALLOWED_TABLES` and arbitrary `SELECT` is permitted. It is gated by a shared
secret.

`/context/date/{date}` is a **public read** that already carries
`espn_event_id` on every row. The sweep uses that instead: same answer, no
credential in play for a question that does not need one.

`scanDuplicates` is imported from `relay-duplicate-fixture-watch.mjs` rather than
rewritten — one rule, one implementation.

## Subset, not equality — and the fixture that says why

```js
const [small, big] = A.size <= B.size ? [A, B] : [B, A]
return [...small].every(w => big.has(w))
```

The entire defect is that one write path says `Lynx` and another says
`Minnesota Lynx`. **Equality calls those different clubs**, so every duplicate
would be reported as a dangerous collision — the alarm would fire on exactly the
rows the fix is meant to merge, and the answer would come back "unsafe" for the
wrong reason.

```
MUTANT: sameTeam by equality, not subset  →  6/12
```

Half the suite. Including `EQUALITY WOULD HAVE FAILED THIS, and flagged the bug
as a collision`, which exists to say so out loud.

## Two more guards, both mutation-proven

**A home/away flip is still one fixture.** Feeds disagree about sides — the
relay's own `HomeVersusAway` handling exists for that — and calling a flip "two
different games" would block a correct fix.

```
MUTANT: no home/away flip check  →  11/12
```

**Any, not majority.** One collapsed game destroys a row; a majority verdict
would hide it behind correct ones.

```
MUTANT: majority verdict instead of any  →  11/12
```

### The third mutation did not apply the first time

My heredoc hit a quoting error and the run reported **12/12** — which I nearly
recorded as "the guard survived". It had not been mutated at all. Re-applied with
an `assert old in s` so a mutation that misses its anchor fails loudly instead of
passing quietly.

That is the same shape as reading `$?` after a pipe and getting `tail`'s status,
and as "green therefore fixed" earlier today. Third time an instrument pointed at
the wrong thing; first time the instrument was the mutation harness itself.

## Three states, and the middle one is not a pass

```
safe             no event id shared by two different games over the window
unsafe           at least one is — the pairs are listed, the run exits 1
not-observable   no date returned a payload; nothing was checked
```

## Verified

```
node scripts/probe-espn-id-collisions.mjs --self-test   12/12
npm run check:workflows                                  9/9
npm run check:script-orphans                             3/3
npm run check:import-purity                              2/2
```

The live sweep needs CI (`*.workers.dev` is blocked from the sandbox) and is
dispatch-only — it settles a question once. The daily watcher in `drift-sentinel`
is the monitor.
