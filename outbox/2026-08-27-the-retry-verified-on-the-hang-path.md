# The retry, verified — on a run that actually hung

Two runs against the deployed retry build (`f606aee`, deployed 13:49:37). One
took the fast path, one took the hang path. Both green.

| run | what | render step | result |
|---|---|---|---|
| [33078881241](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33078881241) | live-check, fired by the deploy | 13:50:53 → 13:50:56 (**3s**) | pass |
| [33078924162](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33078924162) | verify, dispatched | 13:52:24 → 13:52:34 (**10s**) | **22/22** |

**The 10-second one is the evidence.** Three seconds is the fast path — no hang,
nothing retried, and it proves nothing about the retry. Ten seconds is
approximately one second of page load, eight seconds of a first wave hanging to
its cap, half a second of the retry landing, and overhead. Under the previous
build that shape produced a 20-second `waitForFunction` timeout and two red
checks. Here it produced 22/22.

## Which build, established two ways

The deploy timeline: `f606aee` deployed 13:49:37, and no deploy ran between then
and either run. `96d8328` — the head both runs report — is a `status: refresh
[skip ci]` on top of it and changes no source.

And independently: **live-check step 8 is "The deployed build stamp matches
main"**, and it passed at 13:50:52. That check already existed, in the sibling
workflow, doing exactly what this morning's confusion needed. verify's render
step had no equivalent, which is why the preconnect run was misread — the
capability was one workflow over the whole time.

## The timing line, read

Retrieved from run 33078924162 on a wider log tail. It is no longer an
inference:

```
open-meteo (start+duration):
  635+7999ms  635+8000ms  636+8000ms  636+8001ms      wave 1  — four, all hung to the cap
  8636+625ms  8636+647ms                              wave 2  — the two remaining originals
  9285+163ms  9285+158ms  9285+315ms  9286+325ms      THE RETRY — the four that never answered
```

Ten requests for six distinct coordinates: six originals, then exactly four
retried. Reading it in order:

1. **t=635ms** — four requests go out and every one is aborted at its 8000ms
   cap. This is the hang, in the shape it has held all day.
2. **t=8636ms** — wave 2 starts the instant wave 1 gives up, and both answer in
   about 630ms.
3. **t=9285ms** — the four that never answered are asked again and all four
   land, in **158–325ms**. Faster than wave 2, on a path that keeps warming.

Total 9.6 seconds, inside the 14s slate budget and inside the 20s chip wait, and
the run reports `PASS the chips all filled within the wait` with every one of the
six chips present.

That is the whole mechanism, measured end to end: four requests lost, four
recovered, nothing left to infer. It also confirms `weather-burst-check`'s "asked
exactly twice, never more" against production rather than a stub — six
coordinates, ten requests, four of them second asks.

## Also unreported until now

`2408ed3`'s verify **failed** at 13:34:45 and I did not report it. I pushed it
without arming a watch and moved on to the Drive work. Not concealed, just
unobserved — which is a poor showing in the same hour as shipping a commit about
reading the wrong run. It was the same intermittent hang, against the same
`f7c0248` build as the two runs either side of it.

That gives three consecutive verify runs against **identical bytes**: fail
(13:28), fail (13:34), pass (13:48). The intermittency is measured on an
unchanged build rather than assumed.

## Standing state

- **The hang**: real, intermittent, documented since 2026-08-12, not ours.
- **The retry**: deployed and verified on a run that hung.
- **preconnect**: still neither proven nor refuted. It stays.
- **`fetchUnsafe`**: the HTTP-status branch in `fetchOne` is reachable for the
  first time since it was written.
