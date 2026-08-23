# Outbox — live-tabs-check read the panels before the SPA rendered them

**Date:** 2026-08-23
**Ships:** `scripts/live-tabs-check.mjs` — a render-readiness wait before the pick
panels are read.

## The symptom

`live-check` was red on every commit for over a day (runs ~348–377, 2026-08-22
into 08-23), across status-refreshes, the palette work, the market-shape commit,
and the soccer-odds commit — none of which touched the pick UI. The failing job
reported 7/15, all eight failures on the pick tabs:

```
FAIL  the Field's Pick panel becomes visible and renders → length 0
FAIL  the Scout's Pick panel becomes visible and renders → length 0
FAIL  the Field's Pick panel is in a stated state, not blank → panel said:
FAIL  the Scout's Pick panel reports gates → panel said:
FAIL  the Pick'em panel renders and says whose opinion it is → panel said:
...
PASS  no page errors on the deployed artifact
```

All three pick panels blank, no page error, the static tabs present.

## The cause

`live-tabs-check` navigates with `waitUntil: 'domcontentloaded'` and then waits
only for `.tabs [role="tab"]` before reading panel content. Those tabs are in the
**served HTML** — the selector resolves before the SPA has run. The panels are
rendered by the app's init **after** it fetches `/context/date`, and Field's Pick
after a **second, async** fetch to `/analytics/newspaper/`. So the check read
every dynamically-rendered panel before it existed.

It went red the moment `de63a93` changed this file's goto from `networkidle` to
`domcontentloaded`. That change was right in itself — every card fires its own
weather fetch, so the page never reaches network-idle and the old wait timed out
at 30s. But `networkidle` had been incidentally holding long enough for the
panels to render; `domcontentloaded` does not, and the only replacement wait
pointed at a static element. Two correct-looking waits, neither of them the one
the assertions need.

Confirmed not a data fault: `/analytics/newspaper/2026-08-23` returns 200 (with
`pick: null`, which renders "No pick section" — text, not blank), and
`/context/date` carries a full slate. The panels are blank because they are read
early, not because there is nothing to render.

## The fix

Wait for what the check needs — the sibling `render-check.mjs`'s own precondition:

1. `#decode-status` settling off `decoding…` — init has run and the tab handlers
   are wired.
2. Per panel, a bounded wait for its own non-empty text after the tab is clicked.
   A panel renders even "No pick section" as text, so non-empty content is the
   honest readiness signal.

Both waits are `.catch(() => {})` so a genuine blank still reaches the existing
assertion, which reports the panel's text verbatim rather than dying on a
`waitForFunction` timeout.

## Why local verification cannot reproduce the race

`live-tabs-check` against `http://localhost:8080/?data=games-2026-08-09` now
passes 15/15, but it passed the blank-panel path too before the fix: on localhost
the committed capture renders synchronously within the same tick, so there is no
window to read early. Measured directly — panel length 663 both before and after
the wait locally. The race only opens over real network latency, which is why
verify (localhost) never caught it and only the deployed `live-check` did. The
fix's real proof is the next deployed `live-check` run going green; the readiness
waits are load-bearing there, inert locally.

## Follow-up

`live-check` sat red for a day because nothing surfaces a persistently-red
post-deploy check — `status.mjs` reports `verify` and the serving commit, not
`live-check`. Surfacing it ships alongside this fix in
`outbox/cc-surface-live-check-in-status-2026-08-23.md`, so the next such
regression is visible on `main` the day it happens instead of a day later.
