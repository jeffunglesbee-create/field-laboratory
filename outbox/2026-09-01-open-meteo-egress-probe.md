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
