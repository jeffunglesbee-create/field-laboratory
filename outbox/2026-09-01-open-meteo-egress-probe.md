# The tolerance branch has a hole, and the probe that measures which one

## What is actually failing

`verify` has been red since run 244 (19:46). Runs 244, 245 and 250 all died at the
same step — **Render check against the LIVE slate** — with the same four
assertions:

```
FAIL  the chips all filled within the wait
      -> page.waitForFunction: Timeout 20000ms exceeded.
FAIL  every card whose venue the table knows carries a live chip
      -> 14 known venue(s) on this slate, 0 chip(s) filled.
         Open-Meteo answered this runner: HTTP 200.
         The page reported: Weather is unavailable: all 14 venue requests failed.
         Request timings (start+duration):
           642+8000ms 642+8000ms 642+8000ms 643+8002ms
           8643+6000ms 8644+5999ms 8644+5997ms 8644+5997ms
```

Four requests started at 642ms and each aborted at its 8000ms cap. The retry wave
started the instant they gave up and aborted too. The slate's 14000ms budget was
then spent, so six venues were never attempted at all.

## What I got wrong first

I diagnosed this run as red because of `check:history` — two commits my own
`generate-team-colours.yml` had written with no outbox entry. That was true and is
fixed (`52c7bc6`). It was not the whole failure. Runs **244 and 245 were already
red on this weather step**, before either of those commits existed;
`check:history` runs earlier in the job, so from 246 it simply spoke first. Two
independent causes, and I reported one as the cause.

Then `check:unused` surfaced a third (`Palette.contrastWithBg`, orphaned by the
card-surface move, fixed in `00155ae`) — also latent, also never reached.

Three failures stacked in one job, each hidden by the one before it. Every fix
reveals the next.

## Why the tolerance branch did not fire

`cc-render-check-tolerate-open-meteo-2026-08-23.md` shipped exactly this
situation's remedy: when the chips do not fill, probe Open-Meteo; if it is
unreachable and `--tolerate-unreachable` is set, skip the four live weather
assertions loudly. A third-party outage must not gate the deploy.

The probe returned `HTTP 200`, so the branch did not fire.

`render-check.mjs` states the limitation itself, in a comment written before it
mattered:

> this probe is one request from node, after the 20s wait has already elapsed,
> and a service that refused a burst can answer a single late request perfectly
> well. So it reports what it saw and does not pretend to have measured the
> page's fate.

## Three readings fit, and they want different fixes

| reading | repair |
|---|---|
| node's egress works, the browser's does not | the probe measures the wrong stack; probe from the page context |
| a single request lands, a burst of 8 does not | concurrency, not reachability; the probe must burst too |
| everything was fine by the time anything was probed | transient; the probe must be able to say so |

Choosing between them by argument is how the wrong one gets shipped. This repo
already knows the host does something like all three: `cc-the-runner-lost-
open-meteo-2026-08-12.md` recorded `api.open-meteo.com` going unreachable from
GitHub runners intermittently, and `WeatherView.fs` documents runs where the
whole first wave aborted at its cap and the retry wave landed in ~470ms on the
same connection. Today the retry wave aborted too, which none of those records
covers.

## What shipped

`scripts/probe-open-meteo-egress.mjs` takes three measurements in one process on
one runner:

1. one `fetch` from **node**
2. one `fetch` from a **chromium page** (`about:blank`, not the app — the app's
   own weather code has waves, budgets and a retry, and running through it would
   measure those instead of reachability)
3. the same **burst of eight** the failing run attempted, from that page

`verdictFor` maps them to one of six states — `reachable`, `service-unreachable`,
`node-only`, `browser-only`, `burst-refused`, `not-observable` — and each names
its own repair, stored beside it so the two cannot drift.

`not-observable` outranks every other reading: a leg that did not run cannot
report that its leg is fine. Omitting a leg throws rather than comparing
`undefined` and falling through to `reachable`.

### Teeth

9/9, and each mutation drops the count:

| mutation | result |
|---|---|
| `browser-only` collapsed into `service-unreachable` | 8/9 |
| the `burst-refused` clause removed | 8/9 |
| `not-measured` no longer outranks | 7/9 |

The first is the exact bug this probe exists to expose, so it is the one that had
to fail.

## What it does not do

It is dispatch-only and it does not gate. Every verdict except `not-observable`
is a real reading, and exiting non-zero on `browser-only` would turn a diagnostic
into a second thing that has to be kept green.

The repair to `render-check.mjs` is deliberately **not** in this commit. Widening
a tolerance before measuring which reading is true is how a real page defect gets
skipped, and that is the failure mode the 08-23 doc was written to avoid.

---

## Reading, run 33561312637 (21:30 UTC)

```
  node   single   HTTP 200
  chrome single   ok in 528ms
  chrome burst    8/8 answered
           0+   202ms  HTTP 200
           1+   327ms  HTTP 200
           1+   445ms  HTTP 200
           1+   477ms  HTTP 200
           1+   510ms  HTTP 200
           1+   476ms  HTTP 200
           1+   482ms  HTTP 200
           1+   510ms  HTTP 200

  VERDICT: reachable
```

**`browser-only` and `burst-refused` are both dead.** Chromium bursts eight
concurrent requests to the same host, from the same runner image, in 202–510ms.
The network stack is not the difference and concurrency is not the difference.

What is left is the third reading: the outage was real and had ended. Seven
minutes separate run 250's failure from this. `WeatherView.fs` already documents
this host recovering inside a single page load, and the six seconds between the
page giving up and `render-check`'s probe firing is more than enough.

That makes the late node probe structurally unable to attribute this failure —
not sometimes, but whenever the host recovers faster than the probe fires, which
is the documented behaviour. Re-probing harder cannot fix it. The attribution has
to come from **the page's own window**.

## The repair being measured for

Three facts, all of them inside the window the page already observed, none of them
requiring a second request:

1. **the page asked for the right URLs** — every `open-meteo` resource entry
   parses to the exact shape `forecastUrl` produces, for a coordinate the venue
   table carries
2. **nothing answered** — no entry received an HTTP response
3. **the page waited** — each attempt ran to its abort cap rather than giving up
   early, which is what a shrunken budget or a broken timeout would look like

All three true is "the page did everything right and the host said nothing" —
tolerable, loudly. Any one false is a real failure and stays one. Note what this
excludes that the current probe does not: a page requesting a malformed URL, or
aborting its own requests in 50ms, both currently reach the tolerance branch
whenever the host happens to be slow.

It rests on two cross-boundary facts about `PerformanceResourceTiming` for a
cross-origin resource with no `Timing-Allow-Origin` — whether `name` carries the
query string, and whether `responseStatus` is populated or TAO-gated to 0 like
the connection phases already are. Both are documented, and documentation is a
copy of the source, so the probe now measures them on the browser that runs the
check, including what an entry for a request to a dead host looks like.

---

## Reading 2, run 33561563519 (21:34 UTC) — and one thing it got wrong

Both cross-boundary facts came back usable:

```
    name carries the query string : YES
    responseStatus present        : YES
    responseStatus on an answered : 200
    responseStatus on a DEAD host : 0
    a name, verbatim: https://api.open-meteo.com/v1/forecast?latitude=39.0517&longitude=-94.4803&current=...
```

`responseStatus` is populated despite the absent `Timing-Allow-Origin` — it is
not gated the way the connection phases are — and the full query string is in
`name`, so the URL the page requested is checkable against `forecastUrl`.

**But the probe recorded 5 resource entries for 10 requests**, and that number is
the more important result. A mechanism resting on "no entry received a response"
is worthless if entries go missing.

Cause: the probe ran on `about:blank`, which has an opaque origin and is not the
configuration `render-check` runs in. The real check's own output disagrees —
run 250 printed eight timings for eight attempted requests, from the app at
`http://localhost:8080`:

```
642+8000ms 642+8000ms 642+8000ms 643+8002ms 8643+6000ms 8644+5999ms 8644+5997ms 8644+5997ms
```

So on the real origin, entries appear to be complete, including for requests that
were aborted at their cap. "Appear to be" is the problem: that is read off a log,
and the fact needed is that EVERY request leaves an entry, which a log of eight
timings for eight requests suggests but does not establish for the general case.

## What the third run measures

Two changes, both narrowing the gap between the probe and the thing it stands in
for:

1. **The real origin.** `scripts/serve.mjs` answers an unknown path with a plain
   404 body — a real document at `http://localhost:8080` with none of the app's
   JS, so the app's own waves, budgets and retry are not in the measurement while
   the origin is the right one. The probe now reports entries recorded against
   requests made.

2. **A request that TIMES OUT, not one that fails DNS.** `api.open-meteo.invalid`
   fails at name resolution in 13ms. The failure being attributed is a request
   aborted at its cap after eight seconds. An entry existing for the first does
   not prove one exists for the second, and the second is the entire mechanism.
   The new target is an unroutable address that hangs until `AbortSignal` fires.

---

## Reading 3, run 33561942089 (21:38 UTC) — at the real origin

```
  resource timing: 11 open-meteo entr(ies)
    an entry for EVERY request    : 9/9 to the real host (burst + single)
    an entry for a TIMED-OUT req  : YES — status 0, 4000ms
    name carries the query string : YES
    responseStatus present        : YES
    responseStatus on an answered : 200
    responseStatus on a DEAD host : 0
```

9 of 9 at `http://localhost:8080`, against 5 of 10 on `about:blank`. The missing
entries were the opaque origin, not the browser. And a request that hung until
its `AbortSignal` fired leaves an entry carrying `status 0` and its full
duration — which is the fact the whole mechanism turns on, and the one a DNS
failure could not have established.

## The repair, shipped

`render-check` now attributes an empty-chip failure from the page's own resource
entries. `attributeWeather({ requests, expectedUrls })` returns `host-silent` or
`page`:

- **no request at all** -> page. There is nothing for a host to be silent about.
- **a URL the venue table does not explain** -> page. Compared origin, path and
  the full sorted parameter set, so the right host and coordinate with the wrong
  field list is not the right request.
- **any response received** -> page. A 429 is the host talking.
- **otherwise** -> host-silent.

`expectedUrls` is built from the venue records through the same `forecastUrl` the
page calls, so a page requesting the wrong place cannot define its own
expectation.

### The clause that was written and then deleted

The first version also asked whether each request ran to the budget it was
entitled to — `min(requestCapMs, slateDeadlineMs - offset)`, both read from
`WeatherView` rather than typed in. It is wrong, and the sandbox proved it in one
run: a request the PAGE abandons early and one the NETWORK refuses early are the
same resource entry, `status 0` and a short duration. The probe measured both
shapes — a dead hostname ends in 13ms, an aborted request ends at 4000ms, neither
carries a status. Reading "short" as "the page gave up" fails exactly the case
this branch exists to tolerate. Against the sandbox's proxy the page's requests
are refused in 302ms, and the deleted rule called that a page defect.

A page that shrinks its own timeout is therefore not caught here. It is caught by
`check:weather-burst`, which drives the wave, budget and retry logic against
mocked timings and asserts them directly — "...and it is asked exactly twice,
never more", "a 429 is NOT retried". Those are properties of the code, not of a
live slate, and that is where they belong.

### Verified, against the sandbox that refuses Open-Meteo exactly as the runner did

| run | result |
|---|---|
| pinned | 18/18, the enumerated attribution cases among them |
| live, no flag | four weather checks FAIL — teeth intact — 18/23 |
| live, `--tolerate-unreachable` | `host-silent`, four checks skipped with the warning, denominator 23 -> 19 |

The live runs' remaining failure is `no page or console errors`, which is the
sandbox proxy's `ERR_TUNNEL_CONNECTION_FAILED` and passes on a runner (it passed
in run 250, mid-outage).

### Teeth

Eight enumerated cases, and each mutation drops the count 18 -> 17:

| mutation | caught |
|---|---|
| a received response no longer disqualifies | yes |
| an unexplained URL no longer disqualifies | yes |
| zero requests reads as `host-silent` | yes |
| the query comparison ignores the field set | yes |

The first is the regression this must never tolerate: the host answered and no
chip filled.

### One F# change it required

`WeatherView.slateDeadlineMs` and `requestCapMs` were `private`. They are now
public so the attribution reads the page's real budget rather than a copy of it,
and both are read one line below their definition, so `check:unused` is satisfied
on its own terms rather than by exception.

## What is still not established

That the tolerance branch fires **on a runner mid-outage**. It has been verified
against a sandbox that refuses at the proxy, which is a different failure shape
from a host that accepts and never answers. The next real Open-Meteo outage is
the test, and the warning text is written to say plainly which evidence it acted
on so that run is readable after the fact.

### One thing the pre-commit gate caught

The pure function and its two verdict constants were written with `export`, out
of habit. `check:import-purity` refused the commit: `render-check.mjs` runs at
module scope — it launches a browser and exits — so exporting anything makes the
purity check import it, and the import terminates the importing process. Exactly
the shape that check exists for, and exactly what `staged-outbox-check.mjs` was
guarded for on 2026-08-23.

Nothing outside the file needs them, and the enumerated cases are in the same
file, so they are local. Not a workaround — the export was the mistake.

---

## Run 254 went green, and printed something false while doing it

`verify` 254 on `5f97823`: **success**. It is worth reading how.

```
open-meteo (start+duration): 553+8000ms 553+8000ms 553+8000ms 553+8001ms
                             8554+69ms 8554+86ms 8554+103ms 8554+120ms  ...
attribution: page — 14 request(s) received a response (200) and no chip filled
PASS  the chips all filled within the wait
PASS  every card whose venue the table knows carries a live chip
```

The first wave aborted at its cap, four times over, and the retry wave landed in
69-120ms — the recover-within-one-page-load behaviour `WeatherView.fs` documents,
working exactly as designed. The page saved itself and the chips filled.

And the attribution line says `page — ... and no chip filled`, on a run where
every chip filled.

Every clause of that sentence is true except the last, and the last is the one
that makes it a finding. It changed no decision — the verdict is only consulted
when chips are missing — but an instrument that reports a fault on a healthy run
is **the same collapse it was written to prevent, one level up**: `page` meant
both "the host answered and nothing rendered" and "the host answered and
everything is fine".

The node probe it replaces had this right and said so: "the probe runs solely
when there is an empty-chip failure to explain, so a healthy slate pays nothing."
Moving the computation ahead of the branch dropped that property. It is now
computed only when `waitErr !== null || filled.length < expected` — the same
condition — and the `why` for an answered request no longer asserts "and no chip
filled", which is the caller's fact and not the function's.

Fifth instance today of a measurement that reads true locally and is false about
the thing it stands for.
