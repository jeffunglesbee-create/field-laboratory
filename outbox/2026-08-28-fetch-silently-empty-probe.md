# Probing defect 2: where else does a failed fetch read as an empty answer?

**2026-08-28** · `scripts/fetch-silently-empty-probe.mjs`

## The defect this generalises

`field-relay-nba/scripts/cfb-first-slate-check.mjs` asked ESPN for a slate:

```js
const sb = await (await fetch(url)).json().catch(() => null)
const events = sb?.events || []
if (!events.length) console.log('NOT OBSERVABLE — ESPN lists no CFB events')
```

A 403 returns an HTML error body, `.json()` throws, `.catch(() => null)`
swallows it, and the check reports a quiet day. Run locally it printed *"lists
no CFB events"* while the real state was **HTTP 403**.

A check that downgrades "I could not look" to "there was nothing to see" is
worse than no check, on exactly the day something breaks.

## What separates safe from unsafe, and it is not the `.catch`

Most swallow sites are fine:

```js
return { http: r.status, json: await r.json().catch(() => null) }   // SAFE
console.log(`HTTP ${r.status} ${JSON.stringify(body)}`)             // SAFE
```

The status survives, so a caller can still tell the two apart. Unsafe is when
the swallowed value becomes the **only** evidence and no status is ever read —
then emptiness is the sole observable and its two causes have merged.

## The probe reported 17 sites and was wrong about 15 of them

First run, before narrowing:

```
15 swallow(s) with the status preserved, 17 without
```

It had matched **its own explanatory comments**, **its own self-test fixtures**,
and every Playwright `page.click(...).catch(() => {})` in the tree — none of
which is a fetch, and several of which carry a comment saying the swallow is
deliberate (`render-check.mjs:193`: *"a check that cannot fail, and
`.catch(() => {})` is how one is written"*).

**So the detector claimed "a failed fetch reads as an empty answer" and measured
"any `.catch` returning something empty, anywhere, including in prose."** That
is the defect it was written to find, in itself, on its first run — the fourth
instance of that shape in two days.

Three narrowings, each stated rather than tuned until the number looked right:

1. **A comment is not code.** Lines beginning `//` or `*` are skipped.
2. **A swallow is only this defect if it is on a fetch.** The line or the two
   above must mention `fetch(` or `.json(`, and browser-driver promises
   (`page.goto`, `.click`, `waitForSelector`, `browser.close`) are excluded by
   name — those legitimately swallow, and the assertion after them is what
   reports.
3. **Skip its own file.** Its fixtures are swallow sites written on purpose as
   strings, and every one is already exercised by `--self-test`.

11 self-tests, four of which are the narrowings with the real line that forced
each. One is negative in the other direction: a genuine fetch swallow sitting
beside a driver call is still flagged, so narrowing 2 cannot be used to hide one.

## The result: two sites in 265 scripts

```
265 script(s) scanned across 3 repo(s)
8 swallow(s) with the status preserved, 2 without
```

### 1. `field-relay-nba/scripts/cfb-first-slate-check.mjs:101`

**The same defect, one line below the one I fixed this morning, surviving the
commit that fixed it.** The ESPN fetch got three states; the relay fetch on the
next line kept `.json().catch(() => ({}))`.

Its assertion reads `A('the archive answered with rows for this date', rows.length > 0)`
— **named `answered`, measuring `returned rows`**. A relay outage produced
`rows = []` and failed that assertion reporting `0`, i.e. an empty archive for a
relay that never replied.

### 2. `field-laboratory/scripts/sport-vocabulary-check.mjs:170`

`.then(r => r.json()).catch(() => null)` merged three states: a network failure,
a non-200 from `/d1/execute` (**a wrong or rotated `RELAY_SECRET` returns one**),
and a genuine zero-row answer.

**The comment fifteen lines below already knew this mattered:**

> An empty array is a real answer and a different one from "not asked": UFL's
> entry says it unblocks "the day a row appears", and `[]` is the observation
> that the day has not come.

A sample of `[]` for UFL means the day has not come. A sample of `[]` because the
secret rotated means nothing — and the artifact could not tell you which one you
were reading. Now `out.sample_errors[label]` carries the reason and
`out.samples[label]` is `null`, never `[]`: a query that did not run is not a
competition with no rows.

Both fixed. The probe now returns **0 unsafe**.

## Probe, not a check — and what would change that

This answers "where else" once. Two sites in 265 scripts does not justify a
permanent ratchet: the standing cost of a cron outweighs the rate, which is the
waste pattern audited in jubilant-bassoon
`outbox/cc-session-2026-08-16-scheduled-workflow-audit.md`.

**What would justify one:** a third instance appearing without anyone looking.
The probe is committed and runnable — `node scripts/fetch-silently-empty-probe.mjs`
from the laboratory root, scanning all three repos — so re-running it is cheap
and the decision can be made on evidence rather than now, on none.
