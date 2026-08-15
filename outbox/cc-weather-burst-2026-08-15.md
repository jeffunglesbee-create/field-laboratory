# Outbox — the weather fan-out bursts, and live-check caught it

**Date:** 2026-08-15
**Ships:** a bound in `src/WeatherView.fs`, `scripts/weather-burst-check.mjs`,
one mutation invariant, one verify step

## What went red

`live-check` failed on `8fd151e` — 15/18 — with three assertions down:

```
FAIL  no page or console errors
      → console: Failed to load resource: the server responded with a status of 429 (Too Many Requests)
FAIL  the chips all filled within the wait
      → page.waitForFunction: Timeout 20000ms exceeded.
FAIL  every card whose venue the table knows carries a live chip
      → 12 known venue(s) on this slate, 11 chip(s) filled
```

Three failures, one cause. Worth saying plainly: **this is not a Phase 1
regression.** `8fd151e` touches prose scoring and nothing else, and the previous
`live-check` on `afbd4a8` was green. It is a latent defect that a twelve-venue
slate finally exposed.

## The cause, and why it is ours

`WeatherView.fetchSlate` read:

```fsharp
let! settled = targets |> List.map fetchOne |> Promise.all
```

One request per distinct venue coordinate, **all at once**. Twelve venues meant
twelve simultaneous requests to Open-Meteo from one IP, and one came back 429.

The tempting reading is "third-party outage, tolerate it" — and there is even a
precedent in this repo for that, since `verify` runs `weather-live-check` with
`--tolerate-unreachable` after Open-Meteo went unreachable from GitHub runners
on 2026-08-12. That precedent does not apply here. Unreachable is the world's
problem. **429 is the server saying this client is asking too fast**, which is a
fact about our behaviour. Tolerating it would have left the page still asking
too fast and merely stopped reporting the consequence.

So the fix is a bound, not a tolerance:

```fsharp
let private maxInFlight = 4
```

Requests go out in waves. Twelve venues become three waves rather than twelve
simultaneous requests. Four is not tuned to a published quota — Open-Meteo
documents per-minute and per-day ceilings and neither is what twelve-at-once
trips — it is chosen to keep the burst small while leaving the whole slate well
inside live-check's 20s chip wait.

## How it is checked

`scripts/weather-burst-check.mjs` measures the **runtime concurrency**, not the
constant. Reading `maxInFlight` back would prove nothing; the failure was a real
concurrency shape. It stubs `globalThis.fetch`, counts outstanding calls at
their peak, and drives the actual compiled `build/WeatherView.js` over all 34
distinct coordinates in the venue table.

Two things in it are load-bearing and worth naming:

- **The stub resolves on a later macrotask.** A stub that resolved
  synchronously would let each request finish before the next began, reporting a
  peak of 1 — a check that passes on the broken implementation too.
- **Non-vacuity runs first.** With ≤ 4 distinct coordinates, bounded and
  unbounded implementations both peak at the target count and every assertion
  below is free. So the first check asserts the slate is wider than the bound.

It also asserts the bound is not a serialisation in disguise (a wave size of 1
would satisfy "peak ≤ 4" while taking twelve round trips where three would do),
and that the outcome is `Readings` rather than `EveryFetchFailed` — the
distinction `slateWeather` exists to preserve.

Teeth measured, not claimed. With `maxInFlight = 999`, the check reports **6/7,
exit 1**, failing exactly on "the requests never exceeded the in-flight bound";
restored, **7/7, exit 0**. Registered as mutation `weather-bursts-unbounded`, so
it stays measured.

## Two defects of mine, recorded

**Reading the wrong union field.** The reading-count assertion first read
`outcome.fields[1]`. `Readings` carries `(readings, failed)` — `fields[1]` is the
FAILED list, which is empty on a healthy run. It would have looked like a
passing zero on a correct implementation and on a totally broken one alike. The
check now asserts the union case explicitly and reads `fields[0]`.

**A loop whose exit codes meant nothing.** Running the suite, I wrote
`out=$(npm run $c 2>&1 | tail -1); echo "$c -> $?"`. `$?` there is `tail`'s
status, which is always 0 — every check reported success including one that was
failing. Same family as the inverted `process.exit(summarize() ? 0 : 1)` fixed
earlier in this repo: a harness that reports green without measuring anything.
Re-run with the pipeline's real status, which is how `check:spark` was found to
be exiting 1 (it needs the local server; green once served, and green in CI where
an earlier step starts it).

## What this does not fix

The bound reduces the chance of a 429; it does not make one impossible. GitHub
runner IPs are shared, so a well-behaved client can still be rate-limited by
traffic that is not ours. If `live-check` goes red on a 429 again, the next step
is a retry honouring `Retry-After` — which is the protocol's own instruction and
still not a tolerance. It is not being added pre-emptively, because there is no
evidence yet that it is needed and an unexercised retry path is one more thing
that can be wrong.
