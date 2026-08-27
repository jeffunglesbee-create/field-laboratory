# The per-request deadline was being squeezed by the wave count

**Run:** [33034815620](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33034815620), commit `e479727`. 20/22, up from 18/22.

```
FAIL  every card whose venue the table knows carries a live chip
      → 13 known venue(s) on this slate, 9 chip(s) filled.
        Open-Meteo answered this runner: HTTP 200.
        The page reported: 4 venue(s) did not answer:
          Comerica Park: signal timed out, Chase Field: signal timed out,
          Oracle Park: signal timed out, Angel Stadium: signal timed out
```

Two checks recovered. The surface resolves, nine chips fill, and the four that
missed name themselves — which is what the deadline was for. `signal timed out`
is `AbortSignal.timeout` firing, so the deadline is working exactly as written.

## Why the obvious next move is the wrong one

Raising 4000 to 8000 is the same approach a third time, and STANDARDS Rule 42
says stop iterating it and look at what the system is showing.

What it is showing: **4000 was never chosen for what a request costs.** It was
chosen because `fetchSlate` runs its waves in sequence, so the slate's worst
case is `waves x timeout`, and thirteen venues at `maxInFlight = 4` is four
waves — 4 x 4s = 16s, which is what fitted inside render-check's 20s chip wait.
The per-request budget was a quotient of an unrelated constant.

That coupling is the defect. It also degrades with the slate: twenty-five
venues is seven waves, and 7 x 4s = 28s breaks the same check again on a page
nobody touched. Any number picked this way is correct only for today's slate
size.

Worth stating plainly: **why those four exceeded four seconds is still
unmeasured.** `weather-live-check.mjs` probes 45 venue coordinates from node in
the same job in about seven seconds, so the service is not slow from that
runner. The browser is doing something the node probe is not — cross-origin
connection setup on the first wave is the obvious candidate, and exactly one
wave's worth failing is suggestive, but suggestive is not measured and this
change does not claim it.

## The change

The slate gets the deadline that has to hold; each request gets what is left of
it, capped:

```fsharp
let deadlineAt = nowMs () + slateDeadlineMs      // fixed before wave 1
let budget = int (min requestCapMs remaining)    // per request
```

- Total wall clock is bounded by `slateDeadlineMs` whatever the slate size. The
  wave count no longer enters the arithmetic.
- One request that never answers costs `requestCapMs`, not the whole budget.
- A request whose remaining budget is already spent is not attempted, and says
  so in those words rather than reporting a timeout it never waited for.

Numbers: **14s slate**, inside the 20s wait with room for page load. **8s per
request**, twice what just failed and no longer dividing into anything.

## The measurement, so the next number is not a guess either

Every failure reason now carries elapsed milliseconds:
`Comerica Park: signal timed out after 8003ms`. The next run that misses a chip
reports how long it actually waited. Whatever number comes after this one will
be an observation rather than arithmetic against a different constant.

## Done condition

The next verify or live-check render step either passes 22/22, or its chip
failure names an elapsed time per venue. A reason without `after <n>ms` means
this change did not take effect.
