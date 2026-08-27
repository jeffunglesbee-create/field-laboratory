# preconnect removed — the reason it was added was disproved

`f7c0248` added `<link rel="preconnect" href="https://api.open-meteo.com" crossorigin>`
on the reading that the first weather fan-out wave was paying DNS + TCP + TLS for
the whole slate. Run [33078924162](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33078924162)
measured that exact page:

```
635+7999ms  635+8000ms  636+8000ms  636+8001ms      wave 1, with preconnect live
```

The connection was already warm and the first wave hung to its cap anyway. The
hypothesis is refuted by the first run that provably tested it.

## Why removal rather than leaving it

A tag kept for a reason that has been disproved is a comment that lies. The
hang's actual cause is the intermittent reachability recorded in
`outbox/cc-the-runner-lost-open-meteo-2026-08-12.md`, and what handles it is the
retry in `WeatherView.fetchSlate` — measured on the same run recovering all four
lost venues in 158–325ms.

The removal is itself unmeasured, and that is worth saying plainly rather than
implying the page is now better. Nothing depends on it either way: the retry
covers the failure, and no run has shown preconnect helping or harming. If a
future measurement shows first-request latency matters on its own, preconnect
comes back with that measurement attached instead of a hypothesis.

A comment stands where the tag was, carrying the refuting numbers, so the next
session that reaches for preconnect finds the evidence before adding it again.

## Local

`check` 17/17 (`built from: 2a58138`), `check:hard` 17/17, computed-chrome
13/13, tabs 30/30, brief-flip 20/20, design-tokens 21/21, palette 25/25,
typography 11/11, clean-source 3/3.

Note for the next session: `npm run check` fails with `ERR_CONNECTION_REFUSED`
unless `scripts/serve.mjs` is running, and a `nohup ... &` inside a compound
command does not survive here — `(setsid node scripts/serve.mjs >log 2>&1 </dev/null &)`
does.
