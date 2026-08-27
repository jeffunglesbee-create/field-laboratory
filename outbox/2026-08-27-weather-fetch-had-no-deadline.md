# The weather fetch had no deadline, and the diagnostic found it in one run

**Run:** [33034386499](https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/33034386499), commit `2d3f54d`, 02:50:38Z. Same four checks red as run 159.

```
FAIL  every card whose venue the table knows carries a live chip
      → 13 known venue(s) on this slate, 0 chip(s) filled.
        Open-Meteo answered this runner: HTTP 200.
        The page reported: Loading conditions…
```

## What that string settles

`Loading conditions…` is `.wx-idle`. `WeatherView.renderIdle` writes it and
`WeatherView.render` replaces the whole mount when the outcome resolves. So at
twenty seconds the panel was **not** showing an outage — it had not resolved at
all. `fetchSlate`'s promise was still pending.

That rules out the reading run 159 could not rule out. This is not
`EveryFetchFailed`, so it is not "every request was refused"; the requests never
came back. And it was never going to: `fetchOne` catches every rejection —
which makes a *failure* safe — and had no deadline, which makes a request that
simply never answers fatal. Its wave's `Promise.all` stays pending forever, and
`fetchSlate` runs its waves in **sequence**, so one silent socket stalls all
four and the weather surface never resolves. No chips, no outage line, no
reason. Indefinitely.

The previous commit's diagnostic is what produced that string. Run 159 could
only say "0 chip(s) filled"; run 33034386499 said which of the candidate causes
it was, on the first occurrence after the change. That is the done condition in
`2026-08-27-verify-159-weather-attribution.md`, met.

Note what was true the whole time: `scripts/weather-live-check.mjs` has always
passed `AbortSignal.timeout(15_000)` to its own probe of the same service. The
page asking that service had nothing.

## The change

`fetchOne` now passes `Signal(AbortSignal.timeout 4000)`. An abort rejects, the
existing `try/with` turns it into `Error "<venue>: ..."`, the wave settles, and
a total failure now resolves as `EveryFetchFailed` **with its reasons** — which
the previous commit made the page print.

4000ms is arithmetic, not taste. The waves are sequential, so the slate's worst
case is `waves x timeout` = 4 x 4s = 16s, inside live-check's 20s chip wait. For
scale: the whole thirteen-venue slate answered in about three seconds on run
33032652416. This is roughly four times that, applied to each single request
rather than to all of them.

`maxInFlight` stays at 4. Nothing measured says the bound is wrong, and the
failure this fixes is not a burst problem.

## Done condition

A hung request now costs its own venue a chip and names itself in
`.wx-error__why` / `.wx-partial`, instead of costing the entire surface. Verify:
the next verify or live-check run's render step either passes 22/22, or its chip
failure names a reason per venue rather than reporting `Loading conditions…`.
`Loading conditions…` appearing again at 20s would mean the deadline did not
take effect and is the signal to reopen this.
