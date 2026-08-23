# The live page does not reach networkidle — 2026-08-23

**Alarm:** `live-check` run `32614377552`, head `ed5d6b9`

```
> node scripts/live-tabs-check.mjs
https://field-laboratory.jeffunglesbee.workers.dev/
page.goto: Timeout 30000ms exceeded.
  - navigating to "…", waiting until "networkidle"
    at scripts/live-tabs-check.mjs:31:12
  name: 'TimeoutError'
```

## This answers a question the repo left open

`schedule-live-check.mjs` made exactly this change earlier and deliberately did
not generalise it:

> Scope held deliberately: `render-check.mjs:32` and `live-grouping-check.mjs:24`
> use `networkidle` against the same URL and both PASSED in the same run, which
> is evidence the page does reach idle rather than polling forever. That is
> evidence, not proof — whether the live page is ever reliably network-idle now
> that it fetches per card is a real question, and it is recorded in the outbox
> rather than settled by this change.

Settled: it is not reliably network-idle. `live-tabs-check` timed out at the
full 30s in a run where `deploy-landed` had passed 9/9 immediately before, so
the site was up and answering. The page's own design is the reason — every card
with a known venue fires its own weather fetch, and "500ms with at most two
connections" is not a state a page like that has to reach.

## Why this surfaced tonight and not sooner

It was masked. `deploy-landed --strict` ran before it and exited 1 on every run
since 06c37db, killing the job before `check:live-tabs` was reached. Fixing that
verdict bug (`1db425b`) is what let the next step run far enough to fail.

Two real failures in sequence, the second hidden behind the first. Worth noting
because "the fix made a new thing fail" reads like a regression and is not one.

## The fix

`waitUntil: 'domcontentloaded'` plus the wait each script actually needs, at
four call sites against the deployed URL:

| script | precondition |
|---|---|
| `live-tabs-check.mjs:31` | **added** `waitForSelector('.tabs [role="tab"]', 15s)` |
| `render-check.mjs:32` | existing `waitForFunction` on `#decode-status`, unchanged |
| `render-check.mjs:83` (simulate) | existing `waitForSelector('.desk-card')`, unchanged |
| `live-grouping-check.mjs:24` | existing `waitForFunction` on `#decode-status`, unchanged |

Three of the four already asserted their real precondition on the line below the
goto, so `networkidle` was a redundant wait on top of a correct one. Only
`live-tabs-check` had none — it went straight to `$$eval`, so the goto was doing
double duty as navigation and readiness, which is why it is the one that failed
and why it now fails on a named selector rather than a generic timeout.

## Not touched, and why

`brief-flip-check`, `nav-check`, `pickem-check`, `separation-check`,
`spark-check` and `tab-check` still use `networkidle`. All of them run against
`http://localhost:8080` from the local server in `verify`, not against the
deployed page, and all pass. The evidence here is about the live page
specifically. Widening the change to scripts with no observed problem would be
the "while I'm here" edit the standards forbid.
