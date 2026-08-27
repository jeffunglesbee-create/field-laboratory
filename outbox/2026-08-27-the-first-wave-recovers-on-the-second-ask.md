# The first wave recovers on the second ask — and a branch that never ran

Drive and this repo's own outbox both had the answer, and neither had it whole.

## What the docs said

`outbox/cc-the-runner-lost-open-meteo-2026-08-12.md`, written when three
consecutive runs went red on this same host:

> **`api.open-meteo.com` is unreachable from GitHub-hosted runners.** Three runs
> today — 15:41, 16:42, 19:51 — all report `fetch failed` at the connection
> level **after about ten seconds**. Nothing in this repo changed in between.
>
> "Use a GitHub Actions runner, it has egress" has been the answer to every
> sandbox limitation for two days. It is not a property of runners; it is a
> property of a runner and a particular host, and it can stop being true without
> anything on our side moving.

So the hang was known, documented, intermittent, and not ours. That session's
remedy was to split the question by job: `--tolerate-unreachable` in verify,
fatal in drift-sentinel.

## What the docs could not have said

The August 12 session saw whole runs fail. It could not see inside one page load,
because nothing measured that until this morning. The timings do:

```
674+8000ms   674+8000ms   674+8000ms   674+8001ms      ← wave 1, all four aborted at the cap
8675+468ms   8675+470ms                                 ← wave 2, starting the instant they gave up
```

**The host recovers within a single page load, in under half a second.** Same
page, same connection, 470ms. Runs 33076011728 and 33034815620 have the identical
shape at two other slate sizes: whatever is issued after the first wave gives up
answers immediately.

That is what makes a retry the fix rather than a fallback. A fallback substitutes
a different data path; this is the same request down the same path, and three
runs say the second one lands.

## The change

`fetchOne` returns a named outcome instead of `Result<_, string>`:

```fsharp
type private Attempt =
    | Answered of VenueWeather
    | Refused of why: string        // the host answered — a status, or a body that would not decode
    | NeverAnswered of why: string  // nothing came back — the only retryable case
```

`fetchSlate` retries the `NeverAnswered` ones once, inside the same 14s slate
budget, and splices by venue name. A retry that fails again leaves the FIRST
failure in place, so the panel reports the original cause rather than the echo.

`Refused` is never retried. Asking a 429 again is the 2026-08-15 burst bug
wearing a different hat, and `maxInFlight` exists because of it.

## Two errors caught on the way, both by checks

**The classifier was a heuristic pretending to be a fact.** The first version
decided retryability by comparing elapsed time to the budget with a 50ms fudge.
A connection that dies in 5ms never answered either, and that version filed it as
though the host had spoken. The axis that matters is not duration and not
`e.Message` — "signal timed out" is Chromium's current wording, and a classifier
keyed to a vendor string stops classifying, silently, the day the vendor rewords
it. It is now: did the host answer at all.

**A branch that had never executed since it was written.** With the retry in,
`weather-burst-check`'s new "a 429 is NOT retried" measured **84 calls for 42
coordinates** — a 429 was reaching the retryable branch. The cause:

```
Fenway Park: 429 undefined for URL undefined after 1ms
```

That is an exception message, not `sprintf "%s: HTTP %d"`. Fable.Fetch's `fetch`
**rejects** on a non-ok response, so `if not response.Ok then` in `fetchOne` has
been unreachable for its whole life, and every HTTP status has arrived in the
`with` clause dressed as a network failure. Invisible while both paths produced
the same string; visible the instant they had to mean different things.

Fixed by using `fetchUnsafe`, which returns the response instead of throwing. The
status branch is now live for the first time.

## Checks added

Both drive the real compiled `fetchSlate` with a stub that decides per call what
the host does, so each scenario is a property of the host rather than a flag
threaded through the code under test.

- a venue that never answered is asked again, and its reading is recovered
- ...and it is asked exactly twice, never more
- a 429 is NOT retried — the host said stop asking
- ...and a slate refused everywhere is `EveryFetchFailed`, not empty `Readings`

The abort in the first scenario is spelled `new Error('the network went away')`
deliberately — not "signal timed out". If the classifier ever goes back to
matching the browser's wording, that check fails.

## What was NOT changed

`requestCapMs` 8000, `slateDeadlineMs` 14000, `maxInFlight` 4, and the preconnect
tag all stay. None has been shown wrong or harmful, and moving one alongside the
real fix would confound the next reading exactly as the preconnect reading was
confounded.

## Local

`check:weather-burst` 11/11, `check:verify` 80/80 held, `check:proof` 71/71,
`check` 17/17 (`built from: 2408ed3`), `check:hard` 17/17, unused, clean-source,
import-purity.
