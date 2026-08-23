# Outbox — STATUS.md now surfaces live-check, so a red cannot hide for a day

**Date:** 2026-08-23
**Ships:** `scripts/status.mjs` + `scripts/status-verdict-check.mjs` — a
live-check health line in STATUS.md.

## Why

`live-check` sat red on every commit for over a day and nothing surfaced it.
`status.mjs` reported `verify`'s conclusion and the serving commit, but never
`live-check` — so a red post-deploy check against the deployed artifact was
invisible on `main`. That is the same "cannot contradict a false green" gap the
verify row was written to close, one surface over: the deploy landed, the site
was up, and the page it served was broken, with nothing on `main` saying so.

## What ships

- `liveCheckRunsUrl` beside `verifyRunsUrl`.
- The reader is generalised into one `readWorkflowConclusion` that both
  `readVerify` and the new `readLiveCheck` delegate to. `readVerify`'s external
  behaviour is byte-identical — its seven recorded-response tests pass unchanged
  — so the classification cannot answer a new failure shape one way for verify
  and another for live-check. That single-direction split is the exact failure
  `readVerify` was rewritten to remove; sharing the body keeps it removed.
- A `## Is the live artifact healthy?` section in STATUS.md rendering the
  live-check verdict — green, FAILURE (named and linked), running, or unreadable.

## Deliberately NOT wired to fail the status job

verify's conclusion is the gate on "is main green". A red post-deploy check
should be **visible** on `main`, not turn a second workflow red on top of the
first — a status job that goes red whenever live-check is red is a cascade, not a
signal. So the verdict is rendered, not exited on. Surfacing is the whole fix.

## Verified

`status-verdict-check` 27/27 — the seven verify cases unchanged, plus four for
live-check: it reads a different workflow than verify, a FAILED live-check run
reads as failed (named + linked), an empty list says "no live-check run" (not
"verify"), and outside CI it is not a problem. `import-purity` 2/2 —
`readLiveCheck`/`liveCheckRunsUrl` are exported and importing the module still
runs nothing. `status.mjs` renders offline without crashing, the new section
present.

## Pairs with

`outbox/cc-live-tabs-render-wait-2026-08-23.md` — the fix that turns live-check
green. This is its follow-up: the fix stops the panels reading blank; this makes
the next such regression visible the day it happens instead of a day later.
