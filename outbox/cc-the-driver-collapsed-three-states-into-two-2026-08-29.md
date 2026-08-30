# The predicates returned three states; their caller kept two

**Date:** 2026-08-29
**Scope:** `scripts/cc-cmd-followup.mjs`

## The question that produced this

*"What novel thinking resolves the unproven?"* The unproven thing was the
2026-08-27 verdict:

```
REGRESSED  CC-CMD-2026-08-23-soccer-three-way-odds
           landed 2026-08-26 — no longer holds on /context/date/2026-08-27
```

Two sessions went into it. The first named three candidate causes and measured
none. The second found `SOCCER_SPORTS` was a four-element literal blind to 15 of
50 soccer games, fixed it, and still could not say whether the verdict flips.

Both were iterating on the same question: *was the relay's adapter broken?*

## It was never the adapter, and that was already proven

`field-relay-nba/scripts/three-way-odds-check.mjs` runs on **every deploy**
(`deploy.yml:335`). It tests `drawPriceFrom` directly, needs no slate, and cannot
return "not observable":

```
ok   a draw selection named "Empate" / "X" / "DRAW" / "" is still found
ok   a two-outcome market yields no draw
ok   a four-outcome market yields no draw
ok   src/index.js imports the rule rather than reimplementing it
all passed
```

The ask — *project the draw price into `opening_odds.moneyline` for soccer
markets* — is a claim about a function, and its deterministic proof has been
green the whole time.

## The actual defect is one line, in the caller

The sentinel's soccer predicate is careful. Its own comment reads:

> Three states are preserved. `null` when no soccer moneyline was served at all
> — an off-day is not a regression, and the fatal list must not fire on a Monday.

And the loop that called it read:

```js
if (!a.holds(await r.json())) regressed.push(a)
```

`!null` is `true`.

```
predicate returned: null
driver classified it as REGRESSED: true
```

Every documented not-observable answer — from every predicate in the file, not
just this one — was reported as a regression against a landed fact and failed
the build. The three-state discipline was written into the predicates and thrown
away one line later by the code that consumed them.

That is what the 2026-08-27 verdict was. 42 soccer games played, the four-league
set could see 7, the predicate answered honestly that it had nothing to judge,
and this line turned that into `::error::REGRESSED`.

**Nothing could see it, because nothing tested the caller.** Every predicate has
a self-test; the loop that interprets them had none.

## Fix

`landedVerdict` extracted as a pure three-way function and asserted:

```js
const landedVerdict = v => (v == null ? 'no rows' : v ? 'holds' : 'REGRESSED')
```

`== null` catches undefined too — a predicate that forgets to return is the same
class of silence.

`NOT OBSERVABLE` is now a reported state: `::warning::`, never fatal, and never
silent. Silence would turn the next occurrence into "it went quiet" rather than
"it was never observable", which is the failure one level up from this one.

Self-test, with the collapse as a fixture:

```
PASS  a predicate returning null reads NOT OBSERVABLE, not REGRESSED
PASS  undefined reads the same way — a predicate that forgets to return
PASS  false is the only REGRESSED
PASS  true holds
PASS  THE COLLAPSE IS DETECTED: the old `!verdict` test cannot tell them apart
```

55/55, up from 50.

The soccer entry's note now points at `deploy.yml:335` first, so anyone reading
a future REGRESSED there checks the deterministic proof before spending a
session on the slate.

`landedVerdict` is deliberately **not** exported. The self-test is in the same
file, and adding `export` puts an 800-line script that runs at module scope into
`check:import-purity`'s scope — which it promptly did, and which was caught at
the pre-commit door.

## What generalises

A three-state predicate is only three-state if every consumer of it is. `null`,
`false` and `0` are all falsy, so `if (!x)` silently merges "I could not tell"
with "the answer is no" — and the merge is invisible at the call site, because
the predicate's own comment is fifty lines away asserting the opposite.

The check that would have caught this is not a better predicate. It is a test of
the loop.
