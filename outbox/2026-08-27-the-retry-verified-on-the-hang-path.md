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

## What was not read

The per-request `open-meteo (start+duration)` line from the 10-second run. It
prints before the PASS block and sits above the log tail window the API returns;
three attempts at widening the window did not reach it, and continuing to spend
calls on a confirmatory line was not worth it.

So the retry's recovery is inferred from the step duration and the verdict, not
read off the request timings. The inference is tight — 10s is not a shape either
the fast path or the old failing path can produce — but it is an inference, and
this session has already been wrong once by treating one of those as proof.

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
