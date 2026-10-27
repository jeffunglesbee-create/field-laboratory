# weather-first-call-connect: Task 0 read, Task 1 not triggered

CC-CMD: `docs/CC-CMD-2026-10-20-weather-first-call-connect.md`. Written 2026-10-27.
No code changed. HEAD at the read: `bd82dc8`.

## Task 0.2 — which call failed in the 2 failed sentinel weather steps

Step "Venue table and Open-Meteo, checked live", daily drift-sentinel, 45-venue table.
Annotations read earlier in this session; the run list and per-step outcomes are
from the Actions API (runs 2026-10-13 → 2026-10-26, 29 runs).

| run | date | failing call | shape |
|---|---|---|---|
| 38858668930 | 2026-10-16 | the venue loop, many venues | HTTP 503 / fetch failed. Pre-dates the venue-loop retry (`31901c0`, `d13c4b3`, `264d3c1`, 2026-10-20). |
| 39141664126 | 2026-10-18 | the sign-flipped probe | a body that failed `res.json()` ("Unexpected…"). Not a connect failure: `call` returned a response, so `didNotAnswer` did not fire. Pre-dates the retry commits. |

Neither is "the first call failed to connect". The 10-18 failure is a probe call,
but its failure mode (a non-JSON body from a response that was not 429/5xx) is not
one the Task 1 retry would cover, because the retry sits behind `didNotAnswer`.

## Task 0.3 — outcomes since the retry landed (2026-10-20T17:39Z)

13 of 13 weather steps `success` (runs 39504314648 on 2026-10-20 through
40378883295 on 2026-10-26T18:34). Since 2026-10-13: 27 success, 2 failure, both
above. Six of the 13 runs failed overall (39553758544, 39639786154, 39909707060,
39990185130, 40168879083, 40209164962 failed at other steps; the weather step
itself was green in each).

**Limit, stated where it is read.** The window since the retry is 7 days, not the
14 the CC-CMD asks for. The 14-day mark is 2026-11-03. And the first call and the
two probes still go through `call` once with no retry (`scripts/weather-live-check.mjs`
`const first = await call(fetchImpl, url)`, `const bad = …`, `const flipped = …`),
so 13 green runs show the venue-loop retry holds, and say nothing about whether a
cold first connect could fail there; none has in 7 days.

## Decision

Task 1 is not triggered: 0 first-call connect failures in the record. The CC-CMD
stays open with Status updated. It closes with the 14-day count as its artifact if
the weather step has 0 failures through 2026-11-03; if one first-call failure
appears, Task 1 runs.

Re-check command (artifact: the printed count):
`gh api "repos/jeffunglesbee-create/field-laboratory/actions/workflows/<drift-sentinel id>/runs?created=>=2026-10-20T17:39"` then the
"Venue table and Open-Meteo, checked live" conclusion per run; expect 0 `failure`.
